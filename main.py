import random

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
Leads -- Kenji, Omari, Logan, Shige, Rob, Ian, Billy, Gustavo
Follows -- Faustine, Reina, Christine, Val, Tati, Dainty Disco, Nonoko, Emma

"""


class Contestant:
    def __init__(self, name) -> None:
        self.name = name
        self.points = 0

    def __str__(self) -> str:
        return f"{self.name}({self.points})"


class Round:
    def __init__(self, round_num, leads, follows, judges, contestant_judges) -> None:
        self.round_num = round_num
        self.leads = leads
        self.follows = follows
        self.judges = judges
        self.contestant_judges = contestant_judges


class Game:
    state = 0
    round_num = 1
    current_round = None
    rounds = []
    contestant_judges = []
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
        self.guest_judges = input(
            "Please enter the names of the guest judges separated by commas: "
        ).split(",")
        self.total_num_leads = len(self.leads)
        self.total_num_follows = len(self.follows)
        random.shuffle(self.leads)
        random.shuffle(self.follows)
        self.pair_1 = (self.leads.pop(0), self.follows.pop(0))
        self.pair_2 = (self.leads.pop(0), self.follows.pop(0))
        self.contestant_judges = self.get_contestant_judges(2)
        self.current_round = Round(
            self.round_num,
            {self.pair_1[0]: [], self.pair_2[0]: []},
            {self.pair_1[1]: [], self.pair_2[1]: []},
            self.guest_judges,
            self.contestant_judges,
        )
        print_game_state(self)

    def get_contestant_judges(self, num):
        eligible_judges = self.leads + self.follows
        random.shuffle(eligible_judges)
        return eligible_judges[:num]

    def finish_round(self):
        winning_lead_num = input(
            f"Which lead did you prefer?\n[1] {self.pair_1[0].name}\n[2] {self.pair_2[0].name}\n"
        )
        self.winning_lead = (
            self.pair_1[0] if winning_lead_num == "1" else self.pair_2[0]
        )
        losing_lead = self.pair_1[0] if winning_lead_num == "2" else self.pair_2[0]
        self.winning_lead.points += 1
        self.leads.append(losing_lead)

        winning_follow_num = input(
            f"Which follow did you prefer?\n[1] {self.pair_1[1].name}\n[2] {self.pair_2[1].name}\n"
        )
        self.winning_follow = (
            self.pair_1[1] if winning_follow_num == "1" else self.pair_2[1]
        )
        losing_follow = self.pair_1[1] if winning_follow_num == "2" else self.pair_2[1]
        self.winning_follow.points += 1
        self.follows.append(losing_follow)

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
        self.contestant_judges = self.get_contestant_judges(2)

    def run(self):
        while self.state != 1:
            self.finish_round()
            self.next_round()
            print_game_state(self)
        print(3 * "\n")
        print("Game finished!")
        self.leads.append(self.winning_lead)
        self.follows.append(self.winning_follow)
        print(3 * "\n")
        print(4 * "=" + "Results" + 4 * "=")
        self.leads = sorted(self.leads, key=lambda c: c.points, reverse=True)
        self.follows = sorted(self.follows, key=lambda c: c.points, reverse=True)
        for i in range(len(self.leads)):
            print(self.leads[i], self.follows[i])


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


######################


game = Game()
game.run()
