"""
Normalize a single battle into canonical per-dancer/per-role rows for YTD stats.

Both ingest paths converge here on the versioned export schema
(hustlentussle.battle v1) — publishing a finished live battle and uploading an
exported .json file both feed that shape:

    {
        "participants": {
            "leads":   [{"name": str, "points": int, "placement": int, "is_champion": bool}, ...],
            "follows": [ ... ],
        },
        "champions": {"lead": {...}, "follow": {...}},
        "rounds":  [{"lead_winner": str|None, "follow_winner": str|None, ...}, ...],
    }

The battle *champion* (is_champion) — not the last-round winner — drives the
`is_winner` flag used for YTD crowns.
"""

from typing import Any, Dict, List


def _placements(entries: List[Dict[str, Any]]) -> Dict[str, int]:
    """Rank by points descending; equal points share the same placement."""
    ordered = sorted(entries, key=lambda e: e.get("points", 0), reverse=True)
    placements: Dict[str, int] = {}
    last_points = None
    last_rank = 0
    for idx, entry in enumerate(ordered, start=1):
        pts = entry.get("points", 0)
        if pts != last_points:
            last_rank = idx
            last_points = pts
        placements[entry["name"]] = last_rank
    return placements


def _round_wins(rounds: List[Dict[str, Any]], winner_key: str) -> Dict[str, int]:
    wins: Dict[str, int] = {}
    for rnd in rounds or []:
        winner = rnd.get(winner_key)
        if winner:
            wins[winner] = wins.get(winner, 0) + 1
    return wins


def _normalize_role(
    entries: List[Dict[str, Any]],
    rounds: List[Dict[str, Any]],
    role: str,
    winner_key: str,
) -> List[Dict[str, Any]]:
    placements = _placements(entries)
    round_wins = _round_wins(rounds, winner_key)
    results = []
    for entry in entries:
        name = (entry.get("name") or "").strip()
        if not name:
            continue
        # Prefer the placement computed at export time; fall back to local ranking.
        placement = entry.get("placement")
        if placement is None:
            placement = placements.get(name)
        results.append(
            {
                "name": name,
                "role": role,
                "points": int(entry.get("points", 0) or 0),
                "placement": placement,
                # Battle champion (is_champion) drives the crown; is_winner kept as fallback.
                "is_winner": bool(entry.get("is_champion", entry.get("is_winner", False))),
                "round_wins": round_wins.get(name, 0),
            }
        )
    return results


def normalize_battle(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Return {"results": [...], "names": [...]} where each result row is
    {name, role, points, placement, is_winner, round_wins} and `names` is the
    de-duplicated set of dancer names appearing in the battle (for the
    name-resolution UI).
    """
    rounds = payload.get("rounds") or []
    participants = payload.get("participants") or {}
    # Accept the versioned schema (participants.*); tolerate a flat leads/follows too.
    leads = participants.get("leads") or payload.get("leads") or []
    follows = participants.get("follows") or payload.get("follows") or []
    results = _normalize_role(leads, rounds, "lead", "lead_winner")
    results += _normalize_role(follows, rounds, "follow", "follow_winner")

    seen: List[str] = []
    for row in results:
        if row["name"] not in seen:
            seen.append(row["name"])

    return {"results": results, "names": seen}
