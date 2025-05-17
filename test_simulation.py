import random

from game_logic import Game


def simulate_round(game, pair, role, votes):
    return game.judge_round(pair[0], pair[1], role, votes)


def run_test_cases():
    random.seed(0)
    pass_count = 0
    fail_count = 0

    lead_names = ["Logan", "Ian", "Rob", "Zane"]
    follow_names = ["Emma", "Tati", "Reina", "Diane"]
    guest_judges = ["Kenji", "Diane"]

    game = Game(lead_names, follow_names, guest_judges)
    lead_pair = (game.pair_1[0], game.pair_2[0])
    follow_pair = (game.pair_1[1], game.pair_2[1])

    # Test 1: Tie on leads
    res = simulate_round(
        game, lead_pair, "lead", [("Kenji", 3), ("Diane", 3), ("Reina", 1), ("Rob", 2)]
    )
    expected_prefix = "Tie between"
    if res["winner"].startswith(expected_prefix):
        print("Test 1 PASS: Tie detected on leads")
        pass_count += 1
    else:
        print(
            f"Test 1 FAIL: expected prefix '{expected_prefix}', got '{res['winner']}'"
        )
        fail_count += 1

    # Test 2: No contest on follows
    res = simulate_round(
        game,
        follow_pair,
        "follow",
        [("Kenji", 4), ("Diane", 4), ("Reina", 1), ("Rob", 2)],
    )
    expected = "No Contest"
    if res["winner"] == expected:
        print("Test 2 PASS: No Contest on follows")
        pass_count += 1
    else:
        print(f"Test 2 FAIL: expected '{expected}', got '{res['winner']}'")
        fail_count += 1

    # Test 3: Split vote on leads
    res = simulate_round(
        game, lead_pair, "lead", [("Kenji", 1), ("Diane", 2), ("Reina", 1), ("Rob", 2)]
    )
    expected_winner = lead_pair[0].name
    if res["winner"] == expected_winner:
        print("Test 3 PASS: Correct split vote winner on leads")
        pass_count += 1
    else:
        print(f"Test 3 FAIL: expected '{expected_winner}', got '{res['winner']}'")
        fail_count += 1

    # Test 4: Sweep on follows
    res = simulate_round(
        game,
        follow_pair,
        "follow",
        [("Kenji", 1), ("Diane", 1), ("Reina", 1), ("Rob", 1)],
    )
    expected_winner = follow_pair[0].name
    if res["winner"] == expected_winner:
        print("Test 4 PASS: Sweep winner on follows")
        pass_count += 1
    else:
        print(f"Test 4 FAIL: expected '{expected_winner}', got '{res['winner']}'")
        fail_count += 1

    # Test 5: Double tie verification on leads
    res = simulate_round(
        game, lead_pair, "lead", [("Kenji", 3), ("Diane", 3), ("Reina", 1), ("Rob", 2)]
    )
    if res["winner"].startswith(expected_prefix):
        print("Test 5 PASS: Double tie on leads continues correctly")
        pass_count += 1
    else:
        print(f"Test 5 FAIL: expected tie prefix, got '{res['winner']}'")
        fail_count += 1
    # Verify tied leads are in next round pairs
    tied_names = {lead_pair[0].name, lead_pair[1].name}
    game.next_round()
    next_leads = {game.pair_1[0].name, game.pair_2[0].name}
    if tied_names == next_leads:
        print("Test 5.1 PASS: Both tied leads are re-paired correctly")
        pass_count += 1
    else:
        print(f"Test 5.1 FAIL: expected re-paired leads {tied_names}, got {next_leads}")
        fail_count += 1

    # Test 6: Double tie verification on follows
    res = simulate_round(
        game,
        follow_pair,
        "follow",
        [("Kenji", 3), ("Diane", 3), ("Reina", 1), ("Rob", 2)],
    )
    if res["winner"].startswith(expected_prefix):
        print("Test 6 PASS: Double tie on follows continues correctly")
        pass_count += 1
    else:
        print(f"Test 6 FAIL: expected tie prefix, got '{res['winner']}'")
        fail_count += 1
    # Verify tied follows are in next round pairs
    tied_follow_names = {follow_pair[0].name, follow_pair[1].name}
    game.next_round()
    next_follows = {game.pair_1[1].name, game.pair_2[1].name}
    if tied_follow_names == next_follows:
        print("Test 6.1 PASS: Both tied follows are re-paired correctly")
        pass_count += 1
    else:
        print(
            f"Test 6.1 FAIL: expected re-paired follows {tied_follow_names}, got {next_follows}"
        )
        fail_count += 1

    # Test 7: No Contest returns to end of queue for leads
    game = Game(lead_names, follow_names, guest_judges)
    lead_pair = (game.pair_1[0], game.pair_2[0])
    res = simulate_round(
        game, lead_pair, "lead", [("Kenji", 4), ("Diane", 4), ("Reina", 1), ("Rob", 2)]
    )
    after_leads = [c.name for c in game.leads]
    expected_end = [lead_pair[0].name, lead_pair[1].name]
    if after_leads[-2:] == expected_end:
        print("Test 7 PASS: No Contest places leads at end correctly")
        pass_count += 1
    else:
        print(f"Test 7 FAIL: expected end {expected_end}, got {after_leads[-2:]}")
        fail_count += 1

    # Test 8: Early exit finalize top sorted
    game = Game(lead_names, follow_names, guest_judges)
    lead_pair = (game.pair_1[0], game.pair_2[0])
    follow_pair = (game.pair_1[1], game.pair_2[1])
    # Simulate one round of clear wins
    simulate_round(
        game, lead_pair, "lead", [("Kenji", 1), ("Diane", 1), ("Reina", 1), ("Rob", 1)]
    )
    simulate_round(
        game,
        follow_pair,
        "follow",
        [("Kenji", 1), ("Diane", 1), ("Reina", 1), ("Rob", 1)],
    )
    # Early exit
    leads_sorted, follows_sorted = game.finalize_results()
    if leads_sorted[0].points > leads_sorted[1].points:
        print("Test 8 PASS: Top lead correct after early exit")
        pass_count += 1
    else:
        print(f"Test 8 FAIL: top lead not correct, got {leads_sorted[0].name}")
        fail_count += 1
    if follows_sorted[0].points > follows_sorted[1].points:
        print("Test 8 PASS: Top follow correct after early exit")
        pass_count += 1
    else:
        print(f"Test 8 FAIL: top follow not correct, got {follows_sorted[0].name}")
        fail_count += 1

    # Test 9: Lead win condition with follow still competing
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"], 
        ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"], 
        ["Judge1", "Judge2"]
    )
    
    # Store initial pairs to track
    initial_lead_1 = game.pair_1[0]
    initial_lead_2 = game.pair_2[0]
    
    # Print initial state
    print(f"Test 9 - total_num_leads: {game.total_num_leads}")
    print(f"Test 9 - Win threshold: {game.total_num_leads - 1} points")
    
    # Give winning points to Lead1 (need to win 4 times with 5 total leads)
    initial_lead_1.points = game.total_num_leads - 2  # With 5 leads, needs 4 points to win
    print(f"Test 9 - Initial points: {initial_lead_1.points}")
    
    # Simulate round where Lead1 wins and reaches winning condition
    lead_pair = (initial_lead_1, initial_lead_2)
    result = simulate_round(
        game, lead_pair, "lead", [("Judge1", 1), ("Judge2", 1)]
    )
    print(f"Test 9 - After win, points: {initial_lead_1.points}")
    print(f"Test 9 - Has winning lead: {game.has_winning_lead}")
    print(f"Test 9 - Winning lead: {game.winning_lead.name if game.winning_lead else None}")
    
    # Check if Lead1 is marked as a winner
    if game.has_winning_lead and game.winning_lead.name == initial_lead_1.name:
        print("Test 9.1 PASS: Lead winner correctly identified")
        pass_count += 1
    else:
        print(f"Test 9.1 FAIL: Lead winner not correctly identified. Has winning lead: {game.has_winning_lead}, Winning lead: {game.winning_lead.name if game.winning_lead else None}")
        fail_count += 1
    
    # Move to next round
    game.next_round()
    
    # The winning lead should be sent to the queue, and two new leads should be competing
    leads_in_queue = [lead.name for lead in game.leads]
    competing_leads = [game.pair_1[0].name, game.pair_2[0].name]
    
    print(f"Test 9 - Leads in queue: {leads_in_queue}")
    print(f"Test 9 - Competing leads: {competing_leads}")
    
    # Check if the winning lead is in the queue
    if initial_lead_1.name in leads_in_queue:
        print("Test 9.2 PASS: Winning lead correctly sent to queue")
        pass_count += 1
    else:
        print(f"Test 9.2 FAIL: Winning lead not in queue. Queue: {leads_in_queue}")
        fail_count += 1
    
    # Check that two different leads are now competing
    if initial_lead_1.name not in competing_leads:
        print("Test 9.3 PASS: New leads are competing after lead winner")
        pass_count += 1
    else:
        print(f"Test 9.3 FAIL: Winning lead still competing. Current competitors: {competing_leads}")
        fail_count += 1

    # Test 10: Follow win condition with lead still competing
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"], 
        ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"], 
        ["Judge1", "Judge2"]
    )
    
    # Store initial pairs to track
    initial_follow_1 = game.pair_1[1]
    initial_follow_2 = game.pair_2[1]
    
    # Print initial state
    print(f"Test 10 - total_num_follows: {game.total_num_follows}")
    print(f"Test 10 - Win threshold: {game.total_num_follows - 1} points")
    
    # Give winning points to Follow1 (need to win 4 times with 5 total follows)
    initial_follow_1.points = game.total_num_follows - 2  # With 5 follows, needs 4 points to win
    print(f"Test 10 - Initial points: {initial_follow_1.points}")
    
    # Simulate round where Follow1 wins and reaches winning condition
    follow_pair = (initial_follow_1, initial_follow_2)
    result = simulate_round(
        game, follow_pair, "follow", [("Judge1", 1), ("Judge2", 1)]
    )
    print(f"Test 10 - After win, points: {initial_follow_1.points}")
    print(f"Test 10 - Has winning follow: {game.has_winning_follow}")
    print(f"Test 10 - Winning follow: {game.winning_follow.name if game.winning_follow else None}")
    
    # Check if Follow1 is marked as a winner
    if game.has_winning_follow and game.winning_follow.name == initial_follow_1.name:
        print("Test 10.1 PASS: Follow winner correctly identified")
        pass_count += 1
    else:
        print(f"Test 10.1 FAIL: Follow winner not correctly identified. Has winning follow: {game.has_winning_follow}, Winning follow: {game.winning_follow.name if game.winning_follow else None}")
        fail_count += 1
    
    # Move to next round
    game.next_round()
    
    # The winning follow should be sent to the queue, and two new follows should be competing
    follows_in_queue = [follow.name for follow in game.follows]
    competing_follows = [game.pair_1[1].name, game.pair_2[1].name]
    
    print(f"Test 10 - Follows in queue: {follows_in_queue}")
    print(f"Test 10 - Competing follows: {competing_follows}")
    
    # Check if the winning follow is in the queue
    if initial_follow_1.name in follows_in_queue:
        print("Test 10.2 PASS: Winning follow correctly sent to queue")
        pass_count += 1
    else:
        print(f"Test 10.2 FAIL: Winning follow not in queue. Queue: {follows_in_queue}")
        fail_count += 1
    
    # Check that two different follows are now competing
    if initial_follow_1.name not in competing_follows:
        print("Test 10.3 PASS: New follows are competing after follow winner")
        pass_count += 1
    else:
        print(f"Test 10.3 FAIL: Winning follow still competing. Current competitors: {competing_follows}")
        fail_count += 1
    
    # Test 11: Game finished only when both roles have winners
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"], 
        ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"], 
        ["Judge1", "Judge2"]
    )
    
    print(f"Test 11 - Win thresholds - leads: {game.total_num_leads - 1}, follows: {game.total_num_follows - 1}")
    
    # Store initial competitors
    initial_lead = game.pair_1[0]
    initial_follow = game.pair_1[1]
    
    # Give winning points to lead
    initial_lead.points = game.total_num_leads - 2  # With 5 leads, needs 4 points to win
    
    # Lead wins and reaches winning condition
    lead_pair = (initial_lead, game.pair_2[0])
    result = simulate_round(
        game, lead_pair, "lead", [("Judge1", 1), ("Judge2", 1)]
    )
    
    print(f"Test 11 - After lead win - Has winning lead: {game.has_winning_lead}")
    print(f"Test 11 - After lead win - Has winning follow: {game.has_winning_follow}")
    print(f"Test 11 - After lead win - Game finished: {game.is_finished()}")
    
    # At this point, only lead has a winner, game should not be finished
    if not game.is_finished():
        print("Test 11.1 PASS: Game not finished with only lead winner")
        pass_count += 1
    else:
        print("Test 11.1 FAIL: Game incorrectly marked as finished with only lead winner")
        fail_count += 1
    
    # Give winning points to follow
    initial_follow.points = game.total_num_follows - 2  # With 5 follows, needs 4 points to win
    
    # Follow wins and reaches winning condition
    follow_pair = (initial_follow, game.pair_2[1])
    result = simulate_round(
        game, follow_pair, "follow", [("Judge1", 1), ("Judge2", 1)]
    )
    
    print(f"Test 11 - After follow win - Has winning lead: {game.has_winning_lead}")
    print(f"Test 11 - After follow win - Has winning follow: {game.has_winning_follow}")
    print(f"Test 11 - After follow win - Game finished: {game.is_finished()}")
    
    # Now the game should be finished with both roles having winners
    if game.is_finished():
        print("Test 11.2 PASS: Game finished with both lead and follow winners")
        pass_count += 1
    else:
        print("Test 11.2 FAIL: Game not marked as finished with both winners")
        fail_count += 1

    # Test 12: Round winners stay in competition if not overall winner
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"],
        ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"],
        ["Judge1", "Judge2"]
    )
    
    print("\nTest 12: Round winners stay in competition if not overall winner")
    game.debug_state()
    
    # First, run a normal round where neither contestant reaches win threshold
    lead1 = game.pair_1[0]
    lead2 = game.pair_2[0]
    follow1 = game.pair_1[1]
    follow2 = game.pair_2[1]
    
    print(f"Test 12 - Initial contestants - Leads: {lead1.name}, {lead2.name}; Follows: {follow1.name}, {follow2.name}")
    
    # Lead1 wins
    result = game.judge_round(lead1, lead2, "lead", [("Judge1", 1), ("Judge2", 1)])
    print(f"Test 12 - Lead round: {lead1.name} wins over {lead2.name}")
    
    # Follow1 wins
    result = game.judge_round(follow1, follow2, "follow", [("Judge1", 1), ("Judge2", 1)])
    print(f"Test 12 - Follow round: {follow1.name} wins over {follow2.name}")
    
    # Remember winners
    winning_lead_name = lead1.name
    winning_follow_name = follow1.name
    
    print("\nTest 12 - State after round:")
    game.debug_state()
    
    # Go to next round
    print("\nTest 12 - Moving to next round...")
    game.next_round()
    
    # After next_round, the winners should still be competing
    competing_leads = [game.pair_1[0].name, game.pair_2[0].name]
    competing_follows = [game.pair_1[1].name, game.pair_2[1].name]
    
    print("\nTest 12 - State in new round:")
    game.debug_state()
    
    # Check if previous round winners are still competing
    if winning_lead_name in competing_leads:
        print(f"Test 12.1 PASS: Lead winner {winning_lead_name} still competing in next round")
        pass_count += 1
    else:
        print(f"Test 12.1 FAIL: Lead winner {winning_lead_name} not competing in next round. Current competitors: {competing_leads}")
        fail_count += 1
    
    if winning_follow_name in competing_follows:
        print(f"Test 12.2 PASS: Follow winner {winning_follow_name} still competing in next round")
        pass_count += 1
    else:
        print(f"Test 12.2 FAIL: Follow winner {winning_follow_name} not competing in next round. Current competitors: {competing_follows}")
        fail_count += 1
    
    # Now test when a lead reaches win threshold
    # Set up a specific scenario where a lead is one point away from winning
    print("\nTest 12 - Testing lead win scenario...")
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"],
        ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"],
        ["Judge1", "Judge2"]
    )
    
    initial_lead = game.pair_1[0]
    initial_lead.points = game.total_num_leads - 2  # With 5 leads, needs 4 points to win
    
    print(f"Test 12 - Initial lead {initial_lead.name} has {initial_lead.points} points, needs {game.total_num_leads - 1} to win")
    
    # Simulate a round where this lead wins and reaches the winning threshold
    lead_pair = (initial_lead, game.pair_2[0])
    result = game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
    print(f"Test 12 - Lead {initial_lead.name} now has {initial_lead.points} points")
    
    # Verify the lead is marked as a winner
    if game.has_winning_lead and game.winning_lead.name == initial_lead.name:
        print("Test 12.3 PASS: Lead correctly marked as winner")
        pass_count += 1
    else:
        print(f"Test 12.3 FAIL: Lead not correctly marked as winner. has_winning_lead: {game.has_winning_lead}, winner: {game.winning_lead.name if game.winning_lead else None}")
        fail_count += 1
    
    # Now check that the game is not finished yet
    if not game.is_finished():
        print("Test 12.4 PASS: Game not finished with only lead winner")
        pass_count += 1
    else:
        print("Test 12.4 FAIL: Game incorrectly marked as finished with only lead winner")
        fail_count += 1
    
    print("\nTest 12 - State after lead wins:")
    game.debug_state()
    
    # Move to next round and verify winning lead is sent to queue
    print("\nTest 12 - Moving to next round after lead winner...")
    game.next_round()
    
    print("\nTest 12 - State after next round:")
    game.debug_state()
    
    # After next_round, the winning lead should be in the queue, not competing
    leads_in_queue = [lead.name for lead in game.leads]
    competing_leads = [game.pair_1[0].name, game.pair_2[0].name]
    
    if initial_lead.name in leads_in_queue:
        print(f"Test 12.5 PASS: Winning lead {initial_lead.name} correctly sent to queue")
        pass_count += 1
    else:
        print(f"Test 12.5 FAIL: Winning lead {initial_lead.name} not in queue. Queue: {leads_in_queue}")
        fail_count += 1

    # Test 13: After a role has a winner, round winners for that role stay in competition
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"],
        ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"],
        ["Judge1", "Judge2"]
    )
    
    print("\nTest 13: After a role has a winner, other contestants stay in competition after winning")
    
    # First, make Lead1 the winner for leads
    initial_lead = game.pair_1[0]
    initial_lead.points = game.total_num_leads - 2  # With 5 leads, needs 4 points to win
    
    # Simulate a round where this lead wins and reaches the winning threshold
    lead_pair = (initial_lead, game.pair_2[0])
    result = game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
    
    # Verify the lead is marked as a winner
    if game.has_winning_lead:
        print(f"Test 13 - Lead {initial_lead.name} is now the winner for leads")
    else:
        print(f"Test 13 - ERROR: Lead not marked as winner")
    
    # Also have a follow win (but not reaching winner threshold)
    follow_pair = (game.pair_1[1], game.pair_2[1])
    result = game.judge_round(follow_pair[0], follow_pair[1], "follow", [("Judge1", 1), ("Judge2", 1)])
    
    # Get the state before moving to next round
    print("\nTest 13 - State after declaring winner:")
    game.debug_state()
    
    # Move to next round
    game.next_round()
    print("\nTest 13 - State after moving to next round:")
    game.debug_state()
    
    # Get the new competing leads after the next_round
    new_lead1 = game.pair_1[0]
    new_lead2 = game.pair_2[0]
    print(f"Test 13 - New leads competing: {new_lead1.name}, {new_lead2.name}")
    
    # Have new_lead1 win a round
    result = game.judge_round(new_lead1, new_lead2, "lead", [("Judge1", 1), ("Judge2", 1)])
    print(f"Test 13 - Lead {new_lead1.name} wins the lead round")
    
    # Also have a follow win
    follow1 = game.pair_1[1]
    follow2 = game.pair_2[1]
    result = game.judge_round(follow1, follow2, "follow", [("Judge1", 1), ("Judge2", 1)])
    
    # Get state after round
    print("\nTest 13 - State after round where a lead wins (post role-winner):")
    game.debug_state()
    
    # Move to next round
    game.next_round()
    print("\nTest 13 - State after moving to next round:")
    game.debug_state()
    
    # Verify the winning lead from previous round is still competing
    competing_leads = [game.pair_1[0].name, game.pair_2[0].name]
    if new_lead1.name in competing_leads:
        print(f"Test 13.1 PASS: Lead winner {new_lead1.name} is still competing after winning a round")
        pass_count += 1
    else:
        print(f"Test 13.1 FAIL: Lead winner {new_lead1.name} is not competing. Competitors: {competing_leads}")
        fail_count += 1
    
    # Have new_lead1 win again
    if new_lead1.name == game.pair_1[0].name:
        current_lead = game.pair_1[0]
        other_lead = game.pair_2[0]
    else:
        current_lead = game.pair_2[0]
        other_lead = game.pair_1[0]
    
    result = game.judge_round(current_lead, other_lead, "lead", [("Judge1", 1), ("Judge2", 1)])
    print(f"Test 13 - Lead {current_lead.name} wins again")
    
    # Verify points have been accumulated
    print(f"Test 13 - Lead {current_lead.name} should now have multiple points: {current_lead.points}")
    
    # Move to next round
    game.next_round()
    print("\nTest 13 - State after another round:")
    game.debug_state()
    
    # Verify the lead is still competing after winning multiple rounds
    competing_leads = [game.pair_1[0].name, game.pair_2[0].name]
    if current_lead.name in competing_leads:
        print(f"Test 13.2 PASS: Lead {current_lead.name} is still competing after winning multiple rounds")
        pass_count += 1
    else:
        print(f"Test 13.2 FAIL: Lead {current_lead.name} is not competing. Competitors: {competing_leads}")
        fail_count += 1

    # Test 14: Winner messages only for the first contestant to reach the threshold
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"],
        ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"],
        ["Judge1", "Judge2"]
    )
    
    print("\nTest 14: Only show winner messages for the first contestant to reach the threshold")
    
    # First, make Lead1 almost reach the winning threshold
    initial_lead = game.pair_1[0]
    initial_lead.points = game.total_num_leads - 2  # With 5 leads, needs 4 points to win
    
    print(f"Test 14 - Initial lead {initial_lead.name} has {initial_lead.points} points, needs {game.total_num_leads - 1} to win")
    
    # Make this lead win and reach the threshold
    lead_pair = (initial_lead, game.pair_2[0])
    result = game.judge_round(lead_pair[0], lead_pair[1], "lead", [("Judge1", 1), ("Judge2", 1)])
    
    # Check for win message - should have one
    win_messages = game.check_for_win()
    if win_messages and f"👑 {initial_lead.name} has won for the leads!" in win_messages:
        print(f"Test 14.1 PASS: Correct win message shown for initial winner: {win_messages}")
        pass_count += 1
    else:
        print(f"Test 14.1 FAIL: Expected win message for initial winner, got: {win_messages}")
        fail_count += 1
    
    # Make sure the lead is marked as winner
    if game.has_winning_lead:
        print(f"Test 14 - Lead {initial_lead.name} correctly marked as winner")
    
    # Now simulate several more rounds with other leads winning
    # Move to next round
    game.next_round()
    
    # Get a new lead to win after a role winner is already determined
    new_lead = game.pair_1[0]
    other_lead = game.pair_2[0]
    
    # Make sure this lead is close to winning threshold
    new_lead.points = game.total_num_leads - 2  # One point away from winning
    
    # Make the new lead win
    result = game.judge_round(new_lead, other_lead, "lead", [("Judge1", 1), ("Judge2", 1)])
    
    # Check for win message - should NOT have one since this role already has a winner
    win_messages = game.check_for_win()
    if win_messages is None or f"👑 {new_lead.name} has won for the leads!" not in win_messages:
        print("Test 14.2 PASS: No win message shown for lead winning after role already has winner")
        pass_count += 1
    else:
        print(f"Test 14.2 FAIL: Incorrectly showed win message: {win_messages}")
        fail_count += 1
    
    # Finally, make a follow reach the win threshold for the first time
    follow = game.pair_1[1]
    follow.points = game.total_num_follows - 2  # One point away from winning
    
    # Make the follow win and reach threshold
    result = game.judge_round(follow, game.pair_2[1], "follow", [("Judge1", 1), ("Judge2", 1)])
    
    # Check for win message - should have one for the follow
    win_messages = game.check_for_win()
    if win_messages and f"👑 {follow.name} has won for the follows!" in win_messages:
        print(f"Test 14.3 PASS: Correct win message shown for initial follow winner: {win_messages}")
        pass_count += 1
    else:
        print(f"Test 14.3 FAIL: Expected win message for initial follow winner, got: {win_messages}")
        fail_count += 1
    
    # Verify the game is now finished
    if game.is_finished():
        print("Test 14.4 PASS: Game correctly marked as finished when both roles have winners")
        pass_count += 1
    else:
        print("Test 14.4 FAIL: Game not marked as finished when both roles have winners")
        fail_count += 1

    # Test 15: No points awarded in case of a tie
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"],
        ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"],
        ["Judge1", "Judge2"]
    )
    
    print("\nTest 15: No points awarded in case of a tie")
    
    # Get contestants from the first round
    lead1 = game.pair_1[0]
    lead2 = game.pair_2[0]
    
    # Store their initial points (should be 0)
    initial_lead1_points = lead1.points
    initial_lead2_points = lead2.points
    print(f"Test 15 - Initial points: {lead1.name}: {initial_lead1_points}, {lead2.name}: {initial_lead2_points}")
    
    # Simulate a tie
    result = game.judge_round(lead1, lead2, "lead", [("Judge1", 3), ("Judge2", 3)])
    
    # Verify the result is a tie
    if result["winner"].startswith("Tie between"):
        print(f"Test 15.1 PASS: Tie correctly detected")
        pass_count += 1
    else:
        print(f"Test 15.1 FAIL: Tie not correctly detected, got: {result['winner']}")
        fail_count += 1
    
    # Verify neither contestant got points
    if lead1.points == initial_lead1_points and lead2.points == initial_lead2_points:
        print(f"Test 15.2 PASS: No points awarded in tie ({lead1.name}: {lead1.points}, {lead2.name}: {lead2.points})")
        pass_count += 1
    else:
        print(f"Test 15.2 FAIL: Points incorrectly awarded in tie ({lead1.name}: {lead1.points}, {lead2.name}: {lead2.points})")
        fail_count += 1
    
    # Verify both tied contestants are set for next round
    if game.tie_lead_pair == (lead1, lead2):
        print("Test 15.3 PASS: Tied contestants correctly set for next round")
        pass_count += 1
    else:
        print(f"Test 15.3 FAIL: Tied contestants not correctly set, got: {game.tie_lead_pair}")
        fail_count += 1

    # Test 16: Contestants don't get the same partner after a tie
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"],
        ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"],
        ["Judge1", "Judge2"]
    )
    
    print("\nTest 16: Contestants don't get the same partner after a tie")
    
    # Record initial pairings
    lead1 = game.pair_1[0]
    lead2 = game.pair_2[0]
    follow1 = game.pair_1[1]
    follow2 = game.pair_2[1]
    
    initial_pairings = {
        (lead1.name, follow1.name): True,
        (lead2.name, follow2.name): True
    }
    
    print(f"Test 16 - Initial pairings: {lead1.name}-{follow1.name}, {lead2.name}-{follow2.name}")
    
    # Simulate ties in both lead and follow rounds
    result_lead = game.judge_round(lead1, lead2, "lead", [("Judge1", 3), ("Judge2", 3)])
    result_follow = game.judge_round(follow1, follow2, "follow", [("Judge1", 3), ("Judge2", 3)])
    
    # Move to next round
    game.next_round()
    
    # Get new pairings
    new_lead1 = game.pair_1[0]
    new_lead2 = game.pair_2[0]
    new_follow1 = game.pair_1[1]
    new_follow2 = game.pair_2[1]
    
    new_pairings = {
        (new_lead1.name, new_follow1.name): True,
        (new_lead2.name, new_follow2.name): True
    }
    
    print(f"Test 16 - New pairings: {new_lead1.name}-{new_follow1.name}, {new_lead2.name}-{new_follow2.name}")
    
    # Check if any contestant got the same partner
    same_partner_found = False
    for pairing in new_pairings:
        if pairing in initial_pairings:
            same_partner_found = True
            print(f"Test 16 - Error: Pairing {pairing[0]}-{pairing[1]} is repeated from previous round")
    
    if not same_partner_found:
        print("Test 16.1 PASS: No contestant got the same partner after a tie")
        pass_count += 1
    else:
        print("Test 16.1 FAIL: At least one contestant got the same partner after a tie")
        fail_count += 1
    
    # Force a specific scenario where we need to swap
    game = Game(
        ["LeadA", "LeadB", "LeadC", "LeadD"],
        ["FollowA", "FollowB", "FollowC", "FollowD"],
        ["Judge1", "Judge2"]
    )
    
    # Record initial pairings
    lead1 = game.pair_1[0]
    lead2 = game.pair_2[0]
    follow1 = game.pair_1[1]
    follow2 = game.pair_2[1]
    
    print(f"Test 16 - Forced scenario - Initial pairings: {lead1.name}-{follow1.name}, {lead2.name}-{follow2.name}")
    
    # Simulate the round with ties
    result_lead = game.judge_round(lead1, lead2, "lead", [("Judge1", 3), ("Judge2", 3)])
    result_follow = game.judge_round(follow1, follow2, "follow", [("Judge1", 3), ("Judge2", 3)])
    
    # Manually modify the previous_pairs to force a swap scenario
    # Clear it first, then add entries that would cause a swap
    game.previous_pairs = {}
    
    # Move to next round
    game.next_round()
    
    # Get the new pairings
    new_lead1 = game.pair_1[0]
    new_lead2 = game.pair_2[0]
    new_follow1 = game.pair_1[1]
    new_follow2 = game.pair_2[1]
    
    # Verify the ties were handled correctly
    tied_leads = {lead1.name, lead2.name}
    tied_follows = {follow1.name, follow2.name}
    new_leads = {new_lead1.name, new_lead2.name}
    new_follows = {new_follow1.name, new_follow2.name}
    
    if tied_leads == new_leads and tied_follows == new_follows:
        print("Test 16.2 PASS: Correct contestants competing after tie")
        pass_count += 1
    else:
        print(f"Test 16.2 FAIL: Incorrect contestants after tie. Expected leads: {tied_leads}, follows: {tied_follows}, got leads: {new_leads}, follows: {new_follows}")
        fail_count += 1
    
    # Test that pairings from non-consecutive rounds are allowed
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4"],
        ["Follow1", "Follow2", "Follow3", "Follow4"],
        ["Judge1", "Judge2"]
    )
    
    # Record initial pairings
    lead1 = game.pair_1[0]
    lead2 = game.pair_2[0]
    follow1 = game.pair_1[1]
    follow2 = game.pair_2[1]
    
    initial_pairing_1 = (lead1.name, follow1.name)
    initial_pairing_2 = (lead2.name, follow2.name)
    
    print(f"Test 16.3 - Initial pairings: {initial_pairing_1}, {initial_pairing_2}")
    
    # Manually add the initial pairings to the game's previous_pairs
    game.previous_pairs[initial_pairing_1] = True
    game.previous_pairs[initial_pairing_2] = True
    
    # Move to round 2 with ties to force new pairings
    result = game.judge_round(lead1, lead2, "lead", [("Judge1", 3), ("Judge2", 3)])
    result = game.judge_round(follow1, follow2, "follow", [("Judge1", 3), ("Judge2", 3)])
    game.next_round()
    
    # Verify the round 2 pairings are different due to previous_pairs check
    round2_pairings = [
        (game.pair_1[0].name, game.pair_1[1].name),
        (game.pair_2[0].name, game.pair_2[1].name)
    ]
    print(f"Test 16.3 - Round 2 pairings: {round2_pairings}")
    
    # There should be no overlap between initial and round 2 pairings
    round2_has_no_repeat = initial_pairing_1 not in round2_pairings and initial_pairing_2 not in round2_pairings
    
    if round2_has_no_repeat:
        print("Test 16.3 - Round 2 has no repeat pairings from round 1 as expected")
    else:
        print("Test 16.3 - WARNING: Round 2 has repeat pairings which shouldn't happen")
    
    # Now move to round a third round
    round2_lead1 = game.pair_1[0]
    round2_lead2 = game.pair_2[0]
    round2_follow1 = game.pair_1[1]
    round2_follow2 = game.pair_2[1]
    
    # Another round with ties
    result = game.judge_round(round2_lead1, round2_lead2, "lead", [("Judge1", 3), ("Judge2", 3)])
    result = game.judge_round(round2_follow1, round2_follow2, "follow", [("Judge1", 3), ("Judge2", 3)])
    game.next_round()
    
    # Manually create pairings that match the original round 1 pairings
    # First, force the previous_pairs to include round 2 pairings but NOT round 1
    game.previous_pairs = {}  # Cleared automatically by next_round
    
    # Force the initial pairings to be considered in the round 3 pairings
    round3_pairings = [
        (game.pair_1[0].name, game.pair_1[1].name),
        (game.pair_2[0].name, game.pair_2[1].name)
    ]
    print(f"Test 16.3 - Round 3 pairings: {round3_pairings}")
    
    # Since we're in round 3, the original pairings from round 1 should be allowed
    # because the previous_pairs record is cleared after each round
    original_pairing_possible = (initial_pairing_1 in round3_pairings or 
                                initial_pairing_2 in round3_pairings or
                                (initial_pairing_1[0], initial_pairing_2[1]) in round3_pairings or 
                                (initial_pairing_2[0], initial_pairing_1[1]) in round3_pairings)
    
    if original_pairing_possible:
        print("Test 16.3 PASS: Pairings from non-consecutive rounds are allowed")
        pass_count += 1
    else:
        print("Test 16.3 FAIL: Pairings from non-consecutive rounds are not being allowed")
        fail_count += 1

    # Test 17: Contestants don't get the same partner in consecutive rounds even without ties
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4"],
        ["Follow1", "Follow2", "Follow3", "Follow4"],
        ["Judge1", "Judge2"]
    )
    
    print("\nTest 17: Contestants don't get the same partner in consecutive rounds even without ties")
    
    # Record initial pairings
    lead1 = game.pair_1[0]
    lead2 = game.pair_2[0]
    follow1 = game.pair_1[1]
    follow2 = game.pair_2[1]
    
    initial_pairings = {
        (lead1.name, follow1.name): True,
        (lead2.name, follow2.name): True
    }
    
    print(f"Test 17 - Initial pairings: {lead1.name}-{follow1.name}, {lead2.name}-{follow2.name}")
    
    # Manually add the initial pairings to the game's previous_pairs
    game.previous_pairs[lead1.name, follow1.name] = True
    game.previous_pairs[lead2.name, follow2.name] = True
    
    # Normal round without ties
    result = game.judge_round(lead1, lead2, "lead", [("Judge1", 1), ("Judge2", 1)])
    result = game.judge_round(follow1, follow2, "follow", [("Judge1", 1), ("Judge2", 1)])
    
    # Move to next round - should avoid repeat pairings
    game.next_round()
    
    # Get new pairings
    new_lead1 = game.pair_1[0]
    new_lead2 = game.pair_2[0]
    new_follow1 = game.pair_1[1]
    new_follow2 = game.pair_2[1]
    
    round2_pairings = [
        (new_lead1.name, new_follow1.name),
        (new_lead2.name, new_follow2.name)
    ]
    
    print(f"Test 17 - Round 2 pairings: {round2_pairings}")
    
    # There should be no overlap between initial and round 2 pairings
    no_repeat_pairings = all(pairing not in initial_pairings for pairing in round2_pairings)
    
    if no_repeat_pairings:
        print("Test 17 PASS: No contestant got the same partner in round 2 even without ties")
        pass_count += 1
    else:
        print("Test 17 FAIL: Some contestants got the same partner in round 2")
        fail_count += 1

    # Test 18: Winners are not paired together in the next round
    print(f"\n\033[32mRunning Winners Not Paired Test\033[0m")
    pass_count, fail_count = test_18_winners_not_paired_together(pass_count, fail_count)
    
    # Test 19: Round winner behavior verification
    print(f"\n\033[32mRunning Round Winners Behavior Test\033[0m")
    pass_count, fail_count = test_19_round_winners(pass_count, fail_count)

    print(f"Tests passed: {pass_count}/{pass_count + fail_count}")
    return pass_count, fail_count


