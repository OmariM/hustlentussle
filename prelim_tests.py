#!/usr/bin/env python3
"""Tests for the preliminary elimination round (`prelim_logic.Prelim`).

Covers the grouping/eligibility algorithm, the rotation schedule, selection
validation, persistence round-trips, and the end-to-end Flask flow
(prelims/start -> advance_heat -> commit_selection -> a fresh Game at 0 points).
"""

import math
import os
import time
import unittest

from prelim_logic import Prelim, DEFAULT_NUM_ROTATIONS


def _names(prefix, n):
    return [f"{prefix}{i}" for i in range(n)]


class TestPrelimGrouping(unittest.TestCase):
    def test_even_field_no_padding(self):
        p = Prelim.create(_names("L", 16), _names("F", 16), group_size=8)
        self.assertEqual(len(p.heats), 2)
        for h in p.heats:
            self.assertEqual(len(h["leads"]), 8)
            self.assertEqual(len(h["follows"]), 8)
            # No within-heat duplicates.
            self.assertEqual(len(set(h["leads"])), len(h["leads"]))
            self.assertEqual(len(set(h["follows"])), len(h["follows"]))

    def test_heat_count_driven_by_larger_role(self):
        p = Prelim.create(_names("L", 20), _names("F", 8), group_size=8)
        expected = max(math.ceil(20 / 8), math.ceil(8 / 8))
        self.assertEqual(len(p.heats), expected)

    def test_every_distinct_dancer_eligible_exactly_once(self):
        leads, follows = _names("L", 20), _names("F", 8)
        p = Prelim.create(leads, follows, group_size=8)
        self.assertEqual(sorted(p.eligible_leads), sorted(leads))
        self.assertEqual(sorted(p.eligible_follows), sorted(follows))
        # Exactly once each.
        self.assertEqual(len(p.eligible_leads), len(set(p.eligible_leads)))
        self.assertEqual(len(p.eligible_follows), len(set(p.eligible_follows)))

    def test_smaller_role_padded_as_non_eligible_repeats(self):
        leads, follows = _names("L", 20), _names("F", 8)
        p = Prelim.create(leads, follows, group_size=8)
        # Total follow appearances across heats exceeds the 8 distinct entrants,
        # but only 8 are eligible (first appearances).
        total_follow_slots = sum(len(h["follows"]) for h in p.heats)
        self.assertGreater(total_follow_slots, len(follows))
        self.assertEqual(len(p.eligible_follows), len(follows))

    def test_balanced_circle_and_no_within_heat_dupes(self):
        p = Prelim.create(_names("L", 20), _names("F", 8), group_size=8)
        for h in p.heats:
            self.assertEqual(len(h["leads"]), len(h["follows"]))
            self.assertEqual(len(set(h["leads"])), len(h["leads"]))
            self.assertEqual(len(set(h["follows"])), len(h["follows"]))

    def test_rotation_schedule_is_clockwise(self):
        p = Prelim.create(_names("L", 12), _names("F", 12), group_size=6)
        for h in p.heats:
            k = len(h["leads"])
            self.assertEqual(len(h["rotations"]), DEFAULT_NUM_ROTATIONS)
            for r, rotation in enumerate(h["rotations"]):
                self.assertEqual(len(rotation), k)
                for i in range(k):
                    self.assertEqual(rotation[i], [h["leads"][i], h["follows"][(i + r) % k]])


class TestPrelimNeedsCut(unittest.TestCase):
    def test_spots_default_to_no_cut(self):
        p = Prelim.create(_names("L", 10), _names("F", 10), group_size=5)
        self.assertFalse(p.lead_needs_cut)
        self.assertFalse(p.follow_needs_cut)
        self.assertEqual(p.lead_spots, 10)
        self.assertEqual(p.follow_spots, 10)

    def test_single_role_over_threshold(self):
        p = Prelim.create(_names("L", 20), _names("F", 10), lead_spots=8, follow_spots=10, group_size=8)
        self.assertTrue(p.lead_needs_cut)
        self.assertFalse(p.follow_needs_cut)

    def test_spots_clamped(self):
        p = Prelim.create(_names("L", 5), _names("F", 5), lead_spots=99, follow_spots=0, group_size=5)
        self.assertEqual(p.lead_spots, 5)  # capped at entries
        self.assertEqual(p.follow_spots, 1)  # floored at 1 for a non-empty role


