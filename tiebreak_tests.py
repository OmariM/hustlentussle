import unittest
from game_logic import Game


def make_game(leads=None, follows=None, judges=None, points_to_win=7):
    leads = leads or ["Lead1", "Lead2", "Lead3", "Lead4"]
    follows = follows or ["Follow1", "Follow2", "Follow3", "Follow4"]
    judges = judges or ["Judge1", "Judge2"]
    return Game(leads, follows, judges, points_to_win=points_to_win)


def set_points(game, lead_pts: dict, follow_pts: dict):
    """Set point totals directly on contestant objects."""
    for c in game.initial_leads:
        if c.name in lead_pts:
            c.points = lead_pts[c.name]
    for c in game.initial_follows:
        if c.name in follow_pts:
            c.points = follow_pts[c.name]


class TestDetectTiebreakNeeds(unittest.TestCase):
    def test_no_tiebreak_when_clear_leader(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 1, "Lead3": 0, "Lead4": 0},
            {"Follow1": 3, "Follow2": 1, "Follow3": 0, "Follow4": 0},
        )
        result = game.detect_tiebreak_needs()
        self.assertFalse(result["lead_needed"])
        self.assertFalse(result["follow_needed"])

    def test_lead_tiebreak_detected(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 1, "Lead4": 0},
            {"Follow1": 3, "Follow2": 1, "Follow3": 0, "Follow4": 0},
        )
        result = game.detect_tiebreak_needs()
        self.assertTrue(result["lead_needed"])
        self.assertFalse(result["follow_needed"])
        self.assertCountEqual(result["tied_leads"], ["Lead1", "Lead2"])
        self.assertEqual(result["lead_max_points"], 3)

    def test_follow_tiebreak_detected(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 1, "Lead3": 0, "Lead4": 0},
            {"Follow1": 2, "Follow2": 2, "Follow3": 2, "Follow4": 0},
        )
        result = game.detect_tiebreak_needs()
        self.assertFalse(result["lead_needed"])
        self.assertTrue(result["follow_needed"])
        self.assertCountEqual(result["tied_follows"], ["Follow1", "Follow2", "Follow3"])

    def test_both_tiebreaks_detected(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 2, "Lead2": 2, "Lead3": 1, "Lead4": 0},
            {"Follow1": 2, "Follow2": 2, "Follow3": 0, "Follow4": 0},
        )
        result = game.detect_tiebreak_needs()
        self.assertTrue(result["lead_needed"])
        self.assertTrue(result["follow_needed"])

    def test_skips_role_with_threshold_winner(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 7, "Lead2": 7, "Lead3": 0, "Lead4": 0},
            {"Follow1": 2, "Follow2": 2, "Follow3": 0, "Follow4": 0},
        )
        # Simulate lead already having a winner via threshold
        game.has_winning_lead = True
        result = game.detect_tiebreak_needs()
        self.assertFalse(result["lead_needed"])
        self.assertTrue(result["follow_needed"])

    def test_three_way_lead_tie(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 4, "Lead2": 4, "Lead3": 4, "Lead4": 1},
            {"Follow1": 1, "Follow2": 0, "Follow3": 0, "Follow4": 0},
        )
        result = game.detect_tiebreak_needs()
        self.assertTrue(result["lead_needed"])
        self.assertCountEqual(result["tied_leads"], ["Lead1", "Lead2", "Lead3"])


