"""
PostgreSQL-backed repository for year-to-date stats.

Lives in the same database as the live-game store but owns its own tables
(dancers, battles, battle_results, admins) defined in migrations/0001_ytd_stats.sql.
Reuses the psycopg2 ThreadedConnectionPool pattern from the game repository.
"""

import logging
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

# psycopg2 is a hard dependency in production (requirements.txt) but may be
# absent in a bare in-memory dev environment; guard the import so `import stats`
# never crashes app startup. StatsRepository raises if it's actually used.
try:
    import psycopg2
    from psycopg2 import pool
    from psycopg2.extras import RealDictCursor, Json

    PSYCOPG2_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only without psycopg2
    PSYCOPG2_AVAILABLE = False

logger = logging.getLogger(__name__)


class StatsError(Exception):
    """Generic stats persistence error."""


class DuplicateBattleError(StatsError):
    """A battle with the same (name, date) was already submitted."""


class DuplicateDancerError(StatsError):
    """The requested display name collides with a different, unmerged dancer."""


class StatsRepository:
    def __init__(self, database_url: str, min_connections: int = 1, max_connections: int = 5):
        if not PSYCOPG2_AVAILABLE:
            raise StatsError("psycopg2 is not installed. Install with: pip install psycopg2-binary")
        self._pool = pool.ThreadedConnectionPool(min_connections, max_connections, database_url)

    @contextmanager
    def _connection(self):
        conn = None
        try:
            conn = self._pool.getconn()
            yield conn
        finally:
            if conn:
                self._pool.putconn(conn)

    # ----- dancers -----

    def list_dancers(self) -> List[Dict[str, Any]]:
        with self._connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT id, display_name, aliases FROM dancers ORDER BY display_name")
                return [dict(r) for r in cur.fetchall()]

    def list_dancers_with_stats(self) -> List[Dict[str, Any]]:
        """Like list_dancers, plus battle/result counts so an admin can spot likely
        duplicate/orphaned dancers (e.g. a typo-fixed name left with zero battles)."""
        with self._connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT d.id, d.display_name, d.aliases,
                           COUNT(DISTINCT br.battle_id) AS battles_entered,
                           COUNT(br.id) AS result_count
                    FROM dancers d
                    LEFT JOIN battle_results br ON br.dancer_id = d.id
                    GROUP BY d.id
                    ORDER BY d.display_name
                    """
                )
                return [dict(r) for r in cur.fetchall()]

    def find_dancer_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Match a battle name to a canonical dancer by display name or alias (case-insensitive)."""
        with self._connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, display_name, aliases FROM dancers
                    WHERE LOWER(display_name) = LOWER(%s)
                       OR EXISTS (
                           SELECT 1 FROM unnest(aliases) a WHERE LOWER(a) = LOWER(%s)
                       )
                    LIMIT 1
                    """,
                    (name, name),
                )
                row = cur.fetchone()
                return dict(row) if row else None

    def _get_or_create_dancer(self, cur, display_name: str) -> str:
        cur.execute("SELECT id FROM dancers WHERE LOWER(display_name) = LOWER(%s)", (display_name,))
        row = cur.fetchone()
        if row:
            return row["id"] if isinstance(row, dict) else row[0]
        cur.execute(
            "INSERT INTO dancers (display_name) VALUES (%s) RETURNING id",
            (display_name.strip(),),
        )
        row = cur.fetchone()
        return row["id"] if isinstance(row, dict) else row[0]

    def _maybe_add_alias(self, cur, dancer_id: str, alias: str) -> None:
        """Record an as-seen spelling on a dancer if it isn't already known."""
        cur.execute(
            """
            UPDATE dancers
            SET aliases = array_append(aliases, %s)
            WHERE id = %s
              AND LOWER(display_name) <> LOWER(%s)
              AND NOT (
                  EXISTS (SELECT 1 FROM unnest(aliases) a WHERE LOWER(a) = LOWER(%s))
              )
            """,
            (alias, dancer_id, alias, alias),
        )

    def rename_dancer(self, dancer_id: str, new_display_name: str) -> bool:
        """Change a single dancer's canonical display name (no merge involved).

        The old name is preserved as an alias, same as the rename-on-merge path in
        merge_dancers, so a future upload spelled with the old name still resolves
        to this dancer. Returns False if the dancer doesn't exist.
        """
        new_name = (new_display_name or "").strip()
        if not new_name:
            raise StatsError("Display name is required.")

        with self._connection() as conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("SELECT display_name FROM dancers WHERE id = %s", (dancer_id,))
                    row = cur.fetchone()
                    if not row:
                        return False
                    old_name = row["display_name"]
                    if new_name.lower() == old_name.strip().lower():
                        return True

                    cur.execute("UPDATE dancers SET display_name = %s WHERE id = %s", (new_name, dancer_id))
                    self._maybe_add_alias(cur, dancer_id, old_name)
                conn.commit()
                return True
            except psycopg2.errors.UniqueViolation as exc:
                conn.rollback()
                raise DuplicateDancerError("Another dancer already has that name.") from exc
            except Exception as exc:  # noqa: BLE001
                conn.rollback()
                raise StatsError(str(exc)) from exc

    def merge_dancers(
        self,
        target_id: str,
        source_ids: List[str],
        new_display_name: Optional[str] = None,
    ) -> int:
        """
        Fold one or more duplicate dancers into `target_id`: repoint their
        battle_results, capture their names as aliases on the target, then delete
        them. Optionally also rename the survivor to `new_display_name`.

        Only battle_results.dancer_id and the dancers table are touched - each
        battle's raw_data JSON is the immutable historical record and is
        intentionally left as-is.

        Returns the number of battle_results rows repointed.
        """
        if target_id in source_ids:
            raise StatsError("Target dancer cannot also be a source.")

        with self._connection() as conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    all_ids = [target_id] + list(source_ids)

                    cur.execute(
                        "SELECT id, display_name, aliases FROM dancers WHERE id = ANY(%s::uuid[])",
                        (all_ids,),
                    )
                    by_id = {str(r["id"]): r for r in cur.fetchall()}
                    if len(by_id) != len(all_ids):
                        raise StatsError("One or more selected dancers no longer exist.")

                    # A blind repoint can't tell two dancers apart if they were both
                    # (mistakenly, or legitimately as different people) entered as
                    # separate contestants in the same battle+role - check the whole
                    # merge set together, not just target-vs-each-source, since two
                    # sources can collide with each other too.
                    cur.execute(
                        """
                        SELECT br.battle_id, br.role, b.name, b.battle_date
                        FROM battle_results br
                        JOIN battles b ON b.id = br.battle_id
                        WHERE br.dancer_id = ANY(%s::uuid[])
                        GROUP BY br.battle_id, br.role, b.name, b.battle_date
                        HAVING COUNT(DISTINCT br.dancer_id) > 1
                        """,
                        (all_ids,),
                    )
                    collisions = cur.fetchall()
                    if collisions:
                        battles_desc = ", ".join(f"{c['name']} ({c['battle_date']})" for c in collisions)
                        raise StatsError(
                            f"Cannot merge: {battles_desc} would end up with two results for the same battle and role."
                        )

                    cur.execute(
                        "UPDATE battle_results SET dancer_id = %s WHERE dancer_id = ANY(%s::uuid[])",
                        (target_id, source_ids),
                    )
                    moved = cur.rowcount

                    for source_id in source_ids:
                        source = by_id[source_id]
                        self._maybe_add_alias(cur, target_id, source["display_name"])
                        for alias in source["aliases"]:
                            self._maybe_add_alias(cur, target_id, alias)

                    cur.execute("DELETE FROM dancers WHERE id = ANY(%s::uuid[])", (source_ids,))

                    new_name = (new_display_name or "").strip()
                    target = by_id[target_id]
                    if new_name and new_name.lower() != target["display_name"].strip().lower():
                        old_name = target["display_name"]
                        cur.execute(
                            "UPDATE dancers SET display_name = %s WHERE id = %s",
                            (new_name, target_id),
                        )
                        # Preserve the target's pre-rename name too, so it still resolves
                        # via alias lookup on future uploads. Must run *after* the rename
                        # above - _maybe_add_alias refuses to alias a name that still
                        # equals the dancer's current display_name.
                        self._maybe_add_alias(cur, target_id, old_name)

                conn.commit()
                return moved
            except (StatsError, DuplicateDancerError):
                conn.rollback()
                raise
            except psycopg2.errors.UniqueViolation as exc:
                conn.rollback()
                if "idx_dancers_display_name_lower" in str(exc):
                    raise DuplicateDancerError("Another dancer already has that name.") from exc
                raise StatsError(str(exc)) from exc
            except Exception as exc:  # noqa: BLE001
                conn.rollback()
                raise StatsError(str(exc)) from exc

    # ----- battles -----

    def create_battle(
        self,
        meta: Dict[str, Any],
        raw_data: Dict[str, Any],
        results: List[Dict[str, Any]],
        resolutions: Dict[str, Dict[str, Any]],
    ) -> str:
        """
        Atomically resolve dancers, insert the battle, and insert its results.

        meta: {name, battle_date, source, session_id (optional), uploaded_by (optional)}
        results: rows from normalize_battle (name, role, points, placement, is_winner, round_wins)
        resolutions: {result_name: {"dancer_id": str|None, "new_name": str|None}}
            - dancer_id set  -> map to that existing dancer (as-seen name stored as alias)
            - else           -> create/find dancer by new_name (defaults to result_name)
        """
        with self._connection() as conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    name_to_id: Dict[str, str] = {}
                    for seen_name, res in resolutions.items():
                        dancer_id = (res or {}).get("dancer_id")
                        if dancer_id:
                            self._maybe_add_alias(cur, dancer_id, seen_name)
                        else:
                            canonical = ((res or {}).get("new_name") or seen_name).strip()
                            dancer_id = self._get_or_create_dancer(cur, canonical)
                            if canonical.lower() != seen_name.strip().lower():
                                self._maybe_add_alias(cur, dancer_id, seen_name)
                        name_to_id[seen_name] = dancer_id

                    cur.execute(
                        """
                        INSERT INTO battles (name, battle_date, source, session_id, uploaded_by, raw_data)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (
                            meta["name"],
                            meta["battle_date"],
                            meta.get("source", "upload"),
                            meta.get("session_id"),
                            meta.get("uploaded_by"),
                            Json(raw_data),
                        ),
                    )
                    battle_id = cur.fetchone()["id"]

                    for row in results:
                        dancer_id = name_to_id.get(row["name"])
                        if not dancer_id:
                            # Unmapped name -> create/find by its own spelling.
                            dancer_id = self._get_or_create_dancer(cur, row["name"])
                        cur.execute(
                            """
                            INSERT INTO battle_results
                                (battle_id, dancer_id, dancer_name, role, points, placement, is_winner, round_wins)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                battle_id,
                                dancer_id,
                                row["name"],
                                row["role"],
                                row.get("points", 0),
                                row.get("placement"),
                                row.get("is_winner", False),
                                row.get("round_wins", 0),
                            ),
                        )
                conn.commit()
                return battle_id
            except psycopg2.errors.UniqueViolation as exc:
                conn.rollback()
                if "uq_battles_name_date" in str(exc):
                    raise DuplicateBattleError("A battle with this name and date has already been uploaded.") from exc
                raise StatsError(str(exc)) from exc
            except Exception as exc:  # noqa: BLE001
                conn.rollback()
                raise StatsError(str(exc)) from exc

    def get_battle(self, battle_id: str) -> Optional[Dict[str, Any]]:
        with self._connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, name, battle_date, battle_year, source, session_id, raw_data, created_at
                    FROM battles WHERE id = %s
                    """,
                    (battle_id,),
                )
                row = cur.fetchone()
                return dict(row) if row else None

    def update_battle(
        self,
        battle_id: str,
        meta: Dict[str, Any],
        raw_data: Dict[str, Any],
        results: List[Dict[str, Any]],
    ) -> bool:
        """
        Replace a battle's stored payload and results in place.

        meta: {name, battle_date}
        results: rows from normalize_battle (name, role, points, placement, is_winner, round_wins)

        Unlike create_battle, there's no `resolutions` step here - a dancer name that
        already appears in this battle's results keeps its existing dancer_id (so a
        typo fix doesn't sever the link to their YTD history), and any new/renamed
        name falls back to the same case-insensitive find-or-create as an unmapped
        name during initial ingest.
        """
        with self._connection() as conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT dancer_name, dancer_id FROM battle_results WHERE battle_id = %s",
                        (battle_id,),
                    )
                    existing_by_name = {r["dancer_name"]: r["dancer_id"] for r in cur.fetchall()}

                    cur.execute(
                        """
                        UPDATE battles SET name = %s, battle_date = %s, raw_data = %s
                        WHERE id = %s
                        RETURNING id
                        """,
                        (meta["name"], meta["battle_date"], Json(raw_data), battle_id),
                    )
                    if cur.fetchone() is None:
                        conn.rollback()
                        return False

                    cur.execute("DELETE FROM battle_results WHERE battle_id = %s", (battle_id,))

                    for row in results:
                        dancer_id = existing_by_name.get(row["name"]) or self._get_or_create_dancer(cur, row["name"])
                        cur.execute(
                            """
                            INSERT INTO battle_results
                                (battle_id, dancer_id, dancer_name, role, points, placement, is_winner, round_wins)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                battle_id,
                                dancer_id,
                                row["name"],
                                row["role"],
                                row.get("points", 0),
                                row.get("placement"),
                                row.get("is_winner", False),
                                row.get("round_wins", 0),
                            ),
                        )
                conn.commit()
                return True
            except psycopg2.errors.UniqueViolation as exc:
                conn.rollback()
                if "uq_battles_name_date" in str(exc):
                    raise DuplicateBattleError("Another battle with this name and date already exists.") from exc
                raise StatsError(str(exc)) from exc
            except Exception as exc:  # noqa: BLE001
                conn.rollback()
                raise StatsError(str(exc)) from exc

    def list_years(self) -> List[int]:
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT DISTINCT battle_year FROM battles ORDER BY battle_year DESC")
                return [r[0] for r in cur.fetchall()]

    def list_battles(self, year: Optional[int] = None) -> List[Dict[str, Any]]:
        sql = """
            SELECT b.id, b.name, b.battle_date, b.battle_year, b.source, b.created_at,
                   COUNT(br.id) AS result_count
            FROM battles b
            LEFT JOIN battle_results br ON br.battle_id = b.id
            {where}
            GROUP BY b.id
            ORDER BY b.battle_date DESC
        """.format(where="WHERE b.battle_year = %s" if year else "")
        params = (year,) if year else ()
        with self._connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params)
                return [dict(r) for r in cur.fetchall()]

    def delete_battle(self, battle_id: str) -> bool:
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM battles WHERE id = %s", (battle_id,))
                deleted = cur.rowcount
            conn.commit()
            return deleted > 0

    def get_ytd_standings(self, year: int) -> Dict[str, List[Dict[str, Any]]]:
        """Sum-of-raw-points standings per role for the given year."""
        sql = """
            SELECT d.id AS dancer_id, d.display_name, br.role,
                   SUM(br.points)                       AS total_points,
                   COUNT(*) FILTER (WHERE br.is_winner) AS crowns,
                   COUNT(DISTINCT br.battle_id)         AS battles_entered,
                   SUM(br.round_wins)                   AS round_wins
            FROM battle_results br
            JOIN battles b ON b.id = br.battle_id
            JOIN dancers d ON d.id = br.dancer_id
            WHERE b.battle_year = %s
            GROUP BY d.id, d.display_name, br.role
            ORDER BY total_points DESC, crowns DESC, d.display_name ASC
        """
        with self._connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, (year,))
                rows = [dict(r) for r in cur.fetchall()]

        leads = [r for r in rows if r["role"] == "lead"]
        follows = [r for r in rows if r["role"] == "follow"]
        return {"leads": leads, "follows": follows}

    # ----- admins -----

    def get_admin_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        with self._connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT id, email, password_hash FROM admins WHERE LOWER(email) = LOWER(%s)",
                    (email,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
