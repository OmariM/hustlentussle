"""Live battle lifecycle: start, judging, rounds, tie-breaks, results, export/upload."""

import json
import random
from typing import List

from flask import Blueprint, jsonify, request

from game_logic import Game
from prelim_logic import DEFAULT_GROUP_SIZE, Prelim
from web.extensions import repo
from web.helpers import (
    build_battle_export,
    format_end_game_results,
    get_game_or_404,
    get_prelim_or_404,
    parse_battle_json,
    serialize_prelim,
    serialize_state,
)

bp = Blueprint("game", __name__)


@bp.route("/api/state", methods=["GET"])
def get_state():
    game, error = get_game_or_404(request.args.get("session_id"))
    if error:
        return error
    return jsonify(serialize_state(game))


def _split_names(raw) -> List[str]:
    """Split a comma-separated string (or pass a list through) into trimmed names."""
    if isinstance(raw, list):
        return [str(name).strip() for name in raw if str(name).strip()]
    return [name.strip() for name in (raw or "").split(",") if name.strip()]


def _normalize_randomize(value) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _parse_battle_config(data: dict) -> dict:
    """Extract the shared battle-config fields from a start payload.

    Point/judge values are stored raw (not resolved) because "auto" points depends on
    the final roster size, which for prelims is only known at commit time. Resolved by
    :func:`_build_game`. Reused by /api/start_game and /api/prelims/commit_selection.
    """
    contestant_judging_enabled = bool(data.get("contestant_judging_enabled", True))
    return {
        "judges": _split_names(data.get("judges", "")),
        "playlist_url": data.get("playlist_url", None),
        "randomize_order": _normalize_randomize(data.get("randomize_order", True)),
        "contestant_judging_enabled": contestant_judging_enabled,
        "simple_contestant_judges": bool(data.get("simple_contestant_judges", False)) and contestant_judging_enabled,
        "points_to_win_mode": data.get("points_to_win_mode", "default"),
        "points_to_win": data.get("points_to_win", None),  # legacy direct value
        "num_contestant_judges": data.get("num_contestant_judges", None),
    }


def _resolve_points_to_win(config: dict, n_lead: int, n_follow: int) -> int:
    """Resolve points_to_win from a battle config given the final roster sizes."""
    points_to_win = config.get("points_to_win", None)
    mode = config.get("points_to_win_mode", "default")

    if points_to_win is not None:
        # Legacy: direct value takes precedence
        try:
            parsed = int(points_to_win)
            return parsed if parsed >= 1 else 7
        except (ValueError, TypeError):
            return 7
    if mode == "auto":
        val = max(n_lead, n_follow) - 1
        return val if val >= 1 else 1
    if mode == "default":
        return 7
    try:
        val = int(mode)
        return val if val >= 1 else 7
    except (ValueError, TypeError):
        return 7


def _resolve_num_contestant_judges(config: dict, num_guest_judges: int):
    """Return (num_contestant_judges | None, warning | None)."""
    raw = config.get("num_contestant_judges", None)
    if raw is None:
        return None, None
    expected = num_guest_judges + 1
    try:
        num = int(raw)
        if num < 0:
            num = 0
        warning = None
        if num != expected:
            warning = (
                f"Warning: You specified {num} contestant judge(s), "
                f"but the recommended number is {expected} "
                f"(1 more than the {num_guest_judges} guest judge(s)). "
                "This may cause undetermined behavior."
            )
        return num, warning
    except (ValueError, TypeError):
        return None, None


