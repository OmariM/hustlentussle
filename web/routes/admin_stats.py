"""Admin authentication and year-to-date stats (public reads + admin ingest)."""

import datetime
import json
import threading
import time
import urllib.parse
from functools import wraps
from typing import Dict, List

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash

from stats import normalize_battle, DuplicateBattleError, DuplicateDancerError, StatsError
from web.config import ALLOWED_ORIGIN_HOSTS
from web.extensions import repo, stats_repo
from web.helpers import build_battle_export, parse_battle_json

bp = Blueprint("admin_stats", __name__)


def _request_origin_allowed():
    """CSRF defense-in-depth for cookie-authenticated endpoints.

    Browsers always send an Origin header on cross-site state-changing
    requests; reject those from hosts we don't serve. Requests without an
    Origin (curl, same-site GETs, non-browser clients) fall back to the
    Referer, and are allowed when neither header is present since they
    cannot carry a cross-site-forged cookie request.
    """
    origin = request.headers.get("Origin") or request.headers.get("Referer")
    if not origin:
        return True
    host = urllib.parse.urlparse(origin).hostname
    return host in ALLOWED_ORIGIN_HOSTS


def admin_required(f):
    """Guard an endpoint so only a logged-in admin (Flask session) can call it."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        if request.method not in ("GET", "HEAD", "OPTIONS") and not _request_origin_allowed():
            return jsonify({"error": "Cross-origin request rejected"}), 403
        if not session.get("admin_id"):
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)

    return wrapper


# In-process sliding-window rate limit for admin login (per client IP,
# per gunicorn worker — coarse but sufficient against brute force here).
_LOGIN_MAX_FAILURES = 5
_LOGIN_WINDOW_SECONDS = 15 * 60
_login_failures: Dict[str, List[float]] = {}
_login_failures_lock = threading.Lock()


def _login_rate_limited(ip: str) -> bool:
    now = time.time()
    with _login_failures_lock:
        attempts = [t for t in _login_failures.get(ip, []) if now - t < _LOGIN_WINDOW_SECONDS]
        _login_failures[ip] = attempts
        return len(attempts) >= _LOGIN_MAX_FAILURES


def _record_login_failure(ip: str):
    with _login_failures_lock:
        _login_failures.setdefault(ip, []).append(time.time())


@bp.route("/api/admin/login", methods=["POST"])
def admin_login():
    if not _request_origin_allowed():
        return jsonify({"error": "Cross-origin request rejected"}), 403
    client_ip = request.remote_addr or "unknown"
    if _login_rate_limited(client_ip):
        return jsonify({"error": "Too many failed login attempts; try again later"}), 429
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503
    admin = stats_repo.get_admin_by_email(email)
    if not admin or not check_password_hash(admin["password_hash"], password):
        _record_login_failure(client_ip)
        return jsonify({"error": "Invalid credentials"}), 401
    with _login_failures_lock:
        _login_failures.pop(client_ip, None)
    session["admin_id"] = str(admin["id"])
    session["admin_email"] = admin["email"]
    return jsonify({"authenticated": True, "email": admin["email"]})


@bp.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin_id", None)
    session.pop("admin_email", None)
    return jsonify({"success": True})


@bp.route("/api/admin/me", methods=["GET"])
def admin_me():
    if session.get("admin_id"):
        return jsonify({"authenticated": True, "email": session.get("admin_email")})
    return jsonify({"authenticated": False})


@bp.route("/api/stats/years", methods=["GET"])
def stats_years():
    if stats_repo is None:
        return jsonify({"years": []})
    return jsonify({"years": stats_repo.list_years()})


@bp.route("/api/stats/year-to-date", methods=["GET"])
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


@bp.route("/api/stats/battles", methods=["GET"])
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


@bp.route("/api/stats/ingest/preview", methods=["POST"])
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


@bp.route("/api/stats/ingest/commit", methods=["POST"])
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


@bp.route("/api/stats/battles/<battle_id>", methods=["DELETE"])
@admin_required
def stats_delete_battle(battle_id):
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503
    if not stats_repo.delete_battle(battle_id):
        return jsonify({"error": "Battle not found"}), 404
    return jsonify({"success": True})


@bp.route("/api/stats/battles/<battle_id>", methods=["GET"])
@admin_required
def stats_get_battle(battle_id):
    """Fetch a single committed battle's full raw payload, for the edit modal."""
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503
    battle = stats_repo.get_battle(battle_id)
    if not battle:
        return jsonify({"error": "Battle not found"}), 404
    battle["id"] = str(battle["id"])
    battle["battle_date"] = battle["battle_date"].isoformat() if battle.get("battle_date") else None
    battle["created_at"] = battle["created_at"].isoformat() if battle.get("created_at") else None
    return jsonify(battle)


