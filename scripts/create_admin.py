#!/usr/bin/env python3
"""
Create or update an admin account for uploading battle results.

Passwords are hashed with werkzeug; re-running with an existing email updates
the password (handy for resets). There is no public signup by design.

Usage:
    DATABASE_URL=postgresql://... python scripts/create_admin.py --email a@b.com
    # password prompted securely if not passed via --password
    docker compose run --rm web python scripts/create_admin.py --email a@b.com
"""

import os
import sys
import argparse
import getpass

import psycopg2
from werkzeug.security import generate_password_hash


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or update an admin account.")
    parser.add_argument("--email", required=True, help="Admin email (login identifier)")
    parser.add_argument("--password", help="Admin password (prompted if omitted)")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set.", file=sys.stderr)
        return 1

    email = args.email.strip().lower()
    password = args.password
    if not password:
        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("ERROR: passwords do not match.", file=sys.stderr)
            return 1
    if len(password) < 8:
        print("ERROR: password must be at least 8 characters.", file=sys.stderr)
        return 1

    password_hash = generate_password_hash(password)

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO admins (email, password_hash)
                VALUES (%s, %s)
                ON CONFLICT (email)
                DO UPDATE SET password_hash = EXCLUDED.password_hash
                RETURNING id
                """,
                (email, password_hash),
            )
            admin_id = cur.fetchone()[0]
        conn.commit()
        print(f"Admin ready: {email} (id={admin_id})")
    except Exception as exc:  # noqa: BLE001
        conn.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