class TestPrelimSelection(unittest.TestCase):
    def setUp(self):
        self.p = Prelim.create(_names("L", 20), _names("F", 8), lead_spots=10, follow_spots=8, group_size=8)

    def test_auto_advance_role_returns_full_set(self):
        leads, follows = self.p.commit_selection(self.p.eligible_leads[:10], [])
        self.assertEqual(len(leads), 10)
        self.assertEqual(sorted(follows), sorted(self.p.eligible_follows))
        self.assertTrue(self.p.complete)

    def test_wrong_count_rejected(self):
        with self.assertRaises(ValueError):
            self.p.commit_selection(self.p.eligible_leads[:9], [])

    def test_ineligible_name_rejected(self):
        with self.assertRaises(ValueError):
            self.p.commit_selection(self.p.eligible_leads[:9] + ["NotADancer"], [])

    def test_advance_heat_bounded(self):
        for _ in range(len(self.p.heats) + 5):
            self.p.advance_heat()
        self.assertEqual(self.p.current_heat_index, len(self.p.heats) - 1)


class TestPrelimRotationTimer(unittest.TestCase):
    def _prelim(self, heats=2):
        # 16 leads / 16 follows, group 8 -> 2 heats of 6 rotations each.
        return Prelim.create(_names("L", 8 * heats), _names("F", 8 * heats), group_size=8)

    def test_start_heat_runs_first_rotation(self):
        p = self._prelim()
        self.assertFalse(p.running)
        p.start_heat()
        self.assertTrue(p.running)
        self.assertEqual(p.phase, "dancing")
        self.assertEqual(p.current_rotation_index, 0)
        self.assertIsNotNone(p.rotation_started_at)
        self.assertGreater(p.rotation_remaining(), 0)

    def test_phase_machine_walks_break_intermission_then_ends_heat(self):
        p = self._prelim(heats=2)
        p.start_heat()
        self.assertEqual(p.intermission_after, 3)  # 6 rotations -> hold after the 3rd
        # Rotation 0 dancing -> break -> rotation 1 dancing.
        p.next_phase()
        self.assertEqual(p.phase, "break")
        p.next_phase()
        self.assertEqual((p.phase, p.current_rotation_index), ("dancing", 1))
        # Walk to the 3rd rotation (index 2), whose end triggers the intermission.
        p.next_phase()  # break
        p.next_phase()  # dancing rotation 2
        self.assertEqual(p.current_rotation_index, 2)
        p.next_phase()  # end of rotation 3 -> intermission (holds)
        self.assertEqual(p.phase, "intermission")
        self.assertTrue(p.running)
        self.assertEqual(p.rotation_remaining(), 0)
        # Operator continues into the second half.
        p.next_phase()
        self.assertEqual((p.phase, p.current_rotation_index), ("dancing", 3))
        # Finish rotations 4, 5 then end heat 0, queuing heat 1 (not running).
        for _ in range(4):  # break, r4, break, r5
            p.next_phase()
        self.assertEqual((p.phase, p.current_rotation_index), ("dancing", 5))
        p.next_phase()  # end of last rotation -> end heat
        self.assertFalse(p.running)
        self.assertEqual(p.current_heat_index, 1)
        self.assertEqual(p.current_rotation_index, 0)
        self.assertFalse(p.heats_complete)

    def test_last_heat_completion_sets_flag(self):
        p = self._prelim(heats=1)
        p.start_heat()
        # Drive the phase machine until the heat completes.
        for _ in range(100):
            if not p.running:
                break
            if p.phase == "intermission":
                p.next_phase()  # operator continue
                continue
            p.next_phase()
        self.assertFalse(p.running)
        self.assertTrue(p.heats_complete)

    def test_next_phase_noop_when_not_running(self):
        p = self._prelim()
        p.next_phase()  # never started
        self.assertEqual(p.current_rotation_index, 0)
        self.assertFalse(p.running)

    def test_rotation_remaining_zero_when_idle_or_intermission(self):
        p = self._prelim()
        self.assertEqual(p.rotation_remaining(), 0)
        p.start_heat()
        for _ in range(5):  # advance to the intermission
            if p.phase == "intermission":
                break
            p.next_phase()
        self.assertEqual(p.phase, "intermission")
        self.assertEqual(p.rotation_remaining(), 0)

    def test_timer_state_round_trips(self):
        p = self._prelim()
        p.start_heat()
        p.next_phase()  # into a break
        d = p.to_dict()
        p2 = Prelim.from_dict(d)
        self.assertEqual(p2.running, p.running)
        self.assertEqual(p2.phase, p.phase)
        self.assertEqual(p2.phase_seconds, p.phase_seconds)
        self.assertEqual(p2.current_rotation_index, p.current_rotation_index)
        self.assertEqual(p2.rotation_started_at, p.rotation_started_at)

    def test_pause_freezes_remaining(self):
        p = self._prelim()
        p.start_heat()
        p.pause()
        self.assertTrue(p.paused)
        frozen = p.rotation_remaining()
        time.sleep(0.05)
        # Remaining does not tick down while paused.
        self.assertEqual(p.rotation_remaining(), frozen)

    def test_resume_continues_from_frozen(self):
        p = self._prelim()
        p.start_heat()
        p.toggle_pause()
        self.assertTrue(p.paused)
        p.toggle_pause()
        self.assertFalse(p.paused)
        self.assertTrue(p.running)
        self.assertGreater(p.rotation_remaining(), 0)

    def test_advancing_clears_pause(self):
        p = self._prelim()
        p.start_heat()
        p.pause()
        p.next_phase()
        self.assertFalse(p.paused)

    def test_pause_noop_when_idle(self):
        p = self._prelim()
        p.pause()  # not running
        self.assertFalse(p.paused)

    def test_options_default_true(self):
        p = self._prelim()
        self.assertTrue(p.show_timer)
        self.assertTrue(p.auto_advance)

    def test_set_options_updates_only_given(self):
        p = self._prelim()
        p.set_options(auto_advance=False)
        self.assertFalse(p.auto_advance)
        self.assertTrue(p.show_timer)  # untouched
        p.set_options(show_timer=False)
        self.assertFalse(p.show_timer)

    def test_options_round_trip(self):
        p = self._prelim()
        p.set_options(show_timer=False, auto_advance=False)
        p2 = Prelim.from_dict(p.to_dict())
        self.assertFalse(p2.show_timer)
        self.assertFalse(p2.auto_advance)


