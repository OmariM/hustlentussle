import unittest
import random
import itertools
from typing import List, Tuple, Dict, Any, Set
from dataclasses import dataclass
from game_logic import Game, Contestant


@dataclass
class GameStateSnapshot:
    """Capture a complete snapshot of game state for validation"""

    round_num: int
    pair_1: Tuple[str, str]
    pair_2: Tuple[str, str]
    leads_queue: List[str]
    follows_queue: List[str]
    contestant_judges: List[str]
    lead_points: Dict[str, int]
    follow_points: Dict[str, int]
    has_winning_lead: bool
    has_winning_follow: bool
    winning_lead: str
    winning_follow: str
    last_lead_winner: str
    last_follow_winner: str
    tie_lead_pair: Tuple[str, str]
    tie_follow_pair: Tuple[str, str]
    is_finished: bool
    win_threshold: int


class BattleRulesValidator:
    """Validates that all battle rules are enforced at every game state"""

    def __init__(self, game: Game):
        self.game = game
        self.all_leads = {c.name for c in game.initial_leads}
        self.all_follows = {c.name for c in game.initial_follows}
        self.total_contestants = len(self.all_leads) + len(self.all_follows)

    def capture_state(self) -> GameStateSnapshot:
        """Capture current game state"""
        return GameStateSnapshot(
            round_num=self.game.round_num,
            pair_1=(self.game.pair_1[0].name, self.game.pair_1[1].name),
            pair_2=(self.game.pair_2[0].name, self.game.pair_2[1].name),
            leads_queue=[c.name for c in self.game.leads],
            follows_queue=[c.name for c in self.game.follows],
            contestant_judges=[c.name for c in self.game.contestant_judges],
            lead_points={c.name: c.points for c in self.game.initial_leads},
            follow_points={c.name: c.points for c in self.game.initial_follows},
            has_winning_lead=self.game.has_winning_lead,
            has_winning_follow=self.game.has_winning_follow,
            winning_lead=self.game.winning_lead.name if self.game.winning_lead else None,
            winning_follow=self.game.winning_follow.name if self.game.winning_follow else None,
            last_lead_winner=self.game.last_lead_winner,
            last_follow_winner=self.game.last_follow_winner,
            tie_lead_pair=(self.game.tie_lead_pair[0].name, self.game.tie_lead_pair[1].name)
            if self.game.tie_lead_pair
            else None,
            tie_follow_pair=(self.game.tie_follow_pair[0].name, self.game.tie_follow_pair[1].name)
            if self.game.tie_follow_pair
            else None,
            is_finished=self.game.is_finished(),
            win_threshold=self.game.win_threshold,
        )

    def validate_all_rules(self, state: GameStateSnapshot) -> List[str]:
        """Validate all battle rules against the current state"""
        violations = []

        # Core structural rules
        violations.extend(self._validate_pairing_rules(state))
        violations.extend(self._validate_queue_rules(state))
        violations.extend(self._validate_judging_rules(state))
        violations.extend(self._validate_point_rules(state))
        violations.extend(self._validate_win_rules(state))
        violations.extend(self._validate_state_consistency(state))
        violations.extend(self._validate_contestant_conservation(state))

        return violations

    def _validate_pairing_rules(self, state: GameStateSnapshot) -> List[str]:
        """Validate pairing and competition rules"""
        violations = []

        # Rule: Each pair must have exactly one lead and one follow
        lead_1, follow_1 = state.pair_1
        lead_2, follow_2 = state.pair_2

        if lead_1 not in self.all_leads:
            violations.append(f"Lead in pair 1 ({lead_1}) is not a valid lead")
        if lead_2 not in self.all_leads:
            violations.append(f"Lead in pair 2 ({lead_2}) is not a valid lead")
        if follow_1 not in self.all_follows:
            violations.append(f"Follow in pair 1 ({follow_1}) is not a valid follow")
        if follow_2 not in self.all_follows:
            violations.append(f"Follow in pair 2 ({follow_2}) is not a valid follow")

        # Rule: No contestant can compete against themselves
        if lead_1 == lead_2:
            violations.append(f"Same lead ({lead_1}) in both pairs")
        if follow_1 == follow_2:
            violations.append(f"Same follow ({follow_1}) in both pairs")

        return violations

    def _validate_queue_rules(self, state: GameStateSnapshot) -> List[str]:
        """Validate queue management rules"""
        violations = []

        # Rule: All non-competing contestants should be accounted for
        competing_leads = {state.pair_1[0], state.pair_2[0]}
        competing_follows = {state.pair_1[1], state.pair_2[1]}

        missing_leads = self.all_leads - competing_leads - set(state.leads_queue)
        missing_follows = self.all_follows - competing_follows - set(state.follows_queue)

        # Account for winning contestants that might not be in queue
        if state.winning_lead and state.winning_lead not in competing_leads:
            missing_leads.discard(state.winning_lead)
        if state.winning_follow and state.winning_follow not in competing_follows:
            missing_follows.discard(state.winning_follow)

        if missing_leads:
            violations.append(f"Missing leads not accounted for: {missing_leads}")
        if missing_follows:
            violations.append(f"Missing follows not accounted for: {missing_follows}")

        # Rule: No duplicates in queues
        if len(state.leads_queue) != len(set(state.leads_queue)):
            violations.append("Duplicate leads in queue")
        if len(state.follows_queue) != len(set(state.follows_queue)):
            violations.append("Duplicate follows in queue")

        # Rule: Competing contestants should not be in queue (but this can happen temporarily during transitions)
        # Only report as violation if it's not a transition state
        all_competing = {state.pair_1[0], state.pair_1[1], state.pair_2[0], state.pair_2[1]}
        queue_contestants = set(state.leads_queue + state.follows_queue)
        competing_in_queue = all_competing.intersection(queue_contestants)

        # This is only a violation if we're not in a special game state (like after no contest)
        if competing_in_queue and not self._is_special_state(state):
            violations.append(f"Competing contestants found in queue: {competing_in_queue}")

        return violations

    def _is_special_state(self, state: GameStateSnapshot) -> bool:
        """Check if we're in a special game state where normal rules may be temporarily suspended"""
        # Allow contestants to be in queue temporarily during certain operations
        # This is a simplification - in a real implementation we'd track transition states
        return False

    def _validate_judging_rules(self, state: GameStateSnapshot) -> List[str]:
        """Validate judge selection rules"""
        violations = []

        # Rule: Judges should not be competing in current round
        competing = {state.pair_1[0], state.pair_1[1], state.pair_2[0], state.pair_2[1]}
        judging = set(state.contestant_judges)

        # Only check this if we have contestant judges (minimal games might have 0)
        if judging and competing.intersection(judging):
            violations.append(f"Competing contestants are also judges: {competing.intersection(judging)}")

        # Rule: Judges should be valid contestants
        all_contestants = self.all_leads.union(self.all_follows)
        invalid_judges = judging - all_contestants
        if invalid_judges:
            violations.append(f"Invalid judges (not contestants): {invalid_judges}")

        # Rule: Should have appropriate number of judges based on available contestants
        available_for_judging = all_contestants - competing
        max_possible_judges = min(3, len(available_for_judging))

        # Only validate if there are enough contestants for judges
        if len(all_contestants) > 4 and len(state.contestant_judges) > max_possible_judges:
            violations.append(f"Too many judges: {len(state.contestant_judges)} > {max_possible_judges}")

        return violations

    def _validate_point_rules(self, state: GameStateSnapshot) -> List[str]:
        """Validate point allocation rules"""
        violations = []

        # Rule: Points should be non-negative
        for name, points in state.lead_points.items():
            if points < 0:
                violations.append(f"Negative points for lead {name}: {points}")

        for name, points in state.follow_points.items():
            if points < 0:
                violations.append(f"Negative points for follow {name}: {points}")

        # Rule: Points should be reasonable (not exceed theoretical maximum)
        # Points can be higher than round number due to pre-existing points for testing
        max_reasonable_points = state.round_num + 10  # Allow some buffer for test scenarios
        for name, points in state.lead_points.items():
            if points > max_reasonable_points:
                violations.append(f"Excessive points for lead {name}: {points} > {max_reasonable_points}")

        for name, points in state.follow_points.items():
            if points > max_reasonable_points:
                violations.append(f"Excessive points for follow {name}: {points} > {max_reasonable_points}")

        return violations

    def _validate_win_rules(self, state: GameStateSnapshot) -> List[str]:
        """Validate winning conditions and thresholds"""
        violations = []

        # Rule: Win threshold should be valid
        # Only check auto-calculation if game is using auto-calc (not default 7 and not explicitly set)
        if not getattr(self.game, "custom_threshold", False) and state.win_threshold != 7:
            expected_threshold = max(len(self.all_leads), len(self.all_follows)) - 1
            if state.win_threshold != expected_threshold:
                violations.append(f"Incorrect win threshold: {state.win_threshold} != {expected_threshold}")

        # Rule: Game should be finished only when both roles have winners
        if state.is_finished and not (state.has_winning_lead and state.has_winning_follow):
            violations.append("Game marked as finished without both role winners")

        # Rule: Winning contestants should have reached threshold
        if state.has_winning_lead:
            if state.winning_lead:
                points = state.lead_points.get(state.winning_lead, 0)
                if points < state.win_threshold:
                    violations.append(
                        f"Winning lead {state.winning_lead} below threshold: {points} < {state.win_threshold}"
                    )

        if state.has_winning_follow:
            if state.winning_follow:
                points = state.follow_points.get(state.winning_follow, 0)
                if points < state.win_threshold:
                    violations.append(
                        f"Winning follow {state.winning_follow} below threshold: {points} < {state.win_threshold}"
                    )

        return violations

    def _validate_state_consistency(self, state: GameStateSnapshot) -> List[str]:
        """Validate internal state consistency"""
        violations = []

        # Rule: Tie pairs should be valid if set
        if state.tie_lead_pair:
            lead1, lead2 = state.tie_lead_pair
            if lead1 not in self.all_leads or lead2 not in self.all_leads:
                violations.append(f"Invalid tie lead pair: {state.tie_lead_pair}")

        if state.tie_follow_pair:
            follow1, follow2 = state.tie_follow_pair
            if follow1 not in self.all_follows or follow2 not in self.all_follows:
                violations.append(f"Invalid tie follow pair: {state.tie_follow_pair}")

        # Rule: Last winners should be valid contestants
        if state.last_lead_winner and state.last_lead_winner not in self.all_leads:
            violations.append(f"Invalid last lead winner: {state.last_lead_winner}")

        if state.last_follow_winner and state.last_follow_winner not in self.all_follows:
            violations.append(f"Invalid last follow winner: {state.last_follow_winner}")

        return violations

    def _validate_contestant_conservation(self, state: GameStateSnapshot) -> List[str]:
        """Validate that all contestants are properly accounted for"""
        violations = []

        # Rule: All leads must be accounted for somewhere
        accounted_leads = set()
        accounted_leads.add(state.pair_1[0])  # Competing
        accounted_leads.add(state.pair_2[0])  # Competing
        accounted_leads.update(state.leads_queue)  # In queue
        if state.winning_lead:
            accounted_leads.add(state.winning_lead)  # Current winner

        missing_leads = self.all_leads - accounted_leads
        if missing_leads:
            violations.append(f"Leads not accounted for: {missing_leads}")

        # Rule: All follows must be accounted for somewhere
        accounted_follows = set()
        accounted_follows.add(state.pair_1[1])  # Competing
        accounted_follows.add(state.pair_2[1])  # Competing
        accounted_follows.update(state.follows_queue)  # In queue
        if state.winning_follow:
            accounted_follows.add(state.winning_follow)  # Current winner

        missing_follows = self.all_follows - accounted_follows
        if missing_follows:
            violations.append(f"Follows not accounted for: {missing_follows}")

        return violations