def _build_game(lead_names: List[str], follow_names: List[str], config: dict):
    """Build a Game from resolved rosters + a battle config. Applies randomize_order to
    the rosters. Returns (game, warning). Shared by start_game and prelim commit."""
    lead_names = list(lead_names)
    follow_names = list(follow_names)
    if config.get("randomize_order", True):
        random.shuffle(lead_names)
        random.shuffle(follow_names)

    judge_names = config.get("judges", [])
    points_to_win = _resolve_points_to_win(config, len(lead_names), len(follow_names))
    num_contestant_judges, warning = _resolve_num_contestant_judges(config, len(judge_names))

    game = Game(
        lead_names,
        follow_names,
        judge_names,
        contestant_judging_enabled=config.get("contestant_judging_enabled", True),
        simple_contestant_judges=config.get("simple_contestant_judges", False),
        num_contestant_judges=num_contestant_judges,
        points_to_win=points_to_win,
    )
    return game, warning


def _start_game_response(game: Game, session_id: str, config: dict, warning) -> dict:
    """Build the /api/start_game response body for a freshly created game."""
    state = game.get_game_state()
    response = {
        "session_id": session_id,
        "round": state["round"],
        "pair_1": state["pair_1"],
        "pair_2": state["pair_2"],
        "contestant_judges": state["contestant_judges"],
        "guest_judges": game.guest_judges,
        "initial_leads": [c.name for c in game.initial_leads],
        "initial_follows": [c.name for c in game.initial_follows],
        "playlist_url": config.get("playlist_url") or "",
        "simple_contestant_judges": config.get("simple_contestant_judges", False),
        "contestant_judging_enabled": config.get("contestant_judging_enabled", True),
        "randomize_order": config.get("randomize_order", True),
        "points_to_win": game.win_threshold,
        "auto_win_threshold": game.auto_win_threshold,
        "num_contestant_judges": game.num_contestant_judges,
        "expected_contestant_judges": game.expected_contestant_judges,
    }
    if warning:
        response["contestant_judges_warning"] = warning
    return response


@bp.route("/api/start_game", methods=["POST"])
def start_game():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    lead_names = _split_names(data.get("leads", ""))
    follow_names = _split_names(data.get("follows", ""))
    config = _parse_battle_config(data)

    game, warning = _build_game(lead_names, follow_names, config)
    session_id = repo.create(game)

    return jsonify(_start_game_response(game, session_id, config, warning))


# ---- Prelims (preliminary elimination round) --------------------------------


