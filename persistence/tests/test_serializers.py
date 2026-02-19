"""
Tests for Game serialization/deserialization.

These tests ensure that Game objects can be correctly serialized to JSON
and deserialized back to fully functional Game objects.
"""

import unittest
import sys
import os

# Add parent directories to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from game_logic import Game
from persistence.serializers import GameSerializer


class TestGameSerializer(unittest.TestCase):
    """Test cases for GameSerializer."""

    def test_serialize_deserialize_new_game(self):
        """Test serializing and deserializing a newly created game."""
        # Create a new game
        leads = ["Alice", "Bob", "Charlie", "David"]
        follows = ["Eve", "Fiona", "Grace", "Hannah"]
        judges = ["Judge1", "Judge2"]

        original = Game(leads, follows, judges)

        # Serialize
        json_str = GameSerializer.serialize(original)

        # Verify JSON is valid
        self.assertIsInstance(json_str, str)
        self.assertTrue(len(json_str) > 0)

        # Deserialize
        restored = GameSerializer.deserialize(json_str)

        # Verify basic properties
        self.assertEqual(restored.round_num, original.round_num)
        self.assertEqual(restored.state, original.state)
        self.assertEqual(len(restored.initial_leads), len(original.initial_leads))
        self.assertEqual(len(restored.initial_follows), len(original.initial_follows))

        # Verify guest judges
        self.assertEqual(restored.guest_judges, original.guest_judges)

        # Verify win threshold
        self.assertEqual(restored.win_threshold, original.win_threshold)

    def test_serialize_deserialize_with_votes(self):
        """Test serializing and deserializing a game with some votes."""
        leads = ["Alice", "Bob", "Charlie", "David"]
        follows = ["Eve", "Fiona", "Grace", "Hannah"]
        judges = ["Judge1", "Judge2"]

        original = Game(leads, follows, judges)

        # Process some votes for leads
        lead1 = original.pair_1[0]
        lead2 = original.pair_2[0]
        votes = [("Judge1", 1), ("Judge2", 1)]
        original.judge_round(lead1, lead2, "lead", votes)

        # Serialize and deserialize
        json_str = GameSerializer.serialize(original)
        restored = GameSerializer.deserialize(json_str)

        # Verify points were preserved
        original_lead_points = {c.name: c.points for c in original.initial_leads}
        restored_lead_points = {c.name: c.points for c in restored.initial_leads}
        self.assertEqual(original_lead_points, restored_lead_points)

        # Verify round was preserved
        self.assertEqual(len(restored.current_round.lead_votes), len(original.current_round.lead_votes))

    def test_serialize_deserialize_multiple_rounds(self):
        """Test serializing and deserializing a game after multiple rounds."""
        leads = ["Alice", "Bob", "Charlie", "David"]
        follows = ["Eve", "Fiona", "Grace", "Hannah"]
        judges = ["Judge1", "Judge2"]

        original = Game(leads, follows, judges)

        # Play 2 rounds
        for _ in range(2):
            # Vote for leads
            lead1 = original.pair_1[0]
            lead2 = original.pair_2[0]
            original.judge_round(lead1, lead2, "lead", [("Judge1", 1), ("Judge2", 1)])

            # Vote for follows
            follow1 = original.pair_1[1]
            follow2 = original.pair_2[1]
            original.judge_round(follow1, follow2, "follow", [("Judge1", 1), ("Judge2", 1)])

            original.check_for_win()

            if not original.is_finished():
                original.next_round()

        # Serialize and deserialize
        json_str = GameSerializer.serialize(original)
        restored = GameSerializer.deserialize(json_str)

        # Verify round number
        self.assertEqual(restored.round_num, original.round_num)

        # Verify rounds history length
        self.assertEqual(len(restored.rounds), len(original.rounds))

        # Verify has_winning flags
        self.assertEqual(restored.has_winning_lead, original.has_winning_lead)
        self.assertEqual(restored.has_winning_follow, original.has_winning_follow)

    def test_serialize_deserialize_tie_state(self):
        """Test serializing and deserializing a game with tie state."""
        leads = ["Alice", "Bob", "Charlie", "David"]
        follows = ["Eve", "Fiona", "Grace", "Hannah"]
        judges = ["Judge1", "Judge2"]

        original = Game(leads, follows, judges)

        # Create a tie (both judges vote 3)
        lead1 = original.pair_1[0]
        lead2 = original.pair_2[0]
        original.judge_round(lead1, lead2, "lead", [("Judge1", 3), ("Judge2", 3)])

        # Verify tie was registered
        self.assertIsNotNone(original.tie_lead_pair)

        # Serialize and deserialize
        json_str = GameSerializer.serialize(original)
        restored = GameSerializer.deserialize(json_str)

        # Verify tie state was preserved
        self.assertIsNotNone(restored.tie_lead_pair)
        self.assertEqual(restored.tie_lead_pair[0].name, original.tie_lead_pair[0].name)
        self.assertEqual(restored.tie_lead_pair[1].name, original.tie_lead_pair[1].name)

    def test_to_dict_from_dict(self):
        """Test the dictionary conversion methods."""
        leads = ["Alice", "Bob"]
        follows = ["Eve", "Fiona"]
        judges = ["Judge1"]

        original = Game(leads, follows, judges)

        # Convert to dict
        game_dict = GameSerializer.to_dict(original)

        # Verify it's a dict
        self.assertIsInstance(game_dict, dict)
        self.assertIn("version", game_dict)
        self.assertIn("leads", game_dict)
        self.assertIn("follows", game_dict)

        # Convert back
        restored = GameSerializer.from_dict(game_dict)

        # Verify
        self.assertEqual(restored.round_num, original.round_num)
        self.assertEqual(len(restored.initial_leads), len(original.initial_leads))

    def test_contestant_points_preservation(self):
        """Test that contestant points are correctly preserved across serialization."""
        leads = ["Alice", "Bob", "Charlie", "David"]
        follows = ["Eve", "Fiona", "Grace", "Hannah"]
        judges = ["Judge1", "Judge2"]

        original = Game(leads, follows, judges)

        # Give some contestants specific points
        for contestant in original.initial_leads:
            if contestant.name == "Alice":
                contestant.points = 5
            elif contestant.name == "Bob":
                contestant.points = 3

        for contestant in original.initial_follows:
            if contestant.name == "Eve":
                contestant.points = 4

        # Serialize and deserialize
        json_str = GameSerializer.serialize(original)
        restored = GameSerializer.deserialize(json_str)

        # Check points
        for contestant in restored.initial_leads:
            if contestant.name == "Alice":
                self.assertEqual(contestant.points, 5)
            elif contestant.name == "Bob":
                self.assertEqual(contestant.points, 3)

        for contestant in restored.initial_follows:
            if contestant.name == "Eve":
                self.assertEqual(contestant.points, 4)

    def test_session_id_preservation(self):
        """Test that session_id is preserved across serialization."""
        leads = ["Alice", "Bob"]
        follows = ["Eve", "Fiona"]
        judges = ["Judge1"]

        original = Game(leads, follows, judges)
        original.session_id = "test-session-123"

        # Serialize and deserialize
        json_str = GameSerializer.serialize(original)
        restored = GameSerializer.deserialize(json_str)

        self.assertEqual(restored.session_id, "test-session-123")


