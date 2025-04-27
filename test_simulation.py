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

    # Summary
    total = pass_count + fail_count
    print(f"\nSummary: {pass_count}/{total} tests passed, {fail_count} failed.")


if __name__ == "__main__":
    run_test_cases()
