"""Offline tests for the sample data file and payloads (run: python -m unittest discover -s scripts)."""

import copy
import sys
import unittest
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sample_data as sd  # noqa: E402

DATA = sd.load_data()
USERS = {key: f"00000000-0000-0000-0000-00000000000{i}" for i, key in enumerate(sd.USER_KEYS, 1)}
NAV = {name: f"nav_{name.replace('.', '_')}" for name in sd.NAV_LOOKUPS}
# A fixed load moment: 9 October 2026, 15:00 in Amsterdam (UTC+2).
CLOCK = sd.Clock(datetime(2026, 10, 9, 15, 0, tzinfo=timezone(timedelta(hours=2))))


def records():
    return {r.key: r for r in sd.build_records(DATA, USERS, NAV, CLOCK)}


def broken(change):
    data = copy.deepcopy(DATA)
    change(data)
    return sd.validate(data)


def find(data, key):
    section = next(t.section for t in sd.TABLES if key.startswith(t.prefix))
    return next(r for r in data[section] if r["key"] == key)


class DataFile(unittest.TestCase):
    def test_is_valid(self):
        self.assertEqual(sd.validate(DATA), [])

    def test_amounts_match_the_spec(self):
        self.assertEqual(len(DATA["accounts"]), 25)
        self.assertEqual(len(DATA["contacts"]), 50)
        self.assertEqual(Counter(r["status"] for r in DATA["leads"]),
                         {"notContacted": 8, "working": 12, "qualified": 6, "disqualified": 4})
        stages = Counter(r["stage"] for r in DATA["opportunities"])
        self.assertEqual(sum(stages[s] for s in sd.OPEN_STAGES), 20)
        self.assertTrue(all(stages[s] > 0 for s in sd.OPEN_STAGES))
        self.assertEqual((stages["closedWon"], stages["closedLost"]), (6, 4))
        self.assertEqual((len(DATA["notes"]), len(DATA["tasks"]), len(DATA["phoneCalls"])), (40, 30, 20))

    def test_every_demo_user_has_home_and_pipeline_content(self):
        for user in sd.USER_KEYS:
            tasks = [t for t in DATA["tasks"] if not t["completed"] and sd.owner_of(DATA, t) == user]
            with self.subTest(user=user):
                self.assertTrue(any(t["dueInDays"] < 0 for t in tasks), "an overdue Task")
                self.assertTrue(any(t["dueInDays"] == 0 for t in tasks), "a Task due today")
                self.assertTrue(any(l["owner"] == user and l["status"] == "notContacted" for l in DATA["leads"]))
                self.assertTrue(any(o["owner"] == user and o["stage"] in sd.OPEN_STAGES
                                    for o in DATA["opportunities"]))

    def test_keys_give_fixed_unique_ids(self):
        keys = [r["key"] for t in sd.TABLES for r in DATA[t.section]]
        ids = {sd.record_id(k) for k in keys}
        self.assertEqual(len(ids), len(keys))
        self.assertEqual(sd.record_id("acc-vandijk"), sd.record_id("acc-vandijk"))
        self.assertNotEqual(sd.record_id("acc-vandijk"), sd.record_id("acc-devries"))


class Validation(unittest.TestCase):
    def test_qualified_lead_needs_its_opportunity(self):
        def drop_link(data):
            find(data, "opp-devries").pop("originatingLead")
        self.assertIn("lead-devries: Qualified but no Opportunity has it as originatingLead", broken(drop_link))

    def test_carry_over_must_match(self):
        def other_owner(data):
            find(data, "opp-devries")["owner"] = "diego"
        self.assertIn("lead-devries: its Opportunity must have the Lead's owner", broken(other_owner))

        def other_email(data):
            find(data, "lead-devries")["email"] = "someone@else.example"
        self.assertIn("lead-devries: email differs from Primary Contact con-sander-hendriks", broken(other_email))

    def test_closed_lost_needs_a_reason(self):
        def no_reason(data):
            find(data, "opp-peelland-mes").pop("lostReason")
        self.assertTrue(any("Closed Lost needs a Lost reason" in e for e in broken(no_reason)))

    def test_disqualified_needs_a_reason(self):
        def no_reason(data):
            find(data, "lead-drenthe").pop("disqualifyReason")
        self.assertIn("lead-drenthe: disqualifyReason is required", broken(no_reason))

    def test_child_cannot_predate_parent(self):
        def young_account(data):
            find(data, "acc-vandijk")["createdDaysAgo"] = 1
        self.assertIn("con-joost-vandijk: created before its account acc-vandijk", broken(young_account))

    def test_bram_owns_nothing(self):
        def bram(data):
            find(data, "acc-vandijk")["owner"] = "bram"
        self.assertIn("acc-vandijk: unknown owner 'bram'", broken(bram))


