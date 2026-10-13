"""
load_sample_data.py — load the fictional sample data (data/sample-data.json)
into dev-salesapp, or refresh it (issue #35).

Every record has a fixed ID, so loading again updates the same records
instead of adding duplicates, and moves all dates back to "relative to
today". Records are owned by the four demo users (Megan Bowen, Adele Vance,
Alex Wilber, Diego Siciliani); the signed-in admin owns none.

Usage (repo root, .env with DATAVERSE_URL and TENANT_ID):
    python scripts/load_sample_data.py            # dry run: validate, show what would change
    python scripts/load_sample_data.py --apply    # load, then check as each demo user
    python scripts/load_sample_data.py --check    # only the check

Exit code 0 on success, 1 on a data error, a failed write or a failed check.
"""

import argparse
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sample_data as sd  # noqa: E402


# Sample data skips custom plug-ins (the Quota, Product line and Quote plug-ins, the process engine):
# the loader is not a manager, and demo data must always load.
BYPASS = {"MSCRM.BypassCustomPluginExecution": "true"}


def upsert(dv, rec, can_backdate):
    """Create the record with its fixed ID, or update it. Returns "created" or "updated"."""
    table = rec.table
    state = sd.current_state(dv, table, rec.id)
    if state is None:
        body = {k: v for k, v in rec.body.items() if v is not None}
        body[table.id_attribute] = rec.id
        if can_backdate:
            body["overriddencreatedon"] = rec.created_on
        dv.create(table.entity_set, body, headers=BYPASS)
        return "created"
    if table.open_state and state != table.open_state[0]:
        # Closed records (Qualified Leads, closed deals, completed activities)
        # are reopened for the update and closed again at the end.
        set_state(dv, rec, table.open_state)
    patch(dv, rec, rec.body)
    return "updated"


def set_state(dv, rec, state):
    patch(dv, rec, {"statecode": state[0], "statuscode": state[1]})


def patch(dv, rec, body):
    path = f"{rec.table.entity_set}({rec.id})"
    status, err, code, _ = dv.call("PATCH", path, body, headers=BYPASS)
    if status not in (200, 204):
        raise RuntimeError(f"update {rec.key} ({path}) failed: {status} {code} {err}")


def plan(dv, records):
    """Dry run: how many records per table would be created and updated."""
    counts = Counter()
    for rec in records:
        exists = sd.current_state(dv, rec.table, rec.id) is not None
        counts[(rec.table.section, "update" if exists else "create")] += 1
    for table in sd.TABLES:
        print(f"  {table.section:14} create {counts[(table.section, 'create')]:3}"
              f"   update {counts[(table.section, 'update')]:3}")


def load(dv, records):
    backdate = {t.section: sd.has_attribute(dv, t.logical, "overriddencreatedon") for t in sd.TABLES}
    for table in sd.TABLES:
        if not backdate[table.section]:
            print(f"  note: {table.logical} has no overriddencreatedon; its creation dates are today")
    done = Counter()
    for i, rec in enumerate(records, 1):
        done[(rec.table.section, upsert(dv, rec, backdate[rec.table.section]))] += 1
        if i % 25 == 0:
            print(f"  {i}/{len(records)} records written", flush=True)
    closing = [r for r in records if r.final_state]
    for rec in closing:
        set_state(dv, rec, rec.final_state)
    for table in sd.TABLES:
        print(f"  {table.section:14} created {done[(table.section, 'created')]:3}"
              f"   updated {done[(table.section, 'updated')]:3}")
    print(f"  {len(closing)} records closed (Qualified/Disqualified Leads, closed deals, completed activities)")


# --- check -------------------------------------------------------------------

