"""
rule_admin_check.py -- building Business rules against dev-salesapp (issue #98).

The Business rules tab writes through the Dataverse Web API as whoever is signed in. This runs the
same writes as the demo users and checks the role and the plug-in do what the page assumes:

  * a Process builder (Megan) creates a block save rule for Contacts (it only matches a test
    last name, so no real record is touched); Dataverse records who changed it last
  * the plug-in enforces it at once: a Contact that matches cannot be created without an email
  * she switches it off and the effect goes; she deletes it
  * a salesperson (Adele) reads the rule but cannot create, change or delete one

Run:  python scripts/rule_admin_check.py          # run and clean up
      python scripts/rule_admin_check.py --keep   # leave the test records for a look
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from security_check import Dataverse, Report, cleanup, load_users  # noqa: E402

NAME = "[rule-check]"
TABLE_CONTACT = 841200003


def definition():
    return {
        "schemaVersion": 1,
        "table": "contact",
        "when": {"match": "all", "conditions": [{"field": "lastName", "op": "equals", "value": f"{NAME} Ghost"}, {"field": "email", "op": "isEmpty"}]},
        "effects": [{"type": "blockSave", "message": "A Contact needs an email address."}],
    }


def run(dv, report, users, track):
    megan, adele = users["megan"], users["adele"]
    print("Rule admin: a Process builder builds", flush=True)

    rule = track("vibe_businessrules", dv.create("vibe_businessrules", {
        "vibe_name": f"{NAME} No ghosts", "vibe_tablechoice": TABLE_CONTACT, "vibe_enabled": True,
        "vibe_definition": json.dumps(definition()),
    }, as_user=megan))
    report.check("A Process builder creates a Business rule", True)
    row = dv.get(f"vibe_businessrules({rule})?$select=vibe_name,vibe_enabled,vibe_definition,modifiedon,_modifiedby_value"
                 "&$expand=modifiedby($select=fullname)")
    report.check("... and it reads back with its definition", json.loads(row["vibe_definition"]) == definition())
    report.check("... and Dataverse says who changed it last", row["modifiedon"] and row["modifiedby"]["fullname"] == "Megan Bowen")

    print("Rule admin: the plug-in enforces it at once", flush=True)
    status, body, _, made = dv.call("POST", "contacts", {"firstname": "G", "lastname": f"{NAME} Ghost", "mobilephone": "+31 6 1234"}, as_user=adele)
    report.check("A Contact that matches the rule cannot be created without an email", status >= 400 and "email address" in json.dumps(body), f"status {status}")
    track("contacts", made)
    contact = track("contacts", dv.create("contacts", {"firstname": "G", "lastname": f"{NAME} Ghost", "emailaddress1": "ghost@example.com", "mobilephone": "+31 6 1234"}, as_user=adele))
    report.check("... but can with one", bool(contact))

    report.expect_status("She switches the rule off", dv.call("PATCH", f"vibe_businessrules({rule})", {"vibe_enabled": False}, as_user=megan), 204)
    status, _, _, made = dv.call("POST", "contacts", {"firstname": "H", "lastname": f"{NAME} Ghost", "mobilephone": "+31 6 1234"}, as_user=adele)
    report.check("With the rule off the same Contact saves", status < 400, f"status {status}")
    track("contacts", made)

    print("Rule admin: a salesperson reads", flush=True)
    status, rows, _, _ = dv.call("GET", f"vibe_businessrules?$select=vibe_name&$filter=vibe_businessruleid eq {rule}", as_user=adele)
    report.check("Adele reads the rule", status == 200 and len(rows["value"]) == 1)
    report.expect_status("She cannot create one", dv.call("POST", "vibe_businessrules", {
        "vibe_name": f"{NAME} Adele", "vibe_tablechoice": TABLE_CONTACT, "vibe_enabled": True, "vibe_definition": json.dumps(definition())}, as_user=adele), 403)
    report.expect_status("She cannot change one", dv.call("PATCH", f"vibe_businessrules({rule})", {"vibe_enabled": True}, as_user=adele), 403)
    report.expect_status("She cannot delete one", dv.call("DELETE", f"vibe_businessrules({rule})", as_user=adele), 403)

    error = track("vibe_engineerrors", dv.create("vibe_engineerrors", {
        "vibe_code": "fieldMissing", "vibe_message": f"{NAME} The field no longer exists.", "vibe_occurredon": "2026-10-13T12:00:00Z",
        "vibe_RuleId@odata.bind": f"/vibe_businessrules({rule})",
    }))
    report.check("An Engine error can point at the rule", bool(error))
    report.expect_status("Megan deletes the rule, even with an Engine error pointing at it", dv.call("DELETE", f"vibe_businessrules({rule})", as_user=megan), 204)
    row = dv.get(f"vibe_engineerrors({error})?$select=_vibe_ruleid_value")
    report.check("... which leaves the error behind without a rule", row["_vibe_ruleid_value"] is None)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--keep", action="store_true", help="leave the test records in place")
    args = parser.parse_args()

    dv = Dataverse()
    report = Report()
    created = []

    def track(entity_set, record_id):
        if record_id:
            created.append((entity_set, record_id))
        return record_id

    try:
        users = load_users(dv, report)
        run(dv, report, users, track)
    except RuntimeError as e:
        report.check("script ran to the end", False, str(e))
    finally:
        if args.keep:
            print(f"Kept {len(created)} records named '{NAME} …'", flush=True)
        else:
            print("Cleanup", flush=True)
            cleanup(dv, created)

    total, failed = len(report.rows), len(report.failed)
    print(f"\n{total - failed}/{total} checks passed", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
