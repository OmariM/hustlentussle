from flask import Flask, render_template, request, jsonify, send_file, redirect, session, abort
from functools import wraps
import sys
import os
import io
import datetime
from werkzeug.utils import secure_filename
import random
import requests
from flask_cors import CORS
from dotenv import load_dotenv
import uuid
import tempfile
import shutil
import threading
import time
import urllib.parse
import json
import base64
import logging
import atexit
from typing import Optional, Dict, List

# Load environment variables from .env file
load_dotenv()

# Add parent directory to path to import game_logic and persistence
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from game_logic import Game, Contestant
from web.config import get_config
from persistence import (
    RepositoryFactory,
    CleanupScheduler,
    PersistenceError,
    MemoryGameRepository,
)
from werkzeug.security import check_password_hash
from stats import StatsRepository, normalize_battle, DuplicateBattleError, StatsError

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Get configuration based on environment
config = get_config()

app = Flask(
    __name__, static_folder=".", static_url_path="", template_folder="."
)  # Set template folder to current directory
app.config.from_object(config)

# Cache-busting for static assets (helps ensure browsers pull latest JS/CSS after deploy)
if not app.config.get("ASSET_VERSION"):
    # Prefer deploy-provided versioning when available; fallback to process start time.
    app.config["ASSET_VERSION"] = (
        os.environ.get("ASSET_VERSION")
        or os.environ.get("RENDER_GIT_COMMIT")
        or os.environ.get("GIT_COMMIT")
        or str(int(time.time()))
    )
CORS(app)

# Stronger cache control: ensure index.html and assets revalidate after deploy.
# This prevents "hard to shake" stale JS/CSS in some browsers/CDNs.
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0


@app.after_request
def add_cache_control_headers(response):
    try:
        path = request.path or ""
        # Never cache the HTML shell; it is the entry point that references versioned assets.
        if path == "/" or response.mimetype == "text/html":
            response.headers["Cache-Control"] = "no-store, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            return response
        # For static assets, require revalidation (query-param versioning already busts caches,
        # but this makes refreshes more reliable across intermediaries).
        if path.endswith(".js") or path.endswith(".css"):
            response.headers["Cache-Control"] = "no-cache, max-age=0, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
    except Exception:
        # Never fail a request due to cache headers.
        pass
    return response


# Initialize game repository using factory
def init_repository():
    """Initialize the game repository based on configuration."""
    database_url = getattr(config, "DATABASE_URL", None)
    fallback_enabled = getattr(config, "PERSISTENCE_FALLBACK_ENABLED", True)
    expiration_seconds = getattr(config, "GAME_EXPIRATION_SECONDS", 6 * 60 * 60)

    try:
        repo = RepositoryFactory.create_repository(
            database_url=database_url,
            fallback_enabled=fallback_enabled,
            expiration_seconds=expiration_seconds,
        )
        logger.info(f"Repository initialized: {type(repo).__name__}")
        return repo
    except PersistenceError as e:
        logger.error(f"Failed to initialize repository: {e}")
        if fallback_enabled:
            logger.warning("Falling back to in-memory repository")
            return MemoryGameRepository(expiration_seconds=expiration_seconds)
        raise


repo = init_repository()


# Initialize the year-to-date stats repository (separate tables, same database).
# Requires DATABASE_URL; when unset (in-memory dev), YTD features are disabled.
def init_stats_repository():
    """Initialize the YTD stats repository if a database is configured."""
    database_url = getattr(config, "DATABASE_URL", None)
    if not database_url:
        logger.warning("DATABASE_URL not set - year-to-date stats features are disabled")
        return None
    try:
        stats = StatsRepository(database_url)
        logger.info("Stats repository initialized")
        return stats
    except Exception as e:  # noqa: BLE001 - never block app startup on stats
        logger.error(f"Failed to initialize stats repository: {e}")
        return None


stats_repo = init_stats_repository()

# Initialize cleanup scheduler
cleanup_scheduler = CleanupScheduler(
    repository=repo,
    interval_seconds=getattr(config, "CLEANUP_INTERVAL_SECONDS", 60 * 60),
)
cleanup_scheduler.start()


# Register cleanup on shutdown
@atexit.register
def shutdown_cleanup():
    """Cleanup on application shutdown."""
    # Guard against cleanup_scheduler not being defined
    # (can happen if init_repository() raised an exception)
    if "cleanup_scheduler" in globals() and cleanup_scheduler is not None:
        logger.info("Shutting down cleanup scheduler...")
        cleanup_scheduler.stop()


# Backwards compatibility for tests that import `games`
# Note: This only works with MemoryGameRepository
# For PostgreSQL, tests should use the repo interface directly
if hasattr(repo, "_games"):
    games = repo._games
else:
    games = {}  # Empty dict as placeholder for non-memory repositories

# In-memory user OAuth token store keyed by provided key (session_id or auth_key)
_spotify_user_tokens: Dict[str, dict] = {}
_spotify_user_tokens_lock = threading.RLock()


def _resolve_key(session_id: Optional[str], auth_key: Optional[str]) -> Optional[str]:
    return auth_key or session_id


