from main import Game

def simulate_round(game, pair, role, votes):
    print(f"\nSimulating {role.capitalize()} Round:")
    result = game.judge_round(pair[0], pair[1], role, votes)
    print("Result:", result)

def run_test_cases():
    # Setup basic game
    lead_names = ["Logan", "Ian", "Rob", "Zane"]
    follow_names = ["Emma", "Tati", "Reina", "Diane"]
    guest_judges = ["Kenji", "Diane"]

    game = Game(lead_names, follow_names, guest_judges)

    # Example pairs to simulate rounds
    lead_pair = (game.pair_1[0], game.pair_2[0])  # Leads
    follow_pair = (game.pair_1[1], game.pair_2[1])  # Follows

    # Test 1: Both Guest Judges vote Tie
    votes_tie = [("Kenji", 3), ("Diane", 3), ("Reina", 1), ("Rob", 2)]
    simulate_round(game, lead_pair, "lead", votes_tie)

    # Test 2: Both Guest Judges vote No Contest
    votes_no_contest = [("Kenji", 4), ("Diane", 4), ("Reina", 1), ("Rob", 2)]
    simulate_round(game, follow_pair, "follow", votes_no_contest)

    # Test 3: Normal Voting (Guest Judges split decision)
    votes_normal = [("Kenji", 1), ("Diane", 2), ("Reina", 1), ("Rob", 2)]
    simulate_round(game, lead_pair, "lead", votes_normal)

    # Test 4: All votes for contestant 1
    votes_sweep = [("Kenji", 1), ("Diane", 1), ("Reina", 1), ("Rob", 1)]
    simulate_round(game, follow_pair, "follow", votes_sweep)

if __name__ == "__main__":
    run_test_cases()
