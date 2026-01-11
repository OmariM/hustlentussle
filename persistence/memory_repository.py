"""
In-memory game repository implementation.

This module provides a thread-safe in-memory storage backend for games.
It can be used as a fallback when database is unavailable, or for testing.
"""

import threading
import uuid
import time
from typing import Optional, List, Dict
import sys
import os

# Add parent directory to path to import game_logic
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from game_logic import Game
from persistence.interfaces import GameRepositoryInterface


class MemoryGameRepository(GameRepositoryInterface):
    """
    Thread-safe in-memory repository for game storage.
    
    This implementation stores games directly in a dictionary with
    thread-safe access via RLock. Games are stored with timestamps
    for expiration support.
    
    Attributes:
        expiration_seconds: Time in seconds before a game expires (default: 6 hours)
    """
    
    def __init__(self, expiration_seconds: int = 6 * 60 * 60):
        """
        Initialize the in-memory repository.
        
        Args:
            expiration_seconds: Time in seconds before games expire (default: 6 hours)
        """
        self._games: Dict[str, Dict] = {}  # {session_id: {'game': Game, 'created_at': float, 'updated_at': float}}
        self._lock = threading.RLock()
        self.expiration_seconds = expiration_seconds
    
    def create(self, game: Game) -> str:
        """
        Store a new game and return its session ID.
        
        Args:
            game: The Game instance to store
            
        Returns:
            str: Generated session ID
        """
        with self._lock:
            session_id = uuid.uuid4().hex
            game.session_id = session_id
            
            # Stamp the current round with session ID if present
            if getattr(game, 'current_round', None):
                game.current_round.session_id = session_id
            
            now = time.time()
            self._games[session_id] = {
                'game': game,
                'created_at': now,
                'updated_at': now,
            }
            return session_id
    
    def get(self, session_id: str) -> Optional[Game]:
        """
        Retrieve a game by session ID.
        
        Args:
            session_id: The game's session ID
            
        Returns:
            The Game instance if found and not expired, None otherwise
        """
        with self._lock:
            entry = self._games.get(session_id)
            if not entry:
                return None
            
            # Check expiration
            if self._is_expired(entry):
                del self._games[session_id]
                return None
            
            return entry['game']
    
    def save(self, session_id: str, game: Game) -> bool:
        """
        Update an existing game.
        
        Args:
            session_id: The game's session ID
            game: The updated Game instance
            
        Returns:
            bool: True if save successful, False if game not found
        """
        with self._lock:
            if session_id not in self._games:
                return False
            
            self._games[session_id]['game'] = game
            self._games[session_id]['updated_at'] = time.time()
            return True
    
    def delete(self, session_id: str) -> bool:
        """
        Remove a game from storage.
        
        Args:
            session_id: The game's session ID
            
        Returns:
            bool: True if deletion successful, False if game not found
        """
        with self._lock:
            if session_id in self._games:
                del self._games[session_id]
                return True
            return False
    
    def exists(self, session_id: str) -> bool:
        """
        Check if a game exists and is not expired.
        
        Args:
            session_id: The game's session ID
            
        Returns:
            bool: True if game exists and is not expired
        """
        with self._lock:
            entry = self._games.get(session_id)
            if not entry:
                return False
            
            if self._is_expired(entry):
                del self._games[session_id]
                return False
            
            return True
    
    def cleanup_expired(self) -> int:
        """
        Remove all expired games.
        
        Returns:
            int: Number of games removed
        """
        with self._lock:
            expired_ids = [
                session_id for session_id, entry in self._games.items()
                if self._is_expired(entry)
            ]
            
            for session_id in expired_ids:
                del self._games[session_id]
            
            return len(expired_ids)
    
    def list_sessions(self) -> List[str]:
        """
        List all active (non-expired) session IDs.
        
        Returns:
            List of session IDs
        """
        with self._lock:
            # Clean up expired while listing
            self.cleanup_expired()
            return list(self._games.keys())
    
    def _is_expired(self, entry: Dict) -> bool:
        """
        Check if a game entry has expired.
        
        Args:
            entry: The game entry dictionary
            
        Returns:
            bool: True if expired
        """
        if self.expiration_seconds <= 0:
            return False
        
        updated_at = entry.get('updated_at', entry.get('created_at', 0))
        return (time.time() - updated_at) > self.expiration_seconds
    
    def get_stats(self) -> Dict:
        """
        Get statistics about the repository.
        
        Returns:
            Dictionary with stats (total_games, oldest_game, etc.)
        """
        with self._lock:
            if not self._games:
                return {'total_games': 0}
            
            now = time.time()
            ages = [now - entry['created_at'] for entry in self._games.values()]
            
            return {
                'total_games': len(self._games),
                'oldest_game_age_seconds': max(ages) if ages else 0,
                'newest_game_age_seconds': min(ages) if ages else 0,
            }

