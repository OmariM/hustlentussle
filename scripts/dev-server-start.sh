#!/bin/bash
# Starts the Hustle n' Tussle dev environment:
#   1. dev-only Postgres (docker-compose.dev.yml)
#   2. Flask dev server as a host process in tmux, bound to the port
#      Nginx Proxy Manager routes dev.hustlentussle.com to.
#
# Edits to files in this repo take effect on save (Flask's reloader) — no
# rebuild needed, same instant-reload philosophy as domino-soul-dev's HMR mode.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
source .env
set +a

docker compose -f docker-compose.dev.yml -p hustlentussle-dev up -d

echo "Waiting for dev Postgres..."
until docker compose -f docker-compose.dev.yml -p hustlentussle-dev exec -T db \
    pg_isready -U "${DEV_POSTGRES_USER:-hustlentussle_dev}" -d "${DEV_POSTGRES_DB:-hustlentussle_dev}" >/dev/null 2>&1; do
  sleep 1
done

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required to build the frontend (web/js/dist). Install Node 22+." >&2
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing frontend dependencies (node_modules missing)..."
  npm ci
fi

tmux kill-session -t hustlentussle-dev 2>/dev/null || true
tmux new-session -d -s hustlentussle-dev -c "$(pwd)"
tmux send-keys -t hustlentussle-dev "
export FLASK_ENV=development
export HOST=0.0.0.0
export PORT=8091
export FLASK_DEBUGGER=0
export DATABASE_URL='postgresql://${DEV_POSTGRES_USER:-hustlentussle_dev}:${DEV_POSTGRES_PASSWORD}@localhost:${DEV_POSTGRES_PORT:-5433}/${DEV_POSTGRES_DB:-hustlentussle_dev}'
exec .venv-dev/bin/python web/app.py
" C-m

# Second window: esbuild watch keeps web/js/dist in sync with source on save
tmux new-window -t hustlentussle-dev -n esbuild -c "$(pwd)"
tmux send-keys -t hustlentussle-dev:esbuild "exec npm run watch" C-m

echo "Dev server starting in tmux session 'hustlentussle-dev' on port 8091."
echo "Window 0: Flask; window 'esbuild': frontend watch build."
echo "Attach: tmux attach -t hustlentussle-dev   (detach: Ctrl+B D)"
