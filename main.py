from colorama import Fore, init, Style
from game_logic import Game

init(autoreset=True)


def print_header(text):
    print(Fore.CYAN + Style.BRIGHT + f"\n===== {text} =====\n")


def get_vote_input(judge, option1, option2, is_guest):
    while True:
        try:
            prompt = f"{Fore.YELLOW}{judge}{Style.RESET_ALL} vote:\n"
            prompt += f" [1] {option1}\n [2] {option2}\n"
            if is_guest:
                prompt += " [3] Tie\n [4] No Contest\n"
            prompt += "Choice: "
            decision = int(input(prompt))
            if (is_guest and decision in [1, 2, 3, 4]) or (
                not is_guest and decision in [1, 2]
            ):
                return decision
            print(Fore.RED + "Invalid choice.")
        except ValueError:
            print(Fore.RED + "Enter a number.")


def format_contestant_with_points(name, contestants):
    for c in contestants:
        if c.name == name:
            return f"{name} ({c.points} pts)"
    return name


if __name__ == "__main__":
    print(Fore.GREEN + Style.BRIGHT + "Welcome to the Dance Competition!\n")
    leads = input("Enter lead names (comma-separated): ").split(",")
    follows = input("Enter follow names (comma-separated): ").split(",")
    guests = input("Enter guest judge names (comma-separated): ").split(",")

    game = Game(leads, follows, guests)

    while not game.is_finished():
        state = game.get_game_state()
        print_header(f"Round {state['round']}")
        print(
            f"Matchup 1: {format_contestant_with_points(state['pair_1'][0], game.leads+game.follows)} (Lead) & "
            f"{format_contestant_with_points(state['pair_1'][1], game.leads+game.follows)} (Follow)"
        )
        print(
            f"Matchup 2: {format_contestant_with_points(state['pair_2'][0], game.leads+game.follows)} (Lead) & "
            f"{format_contestant_with_points(state['pair_2'][1], game.leads+game.follows)} (Follow)"
        )
        print(f"Contestant Judges: {', '.join(state['contestant_judges'])}")

        # Vote Leads
        votes = []
        print_header("Voting for Leads")
        for judge in game.guest_judges + state["contestant_judges"]:
            is_guest = judge in game.guest_judges
            decision = get_vote_input(
                judge, state["pair_1"][0], state["pair_2"][0], is_guest
            )
            votes.append((judge, decision))
        res = game.judge_round(game.pair_1[0], game.pair_2[0], "lead", votes)
        print(Fore.GREEN + f"Winner: {res['winner']}")
        print("Guest Votes:", ", ".join(res["guest_votes"]) or "None")
        print("Contestant Votes:", ", ".join(res["contestant_votes"]) or "None")

        # Vote Follows
        votes = []
        print_header("Voting for Follows")
        for judge in game.guest_judges + state["contestant_judges"]:
            is_guest = judge in game.guest_judges
            decision = get_vote_input(
                judge, state["pair_1"][1], state["pair_2"][1], is_guest
            )
            votes.append((judge, decision))
        res = game.judge_round(game.pair_1[1], game.pair_2[1], "follow", votes)
        print(Fore.GREEN + f"Winner: {res['winner']}")
        print("Guest Votes:", ", ".join(res["guest_votes"]) or "None")
        print("Contestant Votes:", ", ".join(res["contestant_votes"]) or "None")

        for msg in game.check_for_win() or []:
            print(Fore.YELLOW + msg)
        game.next_round()

    print_header("FINAL RESULTS")
    final = game.finalize_results()
    # display leaderboard...