class BattleRulesTestSuite(unittest.TestCase):
    """Comprehensive test suite for validating battle rules"""

    def setUp(self):
        """Set up test environment"""
        self.lead_names = ["Lead1", "Lead2", "Lead3", "Lead4"]
        self.follow_names = ["Follow1", "Follow2", "Follow3", "Follow4"]
        self.judge_names = ["Judge1", "Judge2"]

    def create_game(self, leads=None, follows=None, judges=None):
        """Create a game with specified contestants"""
        leads = leads or self.lead_names
        follows = follows or self.follow_names
        judges = judges or self.judge_names
        return Game(leads, follows, judges, points_to_win=7)

    def validate_game_state(self, game: Game) -> List[str]:
        """Validate current game state against all rules"""
        validator = BattleRulesValidator(game)
        state = validator.capture_state()
        return validator.validate_all_rules(state)

    def test_initial_game_state_rules(self):
        """Test that initial game state follows all rules"""
        game = self.create_game()
        violations = self.validate_game_state(game)
        self.assertEqual(violations, [], f"Initial state violations: {violations}")

    def test_voting_scenarios_preserve_rules(self):
        """Test that all voting scenarios preserve game rules"""
        scenarios = [
            ("normal_win", [("Judge1", 1), ("Judge2", 1)]),
            ("normal_loss", [("Judge1", 2), ("Judge2", 2)]),
            ("split_vote", [("Judge1", 1), ("Judge2", 2)]),
            ("tie_vote", [("Judge1", 3), ("Judge2", 3)]),
            ("no_contest", [("Judge1", 4), ("Judge2", 4)]),
        ]

        for scenario_name, votes in scenarios:
            with self.subTest(scenario=scenario_name):
                game = self.create_game()

                # Test lead voting
                lead_pair = (game.pair_1[0], game.pair_2[0])
                game.judge_round(lead_pair[0], lead_pair[1], "lead", votes)
                violations = self.validate_game_state(game)
                self.assertEqual(violations, [], f"Lead {scenario_name} violations: {violations}")

                # Test follow voting
                follow_pair = (game.pair_1[1], game.pair_2[1])
                game.judge_round(follow_pair[0], follow_pair[1], "follow", votes)
                violations = self.validate_game_state(game)
                self.assertEqual(violations, [], f"Follow {scenario_name} violations: {violations}")

    def test_round_transitions_preserve_rules(self):
        """Test that round transitions preserve all rules"""
        game = self.create_game()

        for round_num in range(1, 10):  # Test multiple round transitions
            # Simulate a round
            lead_pair = (game.pair_1[0], game.pair_2[0])
            follow_pair = (game.pair_1[1], game.pair_2[1])

            game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
            violations = self.validate_game_state(game)
            self.assertEqual(violations, [], f"Round {round_num} lead judge violations: {violations}")

            game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])
            violations = self.validate_game_state(game)
            self.assertEqual(violations, [], f"Round {round_num} follow judge violations: {violations}")

            # Transition to next round
            if not game.is_finished():
                game.next_round()
                violations = self.validate_game_state(game)
                self.assertEqual(violations, [], f"Round {round_num} transition violations: {violations}")
            else:
                break

    def test_unequal_contestant_numbers(self):
        """Test rules with unequal numbers of leads and follows"""
        test_cases = [
            (["Lead1", "Lead2"], ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"]),
            (["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"], ["Follow1", "Follow2"]),
            # Skip impossible configurations (need at least 2 of each for pairs)
            # (["Lead1"], ["Follow1", "Follow2", "Follow3"]),
            # (["Lead1", "Lead2", "Lead3"], ["Follow1"])
        ]

        for leads, follows in test_cases:
            with self.subTest(leads=len(leads), follows=len(follows)):
                try:
                    game = self.create_game(leads, follows)
                    violations = self.validate_game_state(game)
                    self.assertEqual(violations, [], f"Unequal contestants violations: {violations}")

                    # Test a few rounds
                    for _ in range(3):
                        if game.is_finished():
                            break

                        lead_pair = (game.pair_1[0], game.pair_2[0])
                        follow_pair = (game.pair_1[1], game.pair_2[1])

                        game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
                        game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])

                        violations = self.validate_game_state(game)
                        self.assertEqual(violations, [], f"Mid-game violations: {violations}")

                        if not game.is_finished():
                            game.next_round()
                            violations = self.validate_game_state(game)
                            self.assertEqual(violations, [], f"Round transition violations: {violations}")

                except Exception as e:
                    self.fail(f"Exception with {len(leads)} leads, {len(follows)} follows: {e}")

    def test_tie_scenarios_preserve_rules(self):
        """Test that tie scenarios maintain rule integrity"""
        game = self.create_game()

        # Test lead tie
        lead_pair = (game.pair_1[0], game.pair_2[0])
        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 3), ("Judge2", 3)])
        self.assertTrue(result["winner"].startswith("Tie"))
        violations = self.validate_game_state(game)
        self.assertEqual(violations, [], f"Lead tie violations: {violations}")

        # Test follow tie
        follow_pair = (game.pair_1[1], game.pair_2[1])
        result = game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 3), ("Judge2", 3)])
        self.assertTrue(result["winner"].startswith("Tie"))
        violations = self.validate_game_state(game)
        self.assertEqual(violations, [], f"Follow tie violations: {violations}")

        # Test transition after ties
        game.next_round()
        violations = self.validate_game_state(game)
        self.assertEqual(violations, [], f"Post-tie transition violations: {violations}")

    def test_no_contest_scenarios_preserve_rules(self):
        """Test that no contest scenarios maintain rule integrity"""
        game = self.create_game()

        # Test lead no contest
        lead_pair = (game.pair_1[0], game.pair_2[0])
        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 4), ("Judge2", 4)])
        self.assertEqual(result["winner"], "No Contest")
        violations = self.validate_game_state(game)
        self.assertEqual(violations, [], f"Lead no contest violations: {violations}")

        # Test follow no contest
        follow_pair = (game.pair_1[1], game.pair_2[1])
        result = game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 4), ("Judge2", 4)])
        self.assertEqual(result["winner"], "No Contest")
        violations = self.validate_game_state(game)
        self.assertEqual(violations, [], f"Follow no contest violations: {violations}")

        # Test transition after no contest
        game.next_round()
        violations = self.validate_game_state(game)
        self.assertEqual(violations, [], f"Post-no-contest transition violations: {violations}")

    def test_win_threshold_enforcement(self):
        """Test that win thresholds are properly enforced"""
        game = Game(self.lead_names, self.follow_names, self.judge_names)

        # Manually set a contestant close to winning
        target_lead = game.pair_1[0]
        target_lead.points = game.win_threshold - 1

        # Win the round to reach threshold
        result = game.judge_round(game.pair_1[0], game.pair_2[0], "lead", [("Judge1", 1), ("Judge2", 1)])
        self.assertEqual(result["winner"], target_lead.name)
        self.assertTrue(game.has_winning_lead)
        violations = self.validate_game_state(game)
        self.assertEqual(violations, [], f"Win threshold violations: {violations}")

    def test_complete_game_simulation(self):
        """Test a complete game from start to finish"""
        game = self.create_game()
        round_count = 0
        max_rounds = 50  # Prevent infinite loops

        while not game.is_finished() and round_count < max_rounds:
            # Validate state before round
            violations = self.validate_game_state(game)
            self.assertEqual(violations, [], f"Pre-round {round_count} violations: {violations}")

            # Simulate round with random but valid votes
            lead_pair = (game.pair_1[0], game.pair_2[0])
            follow_pair = (game.pair_1[1], game.pair_2[1])

            # Use varied voting patterns
            vote_patterns = [
                [("Judge1", 1), ("Judge2", 1)],  # Clear win
                [("Judge1", 1), ("Judge2", 2)],  # Split
                [("Judge1", 2), ("Judge2", 2)],  # Clear loss
                [("Judge1", 3), ("Judge2", 3)],  # Tie
                [("Judge1", 4), ("Judge2", 4)],  # No contest
            ]

            lead_votes = random.choice(vote_patterns)
            follow_votes = random.choice(vote_patterns)

            game.judge_round(lead_pair[0], lead_pair[1], "lead", lead_votes)
            violations = self.validate_game_state(game)
            self.assertEqual(violations, [], f"Round {round_count} lead violations: {violations}")

            game.judge_round(follow_pair[0], follow_pair[1], "follow", follow_votes)
            violations = self.validate_game_state(game)
            self.assertEqual(violations, [], f"Round {round_count} follow violations: {violations}")

            if not game.is_finished():
                game.next_round()
                violations = self.validate_game_state(game)
                self.assertEqual(violations, [], f"Round {round_count} transition violations: {violations}")

            round_count += 1

        # Validate final state
        if game.is_finished():
            violations = self.validate_game_state(game)
            self.assertEqual(violations, [], f"Final state violations: {violations}")

            # Ensure both roles have winners
            self.assertTrue(game.has_winning_lead, "Game finished without lead winner")
            self.assertTrue(game.has_winning_follow, "Game finished without follow winner")

        self.assertLess(round_count, max_rounds, "Game took too many rounds to complete")

    def test_property_based_invariants(self):
        """Test properties that should always hold regardless of game state"""

        def test_invariants_for_config(leads, follows):
            """Test invariants for a specific contestant configuration"""
            game = self.create_game(leads, follows)
            all_leads = set(leads)
            all_follows = set(follows)

            for round_num in range(20):  # Test multiple rounds
                if game.is_finished():
                    break

                # Invariant: All contestants are always accounted for
                competing_leads = {game.pair_1[0].name, game.pair_2[0].name}
                competing_follows = {game.pair_1[1].name, game.pair_2[1].name}
                queue_leads = set(c.name for c in game.leads)
                queue_follows = set(c.name for c in game.follows)

                accounted_leads = competing_leads | queue_leads
                accounted_follows = competing_follows | queue_follows

                # Account for current winners
                if game.winning_lead:
                    accounted_leads.add(game.winning_lead.name)
                if game.winning_follow:
                    accounted_follows.add(game.winning_follow.name)

                self.assertEqual(all_leads, accounted_leads, f"Lead accounting invariant failed at round {round_num}")
                self.assertEqual(
                    all_follows, accounted_follows, f"Follow accounting invariant failed at round {round_num}"
                )

                # Invariant: No contestant competes against themselves
                self.assertNotEqual(game.pair_1[0].name, game.pair_2[0].name, "Same lead in both pairs")
                self.assertNotEqual(game.pair_1[1].name, game.pair_2[1].name, "Same follow in both pairs")

                # Invariant: Points are non-negative and reasonable
                for lead in game.initial_leads:
                    self.assertGreaterEqual(lead.points, 0, f"Negative points for {lead.name}")
                    self.assertLessEqual(lead.points, round_num + 1, f"Excessive points for {lead.name}")

                for follow in game.initial_follows:
                    self.assertGreaterEqual(follow.points, 0, f"Negative points for {follow.name}")
                    self.assertLessEqual(follow.points, round_num + 1, f"Excessive points for {follow.name}")

                # Simulate round
                lead_pair = (game.pair_1[0], game.pair_2[0])
                follow_pair = (game.pair_1[1], game.pair_2[1])

                game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
                game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])

                if not game.is_finished():
                    game.next_round()

        # Test different configurations
        configs = [
            (["L1", "L2", "L3", "L4"], ["F1", "F2", "F3", "F4"]),
            (["L1", "L2"], ["F1", "F2", "F3", "F4", "F5"]),
            (["L1", "L2", "L3", "L4", "L5"], ["F1", "F2"]),
            (["L1", "L2", "L3"], ["F1", "F2", "F3"]),
        ]

        for leads, follows in configs:
            with self.subTest(leads=len(leads), follows=len(follows)):
                test_invariants_for_config(leads, follows)


