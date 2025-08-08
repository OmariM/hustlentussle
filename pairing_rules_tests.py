import unittest
from game_logic import Game, Contestant
from battle_rules_test_suite import BattleRulesValidator


class PairingRulesTestSuite(unittest.TestCase):
    """Specialized tests for pairing and queue management rules"""
    
    def setUp(self):
        self.lead_names = ["Lead1", "Lead2", "Lead3", "Lead4"]
        self.follow_names = ["Follow1", "Follow2", "Follow3", "Follow4"]
        self.judge_names = ["Judge1", "Judge2"]
    
    def create_game(self, leads=None, follows=None, judges=None):
        leads = leads or self.lead_names
        follows = follows or self.follow_names
        judges = judges or self.judge_names
        return Game(leads, follows, judges)
    
    def test_initial_pairing_validity(self):
        """Test that initial pairs are formed correctly"""
        game = self.create_game()
        
        # Check that pairs have correct structure
        self.assertIsInstance(game.pair_1, tuple)
        self.assertIsInstance(game.pair_2, tuple)
        self.assertEqual(len(game.pair_1), 2)
        self.assertEqual(len(game.pair_2), 2)
        
        # Check that leads and follows are in correct positions
        self.assertIn(game.pair_1[0].name, self.lead_names)
        self.assertIn(game.pair_1[1].name, self.follow_names)
        self.assertIn(game.pair_2[0].name, self.lead_names)
        self.assertIn(game.pair_2[1].name, self.follow_names)
        
        # Check no duplicates
        all_competing = [
            game.pair_1[0].name, game.pair_1[1].name,
            game.pair_2[0].name, game.pair_2[1].name
        ]
        self.assertEqual(len(all_competing), len(set(all_competing)))
    
    def test_queue_replenishment_rules(self):
        """Test that queues are properly replenished when running low"""
        # Test with minimal contestants to force replenishment
        game = self.create_game(["L1", "L2"], ["F1", "F2"])
        
        # After initial pairing, queues should be empty
        self.assertEqual(len(game.leads), 0)
        self.assertEqual(len(game.follows), 0)
        
        # Simulate a round to test replenishment
        lead_pair = (game.pair_1[0], game.pair_2[0])
        follow_pair = (game.pair_1[1], game.pair_2[1])
        
        game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
        game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])
        
        # Move to next round - queues should be replenished
        game.next_round()
        
        # All contestants should be accounted for
        all_leads = {c.name for c in game.initial_leads}
        all_follows = {c.name for c in game.initial_follows}
        
        competing_leads = {game.pair_1[0].name, game.pair_2[0].name}
        competing_follows = {game.pair_1[1].name, game.pair_2[1].name}
        
        queue_leads = {c.name for c in game.leads}
        queue_follows = {c.name for c in game.follows}
        
        # Account for winners
        accounted_leads = competing_leads | queue_leads
        accounted_follows = competing_follows | queue_follows
        
        if game.winning_lead:
            accounted_leads.add(game.winning_lead.name)
        if game.winning_follow:
            accounted_follows.add(game.winning_follow.name)
        
        self.assertEqual(all_leads, accounted_leads)
        self.assertEqual(all_follows, accounted_follows)
    
    def test_no_consecutive_same_pairs(self):
        """Test that same pairs don't compete in consecutive rounds"""
        game = self.create_game()
        
        # Record initial pairs
        initial_pair1 = (game.pair_1[0].name, game.pair_1[1].name)
        initial_pair2 = (game.pair_2[0].name, game.pair_2[1].name)
        
        # Simulate round without ties
        lead_pair = (game.pair_1[0], game.pair_2[0])
        follow_pair = (game.pair_1[1], game.pair_2[1])
        
        game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
        game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])
        
        # Move to next round
        game.next_round()
        
        # Check new pairs
        new_pair1 = (game.pair_1[0].name, game.pair_1[1].name)
        new_pair2 = (game.pair_2[0].name, game.pair_2[1].name)
        
        # Pairs should be different from previous round
        self.assertNotEqual(new_pair1, initial_pair1)
        self.assertNotEqual(new_pair1, initial_pair2)
        self.assertNotEqual(new_pair2, initial_pair1)
        self.assertNotEqual(new_pair2, initial_pair2)
    
    def test_tie_pair_handling(self):
        """Test that tied contestants are properly re-paired"""
        game = self.create_game()
        
        # Create lead tie
        lead_pair = (game.pair_1[0], game.pair_2[0])
        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 3), ("Judge2", 3)])
        self.assertTrue(result["winner"].startswith("Tie"))
        
        # Non-tie follow round
        follow_pair = (game.pair_1[1], game.pair_2[1])
        game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])
        
        # Store tied leads
        tied_leads = {lead_pair[0].name, lead_pair[1].name}
        
        # Move to next round
        game.next_round()
        
        # Tied leads should be competing again
        new_competing_leads = {game.pair_1[0].name, game.pair_2[0].name}
        self.assertEqual(tied_leads, new_competing_leads)
    
    def test_winner_queue_management(self):
        """Test that winners are properly managed in queues"""
        game = self.create_game()
        
        # Get a lead close to winning
        target_lead = game.pair_1[0]
        target_lead.points = game.win_threshold - 1
        
        # Win the round to trigger winning state
        result = game.judge_round(game.pair_1[0], game.pair_2[0], "lead", [("Judge1", 1), ("Judge2", 1)])
        self.assertEqual(result["winner"], target_lead.name)
        self.assertTrue(game.has_winning_lead)
        
        # Complete the follow round
        follow_pair = (game.pair_1[1], game.pair_2[1])
        game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])
        
        # Move to next round
        game.next_round()
        
        # Winning lead should not be competing (since lead role has a winner)
        competing_leads = {game.pair_1[0].name, game.pair_2[0].name}
        self.assertNotIn(target_lead.name, competing_leads)
        
        # Winning lead should be in queue or marked as winner
        queue_leads = {c.name for c in game.leads}
        self.assertTrue(
            target_lead.name in queue_leads or 
            (game.winning_lead and game.winning_lead.name == target_lead.name)
        )
    
    def test_no_contest_queue_placement(self):
        """Test that no contest contestants are properly queued"""
        game = self.create_game()
        
        initial_queue_size = len(game.leads)
        lead_pair = (game.pair_1[0], game.pair_2[0])
        
        # No contest round
        result = game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 4), ("Judge2", 4)])
        self.assertEqual(result["winner"], "No Contest")
        
        # Both contestants should be added to queue
        self.assertEqual(len(game.leads), initial_queue_size + 2)
        self.assertIn(lead_pair[0], game.leads)
        self.assertIn(lead_pair[1], game.leads)
    
    def test_different_contestant_numbers(self):
        """Test pairing with unequal numbers of leads and follows"""
        test_cases = [
            (["L1", "L2"], ["F1", "F2", "F3", "F4", "F5"]),  # More follows
            (["L1", "L2", "L3", "L4", "L5"], ["F1", "F2"]),  # More leads
            (["L1"], ["F1", "F2", "F3"]),                    # Very unbalanced
        ]
        
        for leads, follows in test_cases:
            with self.subTest(leads=len(leads), follows=len(follows)):
                game = self.create_game(leads, follows)
                
                # Should still form valid pairs
                self.assertIn(game.pair_1[0].name, leads)
                self.assertIn(game.pair_1[1].name, follows)
                self.assertIn(game.pair_2[0].name, leads)
                self.assertIn(game.pair_2[1].name, follows)
                
                # Test multiple rounds to ensure cycling works
                for round_num in range(5):
                    if game.is_finished():
                        break
                        
                    lead_pair = (game.pair_1[0], game.pair_2[0])
                    follow_pair = (game.pair_1[1], game.pair_2[1])
                    
                    game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
                    game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])
                    
                    if not game.is_finished():
                        game.next_round()
                        
                        # Validate state after transition
                        validator = BattleRulesValidator(game)
                        violations = validator.validate_all_rules(validator.capture_state())
                        self.assertEqual(violations, [], f"Round {round_num} violations: {violations}")
    
    def test_follow_tie_special_pairing(self):
        """Test special pairing rules when follows tie"""
        game = self.create_game()
        
        # Win lead round first
        lead_pair = (game.pair_1[0], game.pair_2[0])
        game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
        winning_lead = game.last_lead_winner
        
        # Create follow tie
        follow_pair = (game.pair_1[1], game.pair_2[1])
        result = game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 3), ("Judge2", 3)])
        self.assertTrue(result["winner"].startswith("Tie"))
        
        # Get next lead from queue before transition
        next_lead_before = game.leads[0].name if game.leads else None
        
        # Move to next round
        game.next_round()
        
        # Check that follows remain the same
        new_follows = {game.pair_1[1].name, game.pair_2[1].name}
        old_follows = {follow_pair[0].name, follow_pair[1].name}
        self.assertEqual(new_follows, old_follows)
        
        # Check that one lead is the winner, other is from queue
        new_leads = {game.pair_1[0].name, game.pair_2[0].name}
        self.assertIn(winning_lead, new_leads)
        if next_lead_before:
            self.assertIn(next_lead_before, new_leads)
        
        # No couple should be exactly the same as before
        initial_couples = {(game.pair_1[0].name, game.pair_1[1].name), (game.pair_2[0].name, game.pair_2[1].name)}
        previous_couples = {(lead_pair[0].name, follow_pair[0].name), (lead_pair[1].name, follow_pair[1].name)}
        
        self.assertEqual(len(initial_couples.intersection(previous_couples)), 0)
    
    def test_judge_selection_excludes_competitors(self):
        """Test that contestant judge selection excludes competing contestants"""
        for _ in range(10):  # Test multiple rounds
            game = self.create_game()
            
            competing = {
                game.pair_1[0].name, game.pair_1[1].name,
                game.pair_2[0].name, game.pair_2[1].name
            }
            
            judge_names = {judge.name for judge in game.contestant_judges}
            
            # No overlap between competing and judging
            overlap = competing.intersection(judge_names)
            self.assertEqual(len(overlap), 0, f"Competing contestants found as judges: {overlap}")
            
            # All judges should be valid contestants
            all_contestants = set(self.lead_names + self.follow_names)
            invalid_judges = judge_names - all_contestants
            self.assertEqual(len(invalid_judges), 0, f"Invalid judges: {invalid_judges}")
            
            # Simulate round and move to next
            lead_pair = (game.pair_1[0], game.pair_2[0])
            follow_pair = (game.pair_1[1], game.pair_2[1])
            
            game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
            game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])
            
            if not game.is_finished():
                game.next_round()
            else:
                break
    
    def test_pairing_avoids_recent_winners(self):
        """Test that recent round winners aren't paired together"""
        game = self.create_game()
        
        # Simulate a round where we can track winners
        lead_pair = (game.pair_1[0], game.pair_2[0])
        follow_pair = (game.pair_1[1], game.pair_2[1])
        
        # Both pair 1 contestants win
        game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
        game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])
        
        winning_lead = game.last_lead_winner
        winning_follow = game.last_follow_winner
        
        # Move to next round
        game.next_round()
        
        # The two winners shouldn't be paired together if possible
        new_pairs = [
            (game.pair_1[0].name, game.pair_1[1].name),
            (game.pair_2[0].name, game.pair_2[1].name)
        ]
        
        winner_pair = (winning_lead, winning_follow)
        self.assertNotIn(winner_pair, new_pairs, "Recent winners should not be paired together")
    
    def test_queue_order_maintenance(self):
        """Test that queue order is maintained properly"""
        # Use more contestants to test queue behavior
        leads = [f"Lead{i}" for i in range(1, 7)]
        follows = [f"Follow{i}" for i in range(1, 7)]
        game = self.create_game(leads, follows)
        
        # Track initial queue order
        initial_leads_queue = [c.name for c in game.leads]
        initial_follows_queue = [c.name for c in game.follows]
        
        # Simulate several rounds
        for round_num in range(3):
            if game.is_finished():
                break
                
            lead_pair = (game.pair_1[0], game.pair_2[0])
            follow_pair = (game.pair_1[1], game.pair_2[1])
            
            # Normal wins (no ties or no contests)
            game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
            game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])
            
            if not game.is_finished():
                # Check queue before transition
                pre_transition_leads = [c.name for c in game.leads]
                pre_transition_follows = [c.name for c in game.follows]
                
                game.next_round()
                
                # Validate that queue management follows FIFO principles
                # (losers go to back, queue advances from front)
                validator = BattleRulesValidator(game)
                violations = validator.validate_all_rules(validator.capture_state())
                self.assertEqual(violations, [], f"Queue order violations in round {round_num}: {violations}")


if __name__ == '__main__':
    unittest.main(verbosity=2)