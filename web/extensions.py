"""
Shared application services: config, game repository, stats repository and
the cleanup scheduler.

Initialization is eager (at import time), preserving the behavior this app
has always had: importing the web package brings up persistence, and a
failed DB connection falls back per PERSISTENCE_FALLBACK_ENABLED.
"""

import atexit
import logging
import os
import sys

from dotenv import load_dotenv

# Environment variables from .env must be loaded before get_config() reads them
load_dotenv()

# Allow running as `python web/app.py` as well as importing `web.*`
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from web.config import get_config  # noqa: E402
from persistence import (  # noqa: E402
    RepositoryFactory,
    CleanupScheduler,
    PersistenceError,
    MemoryGameRepository,
)
from stats import StatsRepository  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

config = get_config()


def init_repository():
    """Initialize the game repository based on configuration."""
    database_url = getattr(config, "DATABASE_URL", None)
    fallback_enabled = getattr(config, "PERSISTENCE_FALLBACK_ENABLED", True)
    expiration_seconds = getattr(config, "GAME_EXPIRATION_SECONDS", 6 * 60 * 60)

    try:
        repo = RepositoryFactory.create_repository(
            database_url=database_url,
            fallback_enabled=fallback_enabled,
            expiration_seconds=expiration_seconds,
        )
        logger.info(f"Repository initialized: {type(repo).__name__}")
        return repo
    except PersistenceError as e:
        logger.error(f"Failed to initialize repository: {e}")
        if fallback_enabled:
            logger.warning("Falling back to in-memory repository")
            return MemoryGameRepository(expiration_seconds=expiration_seconds)
        raise


repo = init_repository()


# The year-to-date stats repository (separate tables, same database).
# Requires DATABASE_URL; when unset (in-memory dev), YTD features are disabled.
def init_stats_repository():
    """Initialize the YTD stats repository if a database is configured."""
    database_url = getattr(config, "DATABASE_URL", None)
    if not database_url:
        logger.warning("DATABASE_URL not set - year-to-date stats features are disabled")
        return None
    try:
        stats = StatsRepository(database_url)
        logger.info("Stats repository initialized")
        return stats
    except Exception as e:  # noqa: BLE001 - never block app startup on stats
        logger.error(f"Failed to initialize stats repository: {e}")
        return None


stats_repo = init_stats_repository()

cleanup_scheduler = CleanupScheduler(
    repository=repo,
    interval_seconds=getattr(config, "CLEANUP_INTERVAL_SECONDS", 60 * 60),
)
cleanup_scheduler.start()


@atexit.register
def shutdown_cleanup():
    """Cleanup on application shutdown."""
    if "cleanup_scheduler" in globals() and cleanup_scheduler is not None:
        logger.info("Shutting down cleanup scheduler...")
        cleanup_scheduler.stop()


# Backwards compatibility for tests that import `games`
# Note: This only works with MemoryGameRepository
# For PostgreSQL, tests should use the repo interface directly
if hasattr(repo, "_games"):
    games = repo._games
else:
    games = {}  # Empty dict as placeholder for non-memory repositories