def check(dv, data, users):
    """Home and Pipeline have something to show for every demo user, and nothing is duplicated."""
    ok = True
    today = datetime.now().astimezone().date()
    month = today.strftime("%Y-%m")
    nc = sd.choice(sd.LEAD_STATUSES, "notContacted")
    print(f"\n{'user':16} {'overdue':>7} {'today':>5} {'later':>5}  {'NC leads':>8}  {'open opps':>9} {'this month':>10}  {'pipeline':>8}")
    for key, user in users.items():
        mine = f"_ownerid_value eq {user} and statecode eq 0"
        tasks = dv.get(f"tasks?$select=scheduledend&$filter={mine}", as_user=user)["value"]
        due = Counter()
        for t in tasks:
            day = datetime.fromisoformat(t["scheduledend"].replace("Z", "+00:00")).astimezone().date() \
                if t.get("scheduledend") else None
            due["later" if day is None or day > today else "today" if day == today else "overdue"] += 1
        leads = dv.get(f"vibe_leads?$select=vibe_leadid&$filter={mine} and vibe_leadstatus eq {nc}", as_user=user)["value"]
        opps = dv.get(f"vibe_opportunities?$select=vibe_expectedclosedate&$filter={mine}", as_user=user)["value"]
        this_month = sum((o.get("vibe_expectedclosedate") or "").startswith(month) for o in opps)
        # Pipeline reads every open Opportunity (Read is Organization-wide).
        pipeline = dv.get("vibe_opportunities?$select=vibe_opportunityid&$filter=statecode eq 0", as_user=user)["value"]
        name = data["users"][key]
        print(f"{name:16} {due['overdue']:7} {due['today']:5} {due['later']:5}  {len(leads):8}  "
              f"{len(opps):9} {this_month:10}  {len(pipeline):8}")
        for label, count in (("overdue Task", due["overdue"]), ("Task due today", due["today"]),
                             ("Not Contacted Lead", len(leads)), ("open Opportunity", len(opps))):
            if count == 0:
                print(f"  FAIL {name} has no {label} on Home")
                ok = False
        if this_month == 0:
            print(f"  note: {name} has no Opportunity closing this month (normal at a month's end)")

    # A salesperson reads their own Quotas; Megan also her reports'; Diego none.
    sees = {"adele": {"adele"}, "alex": {"alex"}, "megan": {"megan", "adele", "alex"}, "diego": set()}
    for key, user in users.items():
        expected = sum(q["salesperson"] in sees[key] for q in data.get("quotas", []))
        rows = dv.get("vibe_quotas?$select=_vibe_salespersonid_value", as_user=user)["value"]
        got = len(rows)
        if got != expected:
            print(f"  FAIL {data['users'][key]} reads {got} Quotas, expected {expected}")
            ok = False
    # Everyone reads every Quote and its lines (Read is Organization-wide).
    # Quote templates and settings are read by everyone too: the PDF is drawn in the salesperson's browser.
    for label, entity_set, expected in (("Quotes", "vibe_quotes", len(data.get("quotes", []))), ("Quote lines", "vibe_quotelines", len(data.get("quoteLines", []))),
                                        ("Quote templates", "vibe_quotetemplates", len(data.get("quoteTemplates", []))), ("Quote settings", "vibe_quotesettingses", len(data.get("quoteSettings", [])))):
        for key, user in users.items():
            got = len(dv.get(f"{entity_set}?$select=statecode&$top=500", as_user=user)["value"])
            if got != expected:
                print(f"  FAIL {data['users'][key]} reads {got} {label}, expected {expected}")
                ok = False
    for label, entity_set, attribute, values in (
        ("Products", "vibe_products", "vibe_productcode", [r["code"] for r in data["products"]]),
        ("Accounts", "accounts", "name", [r["name"] for r in data["accounts"]]),
        ("Contacts", "contacts", "emailaddress1", [r["email"] for r in data["contacts"]]),
        ("Leads", "vibe_leads", "vibe_email", [r["email"] for r in data["leads"]]),
        ("Opportunities", "vibe_opportunities", "vibe_name", [r["name"] for r in data["opportunities"]]),
    ):
        expected = Counter(values)
        found = Counter()
        for start in range(0, len(values), 25):
            chunk = sorted(set(values[start:start + 25]))
            listed = ",".join("'" + v.replace("'", "''") + "'" for v in chunk)
            where = quote(f"Microsoft.Dynamics.CRM.In(PropertyName='{attribute}',PropertyValues=[{listed}])",
                          safe="(),'[]=.")
            for row in dv.get(f"{entity_set}?$select={attribute}&$filter={where}")["value"]:
                found[row[attribute]] += 1
        extra = {v: found[v] - expected[v] for v in found if found[v] > expected[v]}
        missing = [v for v in expected if found[v] < expected[v]]
        if extra:
            print(f"  FAIL {label}: more records than in the data file for {extra}")
            ok = False
        if missing:
            print(f"  FAIL {label}: missing {missing}")
            ok = False
    print("\nCheck " + ("passed" if ok else "FAILED"))
    return ok


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write to Dataverse (default: dry run)")
    parser.add_argument("--check", action="store_true", help="only run the check as each demo user")
    parser.add_argument("--data", default=str(sd.DATA_PATH), help="data file (default: data/sample-data.json)")
    args = parser.parse_args()

    data = sd.load_data(args.data)
    errors = sd.validate(data)
    if errors:
        print("The data file has problems:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("Sample data: " + "; ".join(sd.summary(data)))

    dv = sd.connect()
    users = sd.find_users(dv, data["users"])
    if args.check:
        return 0 if check(dv, data, users) else 1

    records = sd.build_records(data, users, sd.resolve_nav(dv), sd.Clock())
    if not args.apply:
        print("Dry run (add --apply to load):")
        plan(dv, records)
        return 0
    print(f"Loading into {dv.base}")
    load(dv, records)
    return 0 if check(dv, data, users) else 1


if __name__ == "__main__":
    sys.exit(main())
