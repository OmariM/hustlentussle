"""
Test script to verify the handling of winners in the game logic.
"""

from game_logic import Game

def test_round_winners():
    # Create a game with 5 leads and 5 follows
    game = Game(
        ["Lead1", "Lead2", "Lead3", "Lead4", "Lead5"],
        ["Follow1", "Follow2", "Follow3", "Follow4", "Follow5"],
        ["Judge1", "Judge2"]
    )
    
    print("Initial state:")
    game.debug_state()
    
    # Simulate rounds where a lead wins consistently
    for i in range(3):
        # Remember who the contestants are
        lead1 = game.pair_1[0]
        lead2 = game.pair_2[0]
        follow1 = game.pair_1[1]
        follow2 = game.pair_2[1]
        
        print(f"\nRound {i+1}")
        print(f"Lead1: {lead1.name}, Lead2: {lead2.name}")
        print(f"Follow1: {follow1.name}, Follow2: {follow2.name}")
        
        # Lead1 wins
        result = game.judge_round(lead1, lead2, "lead", [("Judge1", 1), ("Judge2", 1)])
        print(f"Lead round result: {result['winner']} wins")
        
        # Follow1 wins
        result = game.judge_round(follow1, follow2, "follow", [("Judge1", 1), ("Judge2", 1)])
        print(f"Follow round result: {result['winner']} wins")
        
        # Go to next round
        game.debug_state()
        
        print("\nMoving to next round...")
        game.next_round()
        game.debug_state()
    
    # Now make Lead1 reach winning condition
    lead1 = game.pair_1[0]
    lead1.points = game.total_num_leads - 2  # One point away from winning
    
    # Final round where lead becomes a winner
    lead1 = game.pair_1[0]
    lead2 = game.pair_2[0]
    follow1 = game.pair_1[1]
    follow2 = game.pair_2[1]
    
    print("\nFinal round - Lead will reach winning condition")
    print(f"Lead1: {lead1.name} (points: {lead1.points}), Lead2: {lead2.name}")
    
    # Lead1 reaches winning points
    result = game.judge_round(lead1, lead2, "lead", [("Judge1", 1), ("Judge2", 1)])
    print(f"Lead round result: {result['winner']} wins and has {lead1.points} points")
    
    # Check if correctly marked as winner
    win_messages = game.check_for_win()
    if win_messages:
        print(f"Win messages: {win_messages}")
    
    # Check state after lead wins
    game.debug_state()
    
    # Follow1 wins but not enough points to be overall winner
    result = game.judge_round(follow1, follow2, "follow", [("Judge1", 1), ("Judge2", 1)])
    print(f"Follow round result: {result['winner']} wins")
    
    # Move to next round - lead winner should be sent back to queue
    print("\nMoving to next round after lead winner...")
    game.next_round()
    game.debug_state()
    
    # Check if winning lead was sent to back of queue
    print("\nVerifying lead winner behavior:")
    print(f"Is {lead1.name} in the queue? {lead1.name in [l.name for l in game.leads]}")
    print(f"Are new leads competing? {game.pair_1[0].name}, {game.pair_2[0].name}")
    
    # One more round to verify normal round winners stay
    new_lead1 = game.pair_1[0]
    new_lead2 = game.pair_2[0]
    new_follow1 = game.pair_1[1]
    new_follow2 = game.pair_2[1]
    
    # New Lead1 wins
    result = game.judge_round(new_lead1, new_lead2, "lead", [("Judge1", 1), ("Judge2", 1)])
    print(f"\nNew lead round result: {result['winner']} wins")
    
    # New Follow1 wins
    result = game.judge_round(new_follow1, new_follow2, "follow", [("Judge1", 1), ("Judge2", 1)])
    print(f"New follow round result: {result['winner']} wins")
    
    game.debug_state()
    
    # Move to final round to check if winners stay
    print("\nMoving to final verification round...")
    game.next_round()
    game.debug_state()
    
    # Verify winners stay
    print(f"\nIs previous lead winner {new_lead1.name} still competing? {new_lead1.name in [game.pair_1[0].name, game.pair_2[0].name]}")
    print(f"Is previous follow winner {new_follow1.name} still competing? {new_follow1.name in [game.pair_1[1].name, game.pair_2[1].name]}")

if __name__ == "__main__":
    test_round_winners() 