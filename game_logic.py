import random


class Contestant:
    def __init__(self, name) -> None:
        self.name = name
        self.points = 0

    def __str__(self) -> str:
        return f"{self.name} ({self.points})"


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
    tie_lead_pair = None
    tie_follow_pair = None

    has_winning_lead = False
    has_winning_follow = False

    def __init__(self, lead_names, follow_names, guest_judge_names) -> None:
        self.leads = [Contestant(name.strip()) for name in lead_names]
        self.follows = [Contestant(name.strip()) for name in follow_names]
        self.guest_judges = [name.strip() for name in guest_judge_names]

        # Track total counts for win conditions
        self.total_num_leads = len(self.leads)
        self.total_num_follows = len(self.follows)

        random.shuffle(self.leads)
        random.shuffle(self.follows)

        # Always start with Lead vs Follow pairs
        self.pair_1 = (self.leads.pop(0), self.follows.pop(0))
        self.pair_2 = (self.leads.pop(0), self.follows.pop(0))

        # Initialize win flags
        self.has_winning_lead = False
        self.has_winning_follow = False

        self.contestant_judges = self.get_contestant_judges()
        self.current_round = Round(
            self.round_num,
            {},
            {},  # votes initialized empty
            self.guest_judges,
            [judge.name for judge in self.contestant_judges],
        )

    def get_contestant_judges(self):
        eligible = self.leads + self.follows
        random.shuffle(eligible)
        return eligible[: self.num_contestant_judges]

    def next_round(self):
        self.round_num += 1
        self.rounds.append(self.current_round)

        # Determine next lead contestants
        if self.tie_lead_pair:
            lead1, lead2 = self.tie_lead_pair
            self.tie_lead_pair = None
        else:
            lead1 = self.winning_lead
            lead2 = self.leads.pop(0)

        # Determine next follow contestants
        if self.tie_follow_pair:
            follow1, follow2 = self.tie_follow_pair
            self.tie_follow_pair = None
        else:
            follow1 = self.follows.pop(0)
            follow2 = self.winning_follow

        # Form next round pairs (Lead, Follow)
        self.pair_1 = (lead1, follow1)
        self.pair_2 = (lead2, follow2)

        # Select contestant judges and reset round votes
        self.contestant_judges = self.get_contestant_judges()
        self.current_round = Round(
            self.round_num,
            {},
            {},
            self.guest_judges,
            [judge.name for judge in self.contestant_judges],
        )

    def judge_round(self, contestant_1, contestant_2, role, votes):
        guest_votes = [
            decision for voter, decision in votes if voter in self.guest_judges
        ]

        # Tie: both guest judges choose Tie
        if guest_votes.count(3) == len(self.guest_judges):
            contestant_1.points += 1
            contestant_2.points += 1
            if role == "lead":
                self.tie_lead_pair = (contestant_1, contestant_2)
            else:
                self.tie_follow_pair = (contestant_1, contestant_2)
            return {
                "winner": f"Tie between {contestant_1.name} and {contestant_2.name}",
                "guest_votes": [],
                "contestant_votes": [],
            }

        # No Contest: both guest judges choose No Contest
        if guest_votes.count(4) == len(self.guest_judges):
            if role == "lead":
                self.winning_lead = self.leads.pop(0)
            else:
                self.winning_follow = self.follows.pop(0)
            return {"winner": "No Contest", "guest_votes": [], "contestant_votes": []}

        # Normal voting
        c1_score = c2_score = 0
        for voter, decision in votes:
            is_guest = voter in self.guest_judges
            if decision == 1:
                c1_score += 2 if is_guest else 1
            elif decision == 2:
                c2_score += 2 if is_guest else 1
            elif decision == 3 and is_guest:
                c1_score += 1
                c2_score += 1

        return self.process_results(
            contestant_1, contestant_2, c1_score, c2_score, role, votes
        )

    def process_results(self, c1, c2, c1_score, c2_score, role, votes):
        # Determine winner and loser
        winner, loser = (c1, c2) if c1_score >= c2_score else (c2, c1)
        if role == "lead":
            self.winning_lead = winner
            self.leads.append(loser)
        else:
            self.winning_follow = winner
            self.follows.append(loser)
        winner.points += 1

        # Collect votes for winner
        guest_votes_for_winner = []
        contestant_votes_for_winner = []
        for voter, decision in votes:
            if (decision == 1 and winner == c1) or (decision == 2 and winner == c2):
                if voter in self.guest_judges:
                    guest_votes_for_winner.append(voter)
                else:
                    contestant_votes_for_winner.append(voter)

        return {
            "winner": winner.name,
            "guest_votes": guest_votes_for_winner,
            "contestant_votes": contestant_votes_for_winner,
        }

    def check_for_win(self):
        if not self.winning_lead or not self.winning_follow:
            return None

        result = []
        if (
            self.winning_lead.points == self.total_num_leads - 1
            and not self.has_winning_lead
        ):
            self.has_winning_lead = True
            result.append(f"{self.winning_lead.name} has won for the leads!")
        if (
            self.winning_follow.points == self.total_num_follows - 1
            and not self.has_winning_follow
        ):
            self.has_winning_follow = True
            result.append(f"{self.winning_follow.name} has won for the follows!")
        if self.has_winning_lead and self.has_winning_follow:
            self.state = 1
        return result

    def get_game_state(self):
        return {
            "round": self.round_num,
            "pair_1": (self.pair_1[0].name, self.pair_1[1].name),
            "pair_2": (self.pair_2[0].name, self.pair_2[1].name),
            "contestant_judges": [j.name for j in self.contestant_judges],
            "leads": [c.name for c in self.leads],
            "follows": [c.name for c in self.follows],
        }

    def is_finished(self):
        return self.state == 1

    def finalize_results(self):
        # Append final winners if missing
        if self.winning_lead and self.winning_lead not in self.leads:
            self.leads.append(self.winning_lead)
        if self.winning_follow and self.winning_follow not in self.follows:
            self.follows.append(self.winning_follow)

        # Sort separately by points
        self.leads.sort(key=lambda c: c.points, reverse=True)
        self.follows.sort(key=lambda c: c.points, reverse=True)

        # Return two separate leaderboards
        return self.leads, self.follows
