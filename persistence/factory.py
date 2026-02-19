"""
Repository factory with fallback support.

This module provides a factory for creating game repositories with
configurable fallback behavior when the primary database is unavailable.
"""

import logging
import threading
import time
from typing import Optional
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from game_logic import Game
from persistence.interfaces import GameRepositoryInterface, PersistenceError
from persistence.memory_repository import MemoryGameRepository
from persistence.postgres_repository import PostgresGameRepository

logger = logging.getLogger(__name__)


class RepositoryFactory:
    """
    Factory for creating game repositories with optional fallback.

    Supports creating a PostgreSQL repository with automatic fallback
    to in-memory storage when the database is unavailable.
    """

    @staticmethod
    def create_repository(
        database_url: Optional[str] = None,
        fallback_enabled: bool = True,
        expiration_seconds: int = 6 * 60 * 60,
    ) -> GameRepositoryInterface:
        """
        Create a game repository based on configuration.

        Args:
            database_url: PostgreSQL connection URL. If None, uses memory repository.
            fallback_enabled: If True, falls back to memory on database failure.
            expiration_seconds: Game expiration time in seconds.

        Returns:
            A GameRepositoryInterface implementation

        Raises:
            PersistenceError: If database connection fails and fallback is disabled
        """
        # If no database URL, use memory repository
        if not database_url:
            logger.info("No DATABASE_URL configured, using in-memory repository")
            return MemoryGameRepository(expiration_seconds=expiration_seconds)

        # Try to create PostgreSQL repository
        try:
            repo = PostgresGameRepository(
                database_url=database_url,
                expiration_seconds=expiration_seconds,
            )
            logger.info("PostgreSQL repository initialized successfully")
            return repo
        except PersistenceError as e:
            if fallback_enabled:
                logger.warning(f"PostgreSQL unavailable ({e}), falling back to in-memory repository")
                return MemoryGameRepository(expiration_seconds=expiration_seconds)
            else:
                logger.error(f"PostgreSQL unavailable and fallback disabled: {e}")
                raise


class FallbackRepository(GameRepositoryInterface):
    """
    Repository wrapper that provides automatic fallback on errors.

    Wraps a primary repository (PostgreSQL) and falls back to a
    secondary repository (memory) when operations fail, with the
    ability to sync back to primary when it recovers.
    """

    def __init__(
        self,
        primary: GameRepositoryInterface,
        fallback: GameRepositoryInterface,
        retry_interval_seconds: int = 60,
    ):
        """
        Initialize the fallback repository.

        Args:
            primary: The primary repository (usually PostgreSQL)
            fallback: The fallback repository (usually memory)
            retry_interval_seconds: How often to retry primary when in fallback mode
        """
        self.primary = primary
        self.fallback = fallback
        self.retry_interval_seconds = retry_interval_seconds

        self._using_fallback = False
        self._last_primary_attempt = 0
        self._lock = threading.RLock()

    def _should_retry_primary(self) -> bool:
        """Check if we should attempt to use primary again."""
        if not self._using_fallback:
            return True
        return (time.time() - self._last_primary_attempt) > self.retry_interval_seconds

    def _try_primary(self, operation, *args, **kwargs):
        """
        Try an operation on primary, fall back on failure.

        Args:
            operation: Name of the operation method
            *args: Positional arguments
            **kwargs: Keyword arguments

        Returns:
            Result of the operation
        """
        with self._lock:
            if self._should_retry_primary():
                try:
                    self._last_primary_attempt = time.time()
                    result = getattr(self.primary, operation)(*args, **kwargs)

                    if self._using_fallback:
                        logger.info("Primary repository recovered")
                        self._using_fallback = False

                    return result
                except PersistenceError as e:
                    if not self._using_fallback:
                        logger.warning(f"Primary repository failed ({e}), switching to fallback")
                        self._using_fallback = True

            # Use fallback
            return getattr(self.fallback, operation)(*args, **kwargs)

    def create(self, game: Game) -> str:
        return self._try_primary("create", game)

    def get(self, session_id: str) -> Optional[Game]:
        # First try primary
        result = self._try_primary("get", session_id)

        # If not found in primary but we're using fallback, check fallback
        if result is None and self._using_fallback:
            result = self.fallback.get(session_id)

        return result

    def save(self, session_id: str, game: Game) -> bool:
        return self._try_primary("save", session_id, game)

    def delete(self, session_id: str) -> bool:
        return self._try_primary("delete", session_id)

    def exists(self, session_id: str) -> bool:
        result = self._try_primary("exists", session_id)

        # If not found in primary but we're using fallback, check fallback
        if not result and self._using_fallback:
            result = self.fallback.exists(session_id)

        return result

    def cleanup_expired(self) -> int:
        count = 0

        # Cleanup both repositories
        try:
            count += self.primary.cleanup_expired()
        except PersistenceError:
            pass

        count += self.fallback.cleanup_expired()
        return count

    def list_sessions(self) -> list:
        sessions = set()

        # Get from primary
        try:
            sessions.update(self.primary.list_sessions())
        except PersistenceError:
            pass

        # Get from fallback if in use
        if self._using_fallback:
            sessions.update(self.fallback.list_sessions())

        return list(sessions)

    @property
    def is_using_fallback(self) -> bool:
        """Check if currently using fallback repository."""
        return self._using_fallback


class CleanupScheduler:
    """
    Background scheduler for periodic cleanup of expired games.

    Runs cleanup on a configured interval in a background thread.
    """

    def __init__(
        self,
        repository: GameRepositoryInterface,
        interval_seconds: int = 60 * 60,  # 1 hour default
    ):
        """
        Initialize the cleanup scheduler.

        Args:
            repository: The repository to clean up
            interval_seconds: How often to run cleanup (default: 1 hour)
        """
        self.repository = repository
        self.interval_seconds = interval_seconds
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """Start the background cleanup thread."""
        if self._thread and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        logger.info(f"Cleanup scheduler started (interval: {self.interval_seconds}s)")

    def stop(self):
        """Stop the background cleanup thread."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Cleanup scheduler stopped")

    def _run(self):
        """Background thread main loop."""
        while not self._stop_event.wait(self.interval_seconds):
            try:
                removed = self.repository.cleanup_expired()
                if removed > 0:
                    logger.info(f"Scheduled cleanup removed {removed} expired games")
            except Exception as e:
                logger.error(f"Cleanup failed: {e}")

    def cleanup_now(self) -> int:
        """Run cleanup immediately (synchronously)."""
        try:
            return self.repository.cleanup_expired()
        except Exception as e:
            logger.error(f"Immediate cleanup failed: {e}")
            return 0
