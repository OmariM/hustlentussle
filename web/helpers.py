"""
Shared serialization / formatting helpers for the web API.

Everything here is non-mutating with respect to persistence: these functions
take a Game (or an exported payload) and produce JSON-shaped dicts used by
multiple route modules.
"""

import datetime
from typing import Dict, List, Optional, Tuple

from flask import jsonify

from game_logic import Game, Contestant
from prelim_logic import Prelim
from web.extensions import repo


def get_game_or_404(session_id: Optional[str]) -> Tuple[Optional[Game], Optional[tuple]]:
    """Load a game by session id.

    Returns (game, None) on success, or (None, (response, status)) with a
    canonical 404 error response when the id is missing or unknown.
    """
    if not session_id:
        return None, (jsonify({"error": "Missing session_id"}), 400)
    game = repo.get(session_id)
    if not game or isinstance(game, Prelim):
        return None, (jsonify({"error": "Game not found"}), 404)
    return game, None


def get_prelim_or_404(session_id: Optional[str]) -> Tuple[Optional[Prelim], Optional[tuple]]:
    """Load a prelim by session id (mirror of get_game_or_404 for the prelim phase)."""
    if not session_id:
        return None, (jsonify({"error": "Missing session_id"}), 400)
    prelim = repo.get(session_id)
    if not isinstance(prelim, Prelim):
        return None, (jsonify({"error": "Prelim not found"}), 404)
    return prelim, None


def serialize_prelim(prelim: Prelim) -> dict:
    """Build a canonical renderable prelim state snapshot for the UI."""
    return {
        "session_id": prelim.session_id,
        "config": {
            "group_size": prelim.group_size,
            "num_rotations": prelim.num_rotations,
            "rotation_seconds": prelim.rotation_seconds,
            "lead_spots": prelim.lead_spots,
            "follow_spots": prelim.follow_spots,
            "lead_needs_cut": prelim.lead_needs_cut,
            "follow_needs_cut": prelim.follow_needs_cut,
            "num_leads": len(prelim.lead_entries),
            "num_follows": len(prelim.follow_entries),
            "break_seconds": prelim.break_seconds,
            "intermission_after": prelim.intermission_after,
            "playlist_url": prelim.battle_config.get("playlist_url") or "",
            # Carried from prelim setup so the battle setup screen can prefill them.
            "judges": list(prelim.battle_config.get("judges") or []),
        },
        "num_heats": len(prelim.heats),
        "current_heat_index": prelim.current_heat_index,
        "current_rotation_index": prelim.current_rotation_index,
        "running": prelim.running,
        "phase": prelim.phase,
        "paused": prelim.paused,
        "show_timer": prelim.show_timer,
        "auto_advance": prelim.auto_advance,
        "confirmed": prelim.confirmed,
        "rotation_remaining": prelim.rotation_remaining(),
        "heats_complete": prelim.heats_complete,
        "heats": prelim.heats,
        "numbers": {"leads": prelim.lead_numbers, "follows": prelim.follow_numbers},
        "eligible": {"leads": prelim.eligible_leads, "follows": prelim.eligible_follows},
        "selection": {"leads": prelim.selected_leads, "follows": prelim.selected_follows},
        "complete": prelim.complete,
        # Non-null once the battle has been started from this prelim; the spectator
        # display follows it to /battle/<id>?mode=display.
        "battle_session_id": prelim.battle_session_id,
    }


def _champion_for_role(winner_obj, has_threshold_winner, tiebreak_winner, pool):
    """Resolve the champion for one role. Order: tie-break winner, then threshold
    winner, then (battle ended early) the unique top scorer. Returns a dict
    {name, points, decided_by} where decided_by is threshold|tiebreak|points|None.
    Non-mutating."""
    if tiebreak_winner is not None:
        return {"name": tiebreak_winner.name, "points": tiebreak_winner.points, "decided_by": "tiebreak"}
    if has_threshold_winner and winner_obj is not None:
        return {"name": winner_obj.name, "points": winner_obj.points, "decided_by": "threshold"}
    # Early end (below threshold): the clear points leader wins.
    if pool:
        max_points = max(c.points for c in pool)
        top = [c for c in pool if c.points == max_points]
        if max_points > 0 and len(top) == 1:
            return {"name": top[0].name, "points": top[0].points, "decided_by": "points"}
    return {"name": None, "points": None, "decided_by": None}


