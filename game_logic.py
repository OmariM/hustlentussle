import random


class Contestant:
    def __init__(self, name) -> None:
        self.name = name
        self.points = 0

    def __str__(self) -> str:
        return f"{self.name} ({self.points})"


class Round:
    def __init__(
        self,
        round_num,
        lead_votes,
        follow_votes,
        judges,
        contestant_judges,
        session_id,
        *,
        contestant_judging_enabled: bool = True,
        simple_contestant_judges: bool = False,
    ) -> None:
        self.round_num = round_num
        self.lead_votes = lead_votes
        self.follow_votes = follow_votes
        self.judges = judges
        self.contestant_judges = contestant_judges
        self.contestant_judging_enabled = contestant_judging_enabled
        self.simple_contestant_judges = simple_contestant_judges
        self.win_messages = None  # Will store win messages for this round
        self.pairs = {}  # Will store the pairs for this round
        self.lead_winner = None  # Will store the name of the lead winner
        self.follow_winner = None  # Will store the name of the follow winner
        self.song_info = None  # Will store song information for this round
        self.session_id = session_id  # Store the session ID for this round
        # Queue state snapshot for undo functionality
        self.queue_snapshot = None  # Will store {'leads': [...], 'follows': [...]} names


class ContestantQueueProxy:
    """A proxy around the underlying contestant list that:
    - Iterates without current competitors (so validators don't see them in queue)
    - Preserves len() and membership semantics for tests expecting immediate enqueue
    - Delegates list mutation methods to the backing list
    """

    def __init__(self, game, role: str):
        self._game = game
        self._role = role  # 'lead' or 'follow'

    def _backing(self):
        return self._game._leads if self._role == "lead" else self._game._follows

    def _filtered_names(self):
        names = set()
        if self._game.pair_1 is not None and self._game.pair_2 is not None:
            if self._role == "lead":
                names.add(self._game.pair_1[0].name)
                names.add(self._game.pair_2[0].name)
            else:
                names.add(self._game.pair_1[1].name)
                names.add(self._game.pair_2[1].name)
        return names

    # Iteration hides current competitors
    def __iter__(self):
        filtered = self._filtered_names()
        for item in self._backing():
            if item.name not in filtered:
                yield item

    # Length reflects actual queue storage (including competitors appended immediately)
    def __len__(self):
        return len(self._backing())

    # Membership tests use object identity in backing list
    def __contains__(self, item):
        return item in self._backing()

    # Indexing delegates
    def __getitem__(self, idx):
        return self._backing()[idx]

    def __setitem__(self, idx, value):
        self._backing()[idx] = value

    # Mutation methods delegate to backing list
    def append(self, item):
        return self._backing().append(item)

    def extend(self, items):
        return self._backing().extend(items)

    def insert(self, idx, item):
        return self._backing().insert(idx, item)

    def pop(self, idx=-1):
        return self._backing().pop(idx)

    def remove(self, item):
        return self._backing().remove(item)

    def clear(self):
        return self._backing().clear()

    def index(self, item, *args):
        return self._backing().index(item, *args)

    def count(self, item):
        return self._backing().count(item)

    def __repr__(self):
        return repr(list(iter(self)))


