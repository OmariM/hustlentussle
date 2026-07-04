"""App shell, health check and the SPA 404 fallback."""

from flask import Blueprint, current_app, jsonify, render_template, request

from web.extensions import repo

bp = Blueprint("core", __name__)


@bp.route("/")
def index():
    return render_template("index.html", config=current_app.config)


@bp.route("/api/health", methods=["GET"])
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


# SPA fallback: with static_url_path="" Flask's static route greedily matches every root
# path and 404s on a miss, so a catch-all view never runs. Instead, serve the app shell on
# any 404 for a client-side-routed path (/setup, /battle/<id>, /results/<id>, /stats, ...).
# Real /api routes and existing static files resolve normally; genuine asset misses (paths
# with a file extension) and /api/* keep their 404.
# Registered app-wide by the factory (blueprint errorhandlers don't catch routing 404s).
def spa_fallback(err):
    path = request.path or ""
    if path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    last_segment = path.rsplit("/", 1)[-1]
    if "." in last_segment:  # looks like a static asset that genuinely doesn't exist
        return err
    return render_template("index.html", config=current_app.config), 200
