#!/bin/bash
# Stops the tmux-hosted Flask dev server. The dev Postgres container is left
# running (cheap to keep warm); pass --db to stop it too.
set -euo pipefail
cd "$(dirname "$0")/.."

tmux kill-session -t hustlentussle-dev 2>/dev/null && echo "Stopped tmux session 'hustlentussle-dev'." \
  || echo "No 'hustlentussle-dev' tmux session was running."

if [[ "${1:-}" == "--db" ]]; then
  docker compose -f docker-compose.dev.yml -p hustlentussle-dev stop
fi
