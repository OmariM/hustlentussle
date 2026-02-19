"""
Tests for the in-memory game repository.
"""

import unittest
import time
import sys
import os

# Add parent directories to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from game_logic import Game
from persistence.memory_repository import MemoryGameRepository


class TestMemoryGameRepository(unittest.TestCase):
    """Test cases for MemoryGameRepository."""

    def setUp(self):
        """Set up test fixtures."""
        # Use a short expiration for testing
        self.repo = MemoryGameRepository(expiration_seconds=10)

    def test_create_game(self):
        """Test creating a new game."""
        game = Game(["Alice", "Bob"], ["Eve", "Fiona"], ["Judge1"])

        session_id = self.repo.create(game)

        self.assertIsNotNone(session_id)
        self.assertEqual(len(session_id), 32)  # UUID hex is 32 chars
        self.assertEqual(game.session_id, session_id)

    def test_get_game(self):
        """Test retrieving a game by session ID."""
        game = Game(["Alice", "Bob"], ["Eve", "Fiona"], ["Judge1"])
        session_id = self.repo.create(game)

        retrieved = self.repo.get(session_id)

        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.session_id, session_id)

    def test_get_nonexistent_game(self):
        """Test retrieving a game that doesn't exist."""
        result = self.repo.get("nonexistent-session-id")

        self.assertIsNone(result)

    def test_save_game(self):
        """Test saving updates to a game."""
        game = Game(["Alice", "Bob"], ["Eve", "Fiona"], ["Judge1"])
        session_id = self.repo.create(game)

        # Modify the game
        game.round_num = 5

        # Save
        result = self.repo.save(session_id, game)

        self.assertTrue(result)

        # Retrieve and verify
        retrieved = self.repo.get(session_id)
        self.assertEqual(retrieved.round_num, 5)

    def test_save_nonexistent_game(self):
        """Test saving a game that doesn't exist."""
        game = Game(["Alice", "Bob"], ["Eve", "Fiona"], ["Judge1"])

        result = self.repo.save("nonexistent-session-id", game)

        self.assertFalse(result)

    def test_delete_game(self):
        """Test deleting a game."""
        game = Game(["Alice", "Bob"], ["Eve", "Fiona"], ["Judge1"])
        session_id = self.repo.create(game)

        # Verify it exists
        self.assertTrue(self.repo.exists(session_id))

        # Delete
        result = self.repo.delete(session_id)

        self.assertTrue(result)
        self.assertFalse(self.repo.exists(session_id))

    def test_delete_nonexistent_game(self):
        """Test deleting a game that doesn't exist."""
        result = self.repo.delete("nonexistent-session-id")

        self.assertFalse(result)

    def test_exists(self):
        """Test checking if a game exists."""
        game = Game(["Alice", "Bob"], ["Eve", "Fiona"], ["Judge1"])
        session_id = self.repo.create(game)

        self.assertTrue(self.repo.exists(session_id))
        self.assertFalse(self.repo.exists("nonexistent"))

    def test_list_sessions(self):
        """Test listing all session IDs."""
        game1 = Game(["Alice", "Bob"], ["Eve", "Fiona"], ["Judge1"])
        game2 = Game(["Charlie", "David"], ["Grace", "Hannah"], ["Judge2"])

        id1 = self.repo.create(game1)
        id2 = self.repo.create(game2)

        sessions = self.repo.list_sessions()

        self.assertEqual(len(sessions), 2)
        self.assertIn(id1, sessions)
        self.assertIn(id2, sessions)

    def test_expiration(self):
        """Test that expired games are removed."""
        # Create repo with very short expiration
        repo = MemoryGameRepository(expiration_seconds=0.1)  # 100ms

        game = Game(["Alice", "Bob"], ["Eve", "Fiona"], ["Judge1"])
        session_id = repo.create(game)

        # Game should exist initially
        self.assertTrue(repo.exists(session_id))

        # Wait for expiration
        time.sleep(0.2)

        # Game should be expired now
        self.assertFalse(repo.exists(session_id))
        self.assertIsNone(repo.get(session_id))

    def test_cleanup_expired(self):
        """Test cleanup of expired games."""
        # Create repo with very short expiration
        repo = MemoryGameRepository(expiration_seconds=0.1)  # 100ms

        # Create multiple games
        game1 = Game(["Alice", "Bob"], ["Eve", "Fiona"], ["Judge1"])
        game2 = Game(["Charlie", "David"], ["Grace", "Hannah"], ["Judge2"])

        repo.create(game1)
        repo.create(game2)

        # Wait for expiration
        time.sleep(0.2)

        # Cleanup
        removed = repo.cleanup_expired()

        self.assertEqual(removed, 2)
        self.assertEqual(len(repo.list_sessions()), 0)

    def test_get_stats(self):
        """Test getting repository statistics."""
        game = Game(["Alice", "Bob"], ["Eve", "Fiona"], ["Judge1"])
        self.repo.create(game)

        stats = self.repo.get_stats()

        self.assertEqual(stats["total_games"], 1)
        self.assertIn("oldest_game_age_seconds", stats)
        self.assertIn("newest_game_age_seconds", stats)

    def test_thread_safety(self):
        """Test that the repository is thread-safe."""
        import threading

        errors = []

        def create_games():
            try:
                for i in range(10):
                    game = Game(["Alice", "Bob"], ["Eve", "Fiona"], ["Judge1"])
                    self.repo.create(game)
            except Exception as e:
                errors.append(e)

        # Create multiple threads
        threads = [threading.Thread(target=create_games) for _ in range(5)]

        # Start all threads
        for t in threads:
            t.start()

        # Wait for all to complete
        for t in threads:
            t.join()

        # Check for errors
        self.assertEqual(len(errors), 0)

        # Should have 50 games (5 threads * 10 games each)
        self.assertEqual(len(self.repo.list_sessions()), 50)


if __name__ == "__main__":
    unittest.main()