def _get_redirect_uri() -> str:
    # Prefer explicit env var; else infer from request
    env_uri = os.getenv("SPOTIFY_REDIRECT_URI")
    if env_uri:
        return env_uri
    try:
        base = request.host_url.rstrip("/")
        return f"{base}/api/spotify/callback"
    except Exception:
        # Fallback localhost
        return "http://localhost:5000/api/spotify/callback"


def _now() -> float:
    return time.time()


def _store_user_tokens(key: str, access_token: str, refresh_token: Optional[str], expires_in: int) -> None:
    if not key:
        return
    with _spotify_user_tokens_lock:
        _spotify_user_tokens[key] = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": _now() + max(1, int(expires_in) - 30),  # refresh a bit early
        }


def _get_user_tokens(key: str) -> Optional[dict]:
    if not key:
        return None
    with _spotify_user_tokens_lock:
        return _spotify_user_tokens.get(key)


def _refresh_user_token(key: str) -> Optional[str]:
    tokens = _get_user_tokens(key)
    if not tokens or not tokens.get("refresh_token"):
        return None
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None
    resp = requests.post(
        "https://accounts.spotify.com/api/token",
        auth=(client_id, client_secret),
        data={"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"]},
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    access_token = data.get("access_token")
    expires_in = int(data.get("expires_in", 3600))
    # Spotify may or may not return a new refresh token
    refresh_token = data.get("refresh_token", tokens["refresh_token"])
    _store_user_tokens(key, access_token, refresh_token, expires_in)
    return access_token


def _ensure_user_access_token(key: str) -> Optional[str]:
    tokens = _get_user_tokens(key)
    if not tokens:
        return None
    if tokens.get("expires_at", 0) <= _now():
        return _refresh_user_token(key)
    return tokens.get("access_token")


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
            "lead": (_champs["lead"]["name"] if _champs is not None
                     else (game.winning_lead.name if getattr(game, "winning_lead", None) else None)),
            "follow": (_champs["follow"]["name"] if _champs is not None
                       else (game.winning_follow.name if getattr(game, "winning_follow", None) else None)),
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


