-- Live-game session storage, previously created at runtime by
-- persistence/postgres_repository.py. IF NOT EXISTS keeps this a no-op on
-- databases where the runtime path already created the table.

CREATE TABLE IF NOT EXISTS games (
    session_id VARCHAR(64) PRIMARY KEY,
    game_state JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Index for expiration queries
CREATE INDEX IF NOT EXISTS idx_games_expires_at ON games(expires_at);

-- Index for JSONB queries (if needed later)
CREATE INDEX IF NOT EXISTS idx_games_state ON games USING GIN(game_state);
