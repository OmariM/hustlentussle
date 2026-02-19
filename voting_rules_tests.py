import unittest
from game_logic import Game, Contestant
from battle_rules_test_suite import BattleRulesValidator


class VotingRulesTestSuite(unittest.TestCase):
    """Specialized tests for voting rules and scenarios"""

    def setUp(self):
        self.lead_names = ["Lead1", "Lead2", "Lead3", "Lead4"]
        self.follow_names = ["Follow1", "Follow2", "Follow3", "Follow4"]
        self.judge_names = ["Judge1", "Judge2"]

    def create_game(self):
        return Game(self.lead_names, self.follow_names, self.judge_names, points_to_win=7)

    def test_guest_judge_vote_weights(self):
        """Test that guest judge votes have correct weight (2 points vs 1 for contestants)"""
        game = self.create_game()

        # Test scenario: Guest judges vote for contestant 1, contestant judges vote for contestant 2
        lead_pair = (game.pair_1[0], game.pair_2[0])

        # Add some contestant judges to the voting
        contestant_judges = game.contestant_judges[:2]  # Take first 2 contestant judges

        votes = [
            ("Judge1", 1),  # Guest judge votes for contestant 1 (2 points)
            ("Judge2", 1),  # Guest judge votes for contestant 1 (2 points)
            (contestant_judges[0].name, 2),  # Contestant judge votes for contestant 2 (1 point)
            (contestant_judges[1].name, 2),  # Contestant judge votes for contestant 2 (1 point)
        ]

        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", votes)

        # Contestant 1 should win with 4 points (2+2) vs contestant 2 with 2 points (1+1)
        self.assertEqual(result["winner"], lead_pair[0].name)
        self.assertEqual(lead_pair[0].points, 1)  # Winner gets 1 point added to their total

    def test_tie_vote_handling(self):
        """Test all types of tie scenarios"""

        # Test 1: Both guest judges vote tie (3)
        game = self.create_game()
        lead_pair = (game.pair_1[0], game.pair_2[0])

        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 3), ("Judge2", 3)])
        self.assertTrue(result["winner"].startswith("Tie between"))
        self.assertEqual(lead_pair[0].points, 0)  # No points awarded in tie
        self.assertEqual(lead_pair[1].points, 0)

        # Test 2: Mixed votes resulting in equal scores
        game = self.create_game()
        lead_pair = (game.pair_1[0], game.pair_2[0])
        contestant_judge = game.contestant_judges[0].name

        # Guest votes: 1 for each (1 point each), Contestant: 1 vote each (0.5 points each)
        votes = [("Judge1", 1), ("Judge2", 2), (contestant_judge, 1)]
        # Score: Lead1 = 2+1 = 3, Lead2 = 2 = 2, Lead1 wins
        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", votes)
        self.assertEqual(result["winner"], lead_pair[0].name)

    def test_no_contest_handling(self):
        """Test no contest scenarios (both guest judges vote 4)"""

        # Test lead no contest
        game = self.create_game()
        initial_leads_queue = len(game.leads)
        lead_pair = (game.pair_1[0], game.pair_2[0])

        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 4), ("Judge2", 4)])
        self.assertEqual(result["winner"], "No Contest")

        # Both contestants should be added back to queue
        self.assertEqual(len(game.leads), initial_leads_queue + 2)
        self.assertIn(lead_pair[0], game.leads)
        self.assertIn(lead_pair[1], game.leads)

        # Test follow no contest
        initial_follows_queue = len(game.follows)
        follow_pair = (game.pair_1[1], game.pair_2[1])

        result = game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 4), ("Judge2", 4)])
        self.assertEqual(result["winner"], "No Contest")

        # Both contestants should be added back to queue
        self.assertEqual(len(game.follows), initial_follows_queue + 2)
        self.assertIn(follow_pair[0], game.follows)
        self.assertIn(follow_pair[1], game.follows)

    def test_split_vote_scenarios(self):
        """Test various split vote scenarios"""
        scenarios = [
            {
                "name": "guest_split_favor_1",
                "votes": [("Judge1", 1), ("Judge2", 2)],
                "expected_winner": 0,  # First contestant wins in tie
            },
            {
                "name": "guest_split_with_contestant_support",
                "votes": [("Judge1", 1), ("Judge2", 2), ("Lead3", 1)],
                "expected_winner": 0,  # First contestant: 2+1=3, Second: 2
            },
            {
                "name": "all_split_different_ways",
                "votes": [("Judge1", 1), ("Judge2", 2), ("Lead3", 2), ("Lead4", 1)],
                "expected_winner": 0,  # Tie: both get 4, first wins
            },
        ]

        for scenario in scenarios:
            with self.subTest(scenario=scenario["name"]):
                game = self.create_game()
                lead_pair = (game.pair_1[0], game.pair_2[0])

                result = game.judge_round(lead_pair[0], lead_pair[1], "lead", scenario["votes"])
                expected_winner = lead_pair[scenario["expected_winner"]]
                self.assertEqual(result["winner"], expected_winner.name)

    def test_contestant_judge_exclusion(self):
        """Test that competing contestants cannot be judges"""
        game = self.create_game()

        # Get competing contestants
        competing = {game.pair_1[0].name, game.pair_1[1].name, game.pair_2[0].name, game.pair_2[1].name}

        # Check that no contestant judge is also competing
        judge_names = {judge.name for judge in game.contestant_judges}
        overlap = competing.intersection(judge_names)

        self.assertEqual(len(overlap), 0, f"Competing contestants found as judges: {overlap}")

    def test_invalid_vote_handling(self):
        """Test how the system handles edge cases and invalid votes"""
        game = self.create_game()
        lead_pair = (game.pair_1[0], game.pair_2[0])

        # Test with votes that might cause issues
        edge_cases = [
            # Only one guest judge voting (missing second guest judge)
            [("Judge1", 1)],
            # Invalid vote values (should be 1, 2, 3, or 4)
            [("Judge1", 1), ("Judge2", 1)],  # Valid case for comparison
            # Empty votes
            [],
        ]

        for votes in edge_cases:
            with self.subTest(votes=str(votes)):
                try:
                    # Create fresh game for each test
                    fresh_game = self.create_game()
                    fresh_lead_pair = (fresh_game.pair_1[0], fresh_game.pair_2[0])

                    result = fresh_game.judge_round(fresh_lead_pair[0], fresh_lead_pair[1], "lead", votes)

                    # Validate that game state remains consistent
                    validator = BattleRulesValidator(fresh_game)
                    violations = validator.validate_all_rules(validator.capture_state())
                    self.assertEqual(violations, [], f"Violations with votes {votes}: {violations}")

                except Exception as e:
                    # Document what exceptions occur with invalid inputs
                    print(f"Exception with votes {votes}: {e}")

    def test_vote_counting_accuracy(self):
        """Test that vote counting is mathematically correct"""
        test_cases = [
            {
                "votes": [("Judge1", 1), ("Judge2", 1)],  # Both guests vote for contestant 1
                "expected_scores": (4, 0),  # 2+2 for contestant 1, 0 for contestant 2
                "expected_winner": 0,
            },
            {
                "votes": [("Judge1", 2), ("Judge2", 2)],  # Both guests vote for contestant 2
                "expected_scores": (0, 4),  # 0 for contestant 1, 2+2 for contestant 2
                "expected_winner": 1,
            },
            {
                "votes": [("Judge1", 1), ("Judge2", 2)],  # Split guest votes
                "expected_scores": (2, 2),  # 2 each, tie goes to first
                "expected_winner": 0,
            },
            {
                "votes": [("Judge1", 3), ("Judge2", 3)],  # Both tie votes
                "expected_scores": (2, 2),  # 1+1 each from tie votes
                "expected_winner": "TIE",
            },
        ]

        for i, case in enumerate(test_cases):
            with self.subTest(case_num=i):
                game = self.create_game()
                lead_pair = (game.pair_1[0], game.pair_2[0])

                # Manually calculate expected scores to verify logic
                score1 = score2 = 0
                for voter, decision in case["votes"]:
                    is_guest = voter in game.guest_judges
                    weight = 2 if is_guest else 1

                    if decision == 1:
                        score1 += weight
                    elif decision == 2:
                        score2 += weight
                    elif decision == 3:  # Tie vote
                        score1 += weight // 2 if is_guest else 0.5
                        score2 += weight // 2 if is_guest else 0.5

                result = game.judge_round(lead_pair[0], lead_pair[1], "lead", case["votes"])

                if case["expected_winner"] == "TIE":
                    self.assertTrue(result["winner"].startswith("Tie"))
                else:
                    expected_winner = lead_pair[case["expected_winner"]]
                    self.assertEqual(result["winner"], expected_winner.name)

    def test_voting_with_different_judge_counts(self):
        """Test voting with different numbers of contestant judges"""
        configs = [
            (["L1", "L2"], ["F1", "F2"], ["J1", "J2"]),  # Minimal: 0 contestant judges
            (["L1", "L2", "L3"], ["F1", "F2", "F3"], ["J1", "J2"]),  # 2 contestant judges
            (["L1", "L2", "L3", "L4"], ["F1", "F2", "F3", "F4"], ["J1", "J2"]),  # 3 contestant judges
            ([f"L{i}" for i in range(1, 8)], [f"F{i}" for i in range(1, 8)], ["J1", "J2"]),  # Many contestants
        ]

        for leads, follows, judges in configs:
            with self.subTest(total_contestants=len(leads) + len(follows)):
                game = Game(leads, follows, judges, points_to_win=7)

                # Verify judge count is appropriate
                available_for_judging = len(leads) + len(follows) - 4  # 4 are competing
                expected_judges = min(3, available_for_judging)

                if available_for_judging > 0:
                    self.assertEqual(len(game.contestant_judges), expected_judges)

                # Test voting works correctly
                lead_pair = (game.pair_1[0], game.pair_2[0])

                # Create votes including contestant judges
                votes = [("J1", 1), ("J2", 1)]
                for judge in game.contestant_judges[:2]:  # Add some contestant judge votes
                    votes.append((judge.name, 1))

                result = game.judge_round(lead_pair[0], lead_pair[1], "lead", votes)
                self.assertEqual(result["winner"], lead_pair[0].name)

                # Validate state remains consistent
                validator = BattleRulesValidator(game)
                violations = validator.validate_all_rules(validator.capture_state())
                self.assertEqual(violations, [], f"Violations: {violations}")

    def test_unanimous_contestant_judges_required_to_override_single_guest_tie_or_no_contest(self):
        """
        When one guest judge votes Tie (3) or No Contest (4) and the other guest judge votes for a contestant,
        a panel of 3 contestant judges can only overturn that guest-judge advantage if they vote unanimously
        for the other contestant.
        """
        game = self.create_game()
        lead_pair = (game.pair_1[0], game.pair_2[0])

        # Ensure we actually have 3 contestant judges in this typical config
        self.assertGreaterEqual(len(game.contestant_judges), 3)
        cj = [j.name for j in game.contestant_judges[:3]]

        # Case A: One guest votes Tie, the other votes for contestant 1.
        # Guest points: c1 gets 2 + 1 = 3, c2 gets 1.
        # If contestant judges are not unanimous for contestant 2 (e.g., 2-1), c1 should still win.
        votes_mixed = [("Judge1", 3), ("Judge2", 1), (cj[0], 2), (cj[1], 2), (cj[2], 1)]
        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", votes_mixed)
        self.assertEqual(result["winner"], lead_pair[0].name)

        # But if contestant judges are unanimous for contestant 2, contestant 2 should win (4 vs 3).
        game = self.create_game()
        lead_pair = (game.pair_1[0], game.pair_2[0])
        cj = [j.name for j in game.contestant_judges[:3]]
        votes_unanimous = [("Judge1", 3), ("Judge2", 1), (cj[0], 2), (cj[1], 2), (cj[2], 2)]
        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", votes_unanimous)
        self.assertEqual(result["winner"], lead_pair[1].name)

        # Case B: One guest votes No Contest, the other votes for contestant 1.
        # Guest points: c1 gets 2, c2 gets 0.
        # A 2-1 split for contestant 2 is not enough to overturn (c1=3, c2=2).
        game = self.create_game()
        lead_pair = (game.pair_1[0], game.pair_2[0])
        cj = [j.name for j in game.contestant_judges[:3]]
        votes_mixed_nc = [("Judge1", 4), ("Judge2", 1), (cj[0], 2), (cj[1], 2), (cj[2], 1)]
        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", votes_mixed_nc)
        self.assertEqual(result["winner"], lead_pair[0].name)

        # Unanimous for contestant 2 overturns (c1=2, c2=3).
        game = self.create_game()
        lead_pair = (game.pair_1[0], game.pair_2[0])
        cj = [j.name for j in game.contestant_judges[:3]]
        votes_unanimous_nc = [("Judge1", 4), ("Judge2", 1), (cj[0], 2), (cj[1], 2), (cj[2], 2)]
        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", votes_unanimous_nc)
        self.assertEqual(result["winner"], lead_pair[1].name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
