"""
Application entry point / compatibility shim.

The implementation lives in web.factory (app assembly), web.extensions
(config + repositories) and web.routes.* (blueprints). This module keeps the
long-standing import surface working:

    from web.app import app            # wsgi.py
    from web.app import app, games     # unit_tests.py

and remains directly runnable for the dev server: `python web/app.py`.
"""

import os
import sys

# Add parent directory to path to import game_logic and persistence
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from web.extensions import (  # noqa: E402,F401 - re-exported for back-compat
    config,
    cleanup_scheduler,
    games,
    repo,
    stats_repo,
)
from web.factory import create_app  # noqa: E402

app = create_app()


if __name__ == "__main__":
    # FLASK_DEBUGGER lets a dev deployment keep the auto-reloader (for instant
    # reload on save) while disabling Werkzeug's interactive debugger, which
    # allows arbitrary code execution via its console and must never be
    # reachable from an internet-facing address.
    use_debugger = config.DEBUG and os.environ.get("FLASK_DEBUGGER", "1") == "1"
    app.run(host=config.HOST, port=config.PORT, use_reloader=config.DEBUG, use_debugger=use_debugger)