@app.route("/")
def index():
    return render_template("index.html", config=app.config)


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint to verify persistence status."""
    repo_type = type(repo).__name__
    game_count = len(repo.list_sessions()) if hasattr(repo, "list_sessions") else "unknown"

    return jsonify(
        {
            "status": "healthy",
            "persistence": {
                "repository_type": repo_type,
                "using_postgres": repo_type == "PostgresGameRepository",
                "active_games": game_count,
            },
        }
    )


@app.route("/api/state", methods=["GET"])
def get_state():
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400
    game = repo.get(session_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404
    return jsonify(serialize_state(game))


@app.route("/api/start_game", methods=["POST"])
def start_game():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    lead_names = data.get("leads", "").split(",")
    follow_names = data.get("follows", "").split(",")
    judge_names = data.get("judges", "").split(",")
    playlist_url = data.get("playlist_url", None)
    randomize_order = data.get("randomize_order", True)
    contestant_judging_enabled = bool(data.get("contestant_judging_enabled", True))
    simple_contestant_judges = bool(data.get("simple_contestant_judges", False)) and contestant_judging_enabled

    # Filter out any empty names
    lead_names = [name.strip() for name in lead_names if name.strip()]
    follow_names = [name.strip() for name in follow_names if name.strip()]
    judge_names = [name.strip() for name in judge_names if name.strip()]

    # Parse points_to_win_mode: "default" (7), "auto" (formula), or numeric value
    points_to_win_mode = data.get("points_to_win_mode", "default")
    points_to_win = data.get("points_to_win", None)  # Legacy support

    if points_to_win is not None:
        # Legacy: direct points_to_win value takes precedence
        try:
            parsed = int(points_to_win)
            if parsed >= 1:
                points_to_win = parsed
            else:
                points_to_win = 7
        except (ValueError, TypeError):
            points_to_win = 7
    elif points_to_win_mode == "auto":
        # Auto-calculate based on number of contestants
        points_to_win = max(len(lead_names), len(follow_names)) - 1
        if points_to_win < 1:
            points_to_win = 1
    elif points_to_win_mode == "default":
        points_to_win = 7
    else:
        # Treat as custom numeric value
        try:
            points_to_win = int(points_to_win_mode)
            if points_to_win < 1:
                points_to_win = 7
        except (ValueError, TypeError):
            points_to_win = 7

    # Parse num_contestant_judges
    num_contestant_judges_raw = data.get("num_contestant_judges", None)
    num_contestant_judges = None
    contestant_judges_warning = None
    expected_contestant_judges = len(judge_names) + 1

    if num_contestant_judges_raw is not None:
        try:
            num_contestant_judges = int(num_contestant_judges_raw)
            if num_contestant_judges < 0:
                num_contestant_judges = 0
            # Check if it violates the recommended rule
            if num_contestant_judges != expected_contestant_judges:
                contestant_judges_warning = (
                    f"Warning: You specified {num_contestant_judges} contestant judge(s), "
                    f"but the recommended number is {expected_contestant_judges} "
                    f"(1 more than the {len(judge_names)} guest judge(s)). "
                    "This may cause undetermined behavior."
                )
        except (ValueError, TypeError):
            num_contestant_judges = None

    # Determine whether to randomize order
    if isinstance(randomize_order, str):
        randomize_order = randomize_order.strip().lower() in {"1", "true", "yes", "on"}
    randomize_order = bool(randomize_order)

    # Randomize the order of leads and follows if requested
    if randomize_order:
        random.shuffle(lead_names)
        random.shuffle(follow_names)

    # Create a new game with the configuration
    game = Game(
        lead_names,
        follow_names,
        judge_names,
        contestant_judging_enabled=contestant_judging_enabled,
        simple_contestant_judges=simple_contestant_judges,
        num_contestant_judges=num_contestant_judges,
        points_to_win=points_to_win,
    )

    session_id = repo.create(game)

    # Get initial game state
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
        "playlist_url": playlist_url or "",
        "simple_contestant_judges": simple_contestant_judges,
        "contestant_judging_enabled": contestant_judging_enabled,
        "randomize_order": randomize_order,
        "points_to_win": game.win_threshold,
        "auto_win_threshold": game.auto_win_threshold,
        "num_contestant_judges": game.num_contestant_judges,
        "expected_contestant_judges": game.expected_contestant_judges,
    }

    # Add warning if contestant judges rule is violated
    if contestant_judges_warning:
        response["contestant_judges_warning"] = contestant_judges_warning

    return jsonify(response)


@app.route("/api/get_scores", methods=["GET"])
def get_scores():
    session_id = request.args.get("session_id")

    game = repo.get(session_id) if session_id else None
    if not game:
        return jsonify({"error": "Game not found"}), 404

    # Reuse canonical scoreboard
    canon = serialize_state(game)
    return jsonify({"leads": canon["scoreboard"]["leads"], "follows": canon["scoreboard"]["follows"]})


@app.route("/api/judge_leads", methods=["POST"])
def judge_leads():
    data = request.get_json()
    session_id = data.get("session_id")
    votes = data.get("votes", [])
    song_info = data.get("song_info", {})  # Add song info handling

    if not session_id or not votes:
        return jsonify({"error": "Missing session_id or votes"}), 400

    game = repo.get(session_id)
    if not game:
        return jsonify({"error": "Invalid session ID"}), 400

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


@app.route("/api/judge_follows", methods=["POST"])
def judge_follows():
    data = request.get_json()
    session_id = data.get("session_id")
    votes = data.get("votes", [])
    song_info = data.get("song_info", {})  # Add song info handling

    if not session_id or not votes:
        return jsonify({"error": "Missing session_id or votes"}), 400

    game = repo.get(session_id)
    if not game:
        return jsonify({"error": "Invalid session ID"}), 400

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


@app.route("/api/judge_combined", methods=["POST"])
def judge_combined():
    data = request.get_json()
    session_id = data.get("session_id")
    lead_votes = data.get("lead_votes", [])
    follow_votes = data.get("follow_votes", [])
    song_info = data.get("song_info", {})

    if not session_id or not lead_votes or not follow_votes:
        return jsonify({"error": "Missing session_id, lead_votes, or follow_votes"}), 400

    game = repo.get(session_id)
    if not game:
        return jsonify({"error": "Invalid session ID"}), 400

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


@app.route("/api/next_round", methods=["POST"])
def next_round():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    session_id = data.get("session_id")

    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    game = repo.get(session_id)
    if not game:
        return jsonify({"error": "Invalid session ID"}), 400
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


@app.route("/api/undo_round", methods=["POST"])
def undo_round():
    """Undo the last completed round and restore the game to that state."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    session_id = data.get("session_id")

    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    game = repo.get(session_id)
    if not game:
        return jsonify({"error": "Invalid session ID"}), 400

    # Attempt to undo the last round
    success = game.undo_round()

    if not success:
        return jsonify({"error": "No rounds to undo"}), 400

    # Persist game state changes
    repo.save(session_id, game)

    # Return the updated state
    return jsonify({"success": True, "message": f"Reverted to round {game.round_num}", "state": serialize_state(game)})


@app.route("/api/end_game", methods=["POST"])
def end_game():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    session_id = data.get("session_id")

    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    game = repo.get(session_id)
    if not game:
        return jsonify({"error": "Invalid session ID"}), 400

    # Check for tie-break before marking the game finished
    tiebreak_info = game.detect_tiebreak_needs()
    if tiebreak_info['lead_needed'] or tiebreak_info['follow_needed']:
        game.start_tiebreak()
        repo.save(session_id, game)
        r = game.current_round
        return jsonify({
            'tiebreak_required': True,
            'lead_needed': tiebreak_info['lead_needed'],
            'follow_needed': tiebreak_info['follow_needed'],
            'tied_leads': tiebreak_info['tied_leads'],
            'tied_follows': tiebreak_info['tied_follows'],
            'lead_max_points': tiebreak_info['lead_max_points'],
            'follow_max_points': tiebreak_info['follow_max_points'],
            'all_leads': [c.name for c in game.initial_leads],
            'all_follows': [c.name for c in game.initial_follows],
            'guest_judges': (r.judges if r else []) or game.guest_judges,
            'contestant_judges': (r.contestant_judges if r else []),
        })

    # No tie-break needed — mark the game as finished and return results
    game.state = 1
    repo.save(session_id, game)
    return jsonify(_format_end_game_results(game, session_id))


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


