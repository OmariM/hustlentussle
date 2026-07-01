-- Year-to-Date stats schema (idempotent).
-- Applied by scripts/migrate.py or: psql "$DATABASE_URL" -f migrations/0001_ytd_stats.sql
-- Lives in the same database as the live-game `games` table.

-- Canonical dancer registry. Names from individual battles are resolved to
-- one of these so the same person aggregates across events.
CREATE TABLE IF NOT EXISTS dancers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    aliases      TEXT[] NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Discourage accidental duplicate dancers (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS idx_dancers_display_name_lower
    ON dancers (LOWER(display_name));

-- One row per contributed monthly battle.
CREATE TABLE IF NOT EXISTS battles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    battle_date DATE NOT NULL,
    battle_year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM battle_date)::INT) STORED,
    source      TEXT NOT NULL CHECK (source IN ('live', 'upload')),
    session_id  TEXT,
    uploaded_by UUID,
    raw_data    JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Block obvious double-submission of the same event.
    CONSTRAINT uq_battles_name_date UNIQUE (name, battle_date)
);

CREATE INDEX IF NOT EXISTS idx_battles_year ON battles (battle_year);

-- Per dancer, per role, per battle. This is the source for YTD aggregation.
CREATE TABLE IF NOT EXISTS battle_results (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    battle_id   UUID NOT NULL REFERENCES battles (id) ON DELETE CASCADE,
    dancer_id   UUID NOT NULL REFERENCES dancers (id),
    dancer_name TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('lead', 'follow')),
    points      INT NOT NULL DEFAULT 0,
    placement   INT,
    is_winner   BOOLEAN NOT NULL DEFAULT FALSE,
    round_wins  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_battle_results_battle_dancer_role UNIQUE (battle_id, dancer_id, role)
);

CREATE INDEX IF NOT EXISTS idx_battle_results_battle ON battle_results (battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_results_dancer ON battle_results (dancer_id);

-- Admin accounts (no public signup). Seed via scripts/create_admin.py.
CREATE TABLE IF NOT EXISTS admins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