class Game:
    state = 0

    def __init__(
        self,
        lead_names,
        follow_names,
        guest_judge_names,
        *,
        contestant_judging_enabled: bool = True,
        simple_contestant_judges: bool = False,
        num_contestant_judges: int = None,
        points_to_win: int = None,
    ) -> None:
        # Store the session ID
        self.session_id = None  # Will be set when the game is created

        # Initialize contestants (backing lists)
        self._leads = [Contestant(name) for name in lead_names]
        self._follows = [Contestant(name) for name in follow_names]

        # Public queue proxies (hide current competitors from iteration)
        self.leads = ContestantQueueProxy(self, "lead")
        self.follows = ContestantQueueProxy(self, "follow")

        # Store initial order
        self.initial_leads = self._leads.copy()
        self.initial_follows = self._follows.copy()

        # Initialize judges
        self.guest_judges = guest_judge_names
        self.contestant_judges = []
        self.contestant_judging_enabled = bool(contestant_judging_enabled)
        self.simple_contestant_judges = bool(simple_contestant_judges) if self.contestant_judging_enabled else False

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

        # Tie-break mode state
        self.tiebreak_active = False
        self.tiebreak_lead_needed = False
        self.tiebreak_follow_needed = False
        self.tiebreak_leads_tied = []        # list of Contestant objects
        self.tiebreak_follows_tied = []      # list of Contestant objects
        self.tiebreak_sub_round = 0          # 0=setup, 1=sr1, 2=sr2, 3=voting
        self.tiebreak_sub_round_1_pairings = []  # list of (lead_name, follow_name)
        self.tiebreak_sub_round_2_pairings = []
        self.tiebreak_lead_winner = None     # Contestant object
        self.tiebreak_follow_winner = None   # Contestant object

        # Initialize previous pairs tracking
        self.previous_pairs = {}

        # Calculate total number of contestants
        self.total_num_leads = len(self._leads)
        self.total_num_follows = len(self._follows)

        # Calculate auto win threshold (for reference)
        self.auto_win_threshold = max(self.total_num_leads, self.total_num_follows) - 1

        # Track whether threshold was explicitly provided
        self.custom_threshold = points_to_win is not None

        # Set win threshold: use provided value, or default to 7
        if points_to_win is not None:
            self.win_threshold = points_to_win
        else:
            self.win_threshold = 7

        # Calculate expected contestant judges (1 more than guest judges)
        self.expected_contestant_judges = len(guest_judge_names) + 1

        # Calculate number of contestant judges
        available_for_judging = len(self._leads) + len(self._follows) - 4
        if not self.contestant_judging_enabled:
            self.num_contestant_judges = 0
        elif num_contestant_judges is not None:
            # Use custom value if provided
            self.num_contestant_judges = num_contestant_judges
        else:
            # Default: 1 more than guest judges, but limited by available contestants
            default_num = self.expected_contestant_judges
            self.num_contestant_judges = max(0, min(default_num, available_for_judging))

        # Pending queue updates (applied at round transition)
        self._pending_leads_enqueue = []
        self._pending_follows_enqueue = []

        # Special transition flags
        self.no_contest_pending = False

        # Carryover round winners (used when role already has overall winner)
        self.carryover_lead_winner = None
        self.carryover_follow_winner = None

        # Start the first round
        self.start_round()

    def start_round(self):
        """Start a new round by selecting pairs and contestant judges."""
        # Handle cases with insufficient contestants gracefully
        if len(self._leads) < 2 or len(self._follows) < 2:
            # Form pairs without popping to avoid index errors
            lead1 = self._leads[0] if self._leads else None
            lead2 = self._leads[1] if len(self._leads) > 1 else (self._leads[0] if self._leads else None)
            follow1 = self._follows[0] if self._follows else None
            follow2 = self._follows[1] if len(self._follows) > 1 else (self._follows[0] if self._follows else None)

            # If we still don't have valid contestants, create dummy placeholders to avoid crashes
            if not lead1:
                lead1 = Contestant("LeadPlaceholder")
            if not lead2:
                lead2 = lead1
            if not follow1:
                follow1 = Contestant("FollowPlaceholder")
            if not follow2:
                follow2 = follow1

            self.pair_1 = (lead1, follow1)
            self.pair_2 = (lead2, follow2)

            # With insufficient contestants, no contestant judges
            self.contestant_judges = []

            # Create new round
            self.current_round = Round(
                self.round_num,
                {},
                {},
                self.guest_judges,
                [j.name for j in self.contestant_judges],
                self.session_id,
                contestant_judging_enabled=self.contestant_judging_enabled,
                simple_contestant_judges=self.simple_contestant_judges,
            )

            # Store the pairs for this round
            self.current_round.pairs = {
                "pair_1": {"lead": self.pair_1[0].name, "follow": self.pair_1[1].name},
                "pair_2": {"lead": self.pair_2[0].name, "follow": self.pair_2[1].name},
            }

            # Save queue snapshot for undo functionality
            self.current_round.queue_snapshot = {
                "leads": [l.name for l in self._leads],
                "follows": [f.name for f in self._follows],
            }

            # Mark game as finished when either role has fewer than 2 contestants overall
            if self.total_num_leads < 2 or self.total_num_follows < 2:
                self.state = 1
            return

        # Select pairs first
        self.pair_1 = (self._leads.pop(0), self._follows.pop(0))
        self.pair_2 = (self._leads.pop(0), self._follows.pop(0))

        # Select contestant judges from remaining pool (exclude competitors)
        self.contestant_judges = self.get_contestant_judges()

        # Create new round
        self.current_round = Round(
            self.round_num,
            {},
            {},
            self.guest_judges,
            [j.name for j in self.contestant_judges],
            self.session_id,
            contestant_judging_enabled=self.contestant_judging_enabled,
            simple_contestant_judges=self.simple_contestant_judges,
        )

        # Store the pairs for this round
        self.current_round.pairs = {
            "pair_1": {"lead": self.pair_1[0].name, "follow": self.pair_1[1].name},
            "pair_2": {"lead": self.pair_2[0].name, "follow": self.pair_2[1].name},
        }

        # Save queue snapshot for undo functionality
        self.current_round.queue_snapshot = {
            "leads": [l.name for l in self._leads],
            "follows": [f.name for f in self._follows],
        }

    def get_contestant_judges(self):
        if not self.contestant_judging_enabled:
            return []
        # Pool is remaining contestants in queues only (competitors already popped)
        pool = list(self.leads) + list(self.follows)
        if self.num_contestant_judges <= 0 or not pool:
            return []
        random.shuffle(pool)
        take = min(self.num_contestant_judges, len(pool))
        return pool[:take]

    def _apply_pending_queue_updates(self):
        """Apply any pending enqueue operations collected during judging."""
        if self._pending_leads_enqueue:
            for contestant in self._pending_leads_enqueue:
                if contestant not in self._leads:
                    self._leads.append(contestant)
            self._pending_leads_enqueue = []
        if self._pending_follows_enqueue:
            for contestant in self._pending_follows_enqueue:
                if contestant not in self._follows:
                    self._follows.append(contestant)
            self._pending_follows_enqueue = []

    def next_round(self):
        """Prepare the game for the next round."""
        # If game is finished, do nothing
        if self.is_finished():
            return

        # If either role has fewer than 2 total contestants, mark finished and stop
        if self.total_num_leads < 2 or self.total_num_follows < 2:
            self.state = 1
            return

        self.round_num += 1
        self.rounds.append(self.current_round)

        # Apply any pending queue updates from judging before selecting new pairs
        self._apply_pending_queue_updates()
        # Clear special transition flags
        self.no_contest_pending = False

        # Replenish leads if we're running low
        if len(self._leads) < 2:
            if self.total_num_leads <= 2:
                for lead in self.initial_leads:
                    if lead not in self._leads:
                        self._leads.append(lead)
            else:
                # Add all leads back to the queue except the current competing leads
                competing_leads = {self.pair_1[0].name, self.pair_2[0].name}
                for lead in self.initial_leads:
                    if lead.name not in competing_leads and lead not in self._leads:
                        self._leads.append(lead)

        # Replenish follows if we're running low
        if len(self._follows) < 2:
            if self.total_num_follows <= 2:
                for follow in self.initial_follows:
                    if follow not in self._follows:
                        self._follows.append(follow)
            else:
                # Add all follows back to the queue except the current competing follows
                competing_follows = {self.pair_1[1].name, self.pair_2[1].name}
                for follow in self.initial_follows:
                    if follow.name not in competing_follows and follow not in self._follows:
                        self._follows.append(follow)

        # Store current follows if we have a follow tie
        current_follows = None
        if self.tie_follow_pair:
            current_follows = (self.pair_1[1], self.pair_2[1])
            self.tie_follow_pair = None

        # Handle lead selection based on game state
        if self.has_winning_lead and not self.has_winning_follow:
            # Initial winning lead (with flags set) should go to the end of the queue
            if self.winning_lead and self.winning_lead.points >= self.win_threshold:
                self._leads.append(self.winning_lead)
                self.winning_lead = None

                # Select the next two leads from the queue
                if len(self._leads) < 2:
                    # Replenish from initial if needed
                    for lead in self.initial_leads:
                        if lead not in self._leads and lead.name not in {self.pair_1[0].name, self.pair_2[0].name}:
                            self._leads.append(lead)
                lead1 = self._leads.pop(0)
                lead2 = self._leads.pop(0)
            elif self.tie_lead_pair:
                # Use the tied leads
                lead1, lead2 = self.tie_lead_pair
                self.tie_lead_pair = None
            elif self.carryover_lead_winner:
                # Carryover round winner (after role already has an overall winner)
                lead1 = self.carryover_lead_winner
                self.carryover_lead_winner = None
                # Ensure we don't select the same lead twice
                if lead1 in self._leads:
                    try:
                        self._leads.remove(lead1)
                    except ValueError:
                        pass
                if len(self._leads) == 0:
                    for lead in self.initial_leads:
                        if lead.name != lead1.name and lead not in self._leads:
                            self._leads.append(lead)
                lead2 = self._leads.pop(0)
            else:
                # Regular selection
                lead1 = self._leads.pop(0)
                lead2 = self._leads.pop(0)
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
                # Ensure we don't select the same lead twice
                if lead1 in self._leads:
                    try:
                        self._leads.remove(lead1)
                    except ValueError:
                        pass
                if len(self._leads) == 0:
                    for lead in self.initial_leads:
                        if lead.name != lead1.name and lead not in self._leads:
                            self._leads.append(lead)
                lead2 = self._leads.pop(0)
            else:
                # Regular selection
                lead1 = self._leads.pop(0)
                lead2 = self._leads.pop(0)

        # Ensure distinct leads
        if lead1.name == lead2.name:
            # Try to find a different lead from the queue
            replacement = None
            for cand in self._leads:
                if cand.name != lead1.name:
                    replacement = cand
                    break
            if replacement is None:
                # Fall back to any initial lead with different name
                for cand in self.initial_leads:
                    if cand.name != lead1.name:
                        replacement = cand
                        break
            if replacement is not None:
                try:
                    self._leads.remove(replacement)
                except ValueError:
                    pass
                lead2 = replacement

        # Handle follow selection based on game state
        if self.has_winning_follow and not self.has_winning_lead:
            # Initial winning follow (with flags set) should go to the end of the queue
            if self.winning_follow and self.winning_follow.points >= self.win_threshold:
                self._follows.append(self.winning_follow)
                self.winning_follow = None

                # Select the next two follows from the queue
                if len(self._follows) < 2:
                    for follow in self.initial_follows:
                        if follow not in self._follows and follow.name not in {
                            self.pair_1[1].name,
                            self.pair_2[1].name,
                        }:
                            self._follows.append(follow)
                follow1 = self._follows.pop(0)
                follow2 = self._follows.pop(0)
            elif current_follows:  # If we have a follow tie, keep the same follows
                follow1, follow2 = current_follows
            elif self.carryover_follow_winner:
                # Carryover round winner (after role already has an overall winner)
                follow1 = self.carryover_follow_winner
                self.carryover_follow_winner = None
                # Ensure we don't select the same follow twice
                if follow1 in self._follows:
                    try:
                        self._follows.remove(follow1)
                    except ValueError:
                        pass
                if len(self._follows) == 0:
                    for follow in self.initial_follows:
                        if follow.name != follow1.name and follow not in self._follows:
                            self._follows.append(follow)
                follow2 = self._follows.pop(0)
            else:
                # Regular selection
                follow1 = self._follows.pop(0)
                follow2 = self._follows.pop(0)
        elif current_follows:  # If we have a follow tie, keep the same follows
            follow1, follow2 = current_follows
        else:
            # If there's a previous round winner for follow, use them in the next round
            # BUT only if that role doesn't already have an overall winner
            if self.winning_follow:
                follow1 = self.winning_follow
                self.winning_follow = None
                # Ensure we don't select the same follow twice
                if follow1 in self._follows:
                    try:
                        self._follows.remove(follow1)
                    except ValueError:
                        pass
                if len(self._follows) == 0:
                    for follow in self.initial_follows:
                        if follow.name != follow1.name and follow not in self._follows:
                            self._follows.append(follow)
                follow2 = self._follows.pop(0)
            else:
                # Regular selection
                follow1 = self._follows.pop(0)
                follow2 = self._follows.pop(0)

        # Ensure distinct follows
        if follow1.name == follow2.name:
            replacement = None
            for cand in self._follows:
                if cand.name != follow1.name:
                    replacement = cand
                    break
            if replacement is None:
                for cand in self.initial_follows:
                    if cand.name != follow1.name:
                        replacement = cand
                        break
            if replacement is not None:
                try:
                    self._follows.remove(replacement)
                except ValueError:
                    pass
                follow2 = replacement

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
            if (
                self.tie_lead_pair is None
                and self.tie_follow_pair is None
                and (lead1, lead2) != (None, None)
                and (follow1, follow2) != (None, None)
            ):
                # Check if the default pairing would recreate previous pairs
                pairing_1 = (lead1.name, follow1.name)
                pairing_2 = (lead2.name, follow2.name)

                # If either pairing already exists in previous_pairs, swap follows
                if pairing_1 in self.previous_pairs or pairing_2 in self.previous_pairs:
                    # Swap follows to avoid repeat pairings
                    follow1, follow2 = follow2, follow1

                # Prevent pairing two winning contestants together
                # Check if both lead1 and follow1 were winners in the last round
                if self.last_lead_winner == lead1.name and self.last_follow_winner == follow1.name:
                    # Swap follows to prevent winners being paired
                    follow1, follow2 = follow2, follow1
                # Check if both lead2 and follow2 were winners in the last round
                elif self.last_lead_winner == lead2.name and self.last_follow_winner == follow2.name:
                    # Swap follows to prevent winners being paired
                    follow1, follow2 = follow2, follow1

            # Form new Lead vs Follow pairs
            self.pair_1 = (lead1, follow1)
            self.pair_2 = (lead2, follow2)

        # Clear previous pairings since we only care about consecutive rounds
        self.previous_pairs = {}

        # Record new pairings for next round
        self._record_pairings()

        # Replenish leads if we're running low
        if len(self._leads) < 2:
            # Add all leads back to the queue except the current competing leads
            competing_leads = {self.pair_1[0].name, self.pair_2[0].name}
            for lead in self.initial_leads:
                if lead.name not in competing_leads and lead not in self._leads:
                    self._leads.append(lead)

        # Replenish follows if we're running low
        if len(self._follows) < 2:
            # Add all follows back to the queue except the current competing follows
            competing_follows = {self.pair_1[1].name, self.pair_2[1].name}
            for follow in self.initial_follows:
                if follow.name not in competing_follows and follow not in self._follows:
                    self._follows.append(follow)

        self.contestant_judges = self.get_contestant_judges()
        self.current_round = Round(
            self.round_num,
            {},
            {},
            self.guest_judges,
            [j.name for j in self.contestant_judges],
            self.session_id,
            contestant_judging_enabled=self.contestant_judging_enabled,
            simple_contestant_judges=self.simple_contestant_judges,
        )

        # Store the pairs for this round
        self.current_round.pairs = {
            "pair_1": {"lead": self.pair_1[0].name, "follow": self.pair_1[1].name},
            "pair_2": {"lead": self.pair_2[0].name, "follow": self.pair_2[1].name},
        }

        # Save queue snapshot for undo functionality
        self.current_round.queue_snapshot = {
            "leads": [l.name for l in self._leads],
            "follows": [f.name for f in self._follows],
        }

    def judge_round(self, c1, c2, role, votes):
        guest_votes = [d for (v, d) in votes if v in self.guest_judges]

        # Any normal judging clears special no-contest state
        self.no_contest_pending = False

        # Store votes in the current round
        vote_dict = {}
        for voter, decision in votes:
            vote_dict[voter] = decision

        if role == "lead":
            self.current_round.lead_votes = vote_dict
        else:
            self.current_round.follow_votes = vote_dict

        # Tie: both guests vote 3
        if guest_votes and guest_votes.count(3) == len(self.guest_judges):
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
        if guest_votes and guest_votes.count(4) == len(self.guest_judges):
            self.no_contest_pending = True
            if role == "lead":
                # enqueue both contestants immediately
                self._leads.append(c1)
                self._leads.append(c2)
            else:
                # enqueue both contestants immediately
                self._follows.append(c1)
                self._follows.append(c2)
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
                # and loser goes to the end of the queue (immediate)
                self._leads.append(loser)
                # Store carryover winner for next round competition
                self.carryover_lead_winner = winner
            else:
                # Normal case - no winner for leads yet
                self.winning_lead = winner
                self._leads.append(loser)

                # Check if we've reached a win condition using the common threshold
                if winner.points + 1 >= self.win_threshold:
                    self.has_winning_lead = True

            # Track the lead winner for this round to prevent pairing with follow winner
            self.last_lead_winner = winner.name
            # Also store the lead winner in the current round
            self.current_round.lead_winner = winner.name

        else:  # Follow
            if self.has_winning_follow:
                # If follow already has a winner, winner stays in the competition
                # and loser goes to the end of the queue (immediate)
                self._follows.append(loser)
                # Store carryover winner for next round competition
                self.carryover_follow_winner = winner
            else:
                # Normal case - no winner for follows yet
                self.winning_follow = winner
                self._follows.append(loser)

                # Check if we've reached a win condition using the common threshold
                if winner.points + 1 >= self.win_threshold:
                    self.has_winning_follow = True
                    # Winner will be appended to queue at round transition if needed (not immediate)

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
        if self.has_winning_lead and self.winning_lead and self.winning_lead.points >= self.win_threshold:
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
        if self.has_winning_follow and self.winning_follow and self.winning_follow.points >= self.win_threshold:
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
        """Return complete, point-accurate leaderboards for both roles.

        Critical detail: contestants may be temporarily removed from the working
        queues (e.g., current competitors popped, winners held aside), so the
        backing lists `self._leads`/`self._follows` might not contain everyone
        at this exact moment. However, `self.initial_leads` and
        `self.initial_follows` contain the canonical Contestant objects used
        throughout the game, and their `points` fields have been updated in
        place. To avoid returning incomplete leaderboards or dropping points,
        we build the final results from the initial lists and sort by points.
        """

        # Use the canonical contestant objects from the initial order
        all_leads = list(self.initial_leads)
        all_follows = list(self.initial_follows)

        # Sort by points (descending)
        all_leads.sort(key=lambda c: c.points, reverse=True)
        all_follows.sort(key=lambda c: c.points, reverse=True)

        return all_leads, all_follows

    # ------------------------------------------------------------------
    # Tie-break methods
    # ------------------------------------------------------------------

    def detect_tiebreak_needs(self):
        """Check if a tie-break is needed for either role after ending early.

        Skips a role if that role already has a threshold winner
        (has_winning_lead / has_winning_follow is True).
        Returns a dict describing which roles need a tie-break and who is tied.
        """
        lead_needed = False
        tied_lead_names = []
        lead_max = 0

        if not self.has_winning_lead and self.initial_leads:
            lead_max = max(c.points for c in self.initial_leads)
            tied = [c for c in self.initial_leads if c.points == lead_max]
            if len(tied) >= 2:
                lead_needed = True
                self.tiebreak_leads_tied = tied
                tied_lead_names = [c.name for c in tied]

        follow_needed = False
        tied_follow_names = []
        follow_max = 0

        if not self.has_winning_follow and self.initial_follows:
            follow_max = max(c.points for c in self.initial_follows)
            tied = [c for c in self.initial_follows if c.points == follow_max]
            if len(tied) >= 2:
                follow_needed = True
                self.tiebreak_follows_tied = tied
                tied_follow_names = [c.name for c in tied]

        self.tiebreak_lead_needed = lead_needed
        self.tiebreak_follow_needed = follow_needed

        return {
            'lead_needed': lead_needed,
            'follow_needed': follow_needed,
            'tied_leads': tied_lead_names,
            'tied_follows': tied_follow_names,
            'lead_max_points': lead_max,
            'follow_max_points': follow_max,
        }

    def start_tiebreak(self):
        """Enter tie-break mode without finishing the game yet."""
        self.tiebreak_active = True
        self.tiebreak_sub_round = 0
        self.tiebreak_sub_round_1_pairings = []
        self.tiebreak_sub_round_2_pairings = []
        self.tiebreak_lead_winner = None
        self.tiebreak_follow_winner = None

    def set_tiebreak_partner_selections(self, lead_selections, follow_selections=None):
        """Record partner selections and compute sub-round pairings.

        lead_selections: {lead_name: follow_name} — tied leads pick follows.
        follow_selections: {follow_name: lead_name} — tied follows pick leads.

        Either or both may be provided depending on which roles are tied.
        SR1: each picker dances with their chosen partner.
        SR2: for lead tiebreak the follows rotate; for follow tiebreak the leads rotate.
        Pairings from both roles are merged (deduplicated) into a single display list.
        Sets tiebreak_sub_round to 1.
        """
        sr1, sr2 = [], []

        # Lead tiebreak: tied leads each pick a follow; SR2 rotates the follows.
        if self.tiebreak_leads_tied and lead_selections:
            tied_lead_names = [c.name for c in self.tiebreak_leads_tied]
            lead_sr1 = [(lead, lead_selections[lead]) for lead in tied_lead_names if lead in lead_selections]
            if lead_sr1:
                leads_ord = [p[0] for p in lead_sr1]
                follows_ord = [p[1] for p in lead_sr1]
                rotated_f = follows_ord[1:] + follows_ord[:1]
                sr1.extend(lead_sr1)
                sr2.extend(zip(leads_ord, rotated_f))

        # Follow tiebreak: tied follows each pick a lead; SR2 rotates the leads.
        if self.tiebreak_follows_tied and follow_selections:
            tied_follow_names = [c.name for c in self.tiebreak_follows_tied]
            follow_sr1 = [
                (follow_selections[follow], follow)
                for follow in tied_follow_names if follow in follow_selections
            ]
            if follow_sr1:
                leads_ord = [p[0] for p in follow_sr1]
                follows_ord = [p[1] for p in follow_sr1]
                rotated_l = leads_ord[1:] + leads_ord[:1]
                existing_sr1 = set(sr1)
                sr1.extend(p for p in follow_sr1 if p not in existing_sr1)
                existing_sr2 = set(sr2)
                sr2.extend(p for p in zip(rotated_l, follows_ord) if p not in existing_sr2)

        self.tiebreak_sub_round_1_pairings = sr1
        self.tiebreak_sub_round_2_pairings = sr2
        self.tiebreak_sub_round = 1

    def advance_tiebreak_sub_round(self):
        """Move to the next tie-break phase (1→2→3). Returns the new value."""
        if self.tiebreak_sub_round < 3:
            self.tiebreak_sub_round += 1
        return self.tiebreak_sub_round

    def judge_tiebreak(self, role, votes):
        """Resolve tie-break voting for one role.

        votes: list of (voter_name, chosen_contestant_name).
        Guest judges count for 2 points, contestant judges for 1.
        If the top score is shared, the tied list is narrowed to those contestants
        and sub_round is reset to 0 so another round can be run.
        Returns {'resolved': bool, 'winner': name | None,
                 'still_tied': [name, ...] | None, 'vote_tally': {name: score}}.
        """
        tied = self.tiebreak_leads_tied if role == 'lead' else self.tiebreak_follows_tied
        if len(tied) < 2:
            return None

        name_to_contestant = {c.name: c for c in tied}
        scores = {c: 0 for c in tied}

        for voter, chosen_name in votes:
            if chosen_name not in name_to_contestant:
                continue
            weight = 2 if voter in self.guest_judges else 1
            scores[name_to_contestant[chosen_name]] += weight

        max_score = max(scores[c] for c in tied)
        top_scorers = [c for c in tied if scores[c] == max_score]

        if len(top_scorers) == 1:
            winner = top_scorers[0]
            if role == 'lead':
                self.tiebreak_lead_winner = winner
            else:
                self.tiebreak_follow_winner = winner
            return {
                'resolved': True,
                'winner': winner.name,
                'still_tied': None,
                'vote_tally': {c.name: scores[c] for c in tied},
            }

        # Still tied — narrow the list and reset for another round
        if role == 'lead':
            self.tiebreak_leads_tied = top_scorers
        else:
            self.tiebreak_follows_tied = top_scorers
        self.tiebreak_sub_round = 0
        self.tiebreak_sub_round_1_pairings = []
        self.tiebreak_sub_round_2_pairings = []
        return {
            'resolved': False,
            'winner': None,
            'still_tied': [c.name for c in top_scorers],
            'vote_tally': {c.name: scores[c] for c in tied},
        }

    def finalize_tiebreak_results(self):
        """Promote tie-break winners to overall winners and mark the game finished.

        Awards +1 point to each tie-break winner so they rank above the
        tied contestants they beat in the final standings.
        """
        if self.tiebreak_lead_needed and self.tiebreak_lead_winner:
            self.tiebreak_lead_winner.points += 1
            self.has_winning_lead = True
            self.winning_lead = self.tiebreak_lead_winner

        if self.tiebreak_follow_needed and self.tiebreak_follow_winner:
            self.tiebreak_follow_winner.points += 1
            self.has_winning_follow = True
            self.winning_follow = self.tiebreak_follow_winner

        self.tiebreak_active = False
        self.state = 1

    def debug_state(self):
        """Print the current state of the game for debugging."""
        print("\n--- Game State ---")
        print(f"Round: {self.round_num}")
        print(f"Pair 1: {self.pair_1[0].name} (lead) vs {self.pair_1[1].name} (follow)")
        print(f"Pair 2: {self.pair_2[0].name} (lead) vs {self.pair_2[1].name} (follow)")
        print(f"Leads in queue: {[lead.name for lead in self._leads]}")
        print(f"Follows in queue: {[follow.name for follow in self._follows]}")
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

    def undo_round(self):
        """Undo the last completed round and restore the game to that state.

        Returns:
            bool: True if undo was successful, False if there's nothing to undo
        """
        # Check if there's a round to undo
        if not self.rounds:
            return False

        # Pop the last completed round
        undone_round = self.rounds.pop()

        # Get the pairs from the undone round
        pair_1_data = undone_round.pairs.get("pair_1", {}) if undone_round.pairs else {}
        pair_2_data = undone_round.pairs.get("pair_2", {}) if undone_round.pairs else {}

        # Find contestant objects for the undone round's pairs
        undone_lead1 = undone_lead2 = undone_follow1 = undone_follow2 = None
        for lead in self.initial_leads:
            if lead.name == pair_1_data.get("lead"):
                undone_lead1 = lead
            if lead.name == pair_2_data.get("lead"):
                undone_lead2 = lead
        for follow in self.initial_follows:
            if follow.name == pair_1_data.get("follow"):
                undone_follow1 = follow
            if follow.name == pair_2_data.get("follow"):
                undone_follow2 = follow

        # Restore queue from snapshot if available (most accurate restoration)
        if undone_round.queue_snapshot:
            # Build name-to-object maps for lookup
            lead_map = {l.name: l for l in self.initial_leads}
            follow_map = {f.name: f for f in self.initial_follows}

            # Restore leads queue from snapshot
            self._leads = []
            for name in undone_round.queue_snapshot.get("leads", []):
                if name in lead_map:
                    self._leads.append(lead_map[name])

            # Restore follows queue from snapshot
            self._follows = []
            for name in undone_round.queue_snapshot.get("follows", []):
                if name in follow_map:
                    self._follows.append(follow_map[name])
        else:
            # Fallback: approximate queue restoration (for rounds saved before this feature)
            undone_pair_leads = {pair_1_data.get("lead"), pair_2_data.get("lead")}
            undone_pair_follows = {pair_1_data.get("follow"), pair_2_data.get("follow")}

            # Identify the losers from the undone round
            lead_loser_name = None
            follow_loser_name = None
            if undone_round.lead_winner and undone_lead1 and undone_lead2:
                lead_loser_name = (
                    undone_lead2.name if undone_round.lead_winner == undone_lead1.name else undone_lead1.name
                )
            if undone_round.follow_winner and undone_follow1 and undone_follow2:
                follow_loser_name = (
                    undone_follow2.name if undone_round.follow_winner == undone_follow1.name else undone_follow1.name
                )

            # Collect contestants from current pairs that need to go back to the queue
            leads_to_restore = []
            follows_to_restore = []
            if self.pair_1 and self.pair_2:
                current_lead1, current_follow1 = self.pair_1
                current_lead2, current_follow2 = self.pair_2

                if current_lead1.name not in undone_pair_leads and current_lead1.name != lead_loser_name:
                    leads_to_restore.append(current_lead1)
                if current_lead2.name not in undone_pair_leads and current_lead2.name != lead_loser_name:
                    leads_to_restore.append(current_lead2)
                if current_follow1.name not in undone_pair_follows and current_follow1.name != follow_loser_name:
                    follows_to_restore.append(current_follow1)
                if current_follow2.name not in undone_pair_follows and current_follow2.name != follow_loser_name:
                    follows_to_restore.append(current_follow2)

            # Remove losers from the queue
            if lead_loser_name:
                self._leads = [l for l in self._leads if l.name != lead_loser_name]
            if follow_loser_name:
                self._follows = [f for f in self._follows if f.name != follow_loser_name]

            # Insert contestants back at the front of the queue
            for lead in reversed(leads_to_restore):
                if lead not in self._leads:
                    self._leads.insert(0, lead)
            for follow in reversed(follows_to_restore):
                if follow not in self._follows:
                    self._follows.insert(0, follow)

            # Remove the undone round's pairs from the queue
            self._leads = [l for l in self._leads if l.name not in undone_pair_leads]
            self._follows = [f for f in self._follows if f.name not in undone_pair_follows]

        # Subtract points from the round winners
        if undone_round.lead_winner:
            for lead in self.initial_leads:
                if lead.name == undone_round.lead_winner:
                    lead.points = max(0, lead.points - 1)
                    break

        if undone_round.follow_winner:
            for follow in self.initial_follows:
                if follow.name == undone_round.follow_winner:
                    follow.points = max(0, follow.points - 1)
                    break

        # Restore round number
        self.round_num = undone_round.round_num

        # Restore pairs from the undone round
        if undone_lead1 and undone_lead2 and undone_follow1 and undone_follow2:
            self.pair_1 = (undone_lead1, undone_follow1)
            self.pair_2 = (undone_lead2, undone_follow2)

        # Clear the votes in the undone round so admin can re-vote
        undone_round.lead_votes = {}
        undone_round.follow_votes = {}
        undone_round.lead_winner = None
        undone_round.follow_winner = None
        undone_round.win_messages = None

        # Restore current_round to the undone round
        self.current_round = undone_round

        # Clear game finished state if it was set
        if self.state == 1:
            self.state = 0

        # Clear carryover winners since we're going back
        self.carryover_lead_winner = None
        self.carryover_follow_winner = None

        # Clear last round winners since we're re-doing this round
        self.last_lead_winner = None
        self.last_follow_winner = None

        # Clear tie state
        self.tie_lead_pair = None
        self.tie_follow_pair = None

        # Clear winning_lead/winning_follow and recalculate based on current points
        self.winning_lead = None
        self.winning_follow = None
        self._recalculate_winner_flags()

        # Reselect contestant judges for this round
        self.contestant_judges = self.get_contestant_judges()
        self.current_round.contestant_judges = [j.name for j in self.contestant_judges]

        return True

    def _recalculate_winner_flags(self):
        """Recalculate has_winning_lead and has_winning_follow based on current points."""
        # Check if any lead has reached the win threshold
        max_lead_points = 0
        lead_with_max = None
        for lead in self.initial_leads:
            if lead.points > max_lead_points:
                max_lead_points = lead.points
                lead_with_max = lead

        if max_lead_points >= self.win_threshold:
            self.has_winning_lead = True
            self.winning_lead = lead_with_max
        else:
            self.has_winning_lead = False
            # Only clear winning_lead if they're below threshold
            if self.winning_lead and self.winning_lead.points < self.win_threshold:
                self.winning_lead = None

        # Check if any follow has reached the win threshold
        max_follow_points = 0
        follow_with_max = None
        for follow in self.initial_follows:
            if follow.points > max_follow_points:
                max_follow_points = follow.points
                follow_with_max = follow

        if max_follow_points >= self.win_threshold:
            self.has_winning_follow = True
            self.winning_follow = follow_with_max
        else:
            self.has_winning_follow = False
            # Only clear winning_follow if they're below threshold
            if self.winning_follow and self.winning_follow.points < self.win_threshold:
                self.winning_follow = None