def _format_end_game_results(game, session_id):
    """Shared results-formatting logic used by end_game and tiebreak/finalize."""
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
            rounds_data.append({
                "round_num": r.round_num, "session_id": session_id,
                "pairs": r.pairs, "lead_votes": r.lead_votes, "follow_votes": r.follow_votes,
                "judges": r.judges, "contestant_judges": r.contestant_judges,
                "win_messages": r.win_messages, "lead_winner": r.lead_winner,
                "follow_winner": r.follow_winner,
                "song_info": r.song_info if hasattr(r, "song_info") else None,
            })
    if game.current_round and game.current_round not in game.rounds:
        if hasattr(game.current_round, "session_id") and game.current_round.session_id == session_id:
            r = game.current_round
            rounds_data.append({
                "round_num": r.round_num, "session_id": session_id,
                "pairs": r.pairs, "lead_votes": r.lead_votes, "follow_votes": r.follow_votes,
                "judges": r.judges, "contestant_judges": r.contestant_judges,
                "win_messages": r.win_messages, "lead_winner": r.lead_winner,
                "follow_winner": r.follow_winner,
                "song_info": r.song_info if hasattr(r, "song_info") else None,
            })
    rounds_data.sort(key=lambda x: x["round_num"])

    # When a tiebreak was resolved, replace the incomplete pre-tiebreak round entry
    # with a synthetic entry listing the original tiebreak participants so the battle
    # graphic badges land on the right people.
    if (game.tiebreak_lead_winner or game.tiebreak_follow_winner) and game.current_round:
        last_round_num = game.current_round.round_num
        rounds_data = [rd for rd in rounds_data if rd.get("round_num") != last_round_num]
        rounds_data.append({
            "round_num": last_round_num,
            "tiebreak": True,
            "tiebreak_leads": [c.name for c in game.tiebreak_original_leads],
            "tiebreak_follows": [c.name for c in game.tiebreak_original_follows],
            "lead_winner": game.tiebreak_lead_winner.name if game.tiebreak_lead_winner else None,
            "follow_winner": game.tiebreak_follow_winner.name if game.tiebreak_follow_winner else None,
            "pairs": None, "lead_votes": None, "follow_votes": None,
            "judges": None, "contestant_judges": None,
            "win_messages": None, "song_info": None,
        })
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


@app.route("/api/tiebreak/set_partners", methods=["POST"])
def tiebreak_set_partners():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    session_id = data.get("session_id")
    lead_selections = data.get("lead_selections", {})
    follow_selections = data.get("follow_selections", {})
    game = repo.get(session_id)
    if not game:
        return jsonify({"error": "Invalid session ID"}), 400
    if not game.tiebreak_active:
        return jsonify({"error": "No tie-break in progress"}), 400
    game.set_tiebreak_partner_selections(lead_selections, follow_selections)
    repo.save(session_id, game)
    return jsonify({
        "sub_round": game.tiebreak_sub_round,
        "sr1_pairings": [list(p) for p in game.tiebreak_sub_round_1_pairings],
        "sr2_pairings": [list(p) for p in game.tiebreak_sub_round_2_pairings],
    })


@app.route("/api/tiebreak/advance", methods=["POST"])
def tiebreak_advance():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    session_id = data.get("session_id")
    game = repo.get(session_id)
    if not game:
        return jsonify({"error": "Invalid session ID"}), 400
    if not game.tiebreak_active:
        return jsonify({"error": "No tie-break in progress"}), 400
    new_phase = game.advance_tiebreak_sub_round()
    repo.save(session_id, game)
    return jsonify({"sub_round": new_phase})


@app.route("/api/tiebreak/vote", methods=["POST"])
def tiebreak_vote():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    session_id = data.get("session_id")
    lead_votes_raw = data.get("lead_votes", [])
    follow_votes_raw = data.get("follow_votes", [])
    game = repo.get(session_id)
    if not game:
        return jsonify({"error": "Invalid session ID"}), 400
    if not game.tiebreak_active:
        return jsonify({"error": "No tie-break in progress"}), 400

    lead_result = None
    follow_result = None

    if game.tiebreak_lead_needed and lead_votes_raw:
        votes = [(v[0], v[1]) for v in lead_votes_raw]
        lead_result = game.judge_tiebreak('lead', votes)

    if game.tiebreak_follow_needed and follow_votes_raw:
        votes = [(v[0], v[1]) for v in follow_votes_raw]
        follow_result = game.judge_tiebreak('follow', votes)

    repo.save(session_id, game)

    needs_another_round = (
        (lead_result is not None and not lead_result.get('resolved')) or
        (follow_result is not None and not follow_result.get('resolved'))
    )
    return jsonify({
        "lead_result": lead_result,
        "follow_result": follow_result,
        "needs_another_round": needs_another_round,
        "tied_leads": [c.name for c in game.tiebreak_leads_tied],
        "tied_follows": [c.name for c in game.tiebreak_follows_tied],
    })


@app.route("/api/tiebreak/finalize", methods=["POST"])
def tiebreak_finalize():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    session_id = data.get("session_id")
    game = repo.get(session_id)
    if not game:
        return jsonify({"error": "Invalid session ID"}), 400

    game.finalize_tiebreak_results()
    repo.save(session_id, game)

    result = _format_end_game_results(game, session_id)
    result["tiebreak_winners"] = {
        "lead": game.winning_lead.name if game.winning_lead else None,
        "follow": game.winning_follow.name if game.winning_follow else None,
    }
    return jsonify(result)


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


