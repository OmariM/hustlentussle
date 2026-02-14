"""
Persistence layer for Hustle n' Tussle.

This package provides abstractions for game state persistence,
supporting multiple backends (in-memory, PostgreSQL).
"""

from persistence.interfaces import (
    GameRepositoryInterface,
    RepositoryError,
    GameNotFoundError,
    PersistenceError,
)
from persistence.memory_repository import MemoryGameRepository
from persistence.postgres_repository import PostgresGameRepository
from persistence.serializers import GameSerializer
from persistence.factory import (
    RepositoryFactory,
    FallbackRepository,
    CleanupScheduler,
)

__all__ = [
    "GameRepositoryInterface",
    "RepositoryError",
    "GameNotFoundError",
    "PersistenceError",
    "MemoryGameRepository",
    "PostgresGameRepository",
    "GameSerializer",
    "RepositoryFactory",
    "FallbackRepository",
    "CleanupScheduler",
]