class TestStartTiebreak(unittest.TestCase):
    def test_start_tiebreak_sets_state(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 0, "Lead4": 0},
            {"Follow1": 1, "Follow2": 0, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        self.assertTrue(game.tiebreak_active)
        self.assertEqual(game.tiebreak_sub_round, 0)
        self.assertIsNone(game.tiebreak_lead_winner)
        self.assertIsNone(game.tiebreak_follow_winner)
        self.assertEqual(game.tiebreak_sub_round_1_pairings, [])
        self.assertEqual(game.tiebreak_sub_round_2_pairings, [])


class TestPartnerSelections(unittest.TestCase):
    def _game_with_lead_tie(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 0, "Lead4": 0},
            {"Follow1": 1, "Follow2": 0, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        return game

    def _game_with_follow_tie(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 1, "Lead3": 0, "Lead4": 0},
            {"Follow1": 2, "Follow2": 2, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        return game

    def _game_with_both_tied(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 0, "Lead4": 0},
            {"Follow1": 2, "Follow2": 2, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        return game

    def test_lead_only_sr1_pairings(self):
        game = self._game_with_lead_tie()
        game.set_tiebreak_partner_selections({"Lead1": "Follow1", "Lead2": "Follow2"}, {})
        self.assertEqual(game.tiebreak_sub_round, 1)
        self.assertIn(("Lead1", "Follow1"), game.tiebreak_sub_round_1_pairings)
        self.assertIn(("Lead2", "Follow2"), game.tiebreak_sub_round_1_pairings)

    def test_lead_only_sr2_rotates_follows(self):
        game = self._game_with_lead_tie()
        game.set_tiebreak_partner_selections({"Lead1": "Follow1", "Lead2": "Follow2"}, {})
        sr2 = game.tiebreak_sub_round_2_pairings
        # Follows should be swapped: Lead1→Follow2, Lead2→Follow1
        self.assertIn(("Lead1", "Follow2"), sr2)
        self.assertIn(("Lead2", "Follow1"), sr2)

    def test_follow_only_sr1_pairings(self):
        game = self._game_with_follow_tie()
        game.set_tiebreak_partner_selections({}, {"Follow1": "Lead1", "Follow2": "Lead2"})
        self.assertEqual(game.tiebreak_sub_round, 1)
        self.assertIn(("Lead1", "Follow1"), game.tiebreak_sub_round_1_pairings)
        self.assertIn(("Lead2", "Follow2"), game.tiebreak_sub_round_1_pairings)

    def test_follow_only_sr2_rotates_leads(self):
        game = self._game_with_follow_tie()
        game.set_tiebreak_partner_selections({}, {"Follow1": "Lead1", "Follow2": "Lead2"})
        sr2 = game.tiebreak_sub_round_2_pairings
        # Leads should rotate: Follow1→Lead2, Follow2→Lead1
        self.assertIn(("Lead2", "Follow1"), sr2)
        self.assertIn(("Lead1", "Follow2"), sr2)

    def test_both_tied_combined_pairings(self):
        game = self._game_with_both_tied()
        game.set_tiebreak_partner_selections(
            {"Lead1": "Follow3", "Lead2": "Follow4"}, {"Follow1": "Lead3", "Follow2": "Lead4"}
        )
        sr1 = game.tiebreak_sub_round_1_pairings
        # All 4 pairings should be present (no overlaps in this case)
        self.assertIn(("Lead1", "Follow3"), sr1)
        self.assertIn(("Lead2", "Follow4"), sr1)
        self.assertIn(("Lead3", "Follow1"), sr1)
        self.assertIn(("Lead4", "Follow2"), sr1)

    def test_deduplication_when_pairs_overlap(self):
        game = self._game_with_both_tied()
        # Lead1 picks Follow1 and Follow1 picks Lead1 → same pair
        game.set_tiebreak_partner_selections(
            {"Lead1": "Follow1", "Lead2": "Follow2"}, {"Follow1": "Lead1", "Follow2": "Lead2"}
        )
        sr1 = game.tiebreak_sub_round_1_pairings
        # (Lead1, Follow1) should only appear once
        self.assertEqual(sr1.count(("Lead1", "Follow1")), 1)
        self.assertEqual(sr1.count(("Lead2", "Follow2")), 1)

    def test_three_way_tie_cyclic_rotation(self):
        game = make_game(leads=["L1", "L2", "L3", "L4"], follows=["F1", "F2", "F3", "F4"])
        set_points(game, {"L1": 3, "L2": 3, "L3": 3, "L4": 0}, {"F1": 1, "F2": 0, "F3": 0, "F4": 0})
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        game.set_tiebreak_partner_selections({"L1": "F1", "L2": "F2", "L3": "F3"}, {})
        sr1 = game.tiebreak_sub_round_1_pairings
        sr2 = game.tiebreak_sub_round_2_pairings
        self.assertEqual(len(sr1), 3)
        # SR2: follows rotate cyclically [F1,F2,F3] → [F2,F3,F1]
        self.assertIn(("L1", "F2"), sr2)
        self.assertIn(("L2", "F3"), sr2)
        self.assertIn(("L3", "F1"), sr2)


class TestAdvanceTiebreakSubRound(unittest.TestCase):
    def test_advance_increments(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 0, "Lead4": 0},
            {"Follow1": 0, "Follow2": 0, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        game.set_tiebreak_partner_selections({"Lead1": "Follow1", "Lead2": "Follow2"}, {})
        self.assertEqual(game.advance_tiebreak_sub_round(), 2)
        self.assertEqual(game.advance_tiebreak_sub_round(), 3)

    def test_advance_caps_at_3(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 0, "Lead4": 0},
            {"Follow1": 0, "Follow2": 0, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        game.tiebreak_sub_round = 3
        result = game.advance_tiebreak_sub_round()
        self.assertEqual(result, 3)


class TestJudgeTiebreak(unittest.TestCase):
    def _setup(self, lead_tie=True, follow_tie=False):
        game = make_game()
        lead_pts = {"Lead1": 3, "Lead2": 3, "Lead3": 0, "Lead4": 0}
        follow_pts = {"Follow1": 2 if follow_tie else 3, "Follow2": 2 if follow_tie else 1, "Follow3": 0, "Follow4": 0}
        if not lead_tie:
            lead_pts["Lead1"] = 4
        set_points(game, lead_pts, follow_pts)
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        return game

    def test_clear_winner_resolved(self):
        game = self._setup(lead_tie=True)
        result = game.judge_tiebreak(
            "lead",
            [
                ("Judge1", "Lead1"),
                ("Judge2", "Lead1"),
            ],
        )
        self.assertTrue(result["resolved"])
        self.assertEqual(result["winner"], "Lead1")
        self.assertIsNotNone(game.tiebreak_lead_winner)
        self.assertEqual(game.tiebreak_lead_winner.name, "Lead1")

    def test_tied_vote_not_resolved(self):
        game = self._setup(lead_tie=True)
        result = game.judge_tiebreak(
            "lead",
            [
                ("Judge1", "Lead1"),
                ("Judge2", "Lead2"),
            ],
        )
        self.assertFalse(result["resolved"])
        self.assertIsNone(result["winner"])
        self.assertCountEqual(result["still_tied"], ["Lead1", "Lead2"])
        self.assertIsNone(game.tiebreak_lead_winner)

    def test_tied_vote_resets_sub_round(self):
        game = self._setup(lead_tie=True)
        game.tiebreak_sub_round = 3
        game.judge_tiebreak("lead", [("Judge1", "Lead1"), ("Judge2", "Lead2")])
        self.assertEqual(game.tiebreak_sub_round, 0)
        self.assertEqual(game.tiebreak_sub_round_1_pairings, [])

    def test_tied_vote_narrows_tied_list(self):
        """Three-way tie: vote narrows to two still-tied contestants."""
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 3, "Lead4": 0},
            {"Follow1": 1, "Follow2": 0, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        # Lead1 and Lead2 each get 1 vote, Lead3 gets 0
        result = game.judge_tiebreak(
            "lead",
            [
                ("Judge1", "Lead1"),
                ("Judge2", "Lead2"),
            ],
        )
        self.assertFalse(result["resolved"])
        self.assertCountEqual(result["still_tied"], ["Lead1", "Lead2"])
        # Lead3 dropped from tied list
        self.assertEqual(len(game.tiebreak_leads_tied), 2)

    def test_guest_judge_weight(self):
        """Guest judges count 2 pts, contestant judges 1 pt."""
        game = self._setup(lead_tie=True)
        contestant_judge = game.contestant_judges[0].name if game.contestant_judges else "Lead3"
        # Judge1 (guest, 2pts) votes Lead2; contestant judge (1pt) votes Lead1
        # Lead1: 1pt, Lead2: 2pt → Lead2 wins
        result = game.judge_tiebreak(
            "lead",
            [
                ("Judge1", "Lead2"),
                (contestant_judge, "Lead1"),
            ],
        )
        self.assertTrue(result["resolved"])
        self.assertEqual(result["winner"], "Lead2")

    def test_follow_tiebreak(self):
        game = self._setup(lead_tie=False, follow_tie=True)
        result = game.judge_tiebreak(
            "follow",
            [
                ("Judge1", "Follow1"),
                ("Judge2", "Follow1"),
            ],
        )
        self.assertTrue(result["resolved"])
        self.assertEqual(result["winner"], "Follow1")
        self.assertEqual(game.tiebreak_follow_winner.name, "Follow1")

    def test_vote_tally_returned(self):
        game = self._setup(lead_tie=True)
        result = game.judge_tiebreak(
            "lead",
            [
                ("Judge1", "Lead1"),
                ("Judge2", "Lead2"),
            ],
        )
        self.assertIn("Lead1", result["vote_tally"])
        self.assertIn("Lead2", result["vote_tally"])

    def test_unknown_contestant_name_ignored(self):
        game = self._setup(lead_tie=True)
        result = game.judge_tiebreak(
            "lead",
            [
                ("Judge1", "Lead1"),
                ("Judge2", "NotARealLead"),
            ],
        )
        # Only Lead1 got a valid vote → Lead1 wins
        self.assertTrue(result["resolved"])
        self.assertEqual(result["winner"], "Lead1")


class TestFinalizeTiebreakResults(unittest.TestCase):
    def test_finalize_promotes_winners(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 0, "Lead4": 0},
            {"Follow1": 2, "Follow2": 2, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        # Manually resolve both roles
        game.judge_tiebreak("lead", [("Judge1", "Lead1"), ("Judge2", "Lead1")])
        game.judge_tiebreak("follow", [("Judge1", "Follow1"), ("Judge2", "Follow1")])
        game.finalize_tiebreak_results()
        self.assertTrue(game.has_winning_lead)
        self.assertTrue(game.has_winning_follow)
        self.assertEqual(game.winning_lead.name, "Lead1")
        self.assertEqual(game.winning_follow.name, "Follow1")
        self.assertEqual(game.state, 1)

    def test_finalize_awards_bonus_point(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 0, "Lead4": 0},
            {"Follow1": 1, "Follow2": 0, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        game.judge_tiebreak("lead", [("Judge1", "Lead1"), ("Judge2", "Lead1")])
        points_before = game.tiebreak_lead_winner.points
        game.finalize_tiebreak_results()
        self.assertEqual(game.winning_lead.points, points_before + 1)

    def test_finalize_only_promotes_needed_roles(self):
        """If only one role needed a tiebreak, only that role gets promoted."""
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 0, "Lead4": 0},
            {"Follow1": 1, "Follow2": 0, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        game.judge_tiebreak("lead", [("Judge1", "Lead1"), ("Judge2", "Lead1")])
        game.finalize_tiebreak_results()
        self.assertTrue(game.has_winning_lead)
        self.assertFalse(game.has_winning_follow)


class TestEndToEndTiebreakFlow(unittest.TestCase):
    def test_full_lead_only_tiebreak(self):
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 1, "Lead4": 0},
            {"Follow1": 4, "Follow2": 1, "Follow3": 0, "Follow4": 0},
        )

        info = game.detect_tiebreak_needs()
        self.assertTrue(info["lead_needed"])
        self.assertFalse(info["follow_needed"])

        game.start_tiebreak()
        game.set_tiebreak_partner_selections({"Lead1": "Follow1", "Lead2": "Follow2"}, {})
        self.assertEqual(len(game.tiebreak_sub_round_1_pairings), 2)

        game.advance_tiebreak_sub_round()  # → 2
        game.advance_tiebreak_sub_round()  # → 3

        result = game.judge_tiebreak(
            "lead",
            [
                ("Judge1", "Lead1"),
                ("Judge2", "Lead1"),
            ],
        )
        self.assertTrue(result["resolved"])

        game.finalize_tiebreak_results()
        self.assertEqual(game.winning_lead.name, "Lead1")
        self.assertEqual(game.state, 1)

    def test_recursive_tiebreak_until_winner(self):
        """Two tied leads, vote ties, second round resolves it."""
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 0, "Lead4": 0},
            {"Follow1": 1, "Follow2": 0, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        game.set_tiebreak_partner_selections({"Lead1": "Follow1", "Lead2": "Follow2"}, {})
        game.advance_tiebreak_sub_round()
        game.advance_tiebreak_sub_round()

        # Round 1 vote: tie
        result = game.judge_tiebreak(
            "lead",
            [
                ("Judge1", "Lead1"),
                ("Judge2", "Lead2"),
            ],
        )
        self.assertFalse(result["resolved"])
        self.assertEqual(game.tiebreak_sub_round, 0)

        # Round 2: new partner selections → another set of sub-rounds
        game.set_tiebreak_partner_selections({"Lead1": "Follow3", "Lead2": "Follow4"}, {})
        game.advance_tiebreak_sub_round()
        game.advance_tiebreak_sub_round()

        # Round 2 vote: clear winner
        result = game.judge_tiebreak(
            "lead",
            [
                ("Judge1", "Lead2"),
                ("Judge2", "Lead2"),
            ],
        )
        self.assertTrue(result["resolved"])
        self.assertEqual(result["winner"], "Lead2")

        game.finalize_tiebreak_results()
        self.assertEqual(game.winning_lead.name, "Lead2")
        self.assertEqual(game.state, 1)

    def test_asymmetric_both_roles_tiebreak(self):
        """3 leads tied, 2 follows tied — each role resolves independently."""
        game = make_game()
        set_points(
            game,
            {"Lead1": 3, "Lead2": 3, "Lead3": 3, "Lead4": 0},
            {"Follow1": 2, "Follow2": 2, "Follow3": 0, "Follow4": 0},
        )
        game.detect_tiebreak_needs()
        game.start_tiebreak()
        game.set_tiebreak_partner_selections(
            {"Lead1": "Follow1", "Lead2": "Follow2", "Lead3": "Follow3"}, {"Follow1": "Lead4", "Follow2": "Lead3"}
        )
        # SR1 has lead pairings + follow pairings (minus any overlaps)
        sr1 = game.tiebreak_sub_round_1_pairings
        self.assertGreaterEqual(len(sr1), 3)

        game.advance_tiebreak_sub_round()
        game.advance_tiebreak_sub_round()

        lead_result = game.judge_tiebreak(
            "lead",
            [
                ("Judge1", "Lead1"),
                ("Judge2", "Lead1"),
            ],
        )
        follow_result = game.judge_tiebreak(
            "follow",
            [
                ("Judge1", "Follow2"),
                ("Judge2", "Follow2"),
            ],
        )
        self.assertTrue(lead_result["resolved"])
        self.assertTrue(follow_result["resolved"])

        game.finalize_tiebreak_results()
        self.assertEqual(game.winning_lead.name, "Lead1")
        self.assertEqual(game.winning_follow.name, "Follow2")
        self.assertEqual(game.state, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