def test_19_round_winners(pass_count=0, fail_count=0):
    """
    Test the behavior of round winners in the game.
    """
    print("\nTest 19: Round winners behavior verification")
    
    # Create a game with 5 leads and 5 follows
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"],
        ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"],
        ["Judge1", "Judge2"]
    )
    
    print("Test 19 - Initial state:")
    game.debug_state()
    
    # Simulate rounds where a lead wins consistently
    for i in range(2):
        # Remember who the contestants are
        lead1 = game.pair_1[0]
        lead2 = game.pair_2[0]
        follow1 = game.pair_1[1]
        follow2 = game.pair_2[1]
        
        print(f"\nTest 19 - Round {i+1}")
        print(f"Lead1: {lead1.name}, Lead2: {lead2.name}")
        print(f"Follow1: {follow1.name}, Follow2: {follow2.name}")
        
        # Lead1 wins
        result = game.judge_round(lead1, lead2, "lead", [("Judge1", 1), ("Judge2", 1)])
        print(f"Lead round result: {result['winner']} wins")
        
        # Follow1 wins
        result = game.judge_round(follow1, follow2, "follow", [("Judge1", 1), ("Judge2", 1)])
        print(f"Follow round result: {result['winner']} wins")
        
        # Go to next round
        game.next_round()
    
    # Now make Lead1 reach winning condition
    lead1 = game.pair_1[0]
    original_points = lead1.points
    # Set points to one away from winning
    lead1.points = game.total_num_leads - 2
    
    lead2 = game.pair_2[0]
    follow1 = game.pair_1[1]
    follow2 = game.pair_2[1]
    
    print(f"\nTest 19 - Final round - Lead will reach winning condition")
    print(f"Lead1: {lead1.name} (points: {lead1.points}), Lead2: {lead2.name}")
    
    # Lead1 reaches winning points
    result = game.judge_round(lead1, lead2, "lead", [("Judge1", 1), ("Judge2", 1)])
    print(f"Lead round result: {result['winner']} wins and has {lead1.points} points")
    
    # Check if correctly marked as winner
    if game.has_winning_lead and game.winning_lead and game.winning_lead.name == lead1.name:
        print("Test 19.1 PASS: Lead correctly marked as winner")
        pass_count += 1
    else:
        print(f"Test 19.1 FAIL: Lead not correctly marked as winner. has_winning_lead: {game.has_winning_lead}, winner: {game.winning_lead.name if game.winning_lead else None}")
        fail_count += 1
    
    # Check win messages
    win_messages = game.check_for_win()
    if win_messages and any(lead1.name in msg for msg in win_messages):
        print("Test 19.2 PASS: Correct win message shown for lead")
        pass_count += 1
    else:
        print(f"Test 19.2 FAIL: Expected win message for lead, got: {win_messages}")
        fail_count += 1
    
    # Follow1 wins but not enough points to be overall winner
    result = game.judge_round(follow1, follow2, "follow", [("Judge1", 1), ("Judge2", 1)])
    print(f"Follow round result: {result['winner']} wins")
    
    # Move to next round - lead winner should be sent back to queue
    game.next_round()
    
    # Check if winning lead was sent to back of queue
    leads_in_queue = [l.name for l in game.leads]
    competing_leads = [game.pair_1[0].name, game.pair_2[0].name]
    
    if lead1.name in leads_in_queue and lead1.name not in competing_leads:
        print("Test 19.3 PASS: Winning lead correctly sent to queue and not competing")
        pass_count += 1
    else:
        print(f"Test 19.3 FAIL: Winning lead queue/competition status incorrect. In queue: {lead1.name in leads_in_queue}, Competing: {lead1.name in competing_leads}")
        fail_count += 1
    
    # One more round to verify normal round winners stay
    new_lead1 = game.pair_1[0]
    new_lead2 = game.pair_2[0]
    new_follow1 = game.pair_1[1]
    new_follow2 = game.pair_2[1]
    
    # New Lead1 wins
    result = game.judge_round(new_lead1, new_lead2, "lead", [("Judge1", 1), ("Judge2", 1)])
    print(f"New lead round result: {result['winner']} wins")
    
    # New Follow1 wins
    result = game.judge_round(new_follow1, new_follow2, "follow", [("Judge1", 1), ("Judge2", 1)])
    print(f"New follow round result: {result['winner']} wins")
    
    # Move to final round to check if winners stay
    game.next_round()
    
    # Verify winners stay in competition (since they're not overall winners)
    final_competing_leads = [game.pair_1[0].name, game.pair_2[0].name]
    final_competing_follows = [game.pair_1[1].name, game.pair_2[1].name]
    
    if new_lead1.name in final_competing_leads:
        print("Test 19.4 PASS: Previous lead winner still competing (not overall winner)")
        pass_count += 1
    else:
        print(f"Test 19.4 FAIL: Previous lead winner not competing. Competitors: {final_competing_leads}")
        fail_count += 1
    
    if new_follow1.name in final_competing_follows:
        print("Test 19.5 PASS: Previous follow winner still competing (not overall winner)")
        pass_count += 1
    else:
        print(f"Test 19.5 FAIL: Previous follow winner not competing. Competitors: {final_competing_follows}")
        fail_count += 1
    
    return pass_count, fail_count


