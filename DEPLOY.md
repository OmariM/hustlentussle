# Deployment (self-hosted Docker stack)

Hustle n' Tussle runs as a self-contained Docker Compose stack — a Flask/gunicorn
`web` container plus its own `postgres:16` `db` container — isolated from anything
else on the host (own network + named volume `hustlentussle_pgdata`). Public
ingress (domain + TLS) is handled by your existing reverse proxy (Nginx Proxy
Manager / Cloudflare Tunnel) pointed at the published host port.

This replaces the old Render deployment (`render.yaml`) and the legacy
`deployment/` systemd + nginx scaffolding.

## 1. Configure

```bash
cp .env.example .env
# edit .env — at minimum set SECRET_KEY and POSTGRES_PASSWORD
python3 -c "import secrets; print(secrets.token_hex(32))"   # SECRET_KEY
```

`.env` keys:

| key | purpose |
|-----|---------|
| `SECRET_KEY` | Flask session signing (admin login). Use a long random value. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | bundled Postgres credentials |
| `WEB_PORT` | host port the web container is published on (loopback). Default `8090` — `8080` is taken by Domino Soul. |

`.env` is gitignored. The web container derives `DATABASE_URL` from these values
automatically (`postgresql://USER:PASSWORD@db:5432/DB`).

## 2. Build & start

```bash
docker compose up -d --build
```

## 3. Initialize the database

```bash
docker compose run --rm web python scripts/migrate.py            # create tables
docker compose run --rm web python scripts/create_admin.py --email you@example.com
# (password prompted; re-running with the same email resets the password)
```

The web container is now reachable at `127.0.0.1:${WEB_PORT}` (default 8090).

## 4. Wire ingress

Point your domain at the container in **Nginx Proxy Manager** (add a Proxy Host →
forward to `127.0.0.1:8090` or the host IP) and/or expose it via **Cloudflare
Tunnel**. TLS is handled there — no certbot needed. Keep the published port bound
to loopback so only the proxy can reach it.

## 5. Update / redeploy

```bash
git pull
docker compose up -d --build
docker compose run --rm web python scripts/migrate.py   # if new migrations were added
```

Data persists in the `hustlentussle_pgdata` volume across rebuilds and restarts.

## Notes

- **Live games vs YTD stats** share the same database but different tables. Live
  game state still auto-expires after 6 hours; YTD data
  (`dancers` / `battles` / `battle_results`) is permanent.
- **Admins** are created only via `scripts/create_admin.py` — there is no public
  signup. Admins log in on the Year-to-Date Stats page to publish/upload results.
- **Reset everything** (drops all data, including the DB volume):
  `docker compose down -v`.
