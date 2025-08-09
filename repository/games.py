from __future__ import annotations

from typing import Dict, Optional
from threading import RLock

from game_logic import Game


class InMemoryGameRepository:
    """Thread-safe in-memory repository for Game instances."""

    def __init__(self) -> None:
        self._games: Dict[str, Game] = {}
        self._lock = RLock()
        self._counter = 0

    def new_session_id(self) -> str:
        with self._lock:
            self._counter += 1
            return f"game_{self._counter}"

    def save(self, session_id: str, game: Game) -> None:
        with self._lock:
            self._games[session_id] = game

    def get(self, session_id: str) -> Optional[Game]:
        with self._lock:
            return self._games.get(session_id)

    def exists(self, session_id: str) -> bool:
        with self._lock:
            return session_id in self._games