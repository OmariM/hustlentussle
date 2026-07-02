"""
PostgreSQL-backed repository for year-to-date stats.

Lives in the same database as the live-game store but owns its own tables
(dancers, battles, battle_results, admins) defined in migrations/0001_ytd_stats.sql.
Reuses the psycopg2 ThreadedConnectionPool pattern from the game repository.
"""

import logging
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

# psycopg2 is a hard dependency in production (requirements.prod.txt) but may be
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
                        dancer_id = existing_by_name.get(row["name"]) or self._get_or_create_dancer(
                            cur, row["name"]
                        )
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
                    raise DuplicateBattleError(
                        "Another battle with this name and date already exists."
                    ) from exc
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
