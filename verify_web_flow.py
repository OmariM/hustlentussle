from game_logic import Game

def verify_web_flow():
    """
    Simulate the exact flow of the web UI to debug why winners might be paired together.
    """
    print("=== SIMULATING WEB UI FLOW ===")
    
    # Create a game with contestants
    lead_names = ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5", "Lead6"]
    follow_names = ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5", "Follow6"]
    guest_judge_names = ["Judge1", "Judge2"]
    
    game = Game(lead_names, follow_names, guest_judge_names)
    
    # ROUND 1
    print("\n=== ROUND 1 ===")
    print("Initial pairings:")
    print(f"Pair 1: {game.pair_1[0].name} (lead) & {game.pair_1[1].name} (follow)")
    print(f"Pair 2: {game.pair_2[0].name} (lead) & {game.pair_2[1].name} (follow)")
    
    # Remember the contestants in round 1
    lead1 = game.pair_1[0]
    lead2 = game.pair_2[0]
    follow1 = game.pair_1[1]
    follow2 = game.pair_2[1]
    
    # STEP 1: Judge the leads (pair 1 wins)
    lead_votes = [(judge, 1) for judge in guest_judge_names]
    lead_result = game.judge_round(lead1, lead2, "lead", lead_votes)
    print(f"\nLead judging result: {lead_result['winner']} wins")
    
    # STEP 2: Judge the follows (pair 1 wins)
    follow_votes = [(judge, 1) for judge in guest_judge_names]
    follow_result = game.judge_round(follow1, follow2, "follow", follow_votes)
    print(f"Follow judging result: {follow_result['winner']} wins")
    
    # STEP 3: Check for win (this is where the last_lead_winner and last_follow_winner are set)
    win_messages = game.check_for_win()
    print(f"Win messages: {win_messages}")
    print(f"last_lead_winner: {game.last_lead_winner if hasattr(game, 'last_lead_winner') else 'Not set'}")
    print(f"last_follow_winner: {game.last_follow_winner if hasattr(game, 'last_follow_winner') else 'Not set'}")
    
    # STEP 4: Move to next round
    game.next_round()
    
    # ROUND 2
    print("\n=== ROUND 2 ===")
    print("New pairings:")
    print(f"Pair 1: {game.pair_1[0].name} (lead) & {game.pair_1[1].name} (follow)")
    print(f"Pair 2: {game.pair_2[0].name} (lead) & {game.pair_2[1].name} (follow)")
    
    # Check if the previous winners are paired together
    winners_paired = False
    if ((game.pair_1[0].name == lead1.name and game.pair_1[1].name == follow1.name) or
        (game.pair_2[0].name == lead1.name and game.pair_2[1].name == follow1.name)):
        winners_paired = True
        print("\n❌ PROBLEM FOUND: Winners from round 1 are paired together in round 2!")
    else:
        print("\n✅ SUCCESS: Winners from round 1 are NOT paired together in round 2")
    
    # Show debug info about the pairings
    print("\nDebug information:")
    print(f"Round 1 winning lead: {lead1.name}")
    print(f"Round 1 winning follow: {follow1.name}")
    print(f"Round 2 Pair 1: {game.pair_1[0].name} (lead) & {game.pair_1[1].name} (follow)")
    print(f"Round 2 Pair 2: {game.pair_2[0].name} (lead) & {game.pair_2[1].name} (follow)")
    print(f"previous_pairs content: {game.previous_pairs}")
    
    return not winners_paired

if __name__ == "__main__":
    verify_web_flow() 