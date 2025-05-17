from game_logic import Game

def verify_winner_pairing_fix():
    """
    Verify that winners from each round don't get paired together in the next round,
    without requiring them to reach the winning threshold.
    """
    print("Verifying that round winners don't get paired together in consecutive rounds...")
    
    # Create a game with a reasonable number of contestants
    lead_names = ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5", "Lead6"]
    follow_names = ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5", "Follow6"] 
    guest_judge_names = ["Judge1", "Judge2"]
    
    game = Game(lead_names, follow_names, guest_judge_names)
    
    all_tests_passed = True
    for round_num in range(1, 4):  # Test 3 rounds
        print(f"\n=== ROUND {round_num} ===")
        
        # Print current pairings
        print(f"Round {round_num} pairings:")
        print(f"Pair 1: {game.pair_1[0].name} (lead) & {game.pair_1[1].name} (follow)")
        print(f"Pair 2: {game.pair_2[0].name} (lead) & {game.pair_2[1].name} (follow)")
        
        # Record initial contestants
        initial_pairs = [
            (game.pair_1[0].name, game.pair_1[1].name),
            (game.pair_2[0].name, game.pair_2[1].name)
        ]
        
        # Choose winners from first pair
        winning_lead = game.pair_1[0]
        winning_follow = game.pair_1[1]
        
        print(f"\nMaking {winning_lead.name} (lead) and {winning_follow.name} (follow) the winners...")
        
        # Create votes to make them win
        lead_votes = [(judge, 1) for judge in guest_judge_names]  # All judges vote for pair_1[0]
        follow_votes = [(judge, 1) for judge in guest_judge_names]  # All judges vote for pair_1[1]
        
        # Judge the rounds - this will now set last_lead_winner and last_follow_winner
        game.judge_round(game.pair_1[0], game.pair_2[0], "lead", lead_votes)
        game.judge_round(game.pair_1[1], game.pair_2[1], "follow", follow_votes)
        
        # Verify winners are set correctly
        print(f"Round {round_num} winners: {game.last_lead_winner} (lead) and {game.last_follow_winner} (follow)")
        if game.last_lead_winner == winning_lead.name and game.last_follow_winner == winning_follow.name:
            print("✅ Winners correctly set")
        else:
            print(f"❌ Winners not correctly set: {game.last_lead_winner}, {game.last_follow_winner}")
            all_tests_passed = False
        
        # Record the pairing between winners
        winning_pair = (winning_lead.name, winning_follow.name)
        
        # Advance to next round
        game.next_round()
        
        # Check that winners aren't paired together
        next_pairings = [
            (game.pair_1[0].name, game.pair_1[1].name),
            (game.pair_2[0].name, game.pair_2[1].name)
        ]
        
        winners_paired = winning_pair in next_pairings
        
        if winners_paired:
            print(f"\n❌ TEST FAILED: Winners from round {round_num} are paired together in round {round_num+1}!")
            all_tests_passed = False
        else:
            print(f"\n✅ Round {round_num}: Winners are NOT paired together in round {round_num+1}")
    
    # Final result
    if all_tests_passed:
        print("\n✅ ALL TESTS PASSED: Winners are never paired together in consecutive rounds")
        return True
    else:
        print("\n❌ SOME TESTS FAILED: Winners were paired together in consecutive rounds at least once")
        return False

if __name__ == "__main__":
    verify_winner_pairing_fix() 