@bp.route("/api/prelims/start", methods=["POST"])
def prelims_start():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    lead_names = _split_names(data.get("leads", ""))
    follow_names = _split_names(data.get("follows", ""))
    if len(lead_names) < 1 or len(follow_names) < 1:
        return jsonify({"error": "Prelims need at least one lead and one follow."}), 400

    config = _parse_battle_config(data)

    def _int_or_none(value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    group_size = _int_or_none(data.get("group_size")) or DEFAULT_GROUP_SIZE
    prelim = Prelim.create(
        lead_names,
        follow_names,
        lead_spots=_int_or_none(data.get("lead_spots")),
        follow_spots=_int_or_none(data.get("follow_spots")),
        group_size=group_size,
        battle_config=config,
    )
    # Optional operator-edited bib numbers from the setup screen.
    if data.get("lead_numbers") or data.get("follow_numbers"):
        prelim.set_numbers(data.get("lead_numbers"), data.get("follow_numbers"))
    # The dedicated setup screen finalizes the roster, so it confirms in one call.
    if data.get("confirm"):
        prelim.confirm()
    session_id = repo.create(prelim)

    response = serialize_prelim(prelim)
    response["session_id"] = session_id
    return jsonify(response)


@bp.route("/api/prelims/state", methods=["GET"])
def prelims_state():
    prelim, error = get_prelim_or_404(request.args.get("session_id"))
    if error:
        return error
    return jsonify(serialize_prelim(prelim))


@bp.route("/api/prelims/start_heat", methods=["POST"])
def prelims_start_heat():
    data = request.get_json() or {}
    session_id = data.get("session_id")
    prelim, error = get_prelim_or_404(session_id)
    if error:
        return error
    prelim.start_heat()
    repo.save(session_id, prelim)
    return jsonify(serialize_prelim(prelim))


@bp.route("/api/prelims/next_phase", methods=["POST"])
def prelims_next_phase():
    """Advance the heat's phase machine one step: rotation -> break -> rotation, hold at
    the music-change intermission, or end the heat. Used by the auto-timer boundary, the
    operator's skip-rotation, and the intermission continue."""
    data = request.get_json() or {}
    session_id = data.get("session_id")
    prelim, error = get_prelim_or_404(session_id)
    if error:
        return error
    prelim.next_phase()
    repo.save(session_id, prelim)
    return jsonify(serialize_prelim(prelim))


@bp.route("/api/prelims/add_participant", methods=["POST"])
def prelims_add_participant():
    data = request.get_json() or {}
    session_id = data.get("session_id")
    prelim, error = get_prelim_or_404(session_id)
    if error:
        return error
    role = data.get("role")
    if role not in ("lead", "follow"):
        return jsonify({"error": "role must be 'lead' or 'follow'"}), 400
    try:
        prelim.add_participant(role, data.get("name", ""), data.get("number"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    repo.save(session_id, prelim)
    return jsonify(serialize_prelim(prelim))


@bp.route("/api/prelims/remove_participant", methods=["POST"])
def prelims_remove_participant():
    data = request.get_json() or {}
    session_id = data.get("session_id")
    prelim, error = get_prelim_or_404(session_id)
    if error:
        return error
    role = data.get("role")
    if role not in ("lead", "follow"):
        return jsonify({"error": "role must be 'lead' or 'follow'"}), 400
    try:
        prelim.remove_participant(role, data.get("name", ""))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    repo.save(session_id, prelim)
    return jsonify(serialize_prelim(prelim))


@bp.route("/api/prelims/confirm", methods=["POST"])
def prelims_confirm():
    data = request.get_json() or {}
    session_id = data.get("session_id")
    prelim, error = get_prelim_or_404(session_id)
    if error:
        return error
    prelim.confirm()
    repo.save(session_id, prelim)
    return jsonify(serialize_prelim(prelim))


@bp.route("/api/prelims/set_numbers", methods=["POST"])
def prelims_set_numbers():
    data = request.get_json() or {}
    session_id = data.get("session_id")
    prelim, error = get_prelim_or_404(session_id)
    if error:
        return error
    try:
        prelim.set_numbers(data.get("lead_numbers"), data.get("follow_numbers"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    repo.save(session_id, prelim)
    return jsonify(serialize_prelim(prelim))


@bp.route("/api/prelims/toggle_pause", methods=["POST"])
def prelims_toggle_pause():
    data = request.get_json() or {}
    session_id = data.get("session_id")
    prelim, error = get_prelim_or_404(session_id)
    if error:
        return error
    prelim.toggle_pause()
    repo.save(session_id, prelim)
    return jsonify(serialize_prelim(prelim))


@bp.route("/api/prelims/advance_heat", methods=["POST"])
def prelims_advance_heat():
    data = request.get_json() or {}
    session_id = data.get("session_id")
    prelim, error = get_prelim_or_404(session_id)
    if error:
        return error
    prelim.advance_heat()
    repo.save(session_id, prelim)
    return jsonify(serialize_prelim(prelim))


@bp.route("/api/prelims/commit_selection", methods=["POST"])
def prelims_commit_selection():
    data = request.get_json() or {}
    session_id = data.get("session_id")
    prelim, error = get_prelim_or_404(session_id)
    if error:
        return error

    try:
        selected_leads, selected_follows = prelim.commit_selection(
            data.get("lead_selections", []),
            data.get("follow_selections", []),
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    repo.save(session_id, prelim)

    # Build the main battle from the advancers (fresh at 0), reusing the stored config.
    game, warning = _build_game(selected_leads, selected_follows, prelim.battle_config)
    new_session_id = repo.create(game)

    response = _start_game_response(game, new_session_id, prelim.battle_config, warning)
    response["prelim_session_id"] = session_id
    return jsonify(response)


@bp.route("/api/get_scores", methods=["GET"])
def get_scores():
    game, error = get_game_or_404(request.args.get("session_id"))
    if error:
        return error

    # Reuse canonical scoreboard
    canon = serialize_state(game)
    return jsonify({"leads": canon["scoreboard"]["leads"], "follows": canon["scoreboard"]["follows"]})


@bp.route("/api/judge_leads", methods=["POST"])
def judge_leads():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    votes = data.get("votes", [])
    song_info = data.get("song_info", {})  # Add song info handling

    if not session_id or not votes:
        return jsonify({"error": "Missing session_id or votes"}), 400

    game, error = get_game_or_404(session_id)
    if error:
        return error

    # Store song info in the current round
    if song_info:
        game.current_round.song_info = song_info

    # Process votes and determine winner
    result = game.judge_round(game.pair_1[0], game.pair_2[0], "lead", votes)

    # Persist game state changes
    repo.save(session_id, game)

    return jsonify(
        {
            "winner": result["winner"],
            "guest_votes": result["guest_votes"],
            "contestant_votes": result["contestant_votes"],
        }
    )


@bp.route("/api/judge_follows", methods=["POST"])
def judge_follows():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    votes = data.get("votes", [])
    song_info = data.get("song_info", {})  # Add song info handling

    if not session_id or not votes:
        return jsonify({"error": "Missing session_id or votes"}), 400

    game, error = get_game_or_404(session_id)
    if error:
        return error

    # Update song info in the current round if not already set
    if song_info and not hasattr(game.current_round, "song_info"):
        game.current_round.song_info = song_info

    # Process votes and determine winner
    result = game.judge_round(game.pair_1[1], game.pair_2[1], "follow", votes)

    # Check for win condition
    win_messages = game.check_for_win() or []

    # Persist game state changes
    repo.save(session_id, game)

    return jsonify(
        {
            "winner": result["winner"],
            "guest_votes": result["guest_votes"],
            "contestant_votes": result["contestant_votes"],
            "win_messages": win_messages,
            "game_finished": game.is_finished(),
        }
    )


@bp.route("/api/judge_combined", methods=["POST"])
def judge_combined():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    lead_votes = data.get("lead_votes", [])
    follow_votes = data.get("follow_votes", [])
    song_info = data.get("song_info", {})

    if not session_id or not lead_votes or not follow_votes:
        return jsonify({"error": "Missing session_id, lead_votes, or follow_votes"}), 400

    game, error = get_game_or_404(session_id)
    if error:
        return error

    # Store song info in the current round
    if song_info:
        game.current_round.song_info = song_info

    # If simple contestant judges is enabled, aggregate the proxy vote to all contestant judges
    def expand_with_mock_contestant_judges(votes_list: List[tuple]) -> List[tuple]:
        try:
            if not getattr(game, "contestant_judging_enabled", True):
                return votes_list
            if not getattr(game, "simple_contestant_judges", False):
                return votes_list
            # Find the proxy vote if present
            proxy_name = "Contestant Judges"
            proxy_votes = [v for v in votes_list if v[0] == proxy_name]
            if not proxy_votes:
                return votes_list
            proxy_decision = proxy_votes[-1][1]
            # Collect the real contestant judge names from current round
            real_cj = list(getattr(game.current_round, "contestant_judges", []) or [])
            # Remove existing contestant judge entries
            filtered = [(v, d) for (v, d) in votes_list if (v not in real_cj and v != proxy_name)]
            # Expand to mock judges, numbered deterministically
            expanded = filtered[:]
            for idx, _name in enumerate(real_cj, start=1):
                expanded.append((f"Contestant Judge {idx}", proxy_decision))
            return expanded
        except Exception:
            return votes_list

    # Expand votes when needed
    lead_votes_effective = expand_with_mock_contestant_judges(lead_votes)
    follow_votes_effective = expand_with_mock_contestant_judges(follow_votes)

    # Process lead votes and determine winner
    lead_result = game.judge_round(game.pair_1[0], game.pair_2[0], "lead", lead_votes_effective)

    # Process follow votes and determine winner
    follow_result = game.judge_round(game.pair_1[1], game.pair_2[1], "follow", follow_votes_effective)

    # Check for win condition
    win_messages = game.check_for_win() or []

    # Persist game state changes
    repo.save(session_id, game)

    return jsonify(
        {
            "lead_winner": lead_result["winner"],
            "lead_guest_votes": lead_result["guest_votes"],
            "lead_contestant_votes": lead_result["contestant_votes"],
            "follow_winner": follow_result["winner"],
            "follow_guest_votes": follow_result["guest_votes"],
            "follow_contestant_votes": follow_result["contestant_votes"],
            "win_messages": win_messages,
            "game_finished": game.is_finished(),
        }
    )


@bp.route("/api/next_round", methods=["POST"])
def next_round():
    data = request.get_json(silent=True) or {}
    game, error = get_game_or_404(data.get("session_id"))
    if error:
        return error
    session_id = data.get("session_id")
    game.next_round()

    # Persist game state changes
    repo.save(session_id, game)

    state = game.get_game_state()

    return jsonify(
        {
            "round": state["round"],
            "pair_1": state["pair_1"],
            "pair_2": state["pair_2"],
            "contestant_judges": state["contestant_judges"],
        }
    )


@bp.route("/api/undo_round", methods=["POST"])
def undo_round():
    """Undo the last completed round and restore the game to that state."""
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    game, error = get_game_or_404(session_id)
    if error:
        return error

    # Attempt to undo the last round
    success = game.undo_round()

    if not success:
        return jsonify({"error": "No rounds to undo"}), 400

    # Persist game state changes
    repo.save(session_id, game)

    # Return the updated state
    return jsonify({"success": True, "message": f"Reverted to round {game.round_num}", "state": serialize_state(game)})


@bp.route("/api/end_game", methods=["POST"])
def end_game():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    game, error = get_game_or_404(session_id)
    if error:
        return error

    # Check for tie-break before marking the game finished
    tiebreak_info = game.detect_tiebreak_needs()
    if tiebreak_info["lead_needed"] or tiebreak_info["follow_needed"]:
        game.start_tiebreak()
        repo.save(session_id, game)
        r = game.current_round
        return jsonify(
            {
                "tiebreak_required": True,
                "lead_needed": tiebreak_info["lead_needed"],
                "follow_needed": tiebreak_info["follow_needed"],
                "tied_leads": tiebreak_info["tied_leads"],
                "tied_follows": tiebreak_info["tied_follows"],
                "lead_max_points": tiebreak_info["lead_max_points"],
                "follow_max_points": tiebreak_info["follow_max_points"],
                "all_leads": [c.name for c in game.initial_leads],
                "all_follows": [c.name for c in game.initial_follows],
                "guest_judges": (r.judges if r else []) or game.guest_judges,
                "contestant_judges": (r.contestant_judges if r else []),
            }
        )

    # No tie-break needed — mark the game as finished and return results
    game.state = 1
    repo.save(session_id, game)
    return jsonify(format_end_game_results(game, session_id))


@bp.route("/api/tiebreak/set_partners", methods=["POST"])
def tiebreak_set_partners():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    lead_selections = data.get("lead_selections", {})
    follow_selections = data.get("follow_selections", {})
    game, error = get_game_or_404(session_id)
    if error:
        return error
    if not game.tiebreak_active:
        return jsonify({"error": "No tie-break in progress"}), 400
    game.set_tiebreak_partner_selections(lead_selections, follow_selections)
    repo.save(session_id, game)
    return jsonify(
        {
            "sub_round": game.tiebreak_sub_round,
            "sr1_pairings": [list(p) for p in game.tiebreak_sub_round_1_pairings],
            "sr2_pairings": [list(p) for p in game.tiebreak_sub_round_2_pairings],
        }
    )


@bp.route("/api/tiebreak/advance", methods=["POST"])
def tiebreak_advance():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    game, error = get_game_or_404(session_id)
    if error:
        return error
    if not game.tiebreak_active:
        return jsonify({"error": "No tie-break in progress"}), 400
    new_phase = game.advance_tiebreak_sub_round()
    repo.save(session_id, game)
    return jsonify({"sub_round": new_phase})


@bp.route("/api/tiebreak/vote", methods=["POST"])
def tiebreak_vote():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    lead_votes_raw = data.get("lead_votes", [])
    follow_votes_raw = data.get("follow_votes", [])
    game, error = get_game_or_404(session_id)
    if error:
        return error
    if not game.tiebreak_active:
        return jsonify({"error": "No tie-break in progress"}), 400

    lead_result = None
    follow_result = None

    if game.tiebreak_lead_needed and lead_votes_raw:
        votes = [(v[0], v[1]) for v in lead_votes_raw]
        lead_result = game.judge_tiebreak("lead", votes)

    if game.tiebreak_follow_needed and follow_votes_raw:
        votes = [(v[0], v[1]) for v in follow_votes_raw]
        follow_result = game.judge_tiebreak("follow", votes)

    repo.save(session_id, game)

    needs_another_round = (lead_result is not None and not lead_result.get("resolved")) or (
        follow_result is not None and not follow_result.get("resolved")
    )
    return jsonify(
        {
            "lead_result": lead_result,
            "follow_result": follow_result,
            "needs_another_round": needs_another_round,
            "tied_leads": [c.name for c in game.tiebreak_leads_tied],
            "tied_follows": [c.name for c in game.tiebreak_follows_tied],
        }
    )


@bp.route("/api/tiebreak/finalize", methods=["POST"])
def tiebreak_finalize():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    game, error = get_game_or_404(session_id)
    if error:
        return error

    game.finalize_tiebreak_results()
    repo.save(session_id, game)

    result = format_end_game_results(game, session_id)
    result["tiebreak_winners"] = {
        "lead": game.winning_lead.name if game.winning_lead else None,
        "follow": game.winning_follow.name if game.winning_follow else None,
    }
    return jsonify(result)


@bp.route("/api/export_battle_data", methods=["GET", "POST"])
def export_battle_data():
    """Export battle data as a portable JSON file (hustlentussle.battle v1)."""
    session_id = request.args.get("session_id")
    game, error = get_game_or_404(session_id)
    if error:
        return error

    posted_rounds = None
    if request.method == "POST" and request.json and "rounds" in request.json:
        posted_rounds = request.json["rounds"]

    export = build_battle_export(game, session_id, posted_rounds)

    response = jsonify(export)
    response.headers["Content-Disposition"] = f'attachment; filename="battle_{session_id}.json"'
    return response


@bp.route("/api/process_uploaded_file", methods=["POST"])
def process_uploaded_file():
    """Load an uploaded battle JSON file and return data for the results display."""
    if "battle_file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["battle_file"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not file.filename.endswith(".json"):
        return jsonify({"error": "File must be a Hustle n' Tussle .json battle file"}), 400

    try:
        payload = json.load(file.stream)
    except Exception:
        return jsonify({"error": "File is not valid JSON"}), 400

    try:
        data = parse_battle_json(payload)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": f"Failed to process file: {e}"}), 500

    return jsonify(data)


@bp.route("/api/results", methods=["GET"])
def get_results():
    """Read-only battle results for a session (for deep-linking /results/<id>).
    Non-mutating; reuses the same shape the live end-of-battle response returns."""
    session_id = request.args.get("session_id")
    game, error = get_game_or_404(session_id)
    if error:
        return error
    return jsonify(format_end_game_results(game, session_id))
