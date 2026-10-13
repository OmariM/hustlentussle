#!/bin/bash
# Replaces the dev database's contents with a copy of the prod database, so the
# dev server (dev.hustlentussle.com) can test changes against real data.
#
#   1. pg_dump the prod DB inside its container (read-only; prod is untouched).
#   2. In ONE transaction on the dev DB: drop the public schema, recreate it and
#      load the dump. Any failure rolls back and leaves dev as it was.
#   3. Re-run scripts/migrate.py against dev, so migrations that exist on main
#      but haven't shipped to prod yet are applied on top of the prod data.
#
# Run directly, or via the dev-only "Sync from prod" admin button (which calls
# this script; see /api/admin/dev/sync-prod-db in web/routes/admin_stats.py).
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
source .env
set +a

PROD_DB_CONTAINER="${PROD_DB_CONTAINER:-hustlentussle-prod-db-1}"

dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT

echo "Dumping prod database ($PROD_DB_CONTAINER)..."
# Credentials come from the prod container's own env, so no prod secrets are needed here.
docker exec "$PROD_DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' >"$dump"

echo "Restoring into dev database..."
{
  echo 'SET client_min_messages = warning;'
  echo 'DROP SCHEMA public CASCADE;'
  echo 'CREATE SCHEMA public;'
  cat "$dump"
} | docker compose -f docker-compose.dev.yml -p hustlentussle-dev exec -T db \
    sh -c 'psql -q -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null

echo "Applying dev migrations..."
DATABASE_URL="postgresql://${DEV_POSTGRES_USER:-hustlentussle_dev}:${DEV_POSTGRES_PASSWORD}@localhost:${DEV_POSTGRES_PORT:-5433}/${DEV_POSTGRES_DB:-hustlentussle_dev}" \
  .venv-dev/bin/python scripts/migrate.py

echo "Done: dev database now mirrors prod."