def compute_champions(game):
    """Single source of champion truth for both the export file and the live
    end-of-battle response. See _champion_for_role for resolution order."""
    return {
        "lead": _champion_for_role(
            getattr(game, "winning_lead", None),
            getattr(game, "has_winning_lead", False),
            getattr(game, "tiebreak_lead_winner", None),
            getattr(game, "initial_leads", []),
        ),
        "follow": _champion_for_role(
            getattr(game, "winning_follow", None),
            getattr(game, "has_winning_follow", False),
            getattr(game, "tiebreak_follow_winner", None),
            getattr(game, "initial_follows", []),
        ),
    }


def serialize_state(game: Game) -> dict:
    """Build a canonical renderable game state snapshot for the UI."""

    # Crown = "won the battle." Once finished, use the resolved champion
    # (threshold / tie-break / early-end points leader). Mid-battle, only a
    # dancer who has actually reached the threshold is crowned (no premature crown).
    _finished = getattr(game, "state", 0) == 1 or (hasattr(game, "is_finished") and game.is_finished())
    _champs = compute_champions(game) if _finished else None

    def has_earned_crown(contestant: Contestant, role: str) -> bool:
        if _champs is not None:
            champ_name = _champs[role]["name"]
            return champ_name is not None and contestant.name == champ_name
        if role == "lead":
            return contestant.points >= game.win_threshold and game.has_winning_lead
        return contestant.points >= game.win_threshold and game.has_winning_follow

    # Build unique contestant maps including current pairs, queues and tracked winners
    lead_dict: Dict[str, dict] = {}
    follow_dict: Dict[str, dict] = {}

    # Add current pair contestants first
    if game.pair_1 and game.pair_2:
        lead_dict[game.pair_1[0].name] = {
            "name": game.pair_1[0].name,
            "points": game.pair_1[0].points,
            "is_winner": has_earned_crown(game.pair_1[0], "lead"),
        }
        lead_dict[game.pair_2[0].name] = {
            "name": game.pair_2[0].name,
            "points": game.pair_2[0].points,
            "is_winner": has_earned_crown(game.pair_2[0], "lead"),
        }
        follow_dict[game.pair_1[1].name] = {
            "name": game.pair_1[1].name,
            "points": game.pair_1[1].points,
            "is_winner": has_earned_crown(game.pair_1[1], "follow"),
        }
        follow_dict[game.pair_2[1].name] = {
            "name": game.pair_2[1].name,
            "points": game.pair_2[1].points,
            "is_winner": has_earned_crown(game.pair_2[1], "follow"),
        }

    # Add contestants from queues (proxies iterate without current competitors)
    for lead in game.leads:
        lead_dict[lead.name] = {"name": lead.name, "points": lead.points, "is_winner": has_earned_crown(lead, "lead")}
    for follow in game.follows:
        follow_dict[follow.name] = {
            "name": follow.name,
            "points": follow.points,
            "is_winner": has_earned_crown(follow, "follow"),
        }

    # Include tracked winners if present
    if getattr(game, "winning_lead", None):
        lead_dict[game.winning_lead.name] = {
            "name": game.winning_lead.name,
            "points": game.winning_lead.points,
            "is_winner": has_earned_crown(game.winning_lead, "lead"),
        }
    if getattr(game, "winning_follow", None):
        follow_dict[game.winning_follow.name] = {
            "name": game.winning_follow.name,
            "points": game.winning_follow.points,
            "is_winner": has_earned_crown(game.winning_follow, "follow"),
        }

    # Sort for stable rendering
    lead_list = sorted(list(lead_dict.values()), key=lambda x: (-x["points"], x["name"]))
    follow_list = sorted(list(follow_dict.values()), key=lambda x: (-x["points"], x["name"]))

    # Judges
    contestant_judges = [j.name for j in game.contestant_judges]
    contestant_enabled = getattr(game, "contestant_judging_enabled", True)
    simple_flag = bool(getattr(game, "simple_contestant_judges", False)) and contestant_enabled

    # Build lightweight rounds summary for live UI (include completed + current)
    rounds_data: List[dict] = []
    try:
        for r in getattr(game, "rounds", []):
            rounds_data.append(
                {
                    "round_num": getattr(r, "round_num", None),
                    "pairs": getattr(r, "pairs", None),
                    "lead_winner": getattr(r, "lead_winner", None),
                    "follow_winner": getattr(r, "follow_winner", None),
                }
            )
        cr = getattr(game, "current_round", None)
        if cr and cr not in getattr(game, "rounds", []):
            rounds_data.append(
                {
                    "round_num": getattr(cr, "round_num", None),
                    "pairs": getattr(cr, "pairs", None),
                    "lead_winner": getattr(cr, "lead_winner", None),
                    "follow_winner": getattr(cr, "follow_winner", None),
                }
            )
        rounds_data = [rd for rd in rounds_data if rd.get("round_num") is not None]
        rounds_data.sort(key=lambda x: x["round_num"])
    except Exception:
        rounds_data = []

    state = {
        "session_id": game.session_id,
        "round": {
            "number": game.round_num,
            "pairs": {
                "pair_1": {"lead": game.pair_1[0].name, "follow": game.pair_1[1].name},
                "pair_2": {"lead": game.pair_2[0].name, "follow": game.pair_2[1].name},
            },
            "judges": {
                "guest": game.guest_judges,
                "contestant": contestant_judges,
                "simple_contestant_judges": simple_flag,
                "contestant_judging_enabled": contestant_enabled,
                "num_contestant_judges": getattr(game, "num_contestant_judges", len(contestant_judges)),
                "expected_contestant_judges": getattr(game, "expected_contestant_judges", len(game.guest_judges) + 1),
            },
        },
        "scoreboard": {
            "leads": lead_list,
            "follows": follow_list,
        },
        "rounds": rounds_data,
        "thresholds": {
            "win": game.win_threshold,
            "auto_win": getattr(game, "auto_win_threshold", game.win_threshold),
        },
        "flags": {
            "has_winning_lead": game.has_winning_lead,
            "has_winning_follow": game.has_winning_follow,
            "finished": game.is_finished(),
        },
        "winners": {
            # When finished, the resolved battle champion (covers early-end/tie-break);
            # otherwise the threshold winner (or None mid-battle).
            "lead": (
                _champs["lead"]["name"]
                if _champs is not None
                else (game.winning_lead.name if getattr(game, "winning_lead", None) else None)
            ),
            "follow": (
                _champs["follow"]["name"]
                if _champs is not None
                else (game.winning_follow.name if getattr(game, "winning_follow", None) else None)
            ),
        },
        "initial_order": {
            "leads": [c.name for c in getattr(game, "initial_leads", [])],
            "follows": [c.name for c in getattr(game, "initial_follows", [])],
        },
        "queue_order": {
            # Current competitors (positions 1-2) then queue (positions 3+)
            "leads": ([game.pair_1[0].name, game.pair_2[0].name] if game.pair_1 and game.pair_2 else [])
            + [c.name for c in game.leads],
            "follows": ([game.pair_1[1].name, game.pair_2[1].name] if game.pair_1 and game.pair_2 else [])
            + [c.name for c in game.follows],
        },
        "tiebreak": {
            "active": game.tiebreak_active,
            "sub_round": game.tiebreak_sub_round,
            "lead_needed": game.tiebreak_lead_needed,
            "follow_needed": game.tiebreak_follow_needed,
            "tied_leads": [c.name for c in game.tiebreak_leads_tied],
            "tied_follows": [c.name for c in game.tiebreak_follows_tied],
            "sr1_pairings": [list(p) for p in game.tiebreak_sub_round_1_pairings],
            "sr2_pairings": [list(p) for p in game.tiebreak_sub_round_2_pairings],
            "lead_winner": game.tiebreak_lead_winner.name if game.tiebreak_lead_winner else None,
            "follow_winner": game.tiebreak_follow_winner.name if game.tiebreak_follow_winner else None,
        },
    }
    return state


