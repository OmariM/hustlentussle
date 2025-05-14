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


def format_contestant_with_points(name, contestants, game=None):
    for c in contestants:
        if c.name == name:
            # Add crown emoji for the first winner of each role
            crown = ""
            if game and ((game.has_winning_lead and game.last_lead_winner == name) or 
                        (game.has_winning_follow and game.last_follow_winner == name)):
                crown = "👑 "
            return f"{crown}{name} ({c.points} pts)"
    return name


if __name__ == "__main__":
    print(Fore.GREEN + Style.BRIGHT + "Welcome to the Dance Competition!\n")
    lead_names = input("Enter lead names (comma-separated): ").split(",")
    follow_names = input("Enter follow names (comma-separated): ").split(",")
    guest_judges = input("Enter guest judge names (comma-separated): ").split(",")

    game = Game(lead_names, follow_names, guest_judges)

    # Main loop with option to end early
    while True:
        state = game.get_game_state()
        print_header(f"Round {state['round']}")
        print(
            f"Matchup 1: {format_contestant_with_points(state['pair_1'][0], game.leads+game.follows, game)} (Lead) & "
            f"{format_contestant_with_points(state['pair_1'][1], game.leads+game.follows, game)} (Follow)"
        )
        print(
            f"Matchup 2: {format_contestant_with_points(state['pair_2'][0], game.leads+game.follows, game)} (Lead) & "
            f"{format_contestant_with_points(state['pair_2'][1], game.leads+game.follows, game)} (Follow)"
        )
        print(f"Contestant Judges: {', '.join(state['contestant_judges'])}")

        # Vote Leads (compare pair_1[0] vs pair_2[0])
        votes = []
        print_header("Voting for Leads")
        lead1 = state["pair_1"][0]
        lead2 = state["pair_2"][0]
        for judge in game.guest_judges + state["contestant_judges"]:
            is_guest = judge in game.guest_judges
            decision = get_vote_input(judge, lead1, lead2, is_guest)
            votes.append((judge, decision))
        res_lead = game.judge_round(game.pair_1[0], game.pair_2[0], "lead", votes)
        print(Fore.GREEN + f"Winner: {res_lead['winner']}")
        print("Guest Votes:      ", ", ".join(res_lead["guest_votes"]) or "None")
        print("Contestant Votes:", ", ".join(res_lead["contestant_votes"]) or "None")

        # Vote Follows (compare pair_1[1] vs pair_2[1])
        votes = []
        print_header("Voting for Follows")
        follow1 = state["pair_1"][1]
        follow2 = state["pair_2"][1]
        for judge in game.guest_judges + state["contestant_judges"]:
            is_guest = judge in game.guest_judges
            decision = get_vote_input(judge, follow1, follow2, is_guest)
            votes.append((judge, decision))
        res_follow = game.judge_round(game.pair_1[1], game.pair_2[1], "follow", votes)
        print(Fore.GREEN + f"Winner: {res_follow['winner']}")
        print("Guest Votes:      ", ", ".join(res_follow["guest_votes"]) or "None")
        print("Contestant Votes:", ", ".join(res_follow["contestant_votes"]) or "None")

        # Win-check messages
        for msg in game.check_for_win() or []:
            print(Fore.YELLOW + msg)

        # Option to end battle early
        end_choice = input("\nEnd battle now? [y/N]: ")
        if end_choice.strip().lower().startswith("y") or game.is_finished():
            break

        game.next_round()

    # Final Results - Separate Leaderboards
    print_header("FINAL RESULTS")
    leads_sorted, follows_sorted = game.finalize_results()

    medals = ["🥇", "🥈", "🥉"]

    # Leads leaderboard
    print("\n" + "🟦" * 20)
    print(f"{Fore.BLUE}Top Leads:{Style.RESET_ALL}")
    print("🟦" * 20)
    for idx, lead in enumerate(leads_sorted):
        medal = medals[idx] if idx < len(medals) else ""
        crown = "👑 " if game.last_lead_winner == lead.name else ""
        print(f"{medal} {crown}{Fore.GREEN}{lead.name} ({lead.points})")

    # Follows leaderboard
    print("\n" + "🟪" * 20)
    print(f"{Fore.MAGENTA}Top Follows:{Style.RESET_ALL}")
    print("🟪" * 20)
    for idx, follow in enumerate(follows_sorted):
        medal = medals[idx] if idx < len(medals) else ""
        crown = "👑 " if game.last_follow_winner == follow.name else ""
        print(f"{medal} {crown}{Fore.CYAN}{follow.name} ({follow.points})")
