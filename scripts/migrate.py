#!/usr/bin/env python3
"""
Apply SQL migrations in migrations/ (sorted by filename) to the database in
$DATABASE_URL. Migrations are written to be idempotent (CREATE ... IF NOT
EXISTS), so re-running is safe.

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
        for path in files:
            name = os.path.basename(path)
            with open(path, "r", encoding="utf-8") as fh:
                sql = fh.read()
            print(f"Applying {name} ...")
            with conn.cursor() as cur:
                cur.execute(sql)
            conn.commit()
        print(f"Done. Applied {len(files)} migration file(s).")
    except Exception as exc:  # noqa: BLE001 - surface the failure clearly
        conn.rollback()
        print(f"ERROR applying migrations: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