def format_end_game_results(game, session_id):
    """Shared results-formatting logic used by end_game, tiebreak/finalize and /api/results."""
    leads, follows = game.finalize_results()
    champions = compute_champions(game)
    lead_champ = champions["lead"]["name"]
    follow_champ = champions["follow"]["name"]

    all_leads = [lead.name for lead in game.initial_leads]
    lead_points = {lead.name: lead.points for lead in leads}
    sorted_leads = sorted(all_leads, key=lambda x: (-lead_points.get(x, 0), x))
    lead_results = []
    for idx, name in enumerate(sorted_leads):
        medal = ["🥇", "🥈", "🥉"][idx] if idx < 3 else ""
        lead_results.append(
            {"name": name, "points": lead_points.get(name, 0), "medal": medal, "is_winner": name == lead_champ}
        )

    all_follows = [follow.name for follow in game.initial_follows]
    follow_points = {follow.name: follow.points for follow in follows}
    sorted_follows = sorted(all_follows, key=lambda x: (-follow_points.get(x, 0), x))
    follow_results = []
    for idx, name in enumerate(sorted_follows):
        medal = ["🥇", "🥈", "🥉"][idx] if idx < 3 else ""
        follow_results.append(
            {"name": name, "points": follow_points.get(name, 0), "medal": medal, "is_winner": name == follow_champ}
        )

    rounds_data = []
    for r in game.rounds:
        if hasattr(r, "session_id") and r.session_id == session_id:
            rounds_data.append(
                {
                    "round_num": r.round_num,
                    "session_id": session_id,
                    "pairs": r.pairs,
                    "lead_votes": r.lead_votes,
                    "follow_votes": r.follow_votes,
                    "judges": r.judges,
                    "contestant_judges": r.contestant_judges,
                    "win_messages": r.win_messages,
                    "lead_winner": r.lead_winner,
                    "follow_winner": r.follow_winner,
                    "song_info": r.song_info if hasattr(r, "song_info") else None,
                }
            )
    if game.current_round and game.current_round not in game.rounds:
        if hasattr(game.current_round, "session_id") and game.current_round.session_id == session_id:
            r = game.current_round
            rounds_data.append(
                {
                    "round_num": r.round_num,
                    "session_id": session_id,
                    "pairs": r.pairs,
                    "lead_votes": r.lead_votes,
                    "follow_votes": r.follow_votes,
                    "judges": r.judges,
                    "contestant_judges": r.contestant_judges,
                    "win_messages": r.win_messages,
                    "lead_winner": r.lead_winner,
                    "follow_winner": r.follow_winner,
                    "song_info": r.song_info if hasattr(r, "song_info") else None,
                }
            )
    rounds_data.sort(key=lambda x: x["round_num"])

    # When a tiebreak was resolved, replace the incomplete pre-tiebreak round entry
    # with a synthetic entry listing the original tiebreak participants so the battle
    # graphic badges land on the right people.
    if (game.tiebreak_lead_winner or game.tiebreak_follow_winner) and game.current_round:
        last_round_num = game.current_round.round_num
        rounds_data = [rd for rd in rounds_data if rd.get("round_num") != last_round_num]
        rounds_data.append(
            {
                "round_num": last_round_num,
                "tiebreak": True,
                "tiebreak_leads": [c.name for c in game.tiebreak_original_leads],
                "tiebreak_follows": [c.name for c in game.tiebreak_original_follows],
                "lead_winner": game.tiebreak_lead_winner.name if game.tiebreak_lead_winner else None,
                "follow_winner": game.tiebreak_follow_winner.name if game.tiebreak_follow_winner else None,
                "pairs": None,
                "lead_votes": None,
                "follow_votes": None,
                "judges": None,
                "contestant_judges": None,
                "win_messages": None,
                "song_info": None,
            }
        )
        rounds_data.sort(key=lambda x: x["round_num"])

    return {
        "session_id": session_id,
        "leads": lead_results,
        "follows": follow_results,
        "rounds": rounds_data,
        "initial_leads": [c.name for c in game.initial_leads],
        "initial_follows": [c.name for c in game.initial_follows],
        "champions": champions,
    }


