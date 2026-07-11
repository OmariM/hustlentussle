"""
Application factory: builds the Flask app, wires middleware and blueprints.

Static and template folders point at the web/ directory itself (the frontend
is plain files next to this module), preserving the original single-module
app's layout.
"""

import os
import time

from flask import Flask, request
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

from web.config import ALLOWED_ORIGIN_HOSTS
from web.extensions import config


def create_app() -> Flask:
    app = Flask(
        __name__, static_folder=".", static_url_path="", template_folder="."
    )  # Set template folder to current directory
    app.config.from_object(config)

    # Cache-busting for static assets (helps ensure browsers pull latest JS/CSS after deploy)
    if not app.config.get("ASSET_VERSION"):
        # Prefer deploy-provided versioning when available; fallback to process start time.
        app.config["ASSET_VERSION"] = (
            os.environ.get("ASSET_VERSION") or os.environ.get("GIT_COMMIT") or str(int(time.time()))
        )

    # The app sits behind a reverse proxy (Nginx Proxy Manager) in dev and prod;
    # trust one hop of X-Forwarded-* so request.remote_addr / scheme are the
    # real client's, not the proxy's (needed for login rate limiting).
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    # The frontend is same-origin; CORS exists only for known deployments of
    # this app, not the whole internet.
    CORS(
        app,
        origins=[f"https://{h}" for h in ALLOWED_ORIGIN_HOSTS] + [f"http://{h}" for h in ALLOWED_ORIGIN_HOSTS],
    )

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

    from web.routes import admin_stats, core, game, spotify

    app.register_blueprint(core.bp)
    app.register_blueprint(game.bp)
    app.register_blueprint(spotify.bp)
    app.register_blueprint(admin_stats.bp)

    # Routing 404s aren't caught by blueprint errorhandlers; register app-wide.
    app.register_error_handler(404, core.spa_fallback)

    return app
