"""
Serialization round-trip tests for GameSerializer.

Regression coverage for the tie-break persistence bug: a Game stored in
PostgreSQL is re-created from JSON on every request via
GameSerializer.deserialize(), which builds the object with object.__new__(Game)
and bypasses __init__. If a field the app reads (e.g. everything /api/state's
serialize_state() touches) isn't explicitly round-tripped, it goes missing and
the endpoint 500s. These tests lock in that the full tie-break state survives.
"""

import unittest

from game_logic import Game
from persistence.serializers import GameSerializer

# Every tie-break attribute /api/state (web.app.serialize_state) reads off a Game.
# All must exist after a JSON round-trip or the battle flow 500s under Postgres.
TIEBREAK_ATTRS = [
    "tiebreak_active",
    "tiebreak_lead_needed",
    "tiebreak_follow_needed",
    "tiebreak_sub_round",
    "tiebreak_leads_tied",
    "tiebreak_follows_tied",
    "tiebreak_original_leads",
    "tiebreak_original_follows",
    "tiebreak_sub_round_1_pairings",
    "tiebreak_sub_round_2_pairings",
    "tiebreak_lead_winner",
    "tiebreak_follow_winner",
]


class TestGameSerialization(unittest.TestCase):
    def _make_game(self):
        return Game(
            ["L1", "L2", "L3", "L4"],
            ["F1", "F2", "F3", "F4"],
            ["J1", "J2"],
            points_to_win=7,
        )

    def _roundtrip(self, game):
        # Mirrors the PostgreSQL path: to JSONB-friendly dict and back.
        return GameSerializer.from_dict(GameSerializer.to_dict(game))

    def test_basic_roundtrip_preserves_core_state(self):
        game = self._make_game()
        game._leads[0].points = 3
        target_name = game._leads[0].name

        restored = self._roundtrip(game)

        self.assertEqual([c.name for c in restored._leads], [c.name for c in game._leads])
        self.assertEqual([c.name for c in restored._follows], [c.name for c in game._follows])
        self.assertEqual(restored.guest_judges, game.guest_judges)
        self.assertEqual(restored.win_threshold, game.win_threshold)
        restored_points = {c.name: c.points for c in restored._leads}
        self.assertEqual(restored_points[target_name], 3)

    def test_roundtrip_restores_all_tiebreak_attrs(self):
        """A fresh Game round-tripped through JSON must still expose every
        tie-break attribute /api/state reads (these were dropped -> 500)."""
        restored = self._roundtrip(self._make_game())
        for attr in TIEBREAK_ATTRS:
            self.assertTrue(hasattr(restored, attr), f"missing {attr} after round-trip")
        self.assertFalse(restored.tiebreak_active)
        self.assertEqual(restored.tiebreak_sub_round, 0)

    def test_roundtrip_preserves_active_tiebreak_state(self):
        """An in-progress tie-break must survive serialization: flags, tied
        lists, name-pairings, and winner references."""
        game = self._make_game()
        game.tiebreak_active = True
        game.tiebreak_sub_round = 2
        game.tiebreak_lead_needed = True
        game.tiebreak_follow_needed = False
        game.tiebreak_leads_tied = [game._leads[0], game._leads[1]]
        game.tiebreak_follows_tied = [game._follows[0], game._follows[1]]
        game.tiebreak_original_leads = list(game.tiebreak_leads_tied)
        game.tiebreak_original_follows = list(game.tiebreak_follows_tied)
        game.tiebreak_sub_round_1_pairings = [(game._leads[0].name, game._follows[0].name)]
        game.tiebreak_sub_round_2_pairings = [(game._leads[1].name, game._follows[1].name)]
        game.tiebreak_lead_winner = game._leads[0]
        game.tiebreak_follow_winner = None

        restored = self._roundtrip(game)

        self.assertTrue(restored.tiebreak_active)
        self.assertEqual(restored.tiebreak_sub_round, 2)
        self.assertTrue(restored.tiebreak_lead_needed)
        self.assertFalse(restored.tiebreak_follow_needed)
        self.assertEqual(
            [c.name for c in restored.tiebreak_leads_tied],
            [game._leads[0].name, game._leads[1].name],
        )
        self.assertEqual(
            [c.name for c in restored.tiebreak_follows_tied],
            [game._follows[0].name, game._follows[1].name],
        )
        self.assertEqual(
            restored.tiebreak_sub_round_1_pairings,
            [(game._leads[0].name, game._follows[0].name)],
        )
        self.assertEqual(
            restored.tiebreak_sub_round_2_pairings,
            [(game._leads[1].name, game._follows[1].name)],
        )
        self.assertIsNotNone(restored.tiebreak_lead_winner)
        self.assertEqual(restored.tiebreak_lead_winner.name, game._leads[0].name)
        self.assertIsNone(restored.tiebreak_follow_winner)
        # Winner should be the same object instance as in the restored tied list,
        # not a duplicate Contestant.
        self.assertIs(restored.tiebreak_lead_winner, restored.tiebreak_leads_tied[0])

    def test_old_record_without_tiebreak_keys_still_loads(self):
        """Backward-compat: a JSON record predating tie-break serialization must
        deserialize with safe defaults (no AttributeError/KeyError)."""
        data = GameSerializer.to_dict(self._make_game())
        for key in list(data.keys()):
            if key.startswith("tiebreak_"):
                data.pop(key)

        restored = GameSerializer.from_dict(data)

        self.assertFalse(restored.tiebreak_active)
        self.assertEqual(restored.tiebreak_leads_tied, [])
        self.assertEqual(restored.tiebreak_follows_tied, [])
        self.assertEqual(restored.tiebreak_sub_round_1_pairings, [])
        self.assertEqual(restored.tiebreak_sub_round_2_pairings, [])
        self.assertIsNone(restored.tiebreak_lead_winner)
        self.assertIsNone(restored.tiebreak_follow_winner)


if __name__ == "__main__":
    unittest.main()
