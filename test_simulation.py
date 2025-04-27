from main import Game


def simulate_round(game, pair, role, votes):
    print(f"\nSimulating {role.capitalize()} Round:")
    res = game.judge_round(pair[0], pair[1], role, votes)
    print(f"Winner: {res['winner']}")
    print("Guest Judges who voted:", ", ".join(res["guest_votes"]) or "None")
    print("Contestant Judges who voted:", ", ".join(res["contestant_votes"]) or "None")


def run_test_cases():
    leads = ["Logan", "Ian", "Rob", "Zane"]
    follows = ["Emma", "Tati", "Reina", "Diane"]
    guests = ["Kenji", "Diane"]
    game = Game(leads, follows, guests)

    lead_pair = (game.pair_1[0], game.pair_2[0])
    follow_pair = (game.pair_1[1], game.pair_2[1])

    # 1. Tie on leads
    simulate_round(
        game, lead_pair, "lead", [("Kenji", 3), ("Diane", 3), ("Reina", 1), ("Rob", 2)]
    )
    # 2. No contest on follows
    simulate_round(
        game,
        follow_pair,
        "follow",
        [("Kenji", 4), ("Diane", 4), ("Reina", 1), ("Rob", 2)],
    )
    # 3. Split vote
    simulate_round(
        game, lead_pair, "lead", [("Kenji", 1), ("Diane", 2), ("Reina", 1), ("Rob", 2)]
    )
    # 4. Sweep
    simulate_round(
        game,
        follow_pair,
        "follow",
        [("Kenji", 1), ("Diane", 1), ("Reina", 1), ("Rob", 1)],
    )
    # 5. Tie verification
    simulate_round(
        game, lead_pair, "lead", [("Kenji", 3), ("Diane", 3), ("Reina", 1), ("Rob", 2)]
    )
    print("Leads after tie:", [c.name for c in game.leads])


if __name__ == "__main__":
    run_test_cases()