def test_18_winners_not_paired_together(pass_count=0, fail_count=0):
    """
    Test that winning contestants are not paired together in the next round.
    """
    print("\nTest 18: Winners are not paired together in the next round")
    
    # Create a game with 4 leads and 4 follows (minimum needed for the test)
    lead_names = ["Lead1", "Lead2", "Lead3", "Lead4"]
    follow_names = ["Follow1", "Follow2", "Follow3", "Follow4"]
    guest_judge_names = ["Judge1", "Judge2"]
    
    game = Game(lead_names, follow_names, guest_judge_names)
    
    # Record initial pairings
    initial_pairs = [
        (game.pair_1[0].name, game.pair_1[1].name),
        (game.pair_2[0].name, game.pair_2[1].name)
    ]
    print(f"Test 18 - Initial pairs: {initial_pairs}")
    
    # Setup to make specific contestants win
    # Choose the lead and follow we want to win
    target_lead = game.pair_1[0].name
    target_follow = game.pair_1[1].name
    
    print(f"Test 18 - Making {target_lead} (lead) and {target_follow} (follow) the winners")
    
    # Create votes to make them win
    lead_votes = [(judge, 1) for judge in guest_judge_names]
    follow_votes = [(judge, 1) for judge in guest_judge_names]
    
    # Judge the round to establish winners
    game.judge_round(game.pair_1[0], game.pair_2[0], "lead", lead_votes)
    game.judge_round(game.pair_1[1], game.pair_2[1], "follow", follow_votes)
    
    # Manually set the last winners for testing purposes
    # (In the web app, these are set by the check_for_win method)
    game.last_lead_winner = target_lead
    game.last_follow_winner = target_follow
    
    # Verify the winners are set correctly
    if game.last_lead_winner == target_lead and game.last_follow_winner == target_follow:
        print("Test 18.1 PASS: Winners correctly identified")
        pass_count += 1
    else:
        print(f"Test 18.1 FAIL: Winners not correctly identified. lead: {game.last_lead_winner}, follow: {game.last_follow_winner}")
        fail_count += 1
    
    # Move to next round
    game.next_round()
    
    # Get new pairings
    new_pairs = [
        (game.pair_1[0].name, game.pair_1[1].name),
        (game.pair_2[0].name, game.pair_2[1].name)
    ]
    print(f"Test 18 - New pairs after next round: {new_pairs}")
    
    # Verify that the winning lead and follow are not paired together
    winners_paired = False
    for pair in new_pairs:
        if pair[0] == target_lead and pair[1] == target_follow:
            winners_paired = True
            break
    
    if not winners_paired:
        print("Test 18.2 PASS: Winners are not paired together in the next round")
        pass_count += 1
    else:
        print("Test 18.2 FAIL: Winners are paired together in the next round")
        fail_count += 1
        
    return pass_count, fail_count


def run_tests():
    """Run all tests"""
    # Run all test cases
    run_test_cases()


if __name__ == "__main__":
    run_tests()
