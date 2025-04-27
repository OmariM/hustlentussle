from game_logic import Game

def simulate_simple_game():
    leads = ["Logan", "Ian", "Rob", "Zane"]
    follows = ["Emma", "Tati", "Reina", "Diane"]
    guests = ["Kenji", "Diane"]

    game = Game(leads, follows, guests)

    def print_pairs():
        s = game.get_game_state()
        print(f"\nRound {s['round']}:")
        print(f" Pair 1: {s['pair_1'][0]} (Lead) & {s['pair_1'][1]} (Follow)")
        print(f" Pair 2: {s['pair_2'][0]} (Lead) & {s['pair_2'][1]} (Follow)")

    # Round 1
    print_pairs()
    # Simulate winners
    game.winning_lead = game.pair_1[0]
    game.winning_follow = game.pair_1[1]
    game.next_round()

    # Round 2
    print_pairs()
    game.winning_lead = game.pair_2[0]
    game.winning_follow = game.pair_2[1]
    game.next_round()

    # Round 3
    print_pairs()

if __name__ == "__main__":
    simulate_simple_game()