@bp.route("/api/stats/battles/<battle_id>", methods=["PUT"])
@admin_required
def stats_update_battle(battle_id):
    """Replace a committed battle's payload and re-derive its results.

    Unlike /ingest/commit, the client only ever holds the edited raw payload (no
    separate pre-normalized results list survives client-side editing), so results
    are always recomputed here from raw_payload via normalize_battle - never
    trust a client-supplied results array for this route.
    """
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503
    data = request.get_json(silent=True) or {}
    name = (data.get("battle_name") or "").strip()
    battle_date = (data.get("battle_date") or "").strip()
    raw_payload = data.get("raw_payload") or {}

    if not name or not battle_date or not raw_payload:
        return jsonify({"error": "battle_name, battle_date and raw_payload are required"}), 400

    try:
        parse_battle_json(raw_payload)  # validate format/version (raises ValueError)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    norm = normalize_battle(raw_payload)
    meta = {"name": name, "battle_date": battle_date}
    try:
        updated = stats_repo.update_battle(battle_id, meta, raw_payload, norm["results"])
    except DuplicateBattleError as e:
        return jsonify({"error": str(e)}), 409
    except StatsError as e:
        return jsonify({"error": str(e)}), 400
    if not updated:
        return jsonify({"error": "Battle not found"}), 404
    return jsonify({"success": True})


@bp.route("/api/stats/dancers", methods=["GET"])
@admin_required
def stats_list_dancers():
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503
    dancers = stats_repo.list_dancers_with_stats()
    for d in dancers:
        d["id"] = str(d["id"])
        d["battles_entered"] = int(d.get("battles_entered") or 0)
        d["result_count"] = int(d.get("result_count") or 0)
    return jsonify({"dancers": dancers})


@bp.route("/api/stats/dancers/<dancer_id>", methods=["PUT"])
@admin_required
def stats_rename_dancer(dancer_id):
    """Rename a single dancer's canonical display name (no merge)."""
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503
    data = request.get_json(silent=True) or {}
    new_name = (data.get("display_name") or "").strip()
    if not new_name:
        return jsonify({"error": "display_name is required"}), 400

    try:
        renamed = stats_repo.rename_dancer(dancer_id, new_name)
    except DuplicateDancerError as e:
        return jsonify({"error": str(e)}), 409
    except StatsError as e:
        return jsonify({"error": str(e)}), 400
    if not renamed:
        return jsonify({"error": "Dancer not found"}), 404
    return jsonify({"success": True})


@bp.route("/api/stats/dancers/merge", methods=["POST"])
@admin_required
def stats_merge_dancers():
    """Fold one or more duplicate dancers into a single survivor."""
    if stats_repo is None:
        return jsonify({"error": "Stats database not configured"}), 503
    data = request.get_json(silent=True) or {}
    target_id = data.get("target_id")
    source_ids = data.get("source_ids") or []
    new_display_name = data.get("new_display_name")

    if not target_id or not isinstance(source_ids, list) or not source_ids:
        return jsonify({"error": "target_id and a non-empty source_ids list are required"}), 400
    if target_id in source_ids:
        return jsonify({"error": "Target dancer cannot also be a source."}), 400

    try:
        moved = stats_repo.merge_dancers(target_id, source_ids, new_display_name)
    except DuplicateDancerError as e:
        return jsonify({"error": str(e)}), 409
    except StatsError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify({"success": True, "battle_results_moved": moved})
