"""Preliminary elimination round logic.

Prelims cut an oversized field down to a fixed number of finalists per role *before*
the main battle. Unlike the main :class:`~game_logic.Game`, prelims have no head-to-head
voting and no points: dancers perform in rotating heats (a circle of follows with leads
rotating clockwise) and the operator watches, then selects who advances.

A :class:`Prelim` is a self-contained, JSON-serializable object stored through the same
repository as ``Game`` (distinguished by ``kind == "prelim"`` in its serialized form).
When the operator commits a selection, the caller builds a normal ``Game`` from the
chosen roster — the advancers start the main battle fresh at 0 points.

Grouping/eligibility rules (see :meth:`Prelim._build_heats`):

- A role "needs a cut" iff ``entries > spots``. If it does not, every entrant in that
  role auto-advances (it still dances as a partner, but no selection is required for it).
- ``num_heats = max(1, ceil(n_lead / group_size), ceil(n_follow / group_size))``.
- Each distinct dancer is assigned to exactly one heat as their evaluated (first)
  appearance and is eligible exactly once. The smaller role's dancers are then reused
  ("repeats") to balance each heat's circle; repeat appearances are not eligible.
"""

import math
import random
import time
from typing import Dict, List, Optional

DEFAULT_NUM_ROTATIONS = 6
DEFAULT_ROTATION_SECONDS = 45
DEFAULT_GROUP_SIZE = 8


def _chunk_evenly(items: List[str], n: int) -> List[List[str]]:
    """Split ``items`` into ``n`` contiguous chunks of as-even-as-possible size."""
    if n <= 0:
        return []
    base, extra = divmod(len(items), n)
    chunks: List[List[str]] = []
    idx = 0
    for i in range(n):
        size = base + (1 if i < extra else 0)
        chunks.append(items[idx : idx + size])
        idx += size
    return chunks


def _fill(base: List[str], k: int, pool: List[str]) -> List[str]:
    """Return a list of exactly ``k`` names starting with ``base`` (the distinct,
    first-appearance dancers for this heat) and padded with repeats drawn from
    ``pool``, avoiding duplicates within the heat while the pool allows it."""
    result = list(base)
    if len(result) >= k:
        return result[:k]
    fillers = [p for p in pool if p not in result]
    i = 0
    while len(result) < k:
        if fillers:
            result.append(fillers[i % len(fillers)])
        elif pool:
            # Pool smaller than the circle (degenerate config): allow repeats.
            result.append(pool[i % len(pool)])
        else:
            break
        i += 1
    return result