def _export_round(r):
    """Serialize a Round to the clean export shape (song object, no internal fields)."""
    return {
        "round_num": r.round_num,
        "pairs": r.pairs,
        "lead_winner": r.lead_winner,
        "follow_winner": r.follow_winner,
        "lead_votes": r.lead_votes,
        "follow_votes": r.follow_votes,
        "judges": r.judges,
        "contestant_judges": r.contestant_judges,
        "song": r.song_info if hasattr(r, "song_info") else None,
    }


def _export_participants(sorted_contestants, initial_names, champion_name):
    """Build participant rows: placement (points desc, ties share), is_champion,
    initial_order. `sorted_contestants` must already be sorted by points desc."""
    placements = {}
    last_points = None
    last_rank = 0
    for idx, c in enumerate(sorted_contestants, start=1):
        if c.points != last_points:
            last_rank = idx
            last_points = c.points
        placements[c.name] = last_rank
    initial_order = {name: i for i, name in enumerate(initial_names, start=1)}
    return [
        {
            "name": c.name,
            "points": c.points,
            "placement": placements[c.name],
            "is_champion": champion_name is not None and c.name == champion_name,
            "initial_order": initial_order.get(c.name),
        }
        for c in sorted_contestants
    ]


def build_battle_export(game, session_id, posted_rounds=None):
    """Build the versioned JSON battle payload (hustlentussle.battle v1).

    Single source of truth for the download file and the YTD 'publish live battle'
    flow. `posted_rounds`, when provided (already in export shape), overrides the
    rounds derived from the game (used when the client sends Spotify-enriched rounds).
    """
    leads, follows = game.finalize_results()
    champions = compute_champions(game)
    initial_leads = [c.name for c in game.initial_leads]
    initial_follows = [c.name for c in game.initial_follows]

    if posted_rounds is not None:
        rounds_data = list(posted_rounds)
    else:
        all_rounds = list(game.rounds)
        if game.current_round and game.current_round not in game.rounds:
            all_rounds.append(game.current_round)
        rounds_data = [_export_round(r) for r in all_rounds]
    rounds_data.sort(key=lambda x: x.get("round_num", 0))

    finished = game.is_finished() if hasattr(game, "is_finished") else getattr(game, "state", 0) == 1

    return {
        "format": "hustlentussle.battle",
        "version": 1,
        "session_id": session_id,
        "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "metadata": {
            "battle_date": datetime.date.today().isoformat(),
            "total_rounds": len({r.get("round_num") for r in rounds_data}),
            "win_threshold": getattr(game, "win_threshold", None),
            "finished": finished,
            "contestant_judging_enabled": getattr(game, "contestant_judging_enabled", True),
        },
        "champions": champions,
        "participants": {
            "leads": _export_participants(leads, initial_leads, champions["lead"]["name"]),
            "follows": _export_participants(follows, initial_follows, champions["follow"]["name"]),
        },
        "judges": {"guest": list(getattr(game, "guest_judges", []))},
        "rounds": rounds_data,
    }


