from game_logic import Game
from colorama import Fore, Style, init
import random

init(autoreset=True)  # Colorama setup

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

            if (is_guest and decision in [1, 2, 3, 4]) or (not is_guest and decision in [1, 2]):
                return decision
            else:
                print(Fore.RED + "Invalid choice. Please enter a valid option.")
        except ValueError:
            print(Fore.RED + "Invalid input. Please enter a number.")

def format_contestant_with_points(name, contestants):
    for c in contestants:
        if c.name == name:
            return f"{name} ({c.points})"
    return name

if __name__ == "__main__":
    print(Fore.GREEN + Style.BRIGHT + "Welcome to the Dance Competition!\n")

    lead_names = input("Enter lead names (comma-separated): ").split(",")
    follow_names = input("Enter follow names (comma-separated): ").split(",")
    guest_judge_names = input("Enter guest judge names (comma-separated): ").split(",")

    game = Game(lead_names, follow_names, guest_judge_names)

    while not game.is_finished():
        state = game.get_game_state()
        print_header(f"Round {state['round']}")
        print(f"{Fore.BLUE}Matchup 1:{Style.RESET_ALL} {format_contestant_with_points(state['pair_1'][0], game.leads)} (Lead) & {format_contestant_with_points(state['pair_1'][1], game.follows)} (Follow)")
        print(f"{Fore.BLUE}Matchup 2:{Style.RESET_ALL} {format_contestant_with_points(state['pair_2'][0], game.leads)} (Lead) & {format_contestant_with_points(state['pair_2'][1], game.follows)} (Follow)")
        print(f"{Fore.MAGENTA}Contestant Judges:{Style.RESET_ALL} {', '.join(state['contestant_judges'])}")

        votes = []
        print_header("Voting for Leads")
        for judge in game.guest_judges + state['contestant_judges']:
            is_guest = judge in game.guest_judges
            decision = get_vote_input(judge, state['pair_1'][0], state['pair_2'][0], is_guest)
            votes.append((judge, decision))

        result_leads = game.judge_round(game.pair_1[0], game.pair_2[0], "lead", votes)
        print(Fore.GREEN + f"Winner: {result_leads['winner']} beat {result_leads['loser']} {result_leads['score'][0]}-{result_leads['score'][1]}")

        votes = []
        print_header("Voting for Follows")
        for judge in game.guest_judges + state['contestant_judges']:
            is_guest = judge in game.guest_judges
            decision = get_vote_input(judge, state['pair_1'][1], state['pair_2'][1], is_guest)
            votes.append((judge, decision))

        result_follows = game.judge_round(game.pair_1[1], game.pair_2[1], "follow", votes)
        print(Fore.GREEN + f"Winner: {result_follows['winner']} beat {result_follows['loser']} {result_follows['score'][0]}-{result_follows['score'][1]}")

        win_messages = game.check_for_win()
        if win_messages:
            for msg in win_messages:
                print(Fore.YELLOW + f"\n{msg}")

        game.next_round()

    print_header("FINAL RESULTS")
    final_pairs = game.finalize_results()

    sorted_leads = sorted([lead for lead, _ in final_pairs], key=lambda l: l.points, reverse=True)
    sorted_follows = sorted([follow for _, follow in final_pairs], key=lambda f: f.points, reverse=True)

    medals = ["🥇", "🥈", "🥉"]

    print("\n" + "🟦" * 20)
    print(f"{Fore.BLUE}Top Leads:{Style.RESET_ALL}")
    print("🟦" * 20)
    for idx, lead in enumerate(sorted_leads):
        medal = medals[idx] if idx < len(medals) else ""
        print(f"{medal} {Fore.GREEN}{lead.name} ({lead.points})")

    print("\n" + "🟪" * 20)
    print(f"{Fore.MAGENTA}Top Follows:{Style.RESET_ALL}")
    print("🟪" * 20)
    for idx, follow in enumerate(sorted_follows):
        medal = medals[idx] if idx < len(medals) else ""
        print(f"{medal} {Fore.CYAN}{follow.name} ({follow.points})")

    print("\n" + Fore.MAGENTA + Style.BRIGHT + "===== Thank you for playing! =====")
