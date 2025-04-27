from game_logic import Game
from colorama import Fore, Style, init

init(autoreset=True)  # Colorama setup

def print_header(text):
    print(Fore.CYAN + Style.BRIGHT + f"\n===== {text} =====\n")

def get_vote_input(judge, option1, option2):
    while True:
        try:
            decision = int(input(f"{Fore.YELLOW}{judge}{Style.RESET_ALL} vote:\n [1] {option1}\n [2] {option2}\n [3] Tie\n [4] No Contest\nChoice: "))
            if decision in [1, 2, 3, 4]:
                return decision
            else:
                print(Fore.RED + "Invalid choice. Please enter 1, 2, 3, or 4.")
        except ValueError:
            print(Fore.RED + "Invalid input. Please enter a number.")

if __name__ == "__main__":
    print(Fore.GREEN + Style.BRIGHT + "Welcome to the Dance Competition!\n")

    lead_names = input("Enter lead names (comma-separated): ").split(",")
    follow_names = input("Enter follow names (comma-separated): ").split(",")
    guest_judge_names = input("Enter guest judge names (comma-separated): ").split(",")

    game = Game(lead_names, follow_names, guest_judge_names)

    while not game.is_finished():
        state = game.get_game_state()
        print_header(f"Round {state['round']}")
        print(f"{Fore.BLUE}Matchup 1:{Style.RESET_ALL} {state['pair_1'][0]} (Lead) & {state['pair_1'][1]} (Follow)")
        print(f"{Fore.BLUE}Matchup 2:{Style.RESET_ALL} {state['pair_2'][0]} (Lead) & {state['pair_2'][1]} (Follow)")
        print(f"{Fore.MAGENTA}Contestant Judges:{Style.RESET_ALL} {', '.join(state['contestant_judges'])}")

        votes = []
        print_header("Voting for Leads")
        for judge in game.guest_judges + state['contestant_judges']:
            decision = get_vote_input(judge, state['pair_1'][0], state['pair_2'][0])
            votes.append((judge, decision))

        result_leads = game.judge_round(game.pair_1[0], game.pair_2[0], "lead", votes)
        print(Fore.GREEN + f"Winner: {result_leads['winner']} beat {result_leads['loser']} {result_leads['score'][0]}-{result_leads['score'][1]}")

        votes = []
        print_header("Voting for Follows")
        for judge in game.guest_judges + state['contestant_judges']:
            decision = get_vote_input(judge, state['pair_1'][1], state['pair_2'][1])
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
    for lead, follow in final_pairs:
        print(f"{Fore.GREEN}{lead} {Style.RESET_ALL}- {Fore.CYAN}{follow}")

    print("\n" + Fore.MAGENTA + Style.BRIGHT + "===== Thank you for playing! =====")
