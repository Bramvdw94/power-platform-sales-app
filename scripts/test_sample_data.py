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
        self.assertEqual(len(DATA["quotas"]), 18)

    def test_catalogue_is_a_realistic_it_services_catalogue(self):
        products = DATA["products"]
        self.assertGreaterEqual(len(products), 12)
        units = {p["unit"] for p in products}
        self.assertEqual(units, set(sd.PRODUCT_UNITS))
        self.assertEqual({p["vatRate"] for p in products}, set(sd.VAT_RATES))
        self.assertTrue(any(p["code"] == "SERVICES" for p in products), "a generic Services Product")
        self.assertEqual([p["code"] for p in products if p.get("retired")], ["SUP-OLD"])

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
    def test_products_need_a_unique_code_a_unit_and_a_price_in_cents(self):
        def clash(data):
            find(data, "prod-consultant")["code"] = "cons-sr"
        self.assertTrue(any("duplicate Product code" in e for e in broken(clash)))

        def bad_unit(data):
            find(data, "prod-consultant")["unit"] = "fortnight"
        self.assertIn("prod-consultant: unknown unit 'fortnight'", broken(bad_unit))

        def bad_vat(data):
            find(data, "prod-consultant")["vatRate"] = 6
        self.assertTrue(any("vatRate must be one of" in e for e in broken(bad_vat)))

        def bad_price(data):
            find(data, "prod-consultant")["listPrice"] = 10.005
        self.assertTrue(any("whole cents" in e for e in broken(bad_price)))

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


class ForecastAndQuotaValidation(unittest.TestCase):
    def test_a_closed_deal_has_no_forecast_category(self):
        def set_one(data):
            find(data, "opp-hofstad-servicedesk")["forecastCategory"] = "commit"
        self.assertIn("opp-hofstad-servicedesk: a closed Opportunity has no Forecast category", broken(set_one))

    def test_unknown_forecast_category(self):
        def set_one(data):
            find(data, "opp-devries")["forecastCategory"] = "won"
        self.assertIn("opp-devries: unknown forecastCategory 'won'", broken(set_one))

    def test_one_quota_per_person_and_month(self):
        def twice(data):
            data["quotas"].append({**data["quotas"][0], "key": "quota-adele-dup"})
        self.assertTrue(any("a second Quota for adele" in e for e in broken(twice)))

    def test_quota_needs_a_demo_user_and_a_sane_amount(self):
        def bad(data):
            data["quotas"][0]["salesperson"] = "bram"
            data["quotas"][1]["amount"] = -1
        errors = broken(bad)
        self.assertTrue(any("salesperson must be a demo user" in e for e in errors))
        self.assertTrue(any("amount must be 0 or more" in e for e in errors))


class Payloads(unittest.TestCase):
    def test_forecast_categories(self):
        recs = records()
        by = lambda key: recs[key].body["vibe_forecastcategory"]
        self.assertEqual(by("opp-devries"), 841200002)           # Proposal, overridden to Commit
        self.assertEqual(by("opp-vandijk-erp"), 841200001)       # Proposal default: Best case
        self.assertEqual(by("opp-hoekstra"), 841200000)          # Needs Analysis default: Pipeline
        self.assertEqual(by("opp-brouwer-tablets"), 841200003)   # Omitted
        self.assertIsNone(by("opp-hofstad-servicedesk"))         # closed
        omitted = [k for k, r in recs.items() if r.body.get("vibe_forecastcategory") == 841200003]
        self.assertGreaterEqual(len(omitted), 2)

    def test_quotas_for_adele_alex_and_megan_for_six_months(self):
        quotas = [r for r in records().values() if r.table.section == "quotas"]
        self.assertEqual(Counter(q.body["nav_quota_salesperson@odata.bind"] for q in quotas),
                         {f"/systemusers({USERS[u]})": 6 for u in ("adele", "alex", "megan")})
        adele_now = records()["quota-adele-0"]
        self.assertEqual((adele_now.body["vibe_month"], adele_now.body["vibe_amount"]), ("2026-10-01", 40000))
        self.assertEqual(adele_now.body["ownerid@odata.bind"], f"/systemusers({USERS['adele']})")
        self.assertEqual(records()["quota-megan-5"].body["vibe_month"], "2027-03-01")
        self.assertEqual(adele_now.body["vibe_name"], "Adele Vance 2026-10")

    def test_first_of_month_wraps_the_year(self):
        from datetime import date
        self.assertEqual(sd.first_of_month(date(2026, 11, 30), 2), "2027-01-01")

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

    def test_products_have_no_owner_and_a_retired_one_is_deactivated(self):
        recs = records()
        workshop, legacy = recs["prod-workshop"], recs["prod-legacy"]
        self.assertNotIn("ownerid@odata.bind", workshop.body)
        self.assertEqual(
            {k: workshop.body[k] for k in ("vibe_productcode", "vibe_unit", "vibe_listprice", "vibe_vatrate")},
            {"vibe_productcode": "WS-DAY", "vibe_unit": 841200002, "vibe_listprice": 1450, "vibe_vatrate": 841200000},
        )
        self.assertIsNone(workshop.final_state)
        self.assertEqual(recs["prod-training"].body["vibe_vatrate"], 841200001)  # 9 %
        self.assertEqual(legacy.final_state, (1, 2))

    def test_load_order_puts_parents_first(self):
        order = [r.table.section for r in sd.build_records(DATA, USERS, NAV, CLOCK)]
        first = {s: order.index(s) for s in set(order)}
        self.assertLess(first["accounts"], first["contacts"])
        self.assertLess(first["contacts"], first["leads"])
        self.assertLess(first["leads"], first["opportunities"])
        self.assertLess(first["opportunities"], first["notes"])


if __name__ == "__main__":
    unittest.main()
