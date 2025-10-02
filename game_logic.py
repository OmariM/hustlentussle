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
        # Track manual overrides applied during this round for auditing/export
        self.manual_overrides: list[str] = []


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
        return self._game._leads if self._role == 'lead' else self._game._follows

    def _filtered_names(self):
        names = set()
        if self._game.pair_1 is not None and self._game.pair_2 is not None:
            if self._role == 'lead':
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
    
    def __init__(self, lead_names, follow_names, guest_judge_names) -> None:
        # Store the session ID
        self.session_id = None  # Will be set when the game is created
        
        # Initialize contestants (backing lists)
        self._leads = [Contestant(name) for name in lead_names]
        self._follows = [Contestant(name) for name in follow_names]
        
        # Public queue proxies (hide current competitors from iteration)
        self.leads = ContestantQueueProxy(self, 'lead')
        self.follows = ContestantQueueProxy(self, 'follow')
        
        # Store initial order
        self.initial_leads = self._leads.copy()
        self.initial_follows = self._follows.copy()
        
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
        self.total_num_leads = len(self._leads)
        self.total_num_follows = len(self._follows)
        
        # Calculate win threshold based on maximum number of contestants
        self.win_threshold = max(self.total_num_leads, self.total_num_follows) - 1
        
        # Calculate number of contestant judges needed - always use 3 if possible
        available_for_judging = len(self._leads) + len(self._follows) - 4
        self.num_contestant_judges = max(0, min(3, available_for_judging))
        
        # Pending queue updates (applied at round transition)
        self._pending_leads_enqueue = []
        self._pending_follows_enqueue = []
        
        # Special transition flags
        self.no_contest_pending = False
        
        # Carryover round winners (used when role already has overall winner)
        self.carryover_lead_winner = None
        self.carryover_follow_winner = None
        
        # Manual mode flag
        self.manual_enabled: bool = False

        # Start the first round
        self.start_round()
        
    # -----------------------------
    # Manual mode helpers
    # -----------------------------
    def set_manual_enabled(self, enabled: bool) -> None:
        self.manual_enabled = bool(enabled)
        # Note: toggling off keeps edits by design

    def _find_contestant_by_name(self, role: str, name: str) -> Contestant | None:
        pool = self.initial_leads if role == 'lead' else self.initial_follows
        for c in pool:
            if c.name == name:
                return c
        return None

    def _update_initial_order_from_current(self) -> None:
        """Ensure replenishment order respects current manual queue ordering.

        Build initial lists as [current competitors] + remaining queue order.
        """
        # Leads
        current_leads = []
        if self.pair_1:
            current_leads.append(self.pair_1[0])
        if self.pair_2:
            current_leads.append(self.pair_2[0])
        remaining_leads = list(self._leads)
        seen = set()
        ordered_leads: list[Contestant] = []
        for c in current_leads + remaining_leads:
            if c and c.name not in seen:
                ordered_leads.append(c)
                seen.add(c.name)
        # Add any stragglers that might not be in queues yet (e.g., carryovers)
        for c in self.initial_leads:
            if c.name not in seen:
                ordered_leads.append(c)
                seen.add(c.name)
        self.initial_leads = ordered_leads

        # Follows
        current_follows = []
        if self.pair_1:
            current_follows.append(self.pair_1[1])
        if self.pair_2:
            current_follows.append(self.pair_2[1])
        remaining_follows = list(self._follows)
        seenf = set()
        ordered_follows: list[Contestant] = []
        for c in current_follows + remaining_follows:
            if c and c.name not in seenf:
                ordered_follows.append(c)
                seenf.add(c.name)
        for c in self.initial_follows:
            if c.name not in seenf:
                ordered_follows.append(c)
                seenf.add(c.name)
        self.initial_follows = ordered_follows

    def set_queue_order(self, role: str, ordered_names: list[str]) -> dict:
        """Reorder the upcoming queue for a role. Current competitors remain in place.

        Returns a summary dict { success: bool, message?: str, applied_order: [names] }.
        """
        role = 'lead' if role == 'lead' else 'follow'
        # Build map of current queue (excludes current competitors by proxy semantics)
        queue = self._leads if role == 'lead' else self._follows
        name_to_obj = {c.name: c for c in queue}
        # Validate all provided names exist in queue (ignore unknowns gracefully)
        new_queue: list[Contestant] = []
        seen: set[str] = set()
        for nm in ordered_names:
            c = name_to_obj.get(nm)
            if c and c.name not in seen:
                new_queue.append(c)
                seen.add(c.name)
        # Append any not specified to preserve full membership
        for c in queue:
            if c.name not in seen:
                new_queue.append(c)
                seen.add(c.name)
        # Apply
        if role == 'lead':
            self._leads = new_queue
        else:
            self._follows = new_queue
        # Keep initial order aligned for future replenishment
        self._update_initial_order_from_current()
        # Log manual override on current round
        if self.current_round:
            self.current_round.manual_overrides.append(f"reordered {role}s queue")
        return { 'success': True, 'applied_order': [c.name for c in new_queue] }

    def set_active_pairs(self, pair_1: dict, pair_2: dict) -> dict:
        """Set current competing pairs by names; reconcile queues to avoid duplicates."""
        # Resolve contestants
        l1 = self._find_contestant_by_name('lead', pair_1.get('lead'))
        f1 = self._find_contestant_by_name('follow', pair_1.get('follow'))
        l2 = self._find_contestant_by_name('lead', pair_2.get('lead'))
        f2 = self._find_contestant_by_name('follow', pair_2.get('follow'))
        if not l1 or not f1 or not l2 or not f2:
            return { 'success': False, 'message': 'Unknown contestant name in pairs' }
        if l1.name == l2.name or f1.name == f2.name:
            return { 'success': False, 'message': 'Duplicate lead or follow across pairs' }

        # Put previous pair members (if any) back into queues at the front to preserve exposure
        prev_leads = []
        prev_follows = []
        if self.pair_1 and self.pair_2:
            prev_leads = [self.pair_1[0], self.pair_2[0]]
            prev_follows = [self.pair_1[1], self.pair_2[1]]

        # Remove new actives from queues if present
        for c in [l1, l2]:
            try:
                if c in self._leads:
                    self._leads.remove(c)
            except ValueError:
                pass
        for c in [f1, f2]:
            try:
                if c in self._follows:
                    self._follows.remove(c)
            except ValueError:
                pass

        # Return previous competitors to the FRONT of their queues if they are not the same as new picks
        for c in reversed(prev_leads):
            if c and c not in (l1, l2):
                try:
                    self._leads.remove(c)
                except ValueError:
                    pass
                self._leads.insert(0, c)
        for c in reversed(prev_follows):
            if c and c not in (f1, f2):
                try:
                    self._follows.remove(c)
                except ValueError:
                    pass
                self._follows.insert(0, c)

        # Set current pairs
        self.pair_1 = (l1, f1)
        self.pair_2 = (l2, f2)

        # Update current round pairs snapshot
        if self.current_round:
            self.current_round.pairs = {
                "pair_1": {"lead": l1.name, "follow": f1.name},
                "pair_2": {"lead": l2.name, "follow": f2.name},
            }
            self.current_round.manual_overrides.append("updated active pairs")

        # Align initial order for future replenishment
        self._update_initial_order_from_current()
        # Clear previous-pairs tracker; new pairs are authoritative now
        self.previous_pairs = {}
        self._record_pairings()
        return { 'success': True }

    def generate_contestant_judges_manual(self, count: int) -> dict:
        """Generate contestant judges excluding current competitors; fill as many as possible."""
        try:
            requested = max(0, int(count))
        except (TypeError, ValueError):
            requested = 0
        pool = list(self.leads) + list(self.follows)
        random.shuffle(pool)
        selected = pool[:requested]
        self.contestant_judges = selected
        if self.current_round:
            self.current_round.contestant_judges = [j.name for j in selected]
            actual = len(selected)
            if requested > 0:
                note = f"generated {actual}/{requested} contestant judges"
            else:
                note = "generated 0 contestant judges"
            self.current_round.manual_overrides.append(note)
        return {
            'success': True,
            'judges': [j.name for j in selected],
            'requested': requested,
            'selected': len(selected)
        }

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
                self.session_id
            )
            
            # Store the pairs for this round
            self.current_round.pairs = {
                "pair_1": {"lead": self.pair_1[0].name, "follow": self.pair_1[1].name},
                "pair_2": {"lead": self.pair_2[0].name, "follow": self.pair_2[1].name},
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
        # Pool is remaining contestants in queues only (competitors already popped)
        pool = list(self.leads) + list(self.follows)
        if self.num_contestant_judges <= 0 or not pool:
            return []
        random.shuffle(pool)
        take = min(self.num_contestant_judges, len(pool))
        return pool[: take]

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
                        if follow not in self._follows and follow.name not in {self.pair_1[1].name, self.pair_2[1].name}:
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
        if (self.has_winning_lead and self.winning_lead and 
            self.winning_lead.points >= self.win_threshold):
            
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
            self.winning_follow.points >= self.win_threshold):
            
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
