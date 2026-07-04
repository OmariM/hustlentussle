"""
Repository factory with fallback support.

This module provides a factory for creating game repositories with
configurable fallback behavior when the primary database is unavailable.
"""

import logging
import threading
from typing import Optional
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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
