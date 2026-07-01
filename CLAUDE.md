# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hustle n' Tussle is a partner dance competition management app. It randomly pairs Lead and Follow dancers, manages voting (guest judges + contestant judges), tracks points, handles ties/no-contests, and displays real-time leaderboards. Available as both a CLI and web interface.

## Tech Stack

- **Backend:** Python 3.9+ with Flask 3.1.1
- **Frontend:** Vanilla HTML5/CSS3/ES6+ JavaScript (no npm, no frontend framework)
- **Database:** PostgreSQL (production) with in-memory fallback (development)
- **Deployment:** Self-hosted Docker Compose stack (web + Postgres). See `DEPLOY.md`.
  (Previously Render.com; `render.yaml`/`Procfile` are legacy.)

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run dev web server (localhost:5000)
python web/app.py

# Run CLI interface
python main.py

# Run full test suite
python run_complete_test_suite.py

# Run individual test files
python unit_tests.py
python battle_rules_test_suite.py
python pairing_rules_tests.py
python voting_rules_tests.py

# Run simulation
python simulate_test.py

# Production (self-hosted Docker stack — see DEPLOY.md)
docker compose up -d --build
docker compose run --rm web python scripts/migrate.py          # apply DB migrations
docker compose run --rm web python scripts/create_admin.py --email you@example.com

# Production (bare gunicorn, no Docker)
gunicorn wsgi:application
```

## Architecture

### Core Game Engine (`game_logic.py`)
Central `Game` class orchestrating all game state. Uses a FIFO queue-based pairing system where `ContestantQueueProxy` wraps contestant lists to filter out current competitors. Each `Round` encapsulates voting results, pairs, winners, and song metadata. Queue snapshots are stored for undo functionality.

### Flask Backend (`web/app.py`)
RESTful API with session-based game management (UUID `session_id` per game). Key endpoint groups:
- `/api/start_game` — initialize game
- `/api/judge_leads`, `/api/judge_follows`, `/api/judge_combined` — process votes
- `/api/next_round`, `/api/undo_round` — round management
- `/api/export_battle_data` — JSON battle export (`hustlentussle.battle` v1, built by reusable `build_battle_export()`; explicit `champions` via `compute_champions()`)
- `/api/process_uploaded_file` — load an exported `.json` battle for read-only display (validated/converted by reusable `parse_battle_json()`)
- `/api/spotify/*` — optional Spotify OAuth integration for track metadata
- `/api/admin/*` — admin login/logout/me (Flask session + `admins` table, werkzeug hashing)
- `/api/stats/*` — year-to-date stats (public read) + admin ingest (`ingest/preview`, `ingest/commit`, battle delete)

### Year-to-Date Stats (`stats/`)
Aggregates results across monthly battles, stored in the same Postgres DB but separate
permanent tables (`dancers`, `battles`, `battle_results`, `admins`; schema in
`migrations/0001_ytd_stats.sql`). `stats/stats_repository.py` holds DB ops + the YTD
aggregation (sum of raw points per role per year, with a canonical dancer registry).
`stats/normalize.py` turns a battle payload into per-dancer/role rows; both ingest paths
(publish a finished live battle, or upload an exported `.json`) converge on it. Admins log
in on the stats page to ingest results via a preview → name-resolution → commit flow.
Frontend lives in `web/js/ytd.js` + the `stats-screen` markup in `index.html`. Requires
`DATABASE_URL`; disabled (endpoints 503) when unset.

### Persistence Layer (`persistence/`)
Factory pattern with interface-based abstraction (`GameRepositoryInterface`). `RepositoryFactory` selects backend based on config. `FallbackRepository` auto-falls back from PostgreSQL to in-memory on failure. Games auto-expire after 6 hours (configurable). `GameSerializer` handles Game object JSON serialization.

### Frontend (`web/js/`)
- `app.js` — main application logic with global state management (sessionId, votes, rounds, contestants)
- `main.js` — entry point
- `components/DebugTools.js` — debug utilities (enable via env, `?debug=1` query param, or Alt+Shift+D)
- `router.js` — client-side History API routing. Clean paths map to screens: `/`, `/setup`,
  `/upload`, `/stats`, `/battle/<session_id>`, `/results/<session_id>`. `navigate(path)` +
  `renderRoute()` drive screen switching; `showScreen()` is the low-level render. Session-
  bearing routes hydrate from the server (`/api/state`, `/api/results`) so they reload/share.
  A Flask catch-all (`spa_catch_all`) serves `index.html` for these paths. Viewer links are
  `/battle/<id>?mode=display` (legacy `?mode=display&session_id=` auto-redirects).
- Screen-based UI flow: home → setup → battle → results (URL-routed)

### Voting Rules
- **Guest judges:** Can vote Tie or No Contest
- **Contestant judges:** Must pick a winner
- **Tie:** No points awarded; tied dancers face each other again next round
- **No Contest:** No points, previous dancers return to queue end, fresh opponents selected
- Default win threshold: 7 points (auto-calculated based on contestant count, configurable via `points_to_win`)

## Configuration (`web/config.py`)

Key environment variables:
- `FLASK_ENV` — `development` or `production`
- `DATABASE_URL` — PostgreSQL connection string (omit for in-memory storage)
- `SECRET_KEY` — Flask secret key
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — optional Spotify integration
- `ENABLE_DEBUG_TOOLS` — toggle debug utilities
- `GAME_EXPIRATION_SECONDS` — default 21600 (6 hours)
- `CLEANUP_INTERVAL_SECONDS` — default 3600 (1 hour)
- `PERSISTENCE_FALLBACK_ENABLED` — auto-fallback to memory if DB unavailable