@app.route("/api/export_battle_data", methods=["GET", "POST"])
def export_battle_data():
    """Export battle data as a portable JSON file (hustlentussle.battle v1)."""
    session_id = request.args.get("session_id")

    if not repo.exists(session_id):
        return jsonify({"error": "Game not found"}), 404

    game = repo.get(session_id)

    posted_rounds = None
    if request.method == "POST" and request.json and "rounds" in request.json:
        posted_rounds = request.json["rounds"]

    export = build_battle_export(game, session_id, posted_rounds)

    response = jsonify(export)
    response.headers["Content-Disposition"] = f'attachment; filename="battle_{session_id}.json"'
    return response


@app.route("/api/process_uploaded_file", methods=["POST"])
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
        print(f"Error processing battle file: {e}")
        return jsonify({"error": f"Failed to process file: {e}"}), 500

    return jsonify(data)


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
            medal = ["\U0001F947", "\U0001F948", "\U0001F949"][idx] if idx < 3 else ""
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
        # Tie-break rounds (see _format_end_game_results) have no normal pairs; carry
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


@app.route("/api/get_spotify_token", methods=["GET"])
def get_spotify_token():
    try:
        # Get client credentials from environment variables
        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")

        if not client_id or not client_secret:
            return jsonify({"error": "Spotify credentials not configured"}), 500

        # Request access token from Spotify
        auth_response = requests.post(
            "https://accounts.spotify.com/api/token",
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials"},
        )

        if auth_response.status_code != 200:
            return jsonify({"error": "Failed to get Spotify access token"}), 500

        return jsonify(auth_response.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/spotify/callback", methods=["GET"])
def spotify_callback():
    """Spotify OAuth callback endpoint."""
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    if error:
        return f"Authentication failed: {error}"

    if not code or not state:
        return "Authentication failed: Missing code or state."

    try:
        # Decode the state parameter
        decoded_state = urllib.parse.unquote(state)
        state_data = json.loads(base64.b64decode(decoded_state).decode("utf-8"))
        session_id = state_data.get("session_id")
        return_to = state_data.get("return_to")
        auth_key = state_data.get("auth_key")

        if not session_id:
            return "Authentication failed: Invalid state."

        # Exchange the authorization code for an access token
        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
        if not client_id or not client_secret:
            return "Spotify credentials not configured."

        token_resp = requests.post(
            "https://accounts.spotify.com/api/token",
            auth=(client_id, client_secret),
            data={"grant_type": "authorization_code", "code": code, "redirect_uri": _get_redirect_uri()},
        )
        if token_resp.status_code != 200:
            return f"Failed to exchange code for token: {token_resp.status_code} - {token_resp.text}"

        tokens = token_resp.json()
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        expires_in = int(tokens.get("expires_in", 3600))

        if not access_token:
            return "Authentication failed: No access token received."

        # Store tokens using the resolved key
        _store_user_tokens(_resolve_key(session_id, auth_key), access_token, refresh_token, expires_in)

        # Redirect to the return_to URL if provided, otherwise to the game page
        if return_to:
            return redirect(return_to)
        else:
            return redirect(f"{request.host_url}?session_id={session_id}")
    except Exception as e:
        return f"Authentication failed: {str(e)}"


@app.route("/api/spotify/authorize", methods=["GET"])
def spotify_authorize():
    """Initiates Spotify OAuth flow."""
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    # Check if user is already authenticated for this session
    tokens = _get_user_tokens(_resolve_key(session_id, None))  # Pass None for auth_key
    if tokens and tokens.get("expires_at", 0) > _now():
        return jsonify({"message": "User already authenticated for this session."})

    redirect_uri = _get_redirect_uri()
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    if not client_id:
        return jsonify({"error": "Spotify client ID not configured"}), 500

    scopes = [
        "user-read-private",
        "user-read-email",
        "user-read-playback-state",
        "user-modify-playback-state",
        "streaming",
    ]
    scope_str = " ".join(scopes)

    # Encode state for redirect
    state_data = {
        "session_id": session_id,
        "return_to": request.args.get("return_to"),  # Optional: redirect back to a specific page
        "auth_key": request.args.get("auth_key"),  # Optional: a unique key for this auth attempt
    }
    encoded_state = base64.b64encode(json.dumps(state_data).encode("utf-8")).decode("utf-8")

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scope_str,
        "state": encoded_state,
    }
    auth_url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode(params)
    return redirect(auth_url)


@app.route("/api/spotify/user_token", methods=["GET"])
def spotify_user_token():
    """Expose the current user's access token for the Web Playback SDK."""
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400
    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "Not authorized"}), 401
    tokens = _get_user_tokens(_resolve_key(session_id, None)) or {}  # Pass None for auth_key
    return jsonify(
        {
            "access_token": access_token,
            "expires_at": tokens.get("expires_at"),
        }
    )