class StressTestSuite(unittest.TestCase):
    """Stress tests for battle rules under extreme conditions"""

    def test_large_contestant_pools(self):
        """Test with large numbers of contestants"""
        leads = [f"Lead{i}" for i in range(1, 21)]  # 20 leads
        follows = [f"Follow{i}" for i in range(1, 21)]  # 20 follows
        judges = ["Judge1", "Judge2"]

        game = Game(leads, follows, judges, points_to_win=7)
        validator = BattleRulesValidator(game)

        # Test initial state
        violations = validator.validate_all_rules(validator.capture_state())
        self.assertEqual(violations, [], f"Large pool initial violations: {violations}")

        # Test several rounds
        for _ in range(10):
            if game.is_finished():
                break

            lead_pair = (game.pair_1[0], game.pair_2[0])
            follow_pair = (game.pair_1[1], game.pair_2[1])

            game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
            game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])

            violations = validator.validate_all_rules(validator.capture_state())
            self.assertEqual(violations, [], f"Large pool violations: {violations}")

            if not game.is_finished():
                game.next_round()

    def test_minimal_contestant_pools(self):
        """Test with minimal numbers of contestants"""
        # Test minimum viable configuration (2 leads, 2 follows)
        game = Game(["Lead1", "Lead2"], ["Follow1", "Follow2"], ["Judge1", "Judge2"], points_to_win=7)
        validator = BattleRulesValidator(game)

        violations = validator.validate_all_rules(validator.capture_state())
        self.assertEqual(violations, [], f"Minimal pool violations: {violations}")

        # Should be able to complete one round
        lead_pair = (game.pair_1[0], game.pair_2[0])
        follow_pair = (game.pair_1[1], game.pair_2[1])

        game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
        game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])

        violations = validator.validate_all_rules(validator.capture_state())
        self.assertEqual(violations, [], f"Minimal pool after round violations: {violations}")

    def test_randomized_game_sequences(self):
        """Test with randomized voting patterns over many games"""
        vote_options = [1, 2, 3, 4]

        for game_num in range(10):  # Test 10 different games
            leads = [f"Lead{i}" for i in range(1, 5)]
            follows = [f"Follow{i}" for i in range(1, 5)]
            random.shuffle(leads)
            random.shuffle(follows)

            game = Game(leads, follows, ["Judge1", "Judge2"], points_to_win=7)
            validator = BattleRulesValidator(game)

            round_count = 0
            while not game.is_finished() and round_count < 30:
                # Random voting
                lead_vote1 = random.choice(vote_options)
                lead_vote2 = random.choice(vote_options)
                follow_vote1 = random.choice(vote_options)
                follow_vote2 = random.choice(vote_options)

                lead_pair = (game.pair_1[0], game.pair_2[0])
                follow_pair = (game.pair_1[1], game.pair_2[1])

                game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", lead_vote1), ("Judge2", lead_vote2)])
                game.judge_round(
                    follow_pair[0], follow_pair[1], "follow", [("Judge1", follow_vote1), ("Judge2", follow_vote2)]
                )

                violations = validator.validate_all_rules(validator.capture_state())
                self.assertEqual(violations, [], f"Game {game_num} round {round_count} violations: {violations}")

                if not game.is_finished():
                    game.next_round()

                round_count += 1

            # Final validation
            violations = validator.validate_all_rules(validator.capture_state())
            self.assertEqual(violations, [], f"Game {game_num} final violations: {violations}")


if __name__ == "__main__":
    # Create a test suite with all test classes
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(BattleRulesTestSuite))
    suite.addTests(loader.loadTestsFromTestCase(StressTestSuite))

    # Run the tests with detailed output
    runner = unittest.TextTestRunner(verbosity=2, buffer=True)
    result = runner.run(suite)

    # Print summary
    print(f"\n{'=' * 50}")
    print(f"BATTLE RULES TEST SUITE SUMMARY")
    print(f"{'=' * 50}")
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(
        f"Success rate: {((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun * 100):.1f}%"
    )

    if result.failures:
        print(f"\nFAILURES:")
        for test, traceback in result.failures:
            print(f"- {test}: {traceback}")

    if result.errors:
        print(f"\nERRORS:")
        for test, traceback in result.errors:
            print(f"- {test}: {traceback}")
