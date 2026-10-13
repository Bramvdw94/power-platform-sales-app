"""
engine_check.py -- the process engine end to end against dev-salesapp (issue #94).

Part of the security check: security_check.py calls run() with the demo users. It
can also run on its own:

    python scripts/engine_check.py          # run and clean up
    python scripts/engine_check.py --keep   # leave the test records for a look

It writes a Process, a Lead Process and some Business rules as the admin, each
matched only by a record named "[engine-check] ...", so nobody's real records are
touched while the rules exist. Then, as the demo users:

  * a new record gets its Process version and first Step, and the first Step's
    Action Task appears in the same save
  * a Gate rejects a forward Step move over the Web API, and lets it through once
    the record is ready; Stage follows the Step; a moved-to Step makes its Task
    once, not again after going back and forward
  * a block save rule rejects a Web API write
  * a salesperson cannot Switch Process; the manager who is a Process builder can
  * a broken rule fails open and leaves an Engine error row
  * salespeople read definitions, not Engine errors, and cannot write definitions
  * the kill switch turns the engine off, and the bypass option loads without it

All records are removed afterwards (a leftover kill switch value is removed too).
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from security_check import (  # noqa: E402
    Dataverse, Report, cleanup, load_users, nav_property,
)

NAME = "[engine-check]"
CHOICE_BASE = 841200000
TABLE_LEAD, TABLE_OPPORTUNITY = CHOICE_BASE, CHOICE_BASE + 1
BYPASS = {"MSCRM.BypassCustomPluginExecution": "true"}
KILL_SWITCH = "vibe_ProcessEngineEnabled"

OPPORTUNITY_PROCESS = {
    "schemaVersion": 1,
    "table": "opportunity",
    "entryCriteria": {"match": "all", "conditions": [{"field": "name", "op": "equals", "value": f"{NAME} Opportunity"}]},
    "steps": [
        {"id": "s1", "name": "Qualify", "mapsTo": "qualification",
         "gate": {"checks": [{"field": "description", "op": "isNotEmpty"}]},
         "actions": [{"id": "a1", "type": "createTask", "subject": f"{NAME} Plan discovery call", "dueInDays": 2, "assignTo": "owner"}]},
        {"id": "s2", "name": "Discover", "mapsTo": "needsAnalysis",
         "actions": [{"id": "a2", "type": "createTask", "subject": f"{NAME} Prepare proposal", "dueInDays": 3, "assignTo": "owner"}]},
        {"id": "s3", "name": "Propose", "mapsTo": "proposal"},
    ],
}
LEAD_PROCESS = {
    "schemaVersion": 1,
    "table": "lead",
    "entryCriteria": {"match": "all", "conditions": [{"field": "company", "op": "equals", "value": f"{NAME} Company"}]},
    "steps": [
        {"id": "l1", "name": "New", "mapsTo": "notContacted", "gate": {"checks": [{"field": "email", "op": "isNotEmpty"}]}},
        {"id": "l2", "name": "Talking", "mapsTo": "working"},
    ],
}
BLOCK_RULE = {
    "schemaVersion": 1,
    "table": "opportunity",
    "when": {"match": "all", "conditions": [{"field": "description", "op": "equals", "value": f"{NAME} blocked"}]},
    "effects": [{"type": "blockSave", "message": "That description is not allowed."}],
}
BROKEN_RULE = {
    "schemaVersion": 1,
    "table": "opportunity",
    "when": {"match": "all", "conditions": [{"field": "removedField", "op": "isNotEmpty"}]},
    "effects": [{"type": "required", "field": "description"}],
}


def message(result):
    err = result[1]
    return err.get("message", "") if isinstance(err, dict) else ""


def run(dv, report, users, track):
    records, rules = [], []
    try:
        _run(dv, report, users, track, records, rules)
    finally:
        sweep(dv, records, rules)


def sweep(dv, records, rules):
    """Engine errors and Action Tasks the plug-in wrote while the checks ran; the deletes of the test records come later."""
    for record_id in records:
        for entity_set, key, query in (
            ("vibe_engineerrors", "vibe_engineerrorid", f"vibe_engineerrors?$select=vibe_engineerrorid&$filter=vibe_recordid eq '{record_id}'"),
            ("tasks", "activityid", f"tasks?$select=activityid&$filter=_regardingobjectid_value eq {record_id}"),
        ):
            for row in dv.get(query)["value"]:
                dv.call("DELETE", f"{entity_set}({row[key]})")
    for rule_id in rules:
        for row in dv.get(f"vibe_engineerrors?$select=vibe_engineerrorid&$filter=_vibe_ruleid_value eq {rule_id}")["value"]:
            dv.call("DELETE", f"vibe_engineerrors({row['vibe_engineerrorid']})")


def _run(dv, report, users, track, records, rules):
    adele, megan, alex, diego = (users[k] for k in ("adele", "megan", "alex", "diego"))
    print("Process engine: definitions", flush=True)

    def create(entity_set, body, headers=None, as_user=None):
        record_id = track(entity_set, dv.create(entity_set, body, headers=headers, as_user=as_user))
        if entity_set in ("vibe_opportunities", "vibe_leads"):
            records.append(record_id)
        if entity_set == "vibe_businessrules":
            rules.append(record_id)
        return record_id

    def process_with_version(table_choice, definition, name):
        process = create("vibe_processes", {
            "vibe_name": name, "vibe_tablechoice": table_choice, "vibe_priority": 0, "vibe_isfallback": False,
        })
        version = create("vibe_processversions", {
            "vibe_name": f"{name} v1", "vibe_versionnumber": 1, "vibe_definition": json.dumps(definition),
            "vibe_ProcessId@odata.bind": f"/vibe_processes({process})",
        })
        status = dv.call("PATCH", f"vibe_processes({process})", {"vibe_LatestVersionId@odata.bind": f"/vibe_processversions({version})"})[0]
        report.check(f"{name}: published as v1", status == 204)
        process_ids.append(process)
        return process, version

    process_ids = []
    _, opp_version = process_with_version(TABLE_OPPORTUNITY, OPPORTUNITY_PROCESS, f"{NAME} Opportunity Process")
    opp_process = process_ids[0]
    opp_version_2 = create("vibe_processversions", {
        "vibe_name": f"{NAME} Opportunity Process v2", "vibe_versionnumber": 2, "vibe_definition": json.dumps(OPPORTUNITY_PROCESS),
        "vibe_ProcessId@odata.bind": f"/vibe_processes({opp_process})",
    })
    _, lead_version = process_with_version(TABLE_LEAD, LEAD_PROCESS, f"{NAME} Lead Process")
    block_rule = create("vibe_businessrules", {
        "vibe_name": f"{NAME} No blocked description", "vibe_tablechoice": TABLE_OPPORTUNITY, "vibe_enabled": True,
        "vibe_definition": json.dumps(BLOCK_RULE),
    })

    account = create("accounts", {"name": f"{NAME} Account"}, as_user=adele)
    account_nav = nav_property(dv, "vibe_opportunity", "account", "vibe_accountid")

    def opportunity_body(name, **extra):
        return {
            "vibe_name": name, f"{account_nav}@odata.bind": f"/accounts({account})", "vibe_stage": CHOICE_BASE,
            "vibe_estimatedvalue": 1000, "vibe_expectedclosedate": "2099-12-31", **extra,
        }

    def read(opportunity):
        return dv.get(f"vibe_opportunities({opportunity})?$select=vibe_stage,vibe_currentstep,vibe_stepenteredon,"
                      f"_vibe_processversionid_value,vibe_description")

    def tasks(record_id):
        return dv.get(f"tasks?$select=subject,vibe_actionid,_ownerid_value,statecode,scheduledend"
                      f"&$filter=_regardingobjectid_value eq {record_id}")["value"]

    def open_tasks(record_id, action_id):
        return [t for t in tasks(record_id) if t["vibe_actionid"] == action_id and t["statecode"] == 0]

    print("Process engine: a new record gets its Process", flush=True)
    opportunity = create("vibe_opportunities", opportunity_body(f"{NAME} Opportunity"), as_user=adele)
    row = read(opportunity)
    report.check("A new Opportunity gets the Process version", row["_vibe_processversionid_value"] == opp_version)
    report.check("... and its first Step", row["vibe_currentstep"] == "s1")
    report.check("... with a Step date", bool(row["vibe_stepenteredon"]))
    first = open_tasks(opportunity, "a1")
    report.check("The first Step's Action Task exists after the create (same save)", len(first) == 1)
    if first:
        report.check("... owned by the Opportunity's Owner", first[0]["_ownerid_value"] == adele)
        report.check("... with the Step's Action id", first[0]["vibe_actionid"] == "a1")

    plain = create("vibe_opportunities", opportunity_body(f"{NAME} Unmatched"), as_user=adele)
    report.check("An Opportunity matching no Process works as before", read(plain)["_vibe_processversionid_value"] is None)

    print("Process engine: Gate and Stage", flush=True)
    stage_discover = CHOICE_BASE + 1
    result = dv.call("PATCH", f"vibe_opportunities({opportunity})", {"vibe_currentstep": "s2"}, as_user=adele)
    report.expect_status("A forward Step move with an open Gate is rejected over the Web API", result, 400)
    report.check("... naming the open check", "open check" in message(result), message(result)[:120])
    report.check("... and nothing changed", read(opportunity)["vibe_currentstep"] == "s1")

    report.expect_status("The same move passes once the Gate is met", dv.call(
        "PATCH", f"vibe_opportunities({opportunity})", {"vibe_currentstep": "s2", "vibe_description": "Wants a quote"}, as_user=adele), 204)
    row = read(opportunity)
    report.check("Stage follows the Step", row["vibe_stage"] == stage_discover)
    report.check("The new Step's Action Task appears in the same save", len(open_tasks(opportunity, "a2")) == 1)

    report.expect_status("Moving back is never gated", dv.call(
        "PATCH", f"vibe_opportunities({opportunity})", {"vibe_currentstep": "s1"}, as_user=adele), 204)
    report.check("... and Stage follows it back", read(opportunity)["vibe_stage"] == CHOICE_BASE)
    report.expect_status("Moving forward again", dv.call(
        "PATCH", f"vibe_opportunities({opportunity})", {"vibe_currentstep": "s2"}, as_user=adele), 204)
    report.check("... does not make the Task twice", len(open_tasks(opportunity, "a2")) == 1)

    report.expect_status("Someone who cannot write the record cannot move it either", dv.call(
        "PATCH", f"vibe_opportunities({opportunity})", {"vibe_currentstep": "s3"}, as_user=diego), 403)

    print("Process engine: Switch Process", flush=True)
    result = dv.call("PATCH", f"vibe_opportunities({opportunity})", {"vibe_ProcessVersionId@odata.bind": f"/vibe_processversions({opp_version_2})"}, as_user=adele)
    report.expect_status("Adele (Owner, not her own manager) cannot Switch Process", result, 400)
    report.check("... and is told who can", "manager" in message(result) and "Process builder" in message(result), message(result)[:120])
    report.check("... nothing changed", read(opportunity)["_vibe_processversionid_value"] == opp_version)
    report.expect_status("Megan (Adele's manager and a Process builder) can Switch Process", dv.call(
        "PATCH", f"vibe_opportunities({opportunity})", {"vibe_ProcessVersionId@odata.bind": f"/vibe_processversions({opp_version_2})"}, as_user=megan), 204)
    row = read(opportunity)
    report.check("... the record is on the new version, on the same Step", row["_vibe_processversionid_value"] == opp_version_2 and row["vibe_currentstep"] == "s2")

    print("Process engine: Business rules", flush=True)
    result = dv.call("PATCH", f"vibe_opportunities({plain})", {"vibe_description": f"{NAME} blocked"}, as_user=adele)
    report.expect_status("A block save rule rejects a Web API write", result, 400)
    report.check("... naming the rule", f"Blocked by the rule “{NAME} No blocked description”" in message(result), message(result)[:160])
    result = dv.call("POST", "vibe_opportunities", opportunity_body(f"{NAME} Blocked create", vibe_description=f"{NAME} blocked"), as_user=adele)
    report.expect_status("... also on create", result, 400)
    report.expect_status("An unrelated edit still saves", dv.call(
        "PATCH", f"vibe_opportunities({plain})", {"vibe_nextstep": "Call back"}, as_user=adele), 204)

    broken = create("vibe_businessrules", {
        "vibe_name": f"{NAME} Broken rule", "vibe_tablechoice": TABLE_OPPORTUNITY, "vibe_enabled": True,
        "vibe_definition": json.dumps(BROKEN_RULE),
    })
    report.expect_status("A rule on a removed field is skipped, the save goes through", dv.call(
        "PATCH", f"vibe_opportunities({plain})", {"vibe_nextstep": "Call again"}, as_user=adele), 204)
    errors = dv.get(f"vibe_engineerrors?$select=vibe_code,vibe_message&$filter=_vibe_ruleid_value eq {broken}")["value"]
    report.check("... and an Engine error row says why", len(errors) >= 1 and errors[0]["vibe_code"] == "fieldMissing", str(errors)[:160])
    report.expect_status("The broken rule is switched off again", dv.call("PATCH", f"vibe_businessrules({broken})", {"vibe_enabled": False}), 204)

    print("Process engine: Leads", flush=True)
    lead = create("vibe_leads", {
        "vibe_lastname": f"{NAME} Lead", "vibe_company": f"{NAME} Company", "vibe_name": f"{NAME} Lead", "vibe_leadstatus": CHOICE_BASE,
    }, as_user=adele)
    row = dv.get(f"vibe_leads({lead})?$select=vibe_currentstep,_vibe_processversionid_value,vibe_leadstatus")
    report.check("A new Lead gets the Lead Process and its first Step", row["_vibe_processversionid_value"] == lead_version and row["vibe_currentstep"] == "l1")
    report.expect_status("A Lead's Gate rejects the move to the next Step", dv.call(
        "PATCH", f"vibe_leads({lead})", {"vibe_currentstep": "l2"}, as_user=adele), 400)
    report.expect_status("... and passes once the email is filled in", dv.call(
        "PATCH", f"vibe_leads({lead})", {"vibe_currentstep": "l2", "vibe_email": "check@example.com"}, as_user=adele), 204)
    report.check("... Lead status follows the Step",
                 dv.get(f"vibe_leads({lead})?$select=vibe_leadstatus")["vibe_leadstatus"] == CHOICE_BASE + 1)

    print("Process engine: who may read and write definitions", flush=True)
    for key in ("adele", "alex", "diego"):
        who, caller = key.capitalize(), users[key]
        report.expect_status(f"{who} reads Processes", dv.call("GET", "vibe_processes?$top=1&$select=vibe_name", as_user=caller), 200)
        report.expect_status(f"{who} reads Business rules", dv.call("GET", "vibe_businessrules?$top=1&$select=vibe_name", as_user=caller), 200)
        report.expect_status(f"{who} reads Process versions", dv.call("GET", "vibe_processversions?$top=1&$select=vibe_name", as_user=caller), 200)
        report.expect_status(f"{who} cannot read Engine errors", dv.call("GET", "vibe_engineerrors?$top=1&$select=vibe_name", as_user=caller), 403)
        report.expect_status(f"{who} cannot write a Business rule", dv.call(
            "PATCH", f"vibe_businessrules({block_rule})", {"vibe_enabled": False}, as_user=caller), 403)
        report.expect_status(f"{who} cannot create a Process", dv.call(
            "POST", "vibe_processes", {"vibe_name": f"{NAME} nope", "vibe_tablechoice": TABLE_LEAD, "vibe_priority": 1}, as_user=caller), 403)
    report.expect_status("Megan (Process builder) reads Engine errors", dv.call(
        "GET", "vibe_engineerrors?$top=1&$select=vibe_name", as_user=megan), 200)
    report.expect_status("Megan can edit a Business rule", dv.call(
        "PATCH", f"vibe_businessrules({block_rule})", {"vibe_name": f"{NAME} No blocked description"}, as_user=megan), 204)

    print("Process engine: kill switch and bypass", flush=True)
    definition = dv.get(f"environmentvariabledefinitions?$select=environmentvariabledefinitionid&$filter=schemaname eq '{KILL_SWITCH}'")["value"]
    report.check(f"The environment variable {KILL_SWITCH} exists", len(definition) == 1)
    if definition:
        value_id = dv.create("environmentvariablevalues", {
            "value": "off",
            "EnvironmentVariableDefinitionId@odata.bind": f"/environmentvariabledefinitions({definition[0]['environmentvariabledefinitionid']})",
        })
        track("environmentvariablevalues", value_id)
        try:
            report.expect_status("With the engine off, the block save rule no longer applies", dv.call(
                "PATCH", f"vibe_opportunities({plain})", {"vibe_description": f"{NAME} blocked"}, as_user=adele), 204)
            off = create("vibe_opportunities", opportunity_body(f"{NAME} Opportunity"), as_user=adele)
            row = read(off)
            report.check("... and a matching new Opportunity gets no Process", row["_vibe_processversionid_value"] is None)
            report.check("... and no Task", len(tasks(off)) == 0)
        finally:
            dv.call("PATCH", f"environmentvariablevalues({value_id})", {"value": "on"})
        dv.call("PATCH", f"vibe_opportunities({plain})", {"vibe_description": "fine again"}, as_user=adele)
        report.expect_status("Back on, the rule applies again", dv.call(
            "PATCH", f"vibe_opportunities({plain})", {"vibe_description": f"{NAME} blocked"}, as_user=adele), 400)

    bypass = create("vibe_opportunities", opportunity_body(f"{NAME} Opportunity", vibe_description=f"{NAME} blocked"), headers=BYPASS)
    row = read(bypass)
    report.check("A load with the bypass option skips the engine (no Process, block save rule ignored)",
                 row["_vibe_processversionid_value"] is None and row["vibe_description"] == f"{NAME} blocked")


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
            print(f"Kept {len(created)} records named '{NAME} ...'", flush=True)
        else:
            print("Cleanup", flush=True)
            cleanup(dv, created)

    total, failed = len(report.rows), len(report.failed)
    print(f"\n{total - failed}/{total} checks passed", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
