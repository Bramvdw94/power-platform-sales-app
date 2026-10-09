"""
security_check.py — verify the SalesApp Salesperson role and manager
hierarchy against a live Dataverse environment (dev-salesapp).

Every check calls the Web API as one of the demo users through impersonation
(the MSCRMCallerID header), so it needs a signed-in admin with the
prvActOnBehalfOfAnotherUser privilege (System Administrator has it).

Users (from the sample data, issue #20):
  Megan Bowen      manager
  Adele Vance      reports to Megan
  Alex Wilber      reports to Megan (Adele's peer)
  Diego Siciliani  outside Megan's team

The script creates its own records as Adele, all named "[security-check] …",
runs the checks, and deletes the records again as the admin.

Usage (repo root, .env with DATAVERSE_URL and TENANT_ID):
    python scripts/security_check.py          # run and clean up
    python scripts/security_check.py --keep   # leave the records for a look

Exit code 0 when every check passes, 1 otherwise.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from auth import get_plugin_headers, get_token, load_env  # noqa: E402

ROLE_NAME = "SalesApp Salesperson"
TAG = "[security-check]"
USERS = {
    "megan": "Megan Bowen",
    "adele": "Adele Vance",
    "alex": "Alex Wilber",
    "diego": "Diego Siciliani",
}


class Dataverse:
    def __init__(self):
        load_env()
        self.base = os.environ["DATAVERSE_URL"].rstrip("/") + "/api/data/v9.2/"
        self.headers = get_plugin_headers("dv-security", get_token())
        self.headers.update({
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
        })

    def call(self, method, path, body=None, as_user=None):
        """Return (status, json_or_none, error_code_or_none, entity_id_or_none)."""
        headers = dict(self.headers)
        if as_user:
            headers["MSCRMCallerID"] = as_user
        data = json.dumps(body).encode() if body is not None else None
        # Python 3.14 refuses raw spaces in a URL; OData filters are full of them.
        req = urllib.request.Request(self.base + path.replace(" ", "%20"), data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                entity_id = None
                location = resp.headers.get("OData-EntityId")
                if location and "(" in location:
                    entity_id = location.rsplit("(", 1)[1].rstrip(")")
                return resp.status, (json.loads(raw) if raw else None), None, entity_id
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                err = json.loads(raw).get("error", {})
            except ValueError:
                err = {"message": raw.decode(errors="replace")}
            code = err.get("code")
            if not code and err.get("message"):
                code = err["message"][:80]
            return e.code, err, code, None

    def get(self, path, as_user=None):
        status, body, code, _ = self.call("GET", path, as_user=as_user)
        if status != 200:
            raise RuntimeError(f"GET {path} failed: {status} {code}")
        return body

    def create(self, entity_set, body, as_user=None):
        status, err, code, entity_id = self.call("POST", entity_set, body, as_user=as_user)
        if status not in (201, 204) or not entity_id:
            raise RuntimeError(f"create {entity_set} failed: {status} {code} {err}")
        return entity_id


def q(value):
    return value.replace("'", "''")


def nav_property(dv, referencing, referenced, attribute):
    """Navigation property on `referencing` that binds `attribute` to `referenced`."""
    body = dv.get(
        f"EntityDefinitions(LogicalName='{referencing}')/ManyToOneRelationships"
        f"?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity,ReferencingAttribute"
        f"&$filter=ReferencedEntity eq '{referenced}' and ReferencingAttribute eq '{attribute}'"
    )
    rows = body["value"]
    if len(rows) != 1:
        raise RuntimeError(f"expected one {referencing}.{attribute} -> {referenced} relationship, got {len(rows)}")
    return rows[0]["ReferencingEntityNavigationPropertyName"]


class Report:
    def __init__(self):
        self.rows = []

    def check(self, name, ok, detail=""):
        self.rows.append((name, ok, detail))
        print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""), flush=True)

    def expect_status(self, name, result, expected):
        status, err, code, _ = result
        detail = f"{status}" + (f" {code}" if code else "")
        if status != expected and isinstance(err, dict) and err.get("message"):
            detail += f": {err['message'][:240]}"
        self.check(name, status == expected, detail)

    @property
    def failed(self):
        return [r for r in self.rows if not r[1]]


def load_users(dv, report):
    ids = {}
    for key, fullname in USERS.items():
        rows = dv.get(f"systemusers?$select=systemuserid,_parentsystemuserid_value,isdisabled"
                      f"&$filter=fullname eq '{q(fullname)}'")["value"]
        if len(rows) != 1:
            raise RuntimeError(f"expected one user named {fullname}, found {len(rows)}")
        ids[key] = rows[0]
    print("Preflight", flush=True)
    for key, fullname in USERS.items():
        user = ids[key]
        roles = dv.get(f"systemusers({user['systemuserid']})/systemuserroles_association"
                       f"?$select=name&$filter=name eq '{q(ROLE_NAME)}'")["value"]
        report.check(f"{fullname} has {ROLE_NAME}", len(roles) == 1)
    megan = ids["megan"]["systemuserid"]
    for key in ("adele", "alex"):
        report.check(f"{USERS[key]} reports to Megan", ids[key]["_parentsystemuserid_value"] == megan)
    report.check("Diego is outside Megan's team", ids["diego"]["_parentsystemuserid_value"] != megan)
    return {k: v["systemuserid"] for k, v in ids.items()}


def owner_of(dv, entity_set, record_id):
    return dv.get(f"{entity_set}({record_id})?$select=_ownerid_value")["_ownerid_value"]


def run(dv, report, created):
    users = load_users(dv, report)
    adele, megan, alex, diego = users["adele"], users["megan"], users["alex"], users["diego"]

    def track(entity_set, record_id):
        created.append((entity_set, record_id))
        return record_id

    print("Create as Adele (Create privilege, polymorphic writes)", flush=True)
    account = track("accounts", dv.create("accounts", {"name": f"{TAG} Account"}, as_user=adele))
    report.check("Adele creates an Account", True)

    contact_nav = nav_property(dv, "contact", "account", "parentcustomerid")
    result = dv.call("POST", "contacts", {
        "firstname": "Check", "lastname": f"{TAG} Contact",
        f"{contact_nav}@odata.bind": f"/accounts({account})",
    }, as_user=adele)
    report.expect_status(f"Contact under an Account ({contact_nav})", result, 204)
    if result[3]:
        track("contacts", result[3])

    lead = track("vibe_leads", dv.create("vibe_leads", {
        "vibe_lastname": f"{TAG} Lead", "vibe_company": f"{TAG} Company", "vibe_name": f"{TAG} Lead",
    }, as_user=adele))
    stage = dv.get("GlobalOptionSetDefinitions(Name='vibe_stage')/Microsoft.Dynamics.CRM.OptionSetMetadata")["Options"][0]["Value"]
    opportunity_account = nav_property(dv, "vibe_opportunity", "account", "vibe_accountid")
    opportunity = track("vibe_opportunities", dv.create("vibe_opportunities", {
        "vibe_name": f"{TAG} Opportunity",
        f"{opportunity_account}@odata.bind": f"/accounts({account})",
        "vibe_stage": stage,
        "vibe_estimatedvalue": 1000,
        "vibe_expectedclosedate": "2026-12-31",
    }, as_user=adele))
    report.check("Adele creates a Lead and an Opportunity", True)

    note_nav = nav_property(dv, "annotation", "vibe_lead", "objectid")
    result = dv.call("POST", "annotations", {
        "subject": f"{TAG} Note", "notetext": "check",
        f"{note_nav}@odata.bind": f"/vibe_leads({lead})",
    }, as_user=adele)
    report.expect_status(f"Note on a Lead ({note_nav})", result, 204)
    if result[3]:
        track("annotations", result[3])

    task_nav = nav_property(dv, "task", "vibe_opportunity", "regardingobjectid")
    result = dv.call("POST", "tasks", {
        "subject": f"{TAG} Task",
        f"{task_nav}@odata.bind": f"/vibe_opportunities({opportunity})",
    }, as_user=adele)
    report.expect_status(f"Task on an Opportunity ({task_nav})", result, 204)
    task = track("tasks", result[3]) if result[3] else None

    call_nav = nav_property(dv, "phonecall", "vibe_opportunity", "regardingobjectid")
    result = dv.call("POST", "phonecalls", {
        "subject": f"{TAG} Phone Call", "directioncode": True,
        f"{call_nav}@odata.bind": f"/vibe_opportunities({opportunity})",
    }, as_user=adele)
    report.expect_status(f"Phone Call on an Opportunity, no parties ({call_nav})", result, 204)
    if result[3]:
        track("phonecalls", result[3])

    print("Peer and outsider: read yes; update, reassign and add activities no; link to the Account yes", flush=True)
    for key in ("alex", "diego"):
        who = USERS[key]
        caller = users[key]
        report.expect_status(f"{who} reads Adele's Lead", dv.call(
            "GET", f"vibe_leads({lead})?$select=vibe_name", as_user=caller), 200)
        report.expect_status(f"{who} updates Adele's Lead", dv.call(
            "PATCH", f"vibe_leads({lead})", {"vibe_jobtitle": who}, as_user=caller), 403)
        report.expect_status(f"{who} reassigns Adele's Lead to self", dv.call(
            "PATCH", f"vibe_leads({lead})", {"ownerid@odata.bind": f"/systemusers({caller})"}, as_user=caller), 403)
        report.expect_status(f"{who} updates Adele's Opportunity", dv.call(
            "PATCH", f"vibe_opportunities({opportunity})", {"vibe_nextstep": who}, as_user=caller), 403)
        result = dv.call("POST", "annotations", {
            "subject": f"{TAG} {who} Note", f"{note_nav}@odata.bind": f"/vibe_leads({lead})",
        }, as_user=caller)
        report.expect_status(f"{who} adds a Note to Adele's Lead", result, 403)
        if result[3]:
            track("annotations", result[3])
        result = dv.call("POST", "tasks", {
            "subject": f"{TAG} {who} Task", f"{task_nav}@odata.bind": f"/vibe_opportunities({opportunity})",
        }, as_user=caller)
        report.expect_status(f"{who} adds a Task to Adele's Opportunity", result, 403)
        if result[3]:
            track("tasks", result[3])
        result = dv.call("POST", "vibe_opportunities", {
            "vibe_name": f"{TAG} {who} Opportunity",
            f"{opportunity_account}@odata.bind": f"/accounts({account})",
            "vibe_stage": stage, "vibe_estimatedvalue": 500, "vibe_expectedclosedate": "2026-12-31",
        }, as_user=caller)
        report.expect_status(f"{who} creates an Opportunity on Adele's Account", result, 204)
        if result[3]:
            track("vibe_opportunities", result[3])

    print("No Delete privilege", flush=True)
    report.expect_status("Adele deletes her own Lead", dv.call("DELETE", f"vibe_leads({lead})", as_user=adele), 403)

    print("Manager: update and reassign a report's records", flush=True)
    report.expect_status("Megan updates Adele's Lead", dv.call(
        "PATCH", f"vibe_leads({lead})", {"vibe_jobtitle": "Updated by Megan"}, as_user=megan), 204)
    report.expect_status("Megan updates Adele's Opportunity", dv.call(
        "PATCH", f"vibe_opportunities({opportunity})", {"vibe_nextstep": "Updated by Megan"}, as_user=megan), 204)
    report.expect_status("Megan adds a Note to Adele's Lead", result := dv.call("POST", "annotations", {
        "subject": f"{TAG} Megan Note", f"{note_nav}@odata.bind": f"/vibe_leads({lead})",
    }, as_user=megan), 204)
    if result[3]:
        track("annotations", result[3])
    result = dv.call("POST", "tasks", {
        "subject": f"{TAG} Megan Task", f"{task_nav}@odata.bind": f"/vibe_opportunities({opportunity})",
    }, as_user=megan)
    report.expect_status("Megan adds a Task to Adele's Opportunity", result, 204)
    if result[3]:
        track("tasks", result[3])

    result = dv.call("PATCH", f"vibe_opportunities({opportunity})",
                     {"ownerid@odata.bind": f"/systemusers({alex})"}, as_user=megan)
    report.expect_status("Megan reassigns Adele's Opportunity to Alex", result, 204)
    if result[0] == 204:
        report.check("Opportunity owner is now Alex", owner_of(dv, "vibe_opportunities", opportunity) == alex)
        if task:
            report.check("Open Task moved to Alex (Cascade Active)", owner_of(dv, "tasks", task) == alex)

    print("Manager: reassign an inactive (Disqualified) Lead", flush=True)
    report.expect_status("Adele deactivates her Lead", dv.call(
        "PATCH", f"vibe_leads({lead})", {"statecode": 1, "statuscode": 2}, as_user=adele), 204)
    result = dv.call("PATCH", f"vibe_leads({lead})",
                     {"ownerid@odata.bind": f"/systemusers({alex})"}, as_user=megan)
    report.expect_status("Megan reassigns Adele's inactive Lead to Alex", result, 204)
    if result[0] == 204:
        report.check("Lead owner is now Alex", owner_of(dv, "vibe_leads", lead) == alex)

    print("Manager: no reach outside the team", flush=True)
    diego_lead = track("vibe_leads", dv.create("vibe_leads", {
        "vibe_lastname": f"{TAG} Diego Lead", "vibe_company": f"{TAG} Company", "vibe_name": f"{TAG} Diego Lead",
    }, as_user=diego))
    report.expect_status("Megan updates Diego's Lead", dv.call(
        "PATCH", f"vibe_leads({diego_lead})", {"vibe_jobtitle": "Updated by Megan"}, as_user=megan), 403)
    report.expect_status("Megan reassigns Diego's Lead", dv.call(
        "PATCH", f"vibe_leads({diego_lead})", {"ownerid@odata.bind": f"/systemusers({megan})"}, as_user=megan), 403)


def cleanup(dv, created):
    for entity_set, record_id in reversed(created):
        status, _, code, _ = dv.call("DELETE", f"{entity_set}({record_id})")
        if status not in (204, 404):
            print(f"  cleanup: could not delete {entity_set}({record_id}): {status} {code}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--keep", action="store_true", help="leave the test records in place")
    args = parser.parse_args()

    dv = Dataverse()
    report = Report()
    created = []
    try:
        run(dv, report, created)
    except RuntimeError as e:
        report.check("script ran to the end", False, str(e))
    finally:
        if args.keep:
            print(f"Kept {len(created)} records named '{TAG} …'", flush=True)
        else:
            print("Cleanup", flush=True)
            cleanup(dv, created)

    total, failed = len(report.rows), len(report.failed)
    print(f"\n{total - failed}/{total} checks passed", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
