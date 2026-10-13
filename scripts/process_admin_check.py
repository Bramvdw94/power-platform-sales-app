"""
process_admin_check.py -- building Processes against dev-salesapp (issue #97).

The Automation page writes through the Dataverse Web API as whoever is signed in. This runs the
same writes as the demo users and checks the role does what the page assumes:

  * a Process builder (Megan) creates a draft Process with its draft definition, edits the draft,
    publishes it as version 1 and then 2 (the version row names its Process and publisher), points
    the Process at the latest version, changes its priority and retires it
  * Move to latest version: a Process builder binds a record of her team to the newer version of its
    own Process; the record keeps its Step
  * a salesperson (Adele) reads Processes and versions, cannot create or change them, and cannot
    read Engine errors

Run:  python scripts/process_admin_check.py          # run and clean up
      python scripts/process_admin_check.py --keep   # leave the test records for a look
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from security_check import Dataverse, Report, cleanup, load_users, nav_property  # noqa: E402

NAME = "[admin-check]"
CHOICE_BASE = 841200000
TABLE_OPPORTUNITY = CHOICE_BASE + 1


def definition(**extra):
    return {
        "schemaVersion": 1,
        "table": "opportunity",
        "entryCriteria": {"match": "all", "conditions": [{"field": "name", "op": "equals", "value": f"{NAME} Opportunity"}]},
        "steps": [
            {"id": "s1", "name": "Qualify", "mapsTo": "qualification"},
            {"id": "s2", "name": "Discover", "mapsTo": "needsAnalysis", **extra},
        ],
    }


def run(dv, report, users, track):
    megan, adele = users["megan"], users["adele"]
    print("Process admin: a Process builder builds", flush=True)

    process = track("vibe_processes", dv.create("vibe_processes", {
        "vibe_name": f"{NAME} Process", "vibe_tablechoice": TABLE_OPPORTUNITY, "vibe_priority": 0,
        "vibe_isfallback": False, "vibe_retired": False, "vibe_draftdefinition": json.dumps(definition()),
    }, as_user=megan))
    report.check("A Process builder creates a draft Process with its draft definition", True)
    row = dv.get(f"vibe_processes({process})?$select=vibe_draftdefinition,_vibe_latestversionid_value")
    report.check("... which has no latest version yet", row["_vibe_latestversionid_value"] is None)

    edited = definition(guidance="Find the need")
    report.expect_status("She edits the draft", dv.call("PATCH", f"vibe_processes({process})", {"vibe_draftdefinition": json.dumps(edited)}, as_user=megan), 204)
    report.check("... and it reads back", json.loads(dv.get(f"vibe_processes({process})?$select=vibe_draftdefinition")["vibe_draftdefinition"]) == edited)

    def publish(number, body):
        version = track("vibe_processversions", dv.create("vibe_processversions", {
            "vibe_name": f"{NAME} Process v{number}", "vibe_versionnumber": number, "vibe_definition": json.dumps(body),
            "vibe_publishedon": "2026-10-13T12:00:00Z",
            "vibe_ProcessId@odata.bind": f"/vibe_processes({process})",
            "vibe_PublishedById@odata.bind": f"/systemusers({megan})",
        }, as_user=megan))
        status = dv.call("PATCH", f"vibe_processes({process})", {"vibe_LatestVersionId@odata.bind": f"/vibe_processversions({version})"}, as_user=megan)
        report.expect_status(f"She publishes version {number} and points the Process at it", status, 204)
        return version

    v1 = publish(1, definition())
    v2 = publish(2, edited)
    versions = dv.get(f"vibe_processversions?$select=vibe_versionnumber,vibe_publishedon,_vibe_publishedbyid_value"
                      f"&$filter=_vibe_processid_value eq {process}&$orderby=vibe_versionnumber asc")["value"]
    report.check("Both versions are stored with number, date and publisher",
                 [(v["vibe_versionnumber"], v["_vibe_publishedbyid_value"]) for v in versions] == [(1, megan), (2, megan)])

    print("Process admin: Move to latest version", flush=True)
    account = track("accounts", dv.create("accounts", {"name": f"{NAME} Account"}, as_user=adele))
    account_nav = nav_property(dv, "vibe_opportunity", "account", "vibe_accountid")
    opportunity = track("vibe_opportunities", dv.create("vibe_opportunities", {
        "vibe_name": f"{NAME} Opportunity", f"{account_nav}@odata.bind": f"/accounts({account})", "vibe_stage": CHOICE_BASE,
        "vibe_estimatedvalue": 1000, "vibe_expectedclosedate": "2099-12-31",
    }, as_user=adele))
    row = dv.get(f"vibe_opportunities({opportunity})?$select=_vibe_processversionid_value,vibe_currentstep")
    report.check("A new record of Adele's gets the latest version (2) and its first Step", row["_vibe_processversionid_value"] == v2 and row["vibe_currentstep"] == "s1")
    dv.call("PATCH", f"vibe_opportunities({opportunity})", {"vibe_currentstep": "s2"}, as_user=adele)
    dv.call("PATCH", f"vibe_opportunities({opportunity})", {"vibe_ProcessVersionId@odata.bind": f"/vibe_processversions({v1})"}, as_user=megan)
    row = dv.get(f"vibe_opportunities({opportunity})?$select=_vibe_processversionid_value,vibe_currentstep")
    report.check("Megan can put a record on the older version", row["_vibe_processversionid_value"] == v1)
    report.expect_status("She moves it to the latest version", dv.call(
        "PATCH", f"vibe_opportunities({opportunity})", {"vibe_ProcessVersionId@odata.bind": f"/vibe_processversions({v2})"}, as_user=megan), 204)
    row = dv.get(f"vibe_opportunities({opportunity})?$select=_vibe_processversionid_value,vibe_currentstep,vibe_stage")
    report.check("... the record is on version 2", row["_vibe_processversionid_value"] == v2)
    report.check("... and stays on its Step", row["vibe_currentstep"] == "s2" and row["vibe_stage"] == CHOICE_BASE + 1)

    print("Process admin: priority and retire", flush=True)
    report.expect_status("She changes the priority", dv.call("PATCH", f"vibe_processes({process})", {"vibe_priority": 7}, as_user=megan), 204)
    report.expect_status("She retires the Process", dv.call("PATCH", f"vibe_processes({process})", {"vibe_retired": True, "vibe_isfallback": False}, as_user=megan), 204)

    print("Process admin: a salesperson reads", flush=True)
    status, rows, _, _ = dv.call("GET", f"vibe_processes?$select=vibe_name,vibe_draftdefinition&$filter=vibe_processid eq {process}", as_user=adele)
    report.check("Adele reads the Process and its draft", status == 200 and len(rows["value"]) == 1)
    status, rows, _, _ = dv.call("GET", f"vibe_processversions?$select=vibe_versionnumber&$filter=_vibe_processid_value eq {process}", as_user=adele)
    report.check("... and its versions", status == 200 and len(rows["value"]) == 2)
    report.expect_status("She cannot create a Process", dv.call("POST", "vibe_processes", {
        "vibe_name": f"{NAME} Adele", "vibe_tablechoice": TABLE_OPPORTUNITY, "vibe_priority": 0}, as_user=adele), 403)
    report.expect_status("She cannot change one", dv.call("PATCH", f"vibe_processes({process})", {"vibe_name": f"{NAME} Hacked"}, as_user=adele), 403)
    report.expect_status("She cannot publish a version", dv.call("POST", "vibe_processversions", {
        "vibe_name": f"{NAME} v3", "vibe_versionnumber": 3, "vibe_definition": json.dumps(definition()),
        "vibe_ProcessId@odata.bind": f"/vibe_processes({process})"}, as_user=adele), 403)
    report.expect_status("She cannot read Engine errors", dv.call("GET", "vibe_engineerrors?$top=1", as_user=adele), 403)
    status, _, _, _ = dv.call("GET", "vibe_engineerrors?$top=1", as_user=megan)
    report.check("A Process builder can", status == 200)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--keep", action="store_true", help="leave the test records in place")
    args = parser.parse_args()

    dv = Dataverse()
    report = Report()
    created = []

    def track(entity_set, record_id):
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
            for entity_set, record_id in created:
                if entity_set == "vibe_opportunities":
                    for row in dv.get(f"tasks?$select=activityid&$filter=_regardingobjectid_value eq {record_id}")["value"]:
                        dv.call("DELETE", f"tasks({row['activityid']})")
            cleanup(dv, created)

    total, failed = len(report.rows), len(report.failed)
    print(f"\n{total - failed}/{total} checks passed", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
