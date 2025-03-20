import random
from re import I

"""
ok so here's what i need
classes:
    - contestants
        - holds points
    - rounds
        variables:
        - know each side
        - judges
        - contestant judges
        functions:
        - increase contestant points

functions:
    - get constantant judges
    - get initial order

general order:
    1. SETUP
        1.1 set up initial order
    2. LOOP
        2.1 get contestants
        2.2 get contestant judges

Commonly used strings:
Leads -- Lesar, Omari, Logan, Shige, Rob, Ian, Billy, Gustavo
Follows -- Faustine, Reina, Christine, Val, Tati, Dainty Disco, Nonoko, Emma
Guest Judges -- Kenji, Diane

"""


class Contestant:
    def __init__(self, name) -> None:
        self.name = name
        self.points = 0

    def __str__(self) -> str:
        return f"{self.name}({self.points})"


class Round:
    def __init__(
        self, round_num, lead_votes, follow_votes, judges, contestant_judges
    ) -> None:
        self.round_num = round_num
        self.lead_votes = lead_votes
        self.follow_votes = follow_votes
        self.judges = judges
        self.contestant_judges = contestant_judges


class Game:
    state = 0
    round_num = 1
    current_round = None
    rounds = []
    contestant_judges = []
    num_contestant_judges = 3
    winning_lead = None
    winning_follow = None
    has_winning_lead = False
    has_winning_follow = False

    def __init__(self) -> None:
        self.leads = [
            Contestant(name.strip())
            for name in input(
                "Please enter the names of the leads separated by commas: "
            ).split(",")
        ]
        self.follows = [
            Contestant(name.strip())
            for name in input(
                "Please enter the names of the follows separated by commas: "
            ).split(",")
        ]
        self.guest_judges = [
            name.strip()
            for name in input(
                "Please enter the names of the guest judges separated by commas: "
            ).split(",")
        ]
        self.total_num_leads = len(self.leads)
        self.total_num_follows = len(self.follows)
        random.shuffle(self.leads)
        random.shuffle(self.follows)
        self.pair_1 = (self.leads.pop(0), self.follows.pop(0))
        self.pair_2 = (self.leads.pop(0), self.follows.pop(0))
        self.contestant_judges = self.get_contestant_judges()
        self.current_round = Round(
            self.round_num,
            {self.pair_1[0]: [], self.pair_2[0]: []},
            {self.pair_1[1]: [], self.pair_2[1]: []},
            self.guest_judges,
            [judge.name for judge in self.contestant_judges],
        )
        print_game_state(self)

    def get_contestant_judges(self):
        eligible_judges = self.leads + self.follows
        random.shuffle(eligible_judges)
        return eligible_judges[: self.num_contestant_judges]

    def check_for_win(self):
        if self.winning_lead == None or self.winning_follow == None:
            return
        if self.winning_lead.points == self.total_num_leads - 1:
            if self.has_winning_lead is False:
                print(f"{self.winning_lead.name} has won for the leads!")
                self.has_winning_lead = True
            if self.has_winning_follow:
                self.state = 1
        if self.winning_follow.points == self.total_num_follows - 1:
            if self.has_winning_follow is False:
                print(f"{self.winning_follow.name} has won for the follows!")
                self.has_winning_follow = True
            if self.has_winning_lead:
                self.state = 1

    def next_round(self):
        self.round_num = self.round_num + 1
        if self.state == 1:
            return
        self.pair_1 = (self.winning_lead, self.follows.pop(0))
        self.pair_2 = (self.leads.pop(0), self.winning_follow)
        self.contestant_judges = self.get_contestant_judges()
        self.rounds.append(self.current_round)
        self.current_round = Round(
            self.round_num,
            {self.pair_1[0]: [], self.pair_2[0]: []},
            {self.pair_1[1]: [], self.pair_2[1]: []},
            self.guest_judges,
            [judge.name for judge in self.contestant_judges],
        )

    def run(self):
        while self.state != 1:
            self.judge_leads()
            self.judge_follows()
            print_round(self.current_round)
            self.check_for_win()
            self.next_round()
            print_game_state(self)
        print(3 * "\n")
        print("Game finished!")
        if self.winning_lead == None or self.winning_follow == None:
            return
        self.leads.append(self.winning_lead)
        self.follows.append(self.winning_follow)
        print(3 * "\n")
        print(4 * "=" + "Results" + 4 * "=")
        self.leads = sorted(self.leads, key=lambda c: c.points, reverse=True)
        self.follows = sorted(self.follows, key=lambda c: c.points, reverse=True)
        for i in range(len(self.leads)):
            print(self.leads[i], self.follows[i])
        print(3 * "\n")
        print(4 * "=" + " Detailed Results " + 4 * "=")
        for round in self.rounds:
            print_round(round)

    def judge_round(self, contestant_1, contestant_2, lead_or_follow):
        contestant_1_name = contestant_1.name
        contestant_2_name = contestant_2.name
        contestant_1_score = 0
        contestant_2_score = 0
        for guest_judge in self.guest_judges:
            guest_judge_decision = int(
                input(
                    f"\n{guest_judge}, select your vote for the {lead_or_follow}s:\n[1] {contestant_1_name}\n[2] {contestant_2_name}\n[3] Tie ('open hands')\n[4] No contest ('crossed hands')\n"
                )
            )
            if guest_judge_decision == 1:
                contestant_1_score += 2
                if lead_or_follow == "lead":
                    self.current_round.lead_votes[contestant_1].append(
                        f"*{guest_judge}*"
                    )
                else:
                    self.current_round.follow_votes[contestant_1].append(
                        f"*{guest_judge}*"
                    )
            elif guest_judge_decision == 2:
                if lead_or_follow == "lead":
                    self.current_round.lead_votes[contestant_2].append(
                        f"*{guest_judge}*"
                    )
                else:
                    self.current_round.follow_votes[contestant_2].append(
                        f"*{guest_judge}*"
                    )
                contestant_2_score += 2
            elif guest_judge_decision == 3:
                if lead_or_follow == "lead":
                    self.current_round.lead_votes[contestant_1].append(
                        f"*{guest_judge}*"
                    )
                    self.current_round.lead_votes[contestant_2].append(
                        f"*{guest_judge}*"
                    )
                else:
                    self.current_round.follow_votes[contestant_1].append(
                        f"*{guest_judge}*"
                    )
                    self.current_round.follow_votes[contestant_2].append(
                        f"*{guest_judge}*"
                    )
                contestant_1_score += 1
                contestant_2_score += 1
            elif guest_judge_decision == 4:
                pass
        for contestant_judge in self.contestant_judges:
            contestant_judge_decision = int(
                input(
                    f"\n{contestant_judge.name}, select your vote the {lead_or_follow}s:\n[1] {contestant_1_name}\n[2] {contestant_2_name}\n"
                )
            )
            if contestant_judge_decision == 1:
                contestant_1_score += 1
                if lead_or_follow == "lead":
                    self.current_round.lead_votes[contestant_1].append(
                        f"{contestant_judge.name}"
                    )
                else:
                    self.current_round.follow_votes[contestant_1].append(
                        f"{contestant_judge.name}"
                    )
            elif contestant_judge_decision == 2:
                contestant_2_score += 1
                if lead_or_follow == "lead":
                    self.current_round.lead_votes[contestant_2].append(
                        f"{contestant_judge.name}"
                    )
                else:
                    self.current_round.follow_votes[contestant_2].append(
                        f"{contestant_judge.name}"
                    )

        # Currently we don't handle ties
        if lead_or_follow == "lead":
            losing_lead = None
            if contestant_1_score >= contestant_2_score:
                self.winning_lead = contestant_1
                losing_lead = contestant_2
            else:
                self.winning_lead = contestant_2
                losing_lead = contestant_1
            print(
                f"{self.winning_lead.name} beat {losing_lead.name}, {max(contestant_1_score, contestant_2_score)}-{min(contestant_1_score, contestant_2_score)}"
            )
            self.winning_lead.points += 1
            self.leads.append(losing_lead)
        elif lead_or_follow == "follow":
            losing_follow = None
            if contestant_1_score >= contestant_2_score:
                self.winning_follow = contestant_1
                losing_follow = contestant_2
            else:
                self.winning_follow = contestant_2
                losing_follow = contestant_1
            print(
                f"{self.winning_follow.name} beat {losing_follow}, {max(contestant_1_score, contestant_2_score)}-{min(contestant_1_score, contestant_2_score)}"
            )
            self.winning_follow.points += 1
            self.follows.append(losing_follow)

    def judge_leads(self):
        self.judge_round(self.pair_1[0], self.pair_2[0], "lead")

    def judge_follows(self):
        self.judge_round(self.pair_1[1], self.pair_2[1], "follow")


### DEBUGGING METHODS ###
def get_pair_string(pair):
    return f"{pair[0]} & {pair[1]}"


def get_contestant_names(contestants):
    return [contestant.name for contestant in contestants]


def print_game_state(game):
    print(3 * "\n")
    print(f"======= ROUND {game.round_num} =======")
    print(f"{get_pair_string(game.pair_1)} vs {get_pair_string(game.pair_2)}")
    print("==== CONTESTANT JUDGES ======")
    print(", ".join(get_contestant_names(game.contestant_judges)))
    print("========== LEADS ============")
    print(", ".join(get_contestant_names(game.leads)))
    print("========== FOLLOWS ==========")
    print(", ".join(get_contestant_names(game.follows)))
    print("=============================")


def print_round(round):
    print(3 * "\n")
    print(f"Round {round.round_num}")
    print(f"Lead votes:")
    print_votes_string(round.lead_votes)
    print(f"Follow votes:")
    print_votes_string(round.follow_votes)
    print(f"Guest Judges: {round.judges}")
    print(f"Contestant Judges: {round.contestant_judges}")


def print_votes_string(contestant_votes):
    for contestant, votes in contestant_votes.items():
        print(f"\t{contestant.name}: {str(votes)}")


######################


game = Game()
game.run()
