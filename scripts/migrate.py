#!/usr/bin/env python3
"""
Apply SQL migrations in migrations/ (sorted by filename) to the database in
$DATABASE_URL.

Applied migrations are recorded in a schema_migrations ledger table and are
never re-run, so migrations do not need to be idempotent. Each migration file
is applied and recorded in a single transaction.

Usage:
    DATABASE_URL=postgresql://... python scripts/migrate.py
    # in Docker:
    docker compose run --rm web python scripts/migrate.py
"""

import os
import sys
import glob

import psycopg2

MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "migrations")

LEDGER_DDL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""


def main() -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set.", file=sys.stderr)
        return 1

    files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
    if not files:
        print(f"No .sql migrations found in {MIGRATIONS_DIR}")
        return 0

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(LEDGER_DDL)
        conn.commit()

        with conn.cursor() as cur:
            cur.execute("SELECT filename FROM schema_migrations")
            applied = {row[0] for row in cur.fetchall()}

        pending = [p for p in files if os.path.basename(p) not in applied]
        if not pending:
            print(f"Up to date. {len(applied)} migration(s) already applied, nothing to do.")
            return 0

        for path in pending:
            name = os.path.basename(path)
            with open(path, "r", encoding="utf-8") as fh:
                sql = fh.read()
            print(f"Applying {name} ...")
            # The migration and its ledger row commit together: a failed
            # migration leaves no record and the transaction rolls back.
            with conn.cursor() as cur:
                cur.execute(sql)
                cur.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (name,))
            conn.commit()
        print(f"Done. Applied {len(pending)} migration file(s).")
    except Exception as exc:  # noqa: BLE001 - surface the failure clearly
        conn.rollback()
        print(f"ERROR applying migrations: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