class Prelim:
    """A preliminary elimination round.

    Prefer :meth:`create` to construct and build heats. The bare constructor with
    ``_build=False`` is used by :meth:`from_dict` to rehydrate a persisted prelim
    without reshuffling (heats must be stable across reloads).
    """

    def __init__(
        self,
        lead_entries: List[str],
        follow_entries: List[str],
        *,
        lead_spots: Optional[int] = None,
        follow_spots: Optional[int] = None,
        group_size: int = DEFAULT_GROUP_SIZE,
        num_rotations: int = DEFAULT_NUM_ROTATIONS,
        rotation_seconds: int = DEFAULT_ROTATION_SECONDS,
        battle_config: Optional[dict] = None,
        _build: bool = True,
    ) -> None:
        self.session_id: Optional[str] = None

        self.lead_entries = list(lead_entries)
        self.follow_entries = list(follow_entries)

        # Spots default to "no cut" (everyone advances) when unset, and are clamped
        # to [1, n] for a non-empty role (0 for an empty one).
        self.lead_spots = self._clamp_spots(lead_spots, len(self.lead_entries))
        self.follow_spots = self._clamp_spots(follow_spots, len(self.follow_entries))

        self.group_size = max(1, int(group_size))
        self.num_rotations = max(1, int(num_rotations))
        self.rotation_seconds = max(1, int(rotation_seconds))

        # Config passed straight through to Game on commit_selection.
        self.battle_config: dict = dict(battle_config or {})

        # Live / selection state (persisted).
        self.current_heat_index = 0
        # Rotation/timer state. The operator drives the timer; these are persisted so
        # the spectator display (/prelims/<id>?mode=display) can mirror it by polling.
        self.current_rotation_index = 0
        self.running = False  # True while the current heat's timer is counting down
        self.rotation_started_at: Optional[float] = None  # server epoch seconds
        self.paused = False  # operator paused the countdown
        self.paused_remaining = 0  # seconds captured at pause (frozen while paused)
        self.confirmed = False  # operator confirmed the roster; locks add/remove
        self.heats_complete = False  # True once the last heat's rotations have finished
        self.selected_leads: List[str] = []
        self.selected_follows: List[str] = []
        self.complete = False

        # Computed structures (persisted so they stay stable across reloads).
        self.heats: List[Dict] = []
        self.eligible_leads: List[str] = []
        self.eligible_follows: List[str] = []

        # Bib numbers judges use to identify dancers (name -> label). Auto-assigned
        # unique across all participants, editable by the operator.
        self.lead_numbers: Dict[str, str] = {}
        self.follow_numbers: Dict[str, str] = {}

        if _build:
            self._build_heats()
            self._assign_default_numbers()

    # ---- construction ---------------------------------------------------------

    @staticmethod
    def _clamp_spots(spots: Optional[int], n: int) -> int:
        if n <= 0:
            return 0
        if spots is None:
            return n
        try:
            spots = int(spots)
        except (TypeError, ValueError):
            return n
        return max(1, min(spots, n))

    def _build_heats(self) -> None:
        """Compute the heats, rotation schedules, and per-role eligibility."""
        leads = self.lead_entries[:]
        follows = self.follow_entries[:]
        random.shuffle(leads)
        random.shuffle(follows)

        n_lead = len(leads)
        n_follow = len(follows)
        n_heats = max(
            1,
            math.ceil(n_lead / self.group_size) if n_lead else 1,
            math.ceil(n_follow / self.group_size) if n_follow else 1,
        )

        lead_chunks = _chunk_evenly(leads, n_heats)
        follow_chunks = _chunk_evenly(follows, n_heats)

        heats: List[Dict] = []
        eligible_leads: List[str] = []
        eligible_follows: List[str] = []

        for h in range(n_heats):
            heat_leads = list(lead_chunks[h])
            heat_follows = list(follow_chunks[h])

            # First appearances are the evaluated (eligible) ones.
            eligible_leads.extend(heat_leads)
            eligible_follows.extend(heat_follows)

            # Balance the circle: pad the shorter role up to the longer with repeats.
            k = max(len(heat_leads), len(heat_follows))
            full_leads = _fill(heat_leads, k, leads)
            full_follows = _fill(heat_follows, k, follows)

            heats.append(
                {
                    "leads": full_leads,
                    "follows": full_follows,
                    "rotations": self._build_rotations(full_leads, full_follows),
                }
            )

        self.heats = heats
        self.eligible_leads = eligible_leads
        self.eligible_follows = eligible_follows

    def _build_rotations(self, leads: List[str], follows: List[str]) -> List[List[List[str]]]:
        """Rotation schedule for one heat. Leads rotate clockwise: in rotation ``r``,
        lead ``i`` dances with follow ``(i + r) % k``. Returns a list of rotations,
        each a list of ``[lead, follow]`` pairs."""
        k = min(len(leads), len(follows))
        rotations: List[List[List[str]]] = []
        for r in range(self.num_rotations):
            rotations.append([[leads[i], follows[(i + r) % k]] for i in range(k)])
        return rotations

    def _assign_default_numbers(self) -> None:
        """Auto-assign unique bib numbers: leads 1..N, follows N+1..N+M. Editable via
        :meth:`set_numbers`."""
        self.lead_numbers = {name: str(i + 1) for i, name in enumerate(self.lead_entries)}
        offset = len(self.lead_entries)
        self.follow_numbers = {name: str(offset + i + 1) for i, name in enumerate(self.follow_entries)}

    def _next_default_number(self) -> str:
        """The next unused sequential number across both roles."""
        used = []
        for v in list(self.lead_numbers.values()) + list(self.follow_numbers.values()):
            try:
                used.append(int(v))
            except (TypeError, ValueError):
                pass
        return str((max(used) + 1) if used else 1)

    def _adjust_spots_after_roster_change(self, role: str, was_no_cut: bool) -> None:
        """Keep a role's spots sensible after add/remove: a role that was 'advance
        everyone' stays that way; otherwise clamp spots into range."""
        if role == "lead":
            n = len(self.lead_entries)
            self.lead_spots = n if was_no_cut else self._clamp_spots(self.lead_spots, n)
        else:
            n = len(self.follow_entries)
            self.follow_spots = n if was_no_cut else self._clamp_spots(self.follow_spots, n)

    def add_participant(self, role: str, name: str, number: Optional[str] = None) -> None:
        """Add a dancer to a role and rebuild the heats (only before the prelim starts)."""
        if self.confirmed:
            raise ValueError("The roster is locked once the prelim has started.")
        name = (name or "").strip()
        if not name:
            raise ValueError("Name is required.")
        entries = self.lead_entries if role == "lead" else self.follow_entries
        numbers = self.lead_numbers if role == "lead" else self.follow_numbers
        if name in entries:
            raise ValueError(f"{name} is already a {role}.")
        if number and str(number).strip():
            bib = str(number).strip()
            in_use = set(self.lead_numbers.values()) | set(self.follow_numbers.values())
            if bib in in_use:
                raise ValueError(f"Bib number {bib} is already in use.")
        else:
            bib = self._next_default_number()
        was_no_cut = (self.lead_spots if role == "lead" else self.follow_spots) >= len(entries)
        entries.append(name)
        numbers[name] = bib
        self._adjust_spots_after_roster_change(role, was_no_cut)
        self._build_heats()

    def remove_participant(self, role: str, name: str) -> None:
        """Remove a dancer from a role and rebuild the heats (only before start)."""
        if self.confirmed:
            raise ValueError("The roster is locked once the prelim has started.")
        entries = self.lead_entries if role == "lead" else self.follow_entries
        numbers = self.lead_numbers if role == "lead" else self.follow_numbers
        if name not in entries:
            return
        if len(entries) <= 1:
            raise ValueError(f"A prelim needs at least one {role}.")
        was_no_cut = (self.lead_spots if role == "lead" else self.follow_spots) >= len(entries)
        entries.remove(name)
        numbers.pop(name, None)
        self._adjust_spots_after_roster_change(role, was_no_cut)
        self._build_heats()

    def confirm(self) -> None:
        """Lock the roster and move past the confirmation step."""
        self.confirmed = True

    def set_numbers(self, lead_numbers: Optional[dict] = None, follow_numbers: Optional[dict] = None) -> None:
        """Update bib numbers for known participants; unknown names are ignored, blanks
        are skipped so a participant always keeps a number. Applied atomically: if the
        result would give two dancers the same number, nothing changes and ValueError is
        raised."""
        proposed_lead = dict(self.lead_numbers)
        proposed_follow = dict(self.follow_numbers)
        for name, value in (lead_numbers or {}).items():
            if name in proposed_lead and str(value).strip():
                proposed_lead[name] = str(value).strip()
        for name, value in (follow_numbers or {}).items():
            if name in proposed_follow and str(value).strip():
                proposed_follow[name] = str(value).strip()

        all_values = list(proposed_lead.values()) + list(proposed_follow.values())
        dupes = sorted({v for v in all_values if all_values.count(v) > 1})
        if dupes:
            raise ValueError(f"Each dancer needs a unique bib number. Already in use: {', '.join(dupes)}")

        self.lead_numbers = proposed_lead
        self.follow_numbers = proposed_follow

    # ---- eligibility / role helpers ------------------------------------------

    @property
    def lead_needs_cut(self) -> bool:
        return len(self.lead_entries) > self.lead_spots

    @property
    def follow_needs_cut(self) -> bool:
        return len(self.follow_entries) > self.follow_spots

    # ---- selection / lifecycle -----------------------------------------------

    def start_heat(self) -> None:
        """Start (or restart) the timer for the current heat's first rotation. The
        operator presses this once everyone is in place."""
        self.current_rotation_index = 0
        self.running = True
        self.paused = False
        self.rotation_started_at = time.time()

    def advance_rotation(self) -> None:
        """Advance to the next rotation (also used by the operator's "skip rotation").
        When the last rotation of a heat finishes, the heat stops (waiting for the next
        Start); if more heats remain, the next heat is queued ready, otherwise the whole
        prelim is marked complete."""
        if not self.running:
            return
        self.paused = False
        if self.current_rotation_index < self.num_rotations - 1:
            self.current_rotation_index += 1
            self.rotation_started_at = time.time()
        else:
            self.running = False
            self.rotation_started_at = None
            self.current_rotation_index = 0
            if self.current_heat_index < len(self.heats) - 1:
                self.current_heat_index += 1
            else:
                self.heats_complete = True

    def pause(self) -> None:
        """Freeze the countdown at its current remaining seconds."""
        if self.running and not self.paused:
            self.paused_remaining = self.rotation_remaining()
            self.paused = True

    def resume(self) -> None:
        """Resume from the frozen remaining seconds."""
        if self.running and self.paused:
            self.rotation_started_at = time.time() - (self.rotation_seconds - self.paused_remaining)
            self.paused = False

    def toggle_pause(self) -> None:
        if self.paused:
            self.resume()
        else:
            self.pause()

    def advance_heat(self) -> int:
        """Manually skip to the next heat (bounded by the last), stopping the timer.
        Returns the new index."""
        self.running = False
        self.rotation_started_at = None
        self.current_rotation_index = 0
        if self.current_heat_index < len(self.heats) - 1:
            self.current_heat_index += 1
        else:
            self.heats_complete = True
        return self.current_heat_index

    def rotation_remaining(self) -> int:
        """Whole seconds left in the current rotation (0 when not running; frozen while
        paused)."""
        if not self.running or self.rotation_started_at is None:
            return 0
        if self.paused:
            return self.paused_remaining
        elapsed = time.time() - self.rotation_started_at
        return max(0, int(round(self.rotation_seconds - elapsed)))

    def resolve_selection(self, lead_selections: List[str], follow_selections: List[str]):
        """Validate and resolve the operator's picks into the final advancer rosters.

        Roles that need no cut auto-advance their full eligible set. Roles that need a
        cut must supply exactly ``spots`` names, all drawn from the eligible set.
        Returns ``(selected_leads, selected_follows)``; raises ``ValueError`` on an
        invalid selection.
        """
        selected_leads = self._resolve_role(
            lead_selections, self.eligible_leads, self.lead_spots, self.lead_needs_cut, "lead"
        )
        selected_follows = self._resolve_role(
            follow_selections, self.eligible_follows, self.follow_spots, self.follow_needs_cut, "follow"
        )
        return selected_leads, selected_follows

    @staticmethod
    def _resolve_role(selections, eligible, spots, needs_cut, role) -> List[str]:
        eligible_set = list(dict.fromkeys(eligible))  # de-dupe, keep order
        if not needs_cut:
            return eligible_set
        chosen = list(dict.fromkeys(selections or []))
        invalid = [name for name in chosen if name not in eligible_set]
        if invalid:
            raise ValueError(f"Ineligible {role}(s) selected: {', '.join(invalid)}")
        if len(chosen) != spots:
            raise ValueError(f"Select exactly {spots} {role}(s) to advance (got {len(chosen)}).")
        return chosen

    def commit_selection(self, lead_selections: List[str], follow_selections: List[str]):
        """Resolve, record, and mark complete. Returns the advancer rosters."""
        selected_leads, selected_follows = self.resolve_selection(lead_selections, follow_selections)
        self.selected_leads = selected_leads
        self.selected_follows = selected_follows
        self.complete = True
        return selected_leads, selected_follows

    # ---- persistence ----------------------------------------------------------

    def to_dict(self) -> dict:
        """Serialize to a JSON-ready dict tagged with ``kind == "prelim"``."""
        return {
            "kind": "prelim",
            "version": 1,
            "session_id": self.session_id,
            "lead_entries": self.lead_entries,
            "follow_entries": self.follow_entries,
            "lead_spots": self.lead_spots,
            "follow_spots": self.follow_spots,
            "group_size": self.group_size,
            "num_rotations": self.num_rotations,
            "rotation_seconds": self.rotation_seconds,
            "battle_config": self.battle_config,
            "current_heat_index": self.current_heat_index,
            "current_rotation_index": self.current_rotation_index,
            "running": self.running,
            "rotation_started_at": self.rotation_started_at,
            "paused": self.paused,
            "paused_remaining": self.paused_remaining,
            "confirmed": self.confirmed,
            "heats_complete": self.heats_complete,
            "selected_leads": self.selected_leads,
            "selected_follows": self.selected_follows,
            "complete": self.complete,
            "heats": self.heats,
            "eligible_leads": self.eligible_leads,
            "eligible_follows": self.eligible_follows,
            "lead_numbers": self.lead_numbers,
            "follow_numbers": self.follow_numbers,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Prelim":
        """Rehydrate a persisted prelim without rebuilding/reshuffling heats."""
        prelim = cls(
            data.get("lead_entries", []),
            data.get("follow_entries", []),
            lead_spots=data.get("lead_spots"),
            follow_spots=data.get("follow_spots"),
            group_size=data.get("group_size", DEFAULT_GROUP_SIZE),
            num_rotations=data.get("num_rotations", DEFAULT_NUM_ROTATIONS),
            rotation_seconds=data.get("rotation_seconds", DEFAULT_ROTATION_SECONDS),
            battle_config=data.get("battle_config"),
            _build=False,
        )
        prelim.session_id = data.get("session_id")
        prelim.current_heat_index = data.get("current_heat_index", 0)
        prelim.current_rotation_index = data.get("current_rotation_index", 0)
        prelim.running = data.get("running", False)
        prelim.rotation_started_at = data.get("rotation_started_at")
        prelim.paused = data.get("paused", False)
        prelim.paused_remaining = data.get("paused_remaining", 0)
        prelim.confirmed = data.get("confirmed", False)
        prelim.heats_complete = data.get("heats_complete", False)
        prelim.selected_leads = data.get("selected_leads", [])
        prelim.selected_follows = data.get("selected_follows", [])
        prelim.complete = data.get("complete", False)
        prelim.heats = data.get("heats", [])
        prelim.eligible_leads = data.get("eligible_leads", [])
        prelim.eligible_follows = data.get("eligible_follows", [])
        prelim.lead_numbers = data.get("lead_numbers", {})
        prelim.follow_numbers = data.get("follow_numbers", {})
        return prelim

    @classmethod
    def create(cls, lead_entries, follow_entries, **kwargs) -> "Prelim":
        """Explicit constructor mirroring the app's factory style."""
        return cls(lead_entries, follow_entries, **kwargs)
