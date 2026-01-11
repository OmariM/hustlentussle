"""
PostgreSQL game repository implementation.

This module provides persistent storage for games using PostgreSQL
with JSONB for game state storage.
"""

import uuid
import time
import logging
from typing import Optional, List
from contextlib import contextmanager
import sys
import os

# Add parent directory to path to import game_logic
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from game_logic import Game
from persistence.interfaces import GameRepositoryInterface, PersistenceError
from persistence.serializers import GameSerializer

# Set up logging
logger = logging.getLogger(__name__)

# Import psycopg2 - will be available after requirements install
try:
    import psycopg2
    from psycopg2 import pool
    from psycopg2.extras import RealDictCursor, Json
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False
    logger.warning("psycopg2 not available - PostgreSQL repository will not work")


class PostgresGameRepository(GameRepositoryInterface):
    """
    PostgreSQL-backed repository for game persistence.
    
    Uses JSONB storage for game state, providing:
    - Persistent storage across server restarts
    - Automatic expiration via SQL queries
    - Support for multiple server instances
    
    Attributes:
        expiration_seconds: Time in seconds before a game expires (default: 6 hours)
    """
    
    def __init__(
        self,
        database_url: str,
        expiration_seconds: int = 6 * 60 * 60,
        min_connections: int = 1,
        max_connections: int = 10,
    ):
        """
        Initialize the PostgreSQL repository.
        
        Args:
            database_url: PostgreSQL connection string
            expiration_seconds: Time in seconds before games expire (default: 6 hours)
            min_connections: Minimum connections in pool
            max_connections: Maximum connections in pool
            
        Raises:
            PersistenceError: If psycopg2 is not available or connection fails
        """
        if not PSYCOPG2_AVAILABLE:
            raise PersistenceError("psycopg2 is not installed. Install with: pip install psycopg2-binary")
        
        self.database_url = database_url
        self.expiration_seconds = expiration_seconds
        
        try:
            self._pool = pool.ThreadedConnectionPool(
                min_connections,
                max_connections,
                database_url,
            )
        except psycopg2.Error as e:
            raise PersistenceError(f"Failed to connect to PostgreSQL: {e}")
        
        # Initialize database schema
        self._init_schema()
    
    def _init_schema(self):
        """Create the games table if it doesn't exist."""
        # Execute each SQL statement separately for psycopg2 compatibility
        statements = [
            """
            CREATE TABLE IF NOT EXISTS games (
                session_id VARCHAR(64) PRIMARY KEY,
                game_state JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL
            )
            """,
            # Index for expiration queries
            "CREATE INDEX IF NOT EXISTS idx_games_expires_at ON games(expires_at)",
            # Index for JSONB queries (if needed later)
            "CREATE INDEX IF NOT EXISTS idx_games_state ON games USING GIN(game_state)",
        ]
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                for statement in statements:
                    cur.execute(statement)
            conn.commit()
    
    @contextmanager
    def _get_connection(self):
        """
        Get a connection from the pool.
        
        Yields:
            A database connection that will be returned to pool on exit
        """
        conn = None
        try:
            conn = self._pool.getconn()
            yield conn
        except psycopg2.Error as e:
            if conn:
                conn.rollback()
            raise PersistenceError(f"Database error: {e}")
        finally:
            if conn:
                self._pool.putconn(conn)
    
    def create(self, game: Game) -> str:
        """
        Store a new game and return its session ID.
        
        Args:
            game: The Game instance to store
            
        Returns:
            str: Generated session ID
            
        Raises:
            PersistenceError: If database operation fails
        """
        session_id = uuid.uuid4().hex
        game.session_id = session_id
        
        # Stamp the current round with session ID if present
        if getattr(game, 'current_round', None):
            game.current_round.session_id = session_id
        
        game_data = GameSerializer.to_dict(game)
        expires_at_seconds = time.time() + self.expiration_seconds
        
        insert_sql = """
        INSERT INTO games (session_id, game_state, expires_at)
        VALUES (%s, %s, TO_TIMESTAMP(%s))
        """
        
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(insert_sql, (session_id, Json(game_data), expires_at_seconds))
                conn.commit()
        except Exception as e:
            raise PersistenceError(f"Failed to create game: {e}")
        
        logger.info(f"Created game with session_id: {session_id}")
        return session_id
    
    def get(self, session_id: str) -> Optional[Game]:
        """
        Retrieve a game by session ID.
        
        Args:
            session_id: The game's session ID
            
        Returns:
            The Game instance if found and not expired, None otherwise
            
        Raises:
            PersistenceError: If database operation fails
        """
        select_sql = """
        SELECT game_state FROM games
        WHERE session_id = %s AND expires_at > NOW()
        """
        
        try:
            with self._get_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(select_sql, (session_id,))
                    row = cur.fetchone()
        except Exception as e:
            raise PersistenceError(f"Failed to get game: {e}")
        
        if not row:
            return None
        
        try:
            game = GameSerializer.from_dict(row['game_state'])
            return game
        except Exception as e:
            logger.error(f"Failed to deserialize game {session_id}: {e}")
            return None
    
    def save(self, session_id: str, game: Game) -> bool:
        """
        Update an existing game.
        
        Args:
            session_id: The game's session ID
            game: The updated Game instance
            
        Returns:
            bool: True if save successful, False if game not found
            
        Raises:
            PersistenceError: If database operation fails
        """
        game_data = GameSerializer.to_dict(game)
        expires_at_seconds = time.time() + self.expiration_seconds
        
        update_sql = """
        UPDATE games
        SET game_state = %s, updated_at = NOW(), expires_at = TO_TIMESTAMP(%s)
        WHERE session_id = %s AND expires_at > NOW()
        """
        
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(update_sql, (Json(game_data), expires_at_seconds, session_id))
                    rows_affected = cur.rowcount
                conn.commit()
        except Exception as e:
            raise PersistenceError(f"Failed to save game: {e}")
        
        return rows_affected > 0
    
    def delete(self, session_id: str) -> bool:
        """
        Remove a game from storage.
        
        Args:
            session_id: The game's session ID
            
        Returns:
            bool: True if deletion successful, False if game not found
            
        Raises:
            PersistenceError: If database operation fails
        """
        delete_sql = "DELETE FROM games WHERE session_id = %s"
        
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(delete_sql, (session_id,))
                    rows_affected = cur.rowcount
                conn.commit()
        except Exception as e:
            raise PersistenceError(f"Failed to delete game: {e}")
        
        return rows_affected > 0
    
    def exists(self, session_id: str) -> bool:
        """
        Check if a game exists and is not expired.
        
        Args:
            session_id: The game's session ID
            
        Returns:
            bool: True if game exists and is not expired
            
        Raises:
            PersistenceError: If database operation fails
        """
        exists_sql = """
        SELECT 1 FROM games
        WHERE session_id = %s AND expires_at > NOW()
        """
        
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(exists_sql, (session_id,))
                    return cur.fetchone() is not None
        except Exception as e:
            raise PersistenceError(f"Failed to check game existence: {e}")
    
    def cleanup_expired(self) -> int:
        """
        Remove all expired games.
        
        Returns:
            int: Number of games removed
            
        Raises:
            PersistenceError: If database operation fails
        """
        delete_sql = "DELETE FROM games WHERE expires_at <= NOW()"
        
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(delete_sql)
                    rows_affected = cur.rowcount
                conn.commit()
        except Exception as e:
            raise PersistenceError(f"Failed to cleanup expired games: {e}")
        
        if rows_affected > 0:
            logger.info(f"Cleaned up {rows_affected} expired games")
        
        return rows_affected
    
    def list_sessions(self) -> List[str]:
        """
        List all active (non-expired) session IDs.
        
        Returns:
            List of session IDs
            
        Raises:
            PersistenceError: If database operation fails
        """
        select_sql = """
        SELECT session_id FROM games
        WHERE expires_at > NOW()
        ORDER BY created_at DESC
        """
        
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(select_sql)
                    rows = cur.fetchall()
                    return [row[0] for row in rows]
        except Exception as e:
            raise PersistenceError(f"Failed to list sessions: {e}")
    
    def get_stats(self) -> dict:
        """
        Get statistics about the repository.
        
        Returns:
            Dictionary with stats
        """
        stats_sql = """
        SELECT
            COUNT(*) as total_games,
            COUNT(*) FILTER (WHERE expires_at > NOW()) as active_games,
            MIN(created_at) as oldest_game,
            MAX(created_at) as newest_game
        FROM games
        """
        
        try:
            with self._get_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(stats_sql)
                    row = cur.fetchone()
                    return dict(row) if row else {}
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            return {}
    
    def close(self):
        """Close the connection pool."""
        if hasattr(self, '_pool') and self._pool:
            self._pool.closeall()
            logger.info("PostgreSQL connection pool closed")
    
    def __del__(self):
        """Cleanup on deletion."""
        self.close()

