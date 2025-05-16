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
        self.win_messages = None  # Will store win messages for this round


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
        
        # Initialize tracking for winners with crown emojis
        self.last_lead_winner = None
        self.last_follow_winner = None

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
        """Prepare the game for the next round."""
        self.round_num += 1
        self.rounds.append(self.current_round)

        # Handle lead selection based on game state
        if self.has_winning_lead and not self.has_winning_follow:
            # Initial winning lead (with flags set) should go to the end of the queue
            if self.winning_lead and self.winning_lead.points >= self.total_num_leads - 1:
                self.leads.append(self.winning_lead)
                self.winning_lead = None
                
                # Select the next two leads from the queue
                lead1 = self.leads.pop(0)
                lead2 = self.leads.pop(0)
            elif self.tie_lead_pair:
                # Use the tied leads
                lead1, lead2 = self.tie_lead_pair
                self.tie_lead_pair = None
            elif self.winning_lead:
                # Regular round winner (after a role already has a winner)
                # stays in the competition
                lead1 = self.winning_lead
                self.winning_lead = None
                lead2 = self.leads.pop(0)
            else:
                # Regular selection
                lead1 = self.leads.pop(0)
                lead2 = self.leads.pop(0)
        elif self.tie_lead_pair:
            # Use the tied leads
            lead1, lead2 = self.tie_lead_pair
            self.tie_lead_pair = None
        else:
            # If there's a previous round winner for lead, use them in the next round
            # BUT only if that role doesn't already have an overall winner
            if self.winning_lead:
                lead1 = self.winning_lead
                self.winning_lead = None
                lead2 = self.leads.pop(0)
            else:
                # Regular selection
                lead1 = self.leads.pop(0)
                lead2 = self.leads.pop(0)

        # Handle follow selection based on game state
        if self.has_winning_follow and not self.has_winning_lead:
            # Initial winning follow (with flags set) should go to the end of the queue
            if self.winning_follow and self.winning_follow.points >= self.total_num_follows - 1:
                self.follows.append(self.winning_follow)
                self.winning_follow = None
                
                # Select the next two follows from the queue
                follow1 = self.follows.pop(0)
                follow2 = self.follows.pop(0)
            elif self.tie_follow_pair:
                # Use the tied follows
                follow1, follow2 = self.tie_follow_pair
                self.tie_follow_pair = None
            elif self.winning_follow:
                # Regular round winner (after a role already has a winner)
                # stays in the competition
                follow1 = self.winning_follow
                self.winning_follow = None
                follow2 = self.follows.pop(0)
            else:
                # Regular selection
                follow1 = self.follows.pop(0)
                follow2 = self.follows.pop(0)
        elif self.tie_follow_pair:
            # Use the tied follows
            follow1, follow2 = self.tie_follow_pair
            self.tie_follow_pair = None
        else:
            # If there's a previous round winner for follow, use them in the next round
            # BUT only if that role doesn't already have an overall winner
            if self.winning_follow:
                follow1 = self.winning_follow
                self.winning_follow = None
                follow2 = self.follows.pop(0)
            else:
                # Regular selection
                follow1 = self.follows.pop(0)
                follow2 = self.follows.pop(0)

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
            # No points awarded in case of a tie
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
        # Handle tie when scores are equal - first contestant (c1) wins in case of tie
        # EXCEPT if the tie is due to guest judges voting 3 (which is handled in judge_round)
        winner, loser = (c1, c2) if s1 >= s2 else (c2, c1)

        # Handle round winner based on role and whether that role already has a winner
        if role == "lead":
            if self.has_winning_lead:
                # If lead already has a winner, winner stays in the competition
                # and loser goes to the end of the queue
                self.leads.append(loser)
                # Store the round winner but don't mark as overall winner
                self.winning_lead = winner
            else:
                # Normal case - no winner for leads yet
                self.winning_lead = winner
                self.leads.append(loser)
                
                # Check if we've reached a win condition
                if winner.points + 1 >= self.total_num_leads - 1:
                    self.has_winning_lead = True
        else:  # Follow
            if self.has_winning_follow:
                # If follow already has a winner, winner stays in the competition
                # and loser goes to the end of the queue
                self.follows.append(loser)
                # Store the round winner but don't mark as overall winner
                self.winning_follow = winner
            else:
                # Normal case - no winner for follows yet
                self.winning_follow = winner
                self.follows.append(loser)
                
                # Check if we've reached a win condition
                if winner.points + 1 >= self.total_num_follows - 1:
                    self.has_winning_follow = True

        winner.points += 1

        gv = []
        cv = []
        for voter, decision in votes:
            if (decision == 1 and winner is c1) or (decision == 2 and winner is c2):
                (gv if voter in self.guest_judges else cv).append(voter)

        return {"winner": winner.name, "guest_votes": gv, "contestant_votes": cv}

    def check_for_win(self):
        """Generate win messages only for the first contestant to reach the winning threshold."""
        out = []
        
        # Generate win message for lead winner if it's a new winner
        # Only show the message if this is the first winner for leads
        if (self.has_winning_lead and self.winning_lead and 
            self.winning_lead.points >= self.total_num_leads - 1 and
            self.last_lead_winner is None):
            
            out.append(f"👑 {self.winning_lead.name} has won for the leads!")
            self.last_lead_winner = self.winning_lead.name
        
        # Generate win message for follow winner if it's a new winner
        # Only show the message if this is the first winner for follows
        if (self.has_winning_follow and self.winning_follow and 
            self.winning_follow.points >= self.total_num_follows - 1 and
            self.last_follow_winner is None):
            
            out.append(f"👑 {self.winning_follow.name} has won for the follows!")
            self.last_follow_winner = self.winning_follow.name

        # Only set game as finished if both roles have winners
        if self.has_winning_lead and self.has_winning_follow:
            self.state = 1
        
        # Store the win messages with the current round
        if hasattr(self, 'current_round'):
            self.current_round.win_messages = out if out else None
        
        return out if out else None

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
        # The game is finished when both roles have winners and state is set
        if self.has_winning_lead and self.has_winning_follow:
            self.state = 1
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

    def debug_state(self):
        """Print the current state of the game for debugging."""
        print("\n--- Game State ---")
        print(f"Round: {self.round_num}")
        print(f"Pair 1: {self.pair_1[0].name} (lead) vs {self.pair_1[1].name} (follow)")
        print(f"Pair 2: {self.pair_2[0].name} (lead) vs {self.pair_2[1].name} (follow)")
        print(f"Leads in queue: {[lead.name for lead in self.leads]}")
        print(f"Follows in queue: {[follow.name for follow in self.follows]}")
        print(f"Winning lead: {self.winning_lead.name if self.winning_lead else None}")
        print(f"Winning follow: {self.winning_follow.name if self.winning_follow else None}")
        print(f"Has winning lead: {self.has_winning_lead}")
        print(f"Has winning follow: {self.has_winning_follow}")
        print(f"Is finished: {self.is_finished()}")
        print("------------------\n")
