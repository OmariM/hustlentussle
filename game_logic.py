import random

class Contestant:
    def __init__(self, name) -> None:
        self.name = name
        self.points = 0

    def __str__(self) -> str:
        return f"{self.name} ({self.points})"

class Round:
    def __init__(self, round_num, lead_votes, follow_votes, judges, contestant_judges) -> None:
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
    winning_leads = []
    winning_follows = []
    has_winning_lead = False
    has_winning_follow = False

    def __init__(self, lead_names, follow_names, guest_judge_names) -> None:
        self.leads = [Contestant(name.strip()) for name in lead_names]
        self.follows = [Contestant(name.strip()) for name in follow_names]
        self.guest_judges = [name.strip() for name in guest_judge_names]

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
            [judge.name for judge in self.contestant_judges]
        )

    def get_contestant_judges(self):
        eligible = self.leads + self.follows
        random.shuffle(eligible)
        return eligible[:self.num_contestant_judges]

    def check_for_win(self):
        if not self.winning_leads or not self.winning_follows:
            return None

        result = []
        if self.winning_leads[0].points == self.total_num_leads - 1 and not self.has_winning_lead:
            self.has_winning_lead = True
            result.append(f"{self.winning_leads[0].name} has won for the leads!")

        if self.winning_follows[0].points == self.total_num_follows - 1 and not self.has_winning_follow:
            self.has_winning_follow = True
            result.append(f"{self.winning_follows[0].name} has won for the follows!")

        if self.has_winning_lead and self.has_winning_follow:
            self.state = 1

        return result

    def next_round(self):
        self.round_num += 1
        if self.state == 1:
            return

        self.pair_1 = (self.winning_leads.pop(0), self.follows.pop(0))
        self.pair_2 = (self.leads.pop(0), self.winning_follows.pop(0))

        self.contestant_judges = self.get_contestant_judges()
        self.rounds.append(self.current_round)

        self.current_round = Round(
            self.round_num,
            {self.pair_1[0]: [], self.pair_2[0]: []},
            {self.pair_1[1]: [], self.pair_2[1]: []},
            self.guest_judges,
            [judge.name for judge in self.contestant_judges]
        )

    def judge_round(self, contestant_1, contestant_2, role, votes):
        guest_votes = [decision for voter, decision in votes if voter in self.guest_judges]

        if guest_votes.count(3) == len(self.guest_judges):  # Tie condition
            contestant_1.points += 1
            contestant_2.points += 1
            if role == "lead":
                self.winning_leads = [contestant_1, contestant_2]
            else:
                self.winning_follows = [contestant_1, contestant_2]
            return {"winner": f"Tie between {contestant_1.name} and {contestant_2.name}", "loser": None, "score": (1, 1)}

        if guest_votes.count(4) == len(self.guest_judges):  # No Contest condition
            if role == "lead":
                self.winning_leads = [self.leads.pop(0)]
            else:
                self.winning_follows = [self.follows.pop(0)]
            return {"winner": "No Contest", "loser": None, "score": (0, 0)}

        # Normal voting
        c1_score, c2_score = 0, 0
        for voter, decision in votes:
            is_guest = voter in self.guest_judges
            if decision == 1:
                c1_score += 2 if is_guest else 1
            elif decision == 2:
                c2_score += 2 if is_guest else 1
            elif decision == 3 and is_guest:
                c1_score += 1
                c2_score += 1

        return self.process_results(contestant_1, contestant_2, c1_score, c2_score, role)

    def process_results(self, c1, c2, c1_score, c2_score, role):
        if role == "lead":
            winner = c1 if c1_score >= c2_score else c2
            loser = c2 if c1_score >= c2_score else c1
            self.winning_leads = [winner]
            self.leads.append(loser)
            winner.points += 1
        else:
            winner = c1 if c1_score >= c2_score else c2
            loser = c2 if c1_score >= c2_score else c1
            self.winning_follows = [winner]
            self.follows.append(loser)
            winner.points += 1

        return {
            "winner": winner.name,
            "loser": loser.name,
            "score": (max(c1_score, c2_score), min(c1_score, c2_score))
        }

    def get_game_state(self):
        return {
            "round": self.round_num,
            "pair_1": (self.pair_1[0].name, self.pair_1[1].name),
            "pair_2": (self.pair_2[0].name, self.pair_2[1].name),
            "contestant_judges": [judge.name for judge in self.contestant_judges],
            "leads": [c.name for c in self.leads],
            "follows": [c.name for c in self.follows],
        }

    def get_current_round(self):
        return self.current_round

    def is_finished(self):
        return self.state == 1

    def finalize_results(self):
        self.leads.extend(self.winning_leads)
        self.follows.extend(self.winning_follows)

        self.leads.sort(key=lambda c: c.points, reverse=True)
        self.follows.sort(key=lambda c: c.points, reverse=True)

        return list(zip(self.leads, self.follows))

    def get_round_history(self):
        return self.rounds