def parse_battle_json(payload):
    """Validate an exported battle JSON (hustlentussle.battle v1) and convert it
    into the display shape used by the results screen and YTD ingest:
    {leads, follows, rounds, initial_leads, initial_follows, champions}."""
    if not isinstance(payload, dict) or payload.get("format") != "hustlentussle.battle":
        raise ValueError("Unrecognized file - expected a Hustle n' Tussle battle export.")
    version = payload.get("version")
    if version != 1:
        raise ValueError(f"Unsupported battle file version: {version}")

    champions = payload.get("champions") or {}
    participants = payload.get("participants") or {}

    def _display(role_list):
        ordered = sorted(role_list, key=lambda p: p.get("points", 0) or 0, reverse=True)
        rows = []
        for idx, p in enumerate(ordered):
            medal = ["\U0001f947", "\U0001f948", "\U0001f949"][idx] if idx < 3 else ""
            rows.append(
                {
                    "name": p.get("name"),
                    "points": p.get("points", 0) or 0,
                    "medal": medal,
                    "is_winner": bool(p.get("is_champion")),
                }
            )
        return rows

    def _initial_order(role_list):
        ordered = [p for p in role_list if p.get("initial_order")]
        if ordered:
            return [p["name"] for p in sorted(ordered, key=lambda p: p["initial_order"])]
        return [p.get("name") for p in role_list]

    leads_part = participants.get("leads") or []
    follows_part = participants.get("follows") or []

    rounds = []
    for r in payload.get("rounds") or []:
        row = {
            "round_num": r.get("round_num"),
            "pairs": r.get("pairs"),
            "lead_winner": r.get("lead_winner"),
            "follow_winner": r.get("follow_winner"),
            "lead_votes": r.get("lead_votes") or {},
            "follow_votes": r.get("follow_votes") or {},
            "judges": r.get("judges") or [],
            "contestant_judges": r.get("contestant_judges") or [],
            "song_info": r.get("song"),
        }
        # Tie-break rounds (see format_end_game_results) have no normal pairs; carry
        # these through so the results screen renders them as a tie-break, not a
        # normal round with blank contestant names.
        if r.get("tiebreak"):
            row["tiebreak"] = True
            row["tiebreak_leads"] = r.get("tiebreak_leads") or []
            row["tiebreak_follows"] = r.get("tiebreak_follows") or []
        rounds.append(row)
    rounds.sort(key=lambda x: x.get("round_num") or 0)

    return {
        "leads": _display(leads_part),
        "follows": _display(follows_part),
        "rounds": rounds,
        "initial_leads": _initial_order(leads_part),
        "initial_follows": _initial_order(follows_part),
        "champions": champions,
    }
