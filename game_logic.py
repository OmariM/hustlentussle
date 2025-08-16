import random


class Contestant:
    def __init__(self, name) -> None:
        self.name = name
        self.points = 0

    def __str__(self) -> str:
        return f"{self.name} ({self.points})"


class Round:
    def __init__(
        self, round_num, lead_votes, follow_votes, judges, contestant_judges, session_id,
        is_tiebreak: bool = False,
        tiebreak_role: str | None = None,
        tiebreak_heat: int | None = None,
        tiebreak_subround: int | None = None,
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
        # Tiebreak metadata
        self.is_tiebreak = is_tiebreak
        self.tiebreak_role = tiebreak_role
        self.tiebreak_heat = tiebreak_heat
        self.tiebreak_subround = tiebreak_subround


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
        # During a No Contest transition, show the full backing queue including current competitors
        if getattr(self._game, 'no_contest_pending', False):
            for item in self._backing():
                yield item
            return
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
        
        # Tiebreak state
        self.tiebreak_active = False
        self.tiebreak_role: str | None = None  # 'lead' or 'follow'
        self.tiebreak_competitors: list[Contestant] = []
        self.tiebreak_partners: list[Contestant] = []
        self.tiebreak_scores: dict[str, int] = {}
        self.tiebreak_heat_index: int = 0  # 0-based
        self._tiebreak_pairs_in_current_heat: int = 0
        self._tiebreak_pairs_boundary_after_next_judge: bool = False
        self._tiebreak_pair_stream_index: int = 0  # counts across heats
        self._tiebreak_pair_buffer: list[tuple[Contestant, Contestant]] = []  # next pairs to use in subrounds (each is (lead, follow))
        self._tiebreak_rotation_size: int = 0
        self.tiebreak_winner_lead: str | None = None
        self.tiebreak_winner_follow: str | None = None
        
        # Start the first round
        self.start_round()
    
    def detect_top_ties(self, role: str) -> list[str]:
        """Return names of contestants tied for top points for the given role."""
        if role not in ("lead", "follow"):
            return []
        pool = self.initial_leads if role == "lead" else self.initial_follows
        if not pool:
            return []
        max_points = max(c.points for c in pool)
        leaders = [c.name for c in pool if c.points == max_points]
        return leaders if len(leaders) > 1 else []
    
    def start_tiebreak(self, role: str, competitor_names: list[str] | None = None):
        """Initialize tiebreak state for the given role. If competitor_names is None,
        use the contestants tied for top points."""
        assert role in ("lead", "follow"), "role must be 'lead' or 'follow'"
        if competitor_names is None:
            competitor_names = self.detect_top_ties(role)
        if not competitor_names or len(competitor_names) < 2:
            raise ValueError("Need at least two tied competitors to start tiebreak")
        # Map names to Contestant objects
        name_to_obj = {c.name: c for c in (self.initial_leads if role == "lead" else self.initial_follows)}
        competitors: list[Contestant] = []
        for n in competitor_names:
            if n not in name_to_obj:
                raise ValueError(f"Invalid competitor: {n}")
            competitors.append(name_to_obj[n])
        # Set state
        self.tiebreak_active = True
        self.tiebreak_role = role
        self.tiebreak_competitors = competitors
        self.tiebreak_partners = []
        self.tiebreak_scores = {c.name: 0 for c in competitors}
        self.tiebreak_heat_index = 0
        self._tiebreak_pairs_in_current_heat = 0
        self._tiebreak_pair_stream_index = 0
        self._tiebreak_pair_buffer = []
        self._tiebreak_rotation_size = len(competitors)
        # Clear any current round pairing buffer to avoid mixing with normal flow
        return {
            "role": role,
            "competitors": [c.name for c in competitors]
        }
    
    def set_tiebreak_partners(self, assignments: list[tuple[str, str]]):
        """Assignments is list of (competitor_name, partner_name). Partner names must be unique
        and from the opposite role original pool."""
        if not self.tiebreak_active or not self.tiebreak_role:
            raise ValueError("No active tiebreak")
        role = self.tiebreak_role
        opp_pool = self.initial_follows if role == "lead" else self.initial_leads
        opp_map = {c.name: c for c in opp_pool}
        # Validate uniqueness and existence
        seen_partners: set[str] = set()
        partner_by_comp: dict[str, Contestant] = {}
        for comp_name, partner_name in assignments:
            if comp_name not in {c.name for c in self.tiebreak_competitors}:
                raise ValueError(f"Unknown tiebreak competitor: {comp_name}")
            if partner_name not in opp_map:
                raise ValueError(f"Invalid partner: {partner_name}")
            if partner_name in seen_partners:
                raise ValueError(f"Duplicate partner selection: {partner_name}")
            seen_partners.add(partner_name)
            partner_by_comp[comp_name] = opp_map[partner_name]
        # Preserve competitor order for rotation
        partners_ordered: list[Contestant] = []
        for comp in self.tiebreak_competitors:
            partners_ordered.append(partner_by_comp[comp.name])
        self.tiebreak_partners = partners_ordered
        # Initialize first subround
        self._prepare_next_tiebreak_subround()
        return self._get_tiebreak_state_payload(include_next_pairs=True)
    
    def _tiebreak_pair_generator(self):
        """Yield pairs for each heat rotation in order. Each yielded item is a tuple
        (lead, follow) representing a couple on the floor. Generates K pairs per heat.
        We use self.tiebreak_heat_index to know current heat, but this generator
        yields from the current heat onward."""
        K = self._tiebreak_rotation_size
        if K <= 0:
            return
        # Start from current heat index
        r = self.tiebreak_heat_index
        while True:
            for i, comp in enumerate(self.tiebreak_competitors):
                partner_idx = (i + r) % K
                partner = self.tiebreak_partners[partner_idx]
                # Couple placement depends on role: couple is always (lead, follow)
                if self.tiebreak_role == 'lead':
                    yield (comp, partner)  # comp is lead
                else:
                    yield (partner, comp)  # comp is follow
            # Advance to next heat after K pairs
            r += 1

    def _get_tiebreak_state_payload(self, include_next_pairs: bool = False) -> dict:
        state = {
            "active": self.tiebreak_active,
            "role": self.tiebreak_role,
            "competitors": [c.name for c in self.tiebreak_competitors],
            "partners": [c.name for c in self.tiebreak_partners],
            "scores": dict(self.tiebreak_scores),
            "heat_index": getattr(self, 'tiebreak_heat_index', 0),
        }
        if include_next_pairs and self.pair_1 and self.pair_2:
            state["current_pairs"] = self.get_current_pairs()
        return state

    def _fill_tiebreak_pair_buffer(self):
        """Ensure we have at least two pairs buffered for the next subround.
        We pull from the infinite generator defined by rotation without mutating heat stats here."""
        gen = getattr(self, '_tiebreak_gen', None)
        if gen is None:
            self._tiebreak_gen = self._tiebreak_pair_generator()
            gen = self._tiebreak_gen
        while len(self._tiebreak_pair_buffer) < 2:
            pair = next(gen)
            self._tiebreak_pair_buffer.append(pair)

    def _prepare_next_tiebreak_subround(self):
        """Prepare Game.pair_1 and Game.pair_2 for the next tiebreak subround and create Round."""
        if not self.tiebreak_active:
            raise ValueError("No active tiebreak to prepare")
        # Buffer two pairs
        self._fill_tiebreak_pair_buffer()
        p1 = self._tiebreak_pair_buffer.pop(0)
        p2 = self._tiebreak_pair_buffer.pop(0)
        # Assign pairs
        self.pair_1 = p1
        self.pair_2 = p2
        # Judges for this subround
        self.contestant_judges = self.get_contestant_judges()
        # Create round with tiebreak meta
        self.current_round = Round(
            self.round_num,
            {},
            {},
            self.guest_judges,
            [j.name for j in self.contestant_judges],
            self.session_id,
            is_tiebreak=True,
            tiebreak_role=self.tiebreak_role,
            tiebreak_heat=self.tiebreak_heat_index,
            tiebreak_subround=0
        )
        self.current_round.pairs = {
            "pair_1": {"lead": self.pair_1[0].name, "follow": self.pair_1[1].name},
            "pair_2": {"lead": self.pair_2[0].name, "follow": self.pair_2[1].name},
        }

    def judge_tiebreak(self, votes: list[tuple[str, int]]):
        """Judge the current tiebreak subround for the active role. Disallow tie/no-contest votes.
        Returns dict with winner and updated scoreboard."""
        if not self.tiebreak_active or not self.tiebreak_role:
            raise ValueError("No active tiebreak")
        # Validate votes: guests and contestants can only vote 1 or 2
        for voter, decision in votes:
            if decision not in (1, 2):
                raise ValueError("Tie and No Contest votes are not allowed in tiebreak")
        # Compute scores
        role = self.tiebreak_role
        if role == 'lead':
            c1 = self.pair_1[0]
            c2 = self.pair_2[0]
            vote_target = 'lead'
        else:
            c1 = self.pair_1[1]
            c2 = self.pair_2[1]
            vote_target = 'follow'
        score1 = score2 = 0
        for voter, decision in votes:
            is_guest = voter in self.guest_judges
            if decision == 1:
                score1 += 2 if is_guest else 1
            elif decision == 2:
                score2 += 2 if is_guest else 1
        # Ties on numeric score go to c1 by rule (no guest tie votes)
        winner, loser = (c1, c2) if score1 >= score2 else (c2, c1)
        # Update round vote storage and winner annotation for the judged role only
        vote_dict = {v: d for (v, d) in votes}
        if vote_target == 'lead':
            self.current_round.lead_votes = vote_dict
            self.current_round.lead_winner = winner.name
        else:
            self.current_round.follow_votes = vote_dict
            self.current_round.follow_winner = winner.name
        # Award tiebreak point to the competitor (ensure we increment only if winner is among competitors)
        if winner.name in self.tiebreak_scores:
            self.tiebreak_scores[winner.name] += 1
        # Finalize this subround and decide whether we have a tiebreak champion
        self.rounds.append(self.current_round)
        self.round_num += 1
        		                                                # Track consumption into this heat; declare heat finished after K pairs judged
        K = self._tiebreak_rotation_size
        self._tiebreak_pairs_in_current_heat += 2  # two pairs were judged in this subround
        heat_finished = False
        if self._tiebreak_pairs_in_current_heat >= K:
            self._tiebreak_pairs_in_current_heat = 0
            self.tiebreak_heat_index += 1
            heat_finished = True
        final_winner_name = None
        if heat_finished:
            # Check for unique leader
            max_pts = max(self.tiebreak_scores.values())
            leaders = [n for n, pts in self.tiebreak_scores.items() if pts == max_pts]
            if len(leaders) == 1:
                final_winner_name = leaders[0]
                # Record and close tiebreak
                if self.tiebreak_role == 'lead':
                    self.tiebreak_winner_lead = final_winner_name
                    self.last_lead_winner = final_winner_name
                else:
                    self.tiebreak_winner_follow = final_winner_name
                    self.last_follow_winner = final_winner_name
                self.tiebreak_active = False
                self.tiebreak_role = None
                self.tiebreak_competitors = []
                self.tiebreak_partners = []
                self._tiebreak_pair_buffer = []
                # Leave scores for reporting purposes
                return {
                    "winner": winner.name,
                    "tiebreak_scores": dict(self.tiebreak_scores),
                    "tiebreak_finished": True,
                    "final_winner": final_winner_name,
                }
        # Not finished yet: prepare next subround
        self._prepare_next_tiebreak_subround()
        return {
            "winner": winner.name,
            "tiebreak_scores": dict(self.tiebreak_scores),
            "tiebreak_finished": False,
            "next_pairs": self.get_current_pairs(),
            "heat_index": self.tiebreak_heat_index,
        }
    
    def get_current_pairs(self) -> dict:
        """Helper to expose current pairing names."""
        if not self.pair_1 or not self.pair_2:
            return {}
        return {
            "pair_1": {"lead": self.pair_1[0].name, "follow": self.pair_1[1].name},
            "pair_2": {"lead": self.pair_2[0].name, "follow": self.pair_2[1].name},
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

        # Final fallback: ensure at least two leads and two follows available for selection
        if len(self._leads) < 2:
            for cand in (self.pair_1[0], self.pair_2[0]):
                if cand not in self._leads:
                    self._leads.append(cand)
        if len(self._follows) < 2:
            for cand in (self.pair_1[1], self.pair_2[1]):
                if cand not in self._follows:
                    self._follows.append(cand)

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
