import random


class Contestant:
    def __init__(self, name) -> None:
        self.name = name
        self.points = 0

    def __str__(self) -> str:
        return f"{self.name} ({self.points})"


class Round:
    def __init__(
        self, round_num, lead_votes, follow_votes, judges, contestant_judges, session_id
    ) -> None:
        self.round_num = round_num
        self.lead_votes = lead_votes
        self.follow_votes = follow_votes
        self.judges = judges
        self.contestant_judges = contestant_judges
        self.win_messages = None  # Will store win messages for this round
        self.pairs = {}  # Will store the pairs for this round
        self.lead_winner = None  # Will store the name of the lead winner
        self.follow_winner = None  # Will store the name of the follow winner
        self.song_info = None  # Will store song information for this round
        self.session_id = session_id  # Store the session ID for this round


class Game:
    state = 0
    
    def __init__(self, lead_names, follow_names, guest_judge_names) -> None:
        # Store the session ID
        self.session_id = None  # Will be set when the game is created
        
        # Initialize contestants
        self.leads = [Contestant(name) for name in lead_names]
        self.follows = [Contestant(name) for name in follow_names]
        
        # Store initial order
        self.initial_leads = self.leads.copy()
        self.initial_follows = self.follows.copy()
        
        # Initialize judges
        self.guest_judges = guest_judge_names
        self.contestant_judges = []
        
        # Initialize game state
        self.round_num = 1
        self.pair_1 = None
        self.pair_2 = None
        self.rounds = []
        self.current_round = None
        
        # Initialize winning state
        self.winning_lead = None
        self.winning_follow = None
        self.has_winning_lead = False
        self.has_winning_follow = False
        self.last_lead_winner = None
        self.last_follow_winner = None
        
        # Initialize tie state
        self.tie_lead_pair = None
        self.tie_follow_pair = None
        
        # Initialize previous pairs tracking
        self.previous_pairs = {}
        
        # Calculate total number of contestants
        self.total_num_leads = len(self.leads)
        self.total_num_follows = len(self.follows)
        
        # Calculate number of contestant judges needed - always use 3 if possible
        self.num_contestant_judges = min(3, len(self.leads) + len(self.follows) - 4)
        
        # Start the first round
        self.start_round()
        
    def start_round(self):
        """Start a new round by selecting pairs and contestant judges."""
        # Select contestant judges
        self.contestant_judges = self.get_contestant_judges()
        
        # Select pairs
        self.pair_1 = (self.leads.pop(0), self.follows.pop(0))
        self.pair_2 = (self.leads.pop(0), self.follows.pop(0))
        
        # Create new round
        self.current_round = Round(
            self.round_num,
            {},
            {},
            self.guest_judges,
            [j.name for j in self.contestant_judges],
            self.session_id
        )
        
        # Store the pairs for this round
        self.current_round.pairs = {
            "pair_1": {
                "lead": self.pair_1[0].name,
                "follow": self.pair_1[1].name
            },
            "pair_2": {
                "lead": self.pair_2[0].name,
                "follow": self.pair_2[1].name
            }
        }

    def get_contestant_judges(self):
        pool = self.leads + self.follows
        random.shuffle(pool)
        return pool[: self.num_contestant_judges]

    def next_round(self):
        """Prepare the game for the next round."""
        self.round_num += 1
        self.rounds.append(self.current_round)

        # Store current follows if we have a follow tie
        current_follows = None
        if self.tie_follow_pair:
            current_follows = (self.pair_1[1], self.pair_2[1])
            self.tie_follow_pair = None

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
            elif current_follows:  # If we have a follow tie, keep the same follows
                follow1, follow2 = current_follows
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
        elif current_follows:  # If we have a follow tie, keep the same follows
            follow1, follow2 = current_follows
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

        # When there's a follow tie, we need to ensure the couples are different
        if current_follows:
            # Get the winning lead and next lead from queue
            winning_lead = lead1 if lead1.name == self.last_lead_winner else lead2
            next_lead = lead2 if lead1.name == self.last_lead_winner else lead1
            
            # Get the previous pairs for comparison
            prev_pair1 = (self.pair_1[0].name, self.pair_1[1].name)
            prev_pair2 = (self.pair_2[0].name, self.pair_2[1].name)
            
            # Try different combinations until we find one that doesn't match previous pairs
            if (winning_lead.name, follow1.name) == prev_pair1 or (winning_lead.name, follow1.name) == prev_pair2:
                # If winning lead with follow1 would recreate a previous pair, swap follows
                follow1, follow2 = follow2, follow1
            
            # Set the pairs
            self.pair_1 = (winning_lead, follow1)
            self.pair_2 = (next_lead, follow2)
        else:
            # Ensure no contestant gets the same partner in consecutive rounds
            # This applies to both tie and non-tie situations
            if (self.tie_lead_pair is None and self.tie_follow_pair is None and 
                (lead1, lead2) != (None, None) and (follow1, follow2) != (None, None)):
                
                # Check if the default pairing would recreate previous pairs
                pairing_1 = (lead1.name, follow1.name)
                pairing_2 = (lead2.name, follow2.name)
                
                # If either pairing already exists in previous_pairs, swap follows
                if pairing_1 in self.previous_pairs or pairing_2 in self.previous_pairs:
                    # Swap follows to avoid repeat pairings
                    follow1, follow2 = follow2, follow1
                
                # Prevent pairing two winning contestants together
                # Check if both lead1 and follow1 were winners in the last round
                if (self.last_lead_winner == lead1.name and self.last_follow_winner == follow1.name):
                    # Swap follows to prevent winners being paired
                    follow1, follow2 = follow2, follow1
                # Check if both lead2 and follow2 were winners in the last round
                elif (self.last_lead_winner == lead2.name and self.last_follow_winner == follow2.name):
                    # Swap follows to prevent winners being paired
                    follow1, follow2 = follow2, follow1

            # Form new Lead vs Follow pairs
            self.pair_1 = (lead1, follow1)
            self.pair_2 = (lead2, follow2)
        
        # Clear previous pairings since we only care about consecutive rounds
        self.previous_pairs = {}
        
        # Record new pairings for next round
        self._record_pairings()

        self.contestant_judges = self.get_contestant_judges()
        self.current_round = Round(
            self.round_num,
            {},
            {},
            self.guest_judges,
            [j.name for j in self.contestant_judges],
            self.session_id
        )
        
        # Store the pairs for this round
        self.current_round.pairs = {
            "pair_1": {
                "lead": self.pair_1[0].name,
                "follow": self.pair_1[1].name
            },
            "pair_2": {
                "lead": self.pair_2[0].name,
                "follow": self.pair_2[1].name
            }
        }

    def judge_round(self, c1, c2, role, votes):
        guest_votes = [d for (v, d) in votes if v in self.guest_judges]

        # Store votes in the current round
        vote_dict = {}
        for voter, decision in votes:
            vote_dict[voter] = decision
            
        if role == "lead":
            self.current_round.lead_votes = vote_dict
        else:
            self.current_round.follow_votes = vote_dict

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
            
            # Track the lead winner for this round to prevent pairing with follow winner
            self.last_lead_winner = winner.name
            # Also store the lead winner in the current round
            self.current_round.lead_winner = winner.name
            
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
            
            # Track the follow winner for this round to prevent pairing with lead winner
            self.last_follow_winner = winner.name
            # Also store the follow winner in the current round
            self.current_round.follow_winner = winner.name

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
        
        # Generate win message for lead winner if they've reached the winning threshold
        # Only show the message if this is the first winner for leads
        if (self.has_winning_lead and self.winning_lead and 
            self.winning_lead.points >= self.total_num_leads - 1):
            
            # Only add crown message if we haven't already shown a crown message for this role
            win_message = f"👑 {self.winning_lead.name} has won for the leads!"
            
            # Check if we've seen this message in any previous rounds
            is_new_crown = True
            for r in self.rounds:
                if r.win_messages and any("👑" in msg and "leads" in msg for msg in r.win_messages):
                    is_new_crown = False
                    break
                    
            if is_new_crown:
                out.append(win_message)
        
        # Generate win message for follow winner if they've reached the winning threshold
        # Only show the message if this is the first winner for follows
        if (self.has_winning_follow and self.winning_follow and 
            self.winning_follow.points >= self.total_num_follows - 1):
            
            # Only add crown message if we haven't already shown a crown message for this role
            win_message = f"👑 {self.winning_follow.name} has won for the follows!"
            
            # Check if we've seen this message in any previous rounds
            is_new_crown = True
            for r in self.rounds:
                if r.win_messages and any("👑" in msg and "follows" in msg for msg in r.win_messages):
                    is_new_crown = False
                    break
                    
            if is_new_crown:
                out.append(win_message)

        # Only set game as finished if both roles have winners
        if self.has_winning_lead and self.has_winning_follow:
            self.state = 1
        
        # Store win messages in the current round
        if out:
            self.current_round.win_messages = out
        
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
        if self.winning_lead and self.winning_lead not in self.leads:
            self.leads.append(self.winning_lead)
        if self.winning_follow and self.winning_follow not in self.follows:
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

    def _record_pairings(self):
        # Record initial pairings
        self.previous_pairs[(self.pair_1[0].name, self.pair_1[1].name)] = True
        self.previous_pairs[(self.pair_2[0].name, self.pair_2[1].name)] = True