@app.route("/api/spotify/current_track", methods=["GET"])
def spotify_current_track():
    """Gets the currently playing track from the user's Spotify account."""
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "User not authenticated or token expired."}), 401

    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        resp = requests.get("https://api.spotify.com/v1/me/player/currently-playing", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            item = data.get("item")
            if item:
                return jsonify(
                    {
                        "is_playing": data.get("is_playing"),
                        "track_name": item.get("name"),
                        "artist_name": ", ".join([a.get("name") for a in item.get("artists", []) if a]),
                        "spotify_url": item.get("external_urls", {}).get("spotify"),
                        "duration_ms": item.get("duration_ms"),
                        "progress_ms": data.get("progress_ms"),
                    }
                )
            else:
                return jsonify({"is_playing": False, "track_name": None, "artist_name": None})
        elif resp.status_code == 401:
            # Token might be expired, try to refresh
            access_token = _refresh_user_token(_resolve_key(session_id, None))  # Pass None for auth_key
            if not access_token:
                return jsonify({"error": "Failed to refresh Spotify token."}), 500
            headers = {"Authorization": f"Bearer {access_token}"}
            resp = requests.get("https://api.spotify.com/v1/me/player/currently-playing", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                item = data.get("item")
                if item:
                    return jsonify(
                        {
                            "is_playing": data.get("is_playing"),
                            "track_name": item.get("name"),
                            "artist_name": ", ".join([a.get("name") for a in item.get("artists", []) if a]),
                            "spotify_url": item.get("external_urls", {}).get("spotify"),
                            "duration_ms": item.get("duration_ms"),
                            "progress_ms": data.get("progress_ms"),
                        }
                    )
                else:
                    return jsonify({"is_playing": False, "track_name": None, "artist_name": None})
            else:
                return jsonify(
                    {
                        "error": "Failed to fetch currently playing track after refresh.",
                        "status": resp.status_code,
                        "details": resp.json(),
                    }
                ), 502
        else:
            return jsonify(
                {"error": "Failed to fetch currently playing track", "status": resp.status_code, "details": resp.json()}
            ), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/spotify/play_track", methods=["POST"])
def spotify_play_track():
    """Plays a track on the user's Spotify account."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    session_id = data.get("session_id")
    track_uri = data.get("track_uri")
    device_id = data.get("device_id")

    if not session_id or not track_uri:
        return jsonify({"error": "Missing session_id or track_uri"}), 400

    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "User not authenticated or token expired."}), 401

    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        url = "https://api.spotify.com/v1/me/player/play"
        if device_id:
            url += f"?device_id={device_id}"
        resp = requests.put(url, headers=headers, json={"uris": [track_uri]})
        if resp.status_code == 204:
            return jsonify({"message": "Track started successfully."})
        elif resp.status_code == 401:
            access_token = _refresh_user_token(_resolve_key(session_id, None))  # Pass None for auth_key
            if not access_token:
                return jsonify({"error": "Failed to refresh Spotify token."}), 500
            headers = {"Authorization": f"Bearer {access_token}"}
            resp = requests.put(url, headers=headers, json={"uris": [track_uri]})
            if resp.status_code == 204:
                return jsonify({"message": "Track started successfully after refresh."})
            else:
                return jsonify(
                    {
                        "error": "Failed to start track after refresh.",
                        "status": resp.status_code,
                        "details": resp.json(),
                    }
                ), 502
        else:
            return jsonify({"error": "Failed to start track", "status": resp.status_code, "details": resp.json()}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/spotify/pause_track", methods=["POST"])
def spotify_pause_track():
    """Pauses the user's Spotify account."""
    session_id = request.args.get("session_id")
    device_id = request.args.get("device_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "User not authenticated or token expired."}), 401

    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        url = "https://api.spotify.com/v1/me/player/pause"
        if device_id:
            url += f"?device_id={device_id}"
        resp = requests.put(url, headers=headers)
        if resp.status_code == 204:
            return jsonify({"message": "Track paused successfully."})
        elif resp.status_code == 401:
            access_token = _refresh_user_token(_resolve_key(session_id, None))  # Pass None for auth_key
            if not access_token:
                return jsonify({"error": "Failed to refresh Spotify token."}), 500
            headers = {"Authorization": f"Bearer {access_token}"}
            resp = requests.put(url, headers=headers)
            if resp.status_code == 204:
                return jsonify({"message": "Track paused successfully after refresh."})
            else:
                return jsonify(
                    {
                        "error": "Failed to pause track after refresh.",
                        "status": resp.status_code,
                        "details": resp.json(),
                    }
                ), 502
        else:
            return jsonify({"error": "Failed to pause track", "status": resp.status_code, "details": resp.json()}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/spotify/next_track", methods=["POST"])
def spotify_next_track():
    """Skips to the next track on the user's Spotify account."""
    session_id = request.args.get("session_id")
    device_id = request.args.get("device_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "User not authenticated or token expired."}), 401

    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        url = "https://api.spotify.com/v1/me/player/next"
        if device_id:
            url += f"?device_id={device_id}"
        resp = requests.post(url, headers=headers)
        if resp.status_code == 204:
            return jsonify({"message": "Track skipped successfully."})
        elif resp.status_code == 401:
            access_token = _refresh_user_token(_resolve_key(session_id, None))  # Pass None for auth_key
            if not access_token:
                return jsonify({"error": "Failed to refresh Spotify token."}), 500
            headers = {"Authorization": f"Bearer {access_token}"}
            resp = requests.post(url, headers=headers)
            if resp.status_code == 204:
                return jsonify({"message": "Track skipped successfully after refresh."})
            else:
                return jsonify(
                    {"error": "Failed to skip track after refresh.", "status": resp.status_code, "details": resp.json()}
                ), 502
        else:
            return jsonify({"error": "Failed to skip track", "status": resp.status_code, "details": resp.json()}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/spotify/previous_track", methods=["POST"])
def spotify_previous_track():
    """Goes back to the previous track on the user's Spotify account."""
    session_id = request.args.get("session_id")
    device_id = request.args.get("device_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    access_token = _ensure_user_access_token(_resolve_key(session_id, None))  # Pass None for auth_key
    if not access_token:
        return jsonify({"error": "User not authenticated or token expired."}), 401

    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        url = "https://api.spotify.com/v1/me/player/previous"
        if device_id:
            url += f"?device_id={device_id}"
        resp = requests.post(url, headers=headers)
        if resp.status_code == 204:
            return jsonify({"message": "Track went back successfully."})
        elif resp.status_code == 401:
            access_token = _refresh_user_token(_resolve_key(session_id, None))  # Pass None for auth_key
            if not access_token:
                return jsonify({"error": "Failed to refresh Spotify token."}), 500
            headers = {"Authorization": f"Bearer {access_token}"}
            resp = requests.post(url, headers=headers)
            if resp.status_code == 204:
                return jsonify({"message": "Track went back successfully after refresh."})
            else:
                return jsonify(
                    {
                        "error": "Failed to go back track after refresh.",
                        "status": resp.status_code,
                        "details": resp.json(),
                    }
                ), 502
        else:
            return jsonify(
                {"error": "Failed to go back track", "status": resp.status_code, "details": resp.json()}
            ), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/spotify/playlist_tracks", methods=["GET"])
def spotify_playlist_tracks():
    """Server-side proxy to fetch all tracks for a public Spotify playlist.
    Returns a simplified JSON structure: { tracks: [ { id, name, artists } ] }
    """
    try:
        playlist_id = request.args.get("playlist_id")
        if not playlist_id:
            return jsonify({"error": "Missing playlist_id"}), 400

        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
        if not client_id or not client_secret:
            return jsonify({"error": "Spotify credentials not configured"}), 500

        # Get access token
        token_resp = requests.post(
            "https://accounts.spotify.com/api/token",
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials"},
        )
        if token_resp.status_code != 200:
            return jsonify({"error": "Failed to get Spotify access token"}), 500
        access_token = token_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {access_token}"}

        # Fetch tracks (paginate)
        url = f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks?limit=100"
        tracks = []
        visited = set()
        while url and url not in visited:
            visited.add(url)
            resp = requests.get(url, headers=headers)
            if resp.status_code == 401:
                # Try to refresh token once
                token_resp = requests.post(
                    "https://accounts.spotify.com/api/token",
                    auth=(client_id, client_secret),
                    data={"grant_type": "client_credentials"},
                )
                if token_resp.status_code != 200:
                    return jsonify({"error": "Failed to refresh Spotify token"}), 500
                access_token = token_resp.json().get("access_token")
                headers = {"Authorization": f"Bearer {access_token}"}
                resp = requests.get(url, headers=headers)
            if resp.status_code != 200:
                try:
                    return jsonify(
                        {"error": "Failed to fetch playlist tracks", "status": resp.status_code, "details": resp.json()}
                    ), 502
                except Exception:
                    return jsonify({"error": "Failed to fetch playlist tracks", "status": resp.status_code}), 502
            data = resp.json()
            items = data.get("items", [])
            for item in items:
                t = (item or {}).get("track") or {}
                tid = t.get("id")
                if not tid:
                    continue
                tracks.append(
                    {
                        "id": tid,
                        "name": t.get("name", ""),
                        "artists": ", ".join([a.get("name", "") for a in t.get("artists", []) if a]),
                    }
                )
            url = data.get("next")

        # Deduplicate by id
        unique = []
        seen = set()
        for t in tracks:
            if t["id"] in seen:
                continue
            seen.add(t["id"])
            unique.append(t)

        return jsonify({"tracks": unique})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =========================================================================
# Year-to-date stats + admin authentication
# =========================================================================


def admin_required(f):
    """Guard an endpoint so only a logged-in admin (Flask session) can call it."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("admin_id"):
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)

    return wrapper


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503
    admin = stats_repo.get_admin_by_email(email)
    if not admin or not check_password_hash(admin["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401
    session["admin_id"] = str(admin["id"])
    session["admin_email"] = admin["email"]
    return jsonify({"authenticated": True, "email": admin["email"]})


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin_id", None)
    session.pop("admin_email", None)
    return jsonify({"success": True})


@app.route("/api/admin/me", methods=["GET"])
def admin_me():
    if session.get("admin_id"):
        return jsonify({"authenticated": True, "email": session.get("admin_email")})
    return jsonify({"authenticated": False})


@app.route("/api/stats/years", methods=["GET"])
def stats_years():
    if stats_repo is None:
        return jsonify({"years": []})
    return jsonify({"years": stats_repo.list_years()})


@app.route("/api/stats/year-to-date", methods=["GET"])
def stats_year_to_date():
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503
    year = request.args.get("year", type=int)
    if not year:
        years = stats_repo.list_years()
        year = years[0] if years else datetime.datetime.now().year
    standings = stats_repo.get_ytd_standings(year)
    for role in ("leads", "follows"):
        for row in standings[role]:
            row["dancer_id"] = str(row["dancer_id"])
            row["total_points"] = int(row["total_points"] or 0)
            row["crowns"] = int(row["crowns"] or 0)
            row["battles_entered"] = int(row["battles_entered"] or 0)
            row["round_wins"] = int(row["round_wins"] or 0)
    return jsonify({"year": year, **standings})


@app.route("/api/stats/battles", methods=["GET"])
def stats_battles():
    if stats_repo is None:
        return jsonify({"battles": []})
    year = request.args.get("year", type=int)
    battles = stats_repo.list_battles(year)
    for b in battles:
        b["id"] = str(b["id"])
        b["battle_date"] = b["battle_date"].isoformat() if b.get("battle_date") else None
        b["created_at"] = b["created_at"].isoformat() if b.get("created_at") else None
        b["result_count"] = int(b.get("result_count") or 0)
    return jsonify({"battles": battles})


def _resolution_proposal(names):
    """For each battle name, propose a matching canonical dancer (or 'new')."""
    proposals = []
    for name in names:
        match = stats_repo.find_dancer_by_name(name)
        proposals.append(
            {
                "name": name,
                "suggested_dancer_id": str(match["id"]) if match else None,
                "suggested_display_name": match["display_name"] if match else name,
                "is_new": match is None,
            }
        )
    return proposals


@app.route("/api/stats/ingest/preview", methods=["POST"])
@admin_required
def stats_ingest_preview():
    """Normalize an uploaded .json battle file or a finished live battle and propose
    name mappings. Does not write anything."""
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503

    if "battle_file" in request.files:
        file = request.files["battle_file"]
        if not file or not file.filename:
            return jsonify({"error": "No file selected"}), 400
        if not file.filename.endswith(".json"):
            return jsonify({"error": "File must be a Hustle n' Tussle .json battle file"}), 400
        try:
            payload = json.load(file.stream)
        except Exception:
            return jsonify({"error": "File is not valid JSON"}), 400
        try:
            parse_battle_json(payload)  # validate format/version (raises ValueError)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        source = "upload"
        session_id = payload.get("session_id")
    else:
        data = request.get_json(silent=True) or {}
        session_id = data.get("session_id")
        if not session_id or not repo.exists(session_id):
            return jsonify({"error": "Battle not found"}), 404
        game = repo.get(session_id)
        payload = build_battle_export(game, session_id)
        source = "live"

    norm = normalize_battle(payload)
    dancers = [{"id": str(d["id"]), "display_name": d["display_name"]} for d in stats_repo.list_dancers()]
    return jsonify(
        {
            "source": source,
            "session_id": session_id,
            "results": norm["results"],
            "names": _resolution_proposal(norm["names"]),
            "dancers": dancers,
            "raw_payload": payload,
        }
    )


@app.route("/api/stats/ingest/commit", methods=["POST"])
@admin_required
def stats_ingest_commit():
    """Persist a previewed battle: create/resolve dancers, insert battle + results."""
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503
    data = request.get_json(silent=True) or {}
    name = (data.get("battle_name") or "").strip()
    battle_date = (data.get("battle_date") or "").strip()
    results = data.get("results")
    resolutions = data.get("resolutions") or {}
    raw_payload = data.get("raw_payload") or {}
    source = data.get("source") if data.get("source") in ("live", "upload") else "upload"
    session_id = data.get("session_id")

    if not name or not battle_date or not results:
        return jsonify({"error": "battle_name, battle_date and results are required"}), 400

    meta = {
        "name": name,
        "battle_date": battle_date,
        "source": source,
        "session_id": session_id,
        "uploaded_by": session.get("admin_id"),
    }
    try:
        battle_id = stats_repo.create_battle(meta, raw_payload, results, resolutions)
    except DuplicateBattleError as e:
        return jsonify({"error": str(e)}), 409
    except StatsError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "battle_id": str(battle_id)})


@app.route("/api/stats/battles/<battle_id>", methods=["DELETE"])
@admin_required
def stats_delete_battle(battle_id):
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503
    if not stats_repo.delete_battle(battle_id):
        return jsonify({"error": "Battle not found"}), 404
    return jsonify({"success": True})


@app.route("/api/results", methods=["GET"])
def get_results():
    """Read-only battle results for a session (for deep-linking /results/<id>).
    Non-mutating; reuses the same shape the live end-of-battle response returns."""
    session_id = request.args.get("session_id")
    game = repo.get(session_id) if session_id else None
    if not game:
        return jsonify({"error": "Game not found"}), 404
    return jsonify(_format_end_game_results(game, session_id))


# SPA fallback: with static_url_path="" Flask's static route greedily matches every root
# path and 404s on a miss, so a catch-all view never runs. Instead, serve the app shell on
# any 404 for a client-side-routed path (/setup, /battle/<id>, /results/<id>, /stats, ...).
# Real /api routes and existing static files resolve normally; genuine asset misses (paths
# with a file extension) and /api/* keep their 404.
@app.errorhandler(404)
def spa_fallback(err):
    path = request.path or ""
    if path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    last_segment = path.rsplit("/", 1)[-1]
    if "." in last_segment:  # looks like a static asset that genuinely doesn't exist
        return err
    return render_template("index.html", config=app.config), 200


if __name__ == "__main__":
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
