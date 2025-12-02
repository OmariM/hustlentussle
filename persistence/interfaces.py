"""
Repository interfaces for game persistence.

This module defines the abstract interface that all game repositories must implement,
enabling swappable storage backends (memory, PostgreSQL, Redis, etc.).
"""

from abc import ABC, abstractmethod
from typing import Optional, List
import sys
import os

# Add parent directory to path to import game_logic
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from game_logic import Game


class GameRepositoryInterface(ABC):
    """
    Abstract base class defining the contract for game persistence.
    
    All concrete repository implementations must implement these methods
    to ensure consistent behavior across different storage backends.
    """
    
    @abstractmethod
    def create(self, game: Game) -> str:
        """
        Persist a new game and return its session ID.
        
        Args:
            game: The Game instance to persist
            
        Returns:
            str: The generated session ID for the game
        """
        pass
    
    @abstractmethod
    def get(self, session_id: str) -> Optional[Game]:
        """
        Retrieve a game by its session ID.
        
        Args:
            session_id: The unique identifier for the game
            
        Returns:
            The Game instance if found, None otherwise
        """
        pass
    
    @abstractmethod
    def save(self, session_id: str, game: Game) -> bool:
        """
        Update an existing game's state.
        
        Args:
            session_id: The unique identifier for the game
            game: The updated Game instance
            
        Returns:
            bool: True if save was successful, False otherwise
        """
        pass
    
    @abstractmethod
    def delete(self, session_id: str) -> bool:
        """
        Remove a game from storage.
        
        Args:
            session_id: The unique identifier for the game
            
        Returns:
            bool: True if deletion was successful, False otherwise
        """
        pass
    
    @abstractmethod
    def exists(self, session_id: str) -> bool:
        """
        Check if a game exists in storage.
        
        Args:
            session_id: The unique identifier for the game
            
        Returns:
            bool: True if the game exists, False otherwise
        """
        pass
    
    @abstractmethod
    def cleanup_expired(self) -> int:
        """
        Remove games that have exceeded their expiration time.
        
        Returns:
            int: The number of games removed
        """
        pass
    
    @abstractmethod
    def list_sessions(self) -> List[str]:
        """
        List all active session IDs.
        
        Returns:
            List of session IDs
        """
        pass


class RepositoryError(Exception):
    """Base exception for repository operations."""
    pass


class GameNotFoundError(RepositoryError):
    """Raised when a requested game does not exist."""
    def __init__(self, session_id: str):
        self.session_id = session_id
        super().__init__(f"Game not found: {session_id}")


class PersistenceError(RepositoryError):
    """Raised when a persistence operation fails."""
    pass