class TestPrelimNumbers(unittest.TestCase):
    def test_default_numbers_unique_across_roles(self):
        p = Prelim.create(_names("L", 3), _names("F", 2), group_size=4)
        self.assertEqual(p.lead_numbers, {"L0": "1", "L1": "2", "L2": "3"})
        self.assertEqual(p.follow_numbers, {"F0": "4", "F1": "5"})
        all_numbers = list(p.lead_numbers.values()) + list(p.follow_numbers.values())
        self.assertEqual(len(all_numbers), len(set(all_numbers)))

    def test_set_numbers_updates_known_only(self):
        p = Prelim.create(_names("L", 3), _names("F", 2), group_size=4)
        p.set_numbers(lead_numbers={"L1": "42", "Nobody": "99"}, follow_numbers={"F0": "7"})
        self.assertEqual(p.lead_numbers["L1"], "42")
        self.assertNotIn("Nobody", p.lead_numbers)
        self.assertEqual(p.follow_numbers["F0"], "7")

    def test_set_numbers_ignores_blanks(self):
        p = Prelim.create(_names("L", 2), _names("F", 2), group_size=4)
        original = p.lead_numbers["L0"]
        p.set_numbers(lead_numbers={"L0": "  "})
        self.assertEqual(p.lead_numbers["L0"], original)

    def test_duplicate_number_rejected(self):
        p = Prelim.create(_names("L", 3), _names("F", 2), group_size=4)
        # L1 defaults to "2"; giving L0 the same number is a conflict.
        with self.assertRaises(ValueError):
            p.set_numbers(lead_numbers={"L0": "2"})
        # Rejected atomically — L0 keeps its original number.
        self.assertEqual(p.lead_numbers["L0"], "1")

    def test_duplicate_across_roles_rejected(self):
        p = Prelim.create(_names("L", 2), _names("F", 2), group_size=4)
        # Follow F0 defaults to "3"; reusing it for a lead conflicts across roles.
        with self.assertRaises(ValueError):
            p.set_numbers(lead_numbers={"L0": "3"})

    def test_swap_numbers_allowed(self):
        p = Prelim.create(_names("L", 2), _names("F", 2), group_size=4)
        # Swapping two numbers in one call keeps the set unique -> allowed.
        p.set_numbers(lead_numbers={"L0": "2", "L1": "1"})
        self.assertEqual(p.lead_numbers["L0"], "2")
        self.assertEqual(p.lead_numbers["L1"], "1")

    def test_add_with_taken_number_rejected(self):
        p = Prelim.create(_names("L", 3), _names("F", 3), group_size=4)
        taken = p.lead_numbers["L0"]
        with self.assertRaises(ValueError):
            p.add_participant("follow", "Clash", number=taken)

    def test_numbers_round_trip(self):
        p = Prelim.create(_names("L", 3), _names("F", 2), group_size=4)
        p.set_numbers(lead_numbers={"L0": "10"})
        p2 = Prelim.from_dict(p.to_dict())
        self.assertEqual(p2.lead_numbers, p.lead_numbers)
        self.assertEqual(p2.follow_numbers, p.follow_numbers)


