from game_logic import Game


def simulate_round(game, pair, role, votes):
    print(f"\nSimulating {role.capitalize()} Round:")
    result = game.judge_round(pair[0], pair[1], role, votes)
    print(f"Winner: {result['winner']}")
    print(
        "Guest Judges who voted for",
        result["winner"],
        ":",
        ", ".join(result["guest_votes"]) or "None",
    )
    print(
        "Contestant Judges who voted for",
        result["winner"],
        ":",
        ", ".join(result["contestant_votes"]) or "None",
    )


def run_test_cases():
    # Setup basic game
    lead_names = ["Logan", "Ian", "Rob", "Zane"]
    follow_names = ["Emma", "Tati", "Reina", "Diane"]
    guest_judges = ["Kenji", "Diane"]

    game = Game(lead_names, follow_names, guest_judges)

    # Prepare initial pairs
    lead_pair = (game.pair_1[0], game.pair_2[0])
    follow_pair = (game.pair_1[1], game.pair_2[1])

    # Test 1: Tie on leads
    simulate_round(
        game, lead_pair, "lead", [("Kenji", 3), ("Diane", 3), ("Reina", 1), ("Rob", 2)]
    )

    # Test 2: No contest on follows
    simulate_round(
        game,
        follow_pair,
        "follow",
        [("Kenji", 4), ("Diane", 4), ("Reina", 1), ("Rob", 2)],
    )

    # Test 3: Split vote
    simulate_round(
        game, lead_pair, "lead", [("Kenji", 1), ("Diane", 2), ("Reina", 1), ("Rob", 2)]
    )

    # Test 4: Sweep
    simulate_round(
        game,
        follow_pair,
        "follow",
        [("Kenji", 1), ("Diane", 1), ("Reina", 1), ("Rob", 1)],
    )

    # Test 5: Double Tie verification
    simulate_round(
        game, lead_pair, "lead", [("Kenji", 3), ("Diane", 3), ("Reina", 1), ("Rob", 2)]
    )
    print("Leads after tie:", [c.name for c in game.leads])

    # Test 6: Tie flows correctly
    simulate_round(
        game,
        follow_pair,
        "follow",
        [("Kenji", 3), ("Diane", 3), ("Reina", 1), ("Rob", 2)],
    )
    print("Follows after tie:", [c.name for c in game.follows])

    # Test 7: No Contest returns to end of queue
    # Reset game state for clarity
    game = Game(lead_names, follow_names, guest_judges)
    lead_pair = (game.pair_1[0], game.pair_2[0])
    initial_leads = [c.name for c in game.leads]
    print("Initial leads:", initial_leads)
    simulate_round(
        game, lead_pair, "lead", [("Kenji", 4), ("Diane", 4), ("Reina", 1), ("Rob", 2)]
    )
    after_leads = [c.name for c in game.leads]
    print("Leads after No Contest:", after_leads)
    expected_end = [lead_pair[0].name, lead_pair[1].name]
    print("Expected at end of leads list:", expected_end)


if __name__ == "__main__":
    run_test_cases()