class Payloads(unittest.TestCase):
    def test_dates_are_relative_to_the_load_day(self):
        opp = records()["opp-vandijk-erp"]  # expectedCloseInDays 6, created 55 days ago
        self.assertEqual(opp.body["vibe_expectedclosedate"], "2026-10-15")
        self.assertEqual(opp.created_on, "2026-08-15T07:00:00Z")  # 09:00 Amsterdam

    def test_created_today_is_never_in_the_future(self):
        clock = sd.Clock(datetime(2026, 10, 9, 7, 30, tzinfo=timezone(timedelta(hours=2))))
        self.assertEqual(clock.created(0), "2026-10-09T05:20:00Z")

    def test_task_due_today(self):
        task = records()["task-dms-prep"]
        self.assertEqual(task.body["scheduledend"], "2026-10-09T10:00:00Z")
        self.assertIsNone(task.final_state)

    def test_completed_task_is_closed(self):
        task = records()["task-kanaalzone-kickoff"]
        self.assertEqual(task.final_state, (1, 5))
        self.assertEqual(task.body["actualend"], task.body["scheduledend"])

    def test_owners_are_demo_users_and_activities_follow_their_record(self):
        recs = records()
        self.assertEqual(recs["acc-vandijk"].body["ownerid@odata.bind"], f"/systemusers({USERS['adele']})")
        self.assertEqual(recs["task-sla-call"].body["ownerid@odata.bind"], f"/systemusers({USERS['megan']})")

    def test_qualified_lead_and_its_opportunity(self):
        recs = records()
        lead, opp = recs["lead-devries"], recs["opp-devries"]
        self.assertEqual(lead.body["vibe_leadstatus"], 841200002)
        self.assertEqual(lead.final_state, (1, 2))
        self.assertEqual(opp.body["nav_opportunity_originatinglead@odata.bind"],
                         f"/vibe_leads({sd.record_id('lead-devries')})")
        self.assertEqual(opp.body["nav_opportunity_primarycontact@odata.bind"],
                         f"/contacts({sd.record_id('con-sander-hendriks')})")
        self.assertEqual(opp.body["vibe_stage"], 841200002)  # Proposal
        self.assertEqual(opp.body["vibe_probability"], 50)
        self.assertIsNone(opp.final_state)

    def test_closed_deals(self):
        recs = records()
        won, lost = recs["opp-hofstad-servicedesk"], recs["opp-mechelse-webshop"]
        self.assertEqual((won.body["vibe_stage"], won.body["vibe_probability"]), (841200004, 100))
        self.assertEqual(won.body["vibe_actualvalue"], 228000)
        self.assertEqual(won.body["vibe_closedate"], "2026-10-05")
        self.assertEqual((lost.body["vibe_stage"], lost.body["vibe_lostreason"]), (841200005, 841200000))
        self.assertEqual(won.final_state, (1, 2))
        self.assertEqual(lost.body["nav_opportunity_closedby@odata.bind"], f"/systemusers({USERS['diego']})")

    def test_disqualified_lead(self):
        lead = records()["lead-namen"]
        self.assertEqual(lead.body["vibe_disqualifyreason"], 841200003)  # Chose a competitor
        self.assertEqual(lead.body["nav_lead_disqualifiedby@odata.bind"], f"/systemusers({USERS['megan']})")
        self.assertEqual(lead.final_state, (1, 2))

    def test_phone_calls(self):
        recs = records()
        made, received, planned = recs["call-haarlem-intro"], recs["call-rijnmond-sla"], recs["call-leuven-call"]
        self.assertEqual((made.final_state, made.body["directioncode"]), ((1, 2), True))
        self.assertEqual((received.final_state, received.body["directioncode"]), ((1, 4), False))
        self.assertIsNone(planned.final_state)
        self.assertEqual(planned.body["scheduledend"], "2026-10-11T09:00:00Z")
        self.assertEqual(received.body["phonenumber"], "+31 10 555 0112")  # the Primary Contact's

    def test_load_order_puts_parents_first(self):
        order = [r.table.section for r in sd.build_records(DATA, USERS, NAV, CLOCK)]
        first = {s: order.index(s) for s in set(order)}
        self.assertLess(first["accounts"], first["contacts"])
        self.assertLess(first["contacts"], first["leads"])
        self.assertLess(first["leads"], first["opportunities"])
        self.assertLess(first["opportunities"], first["notes"])


if __name__ == "__main__":
    unittest.main()
