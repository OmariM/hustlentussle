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
    winning_lead = None
    winning_follow = None
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
        if not self.winning_lead or not self.winning_follow:
            return None

        result = []
        if self.winning_lead.points == self.total_num_leads - 1 and not self.has_winning_lead:
            self.has_winning_lead = True
            result.append(f"{self.winning_lead.name} has won for the leads!")

        if self.winning_follow.points == self.total_num_follows - 1 and not self.has_winning_follow:
            self.has_winning_follow = True
            result.append(f"{self.winning_follow.name} has won for the follows!")

        if self.has_winning_lead and self.has_winning_follow:
            self.state = 1

        return result

    def next_round(self):
        self.round_num += 1
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
            [judge.name for judge in self.contestant_judges]
        )

    def judge_round(self, contestant_1, contestant_2, role, votes):
        guest_votes = [decision for voter, decision in votes if voter in self.guest_judges]

        if guest_votes.count(3) == len(self.guest_judges):
            contestant_1.points += 1
            contestant_2.points += 1
            if role == "lead":
                self.winning_lead = contestant_1
            else:
                self.winning_follow = contestant_2
            return {"winner": contestant_1.name + " and " + contestant_2.name, "loser": None, "score": (1, 1)}

        if guest_votes.count(4) == len(self.guest_judges):
            if role == "lead":
                self.winning_lead = self.leads.pop(0)
            else:
                self.winning_follow = self.follows.pop(0)
            return {"winner": "No Contest", "loser": None, "score": (0, 0)}

        c1_score, c2_score = 0, 0
        for voter, decision in votes:
            is_guest = voter in self.guest_judges
            star = is_guest

            if decision == 1:
                c1_score += 2 if is_guest else 1
                self.add_vote(role, contestant_1, voter, star)
            elif decision == 2:
                c2_score += 2 if is_guest else 1
                self.add_vote(role, contestant_2, voter, star)
            elif decision == 3:
                if is_guest:
                    c1_score += 1
                    c2_score += 1
                    self.add_vote(role, contestant_1, voter, star)
                    self.add_vote(role, contestant_2, voter, star)

        return self.process_results(contestant_1, contestant_2, c1_score, c2_score, role)

    def add_vote(self, role, contestant, voter_name, star=False):
        entry = f"*{voter_name}*" if star else voter_name
        if role == "lead":
            self.current_round.lead_votes[contestant].append(entry)
        else:
            self.current_round.follow_votes[contestant].append(entry)

    def process_results(self, c1, c2, c1_score, c2_score, role):
        if role == "lead":
            self.winning_lead = c1 if c1_score >= c2_score else c2
            losing = c2 if c1_score >= c2_score else c1
            self.leads.append(losing)
            self.winning_lead.points += 1
        else:
            self.winning_follow = c1 if c1_score >= c2_score else c2
            losing = c2 if c1_score >= c2_score else c1
            self.follows.append(losing)
            self.winning_follow.points += 1

        return {
            "winner": self.winning_lead.name if role == "lead" else self.winning_follow.name,
            "loser": losing.name,
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
        self.leads.append(self.winning_lead)
        self.follows.append(self.winning_follow)

        self.leads.sort(key=lambda c: c.points, reverse=True)
        self.follows.sort(key=lambda c: c.points, reverse=True)

        return list(zip(self.leads, self.follows))

    def get_round_history(self):
        return self.rounds