class TestPrelimRoster(unittest.TestCase):
    def test_add_participant_updates_roster_heats_and_number(self):
        p = Prelim.create(_names("L", 4), _names("F", 4), group_size=4)
        p.add_participant("lead", "Newbie")
        self.assertIn("Newbie", p.lead_entries)
        self.assertIn("Newbie", p.lead_numbers)
        self.assertIn("Newbie", p.eligible_leads)  # heats rebuilt
        # A fresh unique number was assigned.
        self.assertNotIn(p.lead_numbers["Newbie"], [p.lead_numbers[n] for n in _names("L", 4)])

    def test_add_with_custom_number(self):
        p = Prelim.create(_names("L", 3), _names("F", 3), group_size=4)
        p.add_participant("follow", "Late", number="99")
        self.assertEqual(p.follow_numbers["Late"], "99")

    def test_add_duplicate_rejected(self):
        p = Prelim.create(_names("L", 3), _names("F", 3), group_size=4)
        with self.assertRaises(ValueError):
            p.add_participant("lead", "L0")

    def test_remove_participant(self):
        p = Prelim.create(_names("L", 4), _names("F", 4), group_size=4)
        p.remove_participant("lead", "L0")
        self.assertNotIn("L0", p.lead_entries)
        self.assertNotIn("L0", p.lead_numbers)
        self.assertNotIn("L0", p.eligible_leads)

    def test_remove_last_rejected(self):
        p = Prelim.create(["Solo"], _names("F", 3), group_size=4)
        with self.assertRaises(ValueError):
            p.remove_participant("lead", "Solo")

    def test_no_cut_role_grows_with_additions(self):
        # 4 leads, no explicit spots -> advance all 4 (no cut).
        p = Prelim.create(_names("L", 4), _names("F", 4), group_size=4)
        self.assertFalse(p.lead_needs_cut)
        p.add_participant("lead", "Extra")
        # Still 'advance everyone' — spots grew to 5, not a surprise cut.
        self.assertFalse(p.lead_needs_cut)
        self.assertEqual(p.lead_spots, 5)

    def test_cut_role_keeps_spots_on_add(self):
        p = Prelim.create(_names("L", 8), _names("F", 8), lead_spots=4, group_size=4)
        self.assertTrue(p.lead_needs_cut)
        p.add_participant("lead", "Extra")
        self.assertEqual(p.lead_spots, 4)  # still cutting to 4

    def test_roster_locked_after_confirm(self):
        p = Prelim.create(_names("L", 4), _names("F", 4), group_size=4)
        p.confirm()
        self.assertTrue(p.confirmed)
        with self.assertRaises(ValueError):
            p.add_participant("lead", "Nope")
        with self.assertRaises(ValueError):
            p.remove_participant("lead", "L0")

    def test_confirmed_round_trips(self):
        p = Prelim.create(_names("L", 4), _names("F", 4), group_size=4)
        p.confirm()
        self.assertTrue(Prelim.from_dict(p.to_dict()).confirmed)