class TestContestantSerializer(unittest.TestCase):
    """Test individual contestant serialization."""

    def test_serialize_contestant(self):
        """Test serializing a single contestant."""
        from game_logic import Contestant

        contestant = Contestant("Test Player")
        contestant.points = 10

        data = GameSerializer.serialize_contestant(contestant)

        self.assertEqual(data["name"], "Test Player")
        self.assertEqual(data["points"], 10)

    def test_deserialize_contestant(self):
        """Test deserializing a single contestant."""
        data = {"name": "Test Player", "points": 7}

        contestant = GameSerializer.deserialize_contestant(data)

        self.assertEqual(contestant.name, "Test Player")
        self.assertEqual(contestant.points, 7)


class TestRoundSerializer(unittest.TestCase):
    """Test individual round serialization."""

    def test_serialize_round(self):
        """Test serializing a round."""
        from game_logic import Round

        round_obj = Round(
            round_num=1,
            lead_votes={"Judge1": 1},
            follow_votes={"Judge1": 2},
            judges=["Judge1"],
            contestant_judges=["Player1"],
            session_id="test-session",
        )
        round_obj.lead_winner = "Alice"
        round_obj.follow_winner = "Eve"

        data = GameSerializer.serialize_round(round_obj)

        self.assertEqual(data["round_num"], 1)
        self.assertEqual(data["lead_votes"], {"Judge1": 1})
        self.assertEqual(data["lead_winner"], "Alice")

    def test_deserialize_round(self):
        """Test deserializing a round."""
        data = {
            "round_num": 2,
            "lead_votes": {"Judge1": 1, "Judge2": 2},
            "follow_votes": {"Judge1": 1},
            "judges": ["Judge1", "Judge2"],
            "contestant_judges": ["Player1"],
            "win_messages": ["Alice wins!"],
            "pairs": {"pair_1": {"lead": "Alice", "follow": "Eve"}},
            "lead_winner": "Alice",
            "follow_winner": "Eve",
            "song_info": {"title": "Test Song"},
            "session_id": "test-session",
        }

        round_obj = GameSerializer.deserialize_round(data)

        self.assertEqual(round_obj.round_num, 2)
        self.assertEqual(round_obj.lead_winner, "Alice")
        self.assertEqual(round_obj.song_info, {"title": "Test Song"})


if __name__ == "__main__":
    unittest.main()
