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
        self.leads = [Contestant(n.strip()) for n in lead_names]
        self.follows = [Contestant(n.strip()) for n in follow_names]
        self.guest_judges = [n.strip() for n in guest_judge_names]

        # Track totals for win condition
        self.total_num_leads = len(self.leads)
        self.total_num_follows = len(self.follows)

        random.shuffle(self.leads)
        random.shuffle(self.follows)

        # Always start with a Lead vs Follow pairing
        self.pair_1 = (self.leads.pop(0), self.follows.pop(0))
        self.pair_2 = (self.leads.pop(0), self.follows.pop(0))

        self.contestant_judges = self.get_contestant_judges()
        self.current_round = Round(
            self.round_num,
            {},
            {},
            self.guest_judges,
            [j.name for j in self.contestant_judges],
        )

    def get_contestant_judges(self):
        pool = self.leads + self.follows
        random.shuffle(pool)
        return pool[: self.num_contestant_judges]

    def next_round(self):
        self.round_num += 1
        self.rounds.append(self.current_round)

        # Check if we have a winner for leads but the game is not finished
        if self.has_winning_lead and not self.has_winning_follow:
            # Send the winning lead to the back of the queue
            self.leads.append(self.winning_lead)
            self.winning_lead = None
            
            # Select the next two leads from the queue
            lead1 = self.leads.pop(0)
            lead2 = self.leads.pop(0)
        # Normal lead selection
        elif self.tie_lead_pair:
            lead1, lead2 = self.tie_lead_pair
            self.tie_lead_pair = None
        else:
            lead1 = self.winning_lead
            lead2 = self.leads.pop(0)

        # Check if we have a winner for follows but the game is not finished
        if self.has_winning_follow and not self.has_winning_lead:
            # Send the winning follow to the back of the queue
            self.follows.append(self.winning_follow)
            self.winning_follow = None
            
            # Select the next two follows from the queue
            follow1 = self.follows.pop(0)
            follow2 = self.follows.pop(0)
        # Normal follow selection
        elif self.tie_follow_pair:
            follow1, follow2 = self.tie_follow_pair
            self.tie_follow_pair = None
        else:
            follow1 = self.follows.pop(0)
            follow2 = self.winning_follow

        # Form new Lead vs Follow pairs
        self.pair_1 = (lead1, follow1)
        self.pair_2 = (lead2, follow2)

        self.contestant_judges = self.get_contestant_judges()
        self.current_round = Round(
            self.round_num,
            {},
            {},
            self.guest_judges,
            [j.name for j in self.contestant_judges],
        )

    def judge_round(self, c1, c2, role, votes):
        guest_votes = [d for (v, d) in votes if v in self.guest_judges]

        # Tie: both guests vote 3
        if guest_votes.count(3) == len(self.guest_judges):
            c1.points += 1
            c2.points += 1
            if role == "lead":
                self.tie_lead_pair = (c1, c2)
            else:
                self.tie_follow_pair = (c1, c2)
            return {
                "winner": f"Tie between {c1.name} and {c2.name}",
                "guest_votes": [],
                "contestant_votes": [],
            }

        # No Contest: both guests vote 4
        if guest_votes.count(4) == len(self.guest_judges):
            if role == "lead":
                # enqueue old leads, select next
                self.leads.append(c1)
                self.leads.append(c2)
                self.winning_lead = self.leads.pop(0)
            else:
                self.follows.append(c1)
                self.follows.append(c2)
                self.winning_follow = self.follows.pop(0)
            return {"winner": "No Contest", "guest_votes": [], "contestant_votes": []}

        # Normal voting
        score1 = score2 = 0
        for voter, decision in votes:
            is_guest = voter in self.guest_judges
            if decision == 1:
                score1 += 2 if is_guest else 1
            elif decision == 2:
                score2 += 2 if is_guest else 1
            elif decision == 3 and is_guest:
                score1 += 1
                score2 += 1

        return self.process_results(c1, c2, score1, score2, role, votes)

    def process_results(self, c1, c2, s1, s2, role, votes):
        winner, loser = (c1, c2) if s1 >= s2 else (c2, c1)

        if role == "lead":
            self.winning_lead = winner
            self.leads.append(loser)
        else:
            self.winning_follow = winner
            self.follows.append(loser)

        winner.points += 1

        gv = []
        cv = []
        for voter, decision in votes:
            if (decision == 1 and winner is c1) or (decision == 2 and winner is c2):
                (gv if voter in self.guest_judges else cv).append(voter)

        return {"winner": winner.name, "guest_votes": gv, "contestant_votes": cv}

    def check_for_win(self):
        if not (self.winning_lead and self.winning_follow):
            return None

        out = []
        # Check if the lead has reached the winning score threshold
        if (
            not self.has_winning_lead
            and self.winning_lead.points == self.total_num_leads - 1
        ):
            self.has_winning_lead = True
            out.append(f"{self.winning_lead.name} has won for the leads!")
        
        # Check if the follow has reached the winning score threshold
        if (
            not self.has_winning_follow
            and self.winning_follow.points == self.total_num_follows - 1
        ):
            self.has_winning_follow = True
            out.append(f"{self.winning_follow.name} has won for the follows!")

        # Only set the game as finished if both leads and follows have winners
        if self.has_winning_lead and self.has_winning_follow:
            self.state = 1
        
        return out

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
        # Ensure final winners are in the lists
        if self.winning_lead not in self.leads:
            self.leads.append(self.winning_lead)
        if self.winning_follow not in self.follows:
            self.follows.append(self.winning_follow)

        # Sort each separately
        self.leads.sort(key=lambda c: c.points, reverse=True)
        self.follows.sort(key=lambda c: c.points, reverse=True)

        return self.leads, self.follows