class TestPrelimPersistence(unittest.TestCase):
    def test_round_trip_is_stable(self):
        p = Prelim.create(_names("L", 20), _names("F", 8), lead_spots=10, follow_spots=8, group_size=8)
        p.session_id = "abc123"
        p.advance_heat()
        d = p.to_dict()
        self.assertEqual(d["kind"], "prelim")
        p2 = Prelim.from_dict(d)
        # Heats/eligibility must not be rebuilt/reshuffled on load.
        self.assertEqual(p2.to_dict(), d)
        self.assertEqual(p2.current_heat_index, 1)
        self.assertEqual(p2.session_id, "abc123")


class TestPrelimFlaskFlow(unittest.TestCase):
    """End-to-end via the Flask test client with the in-memory repository."""

    @classmethod
    def setUpClass(cls):
        os.environ.pop("DATABASE_URL", None)
        import importlib

        appmod = importlib.import_module("web.app")
        app = getattr(appmod, "app", None) or appmod.create_app()
        app.testing = True
        cls.client = app.test_client()

    def test_full_prelim_to_battle(self):
        c = self.client
        start = c.post(
            "/api/prelims/start",
            json={
                "leads": ",".join(_names("L", 20)),
                "follows": ",".join(_names("F", 8)),
                "judges": "J1,J2",
                "lead_spots": 10,
                "follow_spots": 8,
                "group_size": 8,
            },
        )
        self.assertEqual(start.status_code, 200)
        d = start.get_json()
        sid = d["session_id"]
        self.assertEqual(d["config"]["lead_needs_cut"], True)
        self.assertEqual(d["config"]["follow_needs_cut"], False)
        self.assertEqual(len(d["eligible"]["leads"]), 20)

        # Hydrate + advance
        self.assertEqual(c.get(f"/api/prelims/state?session_id={sid}").status_code, 200)
        adv = c.post("/api/prelims/advance_heat", json={"session_id": sid})
        self.assertEqual(adv.get_json()["current_heat_index"], 1)

        # Commit -> a new battle session with the advancers at 0 points.
        commit = c.post(
            "/api/prelims/commit_selection",
            json={"session_id": sid, "lead_selections": d["eligible"]["leads"][:10], "follow_selections": []},
        )
        self.assertEqual(commit.status_code, 200)
        cd = commit.get_json()
        self.assertEqual(len(cd["initial_leads"]), 10)
        self.assertEqual(len(cd["initial_follows"]), 8)

        state = c.get(f"/api/prelims/state?session_id={sid}").status_code  # still a prelim
        self.assertEqual(state, 200)
        battle = c.get(f"/api/state?session_id={cd['session_id']}").get_json()
        pts = [x["points"] for x in battle["scoreboard"]["leads"]] + [
            x["points"] for x in battle["scoreboard"]["follows"]
        ]
        self.assertTrue(all(p == 0 for p in pts))

    def test_start_heat_and_next_phase_endpoints(self):
        c = self.client
        start = c.post(
            "/api/prelims/start",
            json={"leads": ",".join(_names("L", 16)), "follows": ",".join(_names("F", 16)), "group_size": 8},
        )
        sid = start.get_json()["session_id"]

        heat = c.post("/api/prelims/start_heat", json={"session_id": sid}).get_json()
        self.assertTrue(heat["running"])
        self.assertEqual(heat["phase"], "dancing")
        self.assertEqual(heat["current_rotation_index"], 0)
        self.assertGreater(heat["rotation_remaining"], 0)

        # First phase boundary drops into a 3s break before rotation 2.
        brk = c.post("/api/prelims/next_phase", json={"session_id": sid}).get_json()
        self.assertEqual(brk["phase"], "break")
        self.assertTrue(brk["running"])
        nxt = c.post("/api/prelims/next_phase", json={"session_id": sid}).get_json()
        self.assertEqual(nxt["phase"], "dancing")
        self.assertEqual(nxt["current_rotation_index"], 1)

        paused = c.post("/api/prelims/toggle_pause", json={"session_id": sid}).get_json()
        self.assertTrue(paused["paused"])
        resumed = c.post("/api/prelims/toggle_pause", json={"session_id": sid}).get_json()
        self.assertFalse(resumed["paused"])

        opts = c.post(
            "/api/prelims/set_options", json={"session_id": sid, "auto_advance": False, "show_timer": False}
        ).get_json()
        self.assertFalse(opts["auto_advance"])
        self.assertFalse(opts["show_timer"])

    def test_start_with_confirm_and_numbers(self):
        c = self.client
        start = c.post(
            "/api/prelims/start",
            json={
                "leads": ",".join(_names("L", 4)),
                "follows": ",".join(_names("F", 4)),
                "group_size": 4,
                "confirm": True,
                "lead_numbers": {"L0": "9"},
            },
        ).get_json()
        self.assertTrue(start["confirmed"])
        self.assertEqual(start["numbers"]["leads"]["L0"], "9")

    def test_set_numbers_endpoint(self):
        c = self.client
        start = c.post(
            "/api/prelims/start",
            json={"leads": ",".join(_names("L", 4)), "follows": ",".join(_names("F", 4)), "group_size": 4},
        )
        d = start.get_json()
        sid = d["session_id"]
        self.assertIn("numbers", d)
        # Every participant has a default number.
        self.assertEqual(len(d["numbers"]["leads"]), 4)
        first_lead = _names("L", 4)[0]
        updated = c.post(
            "/api/prelims/set_numbers",
            json={"session_id": sid, "lead_numbers": {first_lead: "77"}},
        ).get_json()
        self.assertEqual(updated["numbers"]["leads"][first_lead], "77")

    def test_set_numbers_duplicate_returns_400(self):
        c = self.client
        start = c.post(
            "/api/prelims/start",
            json={"leads": ",".join(_names("L", 3)), "follows": ",".join(_names("F", 3)), "group_size": 4},
        )
        sid = start.get_json()["session_id"]
        leads = _names("L", 3)
        # L1 defaults to "2" — assigning "2" to L0 collides.
        resp = c.post("/api/prelims/set_numbers", json={"session_id": sid, "lead_numbers": {leads[0]: "2"}})
        self.assertEqual(resp.status_code, 400)

    def test_confirmation_flow_add_remove_then_confirm(self):
        c = self.client
        start = c.post(
            "/api/prelims/start",
            json={"leads": ",".join(_names("L", 4)), "follows": ",".join(_names("F", 4)), "group_size": 4},
        )
        d = start.get_json()
        sid = d["session_id"]
        self.assertFalse(d["confirmed"])  # starts on the confirmation step

        added = c.post(
            "/api/prelims/add_participant", json={"session_id": sid, "role": "lead", "name": "Latecomer"}
        ).get_json()
        self.assertIn("Latecomer", added["numbers"]["leads"])

        removed = c.post(
            "/api/prelims/remove_participant", json={"session_id": sid, "role": "lead", "name": "L0"}
        ).get_json()
        self.assertNotIn("L0", removed["numbers"]["leads"])

        confirmed = c.post("/api/prelims/confirm", json={"session_id": sid}).get_json()
        self.assertTrue(confirmed["confirmed"])

        # Roster is locked after confirm.
        locked = c.post("/api/prelims/add_participant", json={"session_id": sid, "role": "lead", "name": "TooLate"})
        self.assertEqual(locked.status_code, 400)

    def test_type_guards(self):
        c = self.client
        start = c.post(
            "/api/prelims/start",
            json={"leads": ",".join(_names("L", 10)), "follows": ",".join(_names("F", 10)), "group_size": 5},
        )
        sid = start.get_json()["session_id"]
        # A prelim id must not resolve on battle endpoints.
        self.assertEqual(c.get(f"/api/state?session_id={sid}").status_code, 404)

    def test_commit_wrong_count_returns_400(self):
        c = self.client
        start = c.post(
            "/api/prelims/start",
            json={
                "leads": ",".join(_names("L", 20)),
                "follows": ",".join(_names("F", 8)),
                "lead_spots": 10,
                "follow_spots": 8,
                "group_size": 8,
            },
        )
        d = start.get_json()
        commit = c.post(
            "/api/prelims/commit_selection",
            json={
                "session_id": d["session_id"],
                "lead_selections": d["eligible"]["leads"][:5],
                "follow_selections": [],
            },
        )
        self.assertEqual(commit.status_code, 400)


if __name__ == "__main__":
    unittest.main(verbosity=2)
