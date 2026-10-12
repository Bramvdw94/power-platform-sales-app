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
CATALOGUE_ROLE = "SalesApp Catalogue Manager"
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

    def call(self, method, path, body=None, as_user=None, headers=None):
        """Return (status, json_or_none, error_code_or_none, entity_id_or_none)."""
        headers = {**self.headers, **(headers or {})}
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

    def create(self, entity_set, body, as_user=None, headers=None):
        status, err, code, entity_id = self.call("POST", entity_set, body, as_user=as_user, headers=headers)
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
    roles = dv.get(f"systemusers({megan})/systemuserroles_association"
                   f"?$select=name&$filter=name eq '{q(CATALOGUE_ROLE)}'")["value"]
    report.check(f"Megan has {CATALOGUE_ROLE}", len(roles) == 1)
    for key in ("adele", "alex", "diego"):
        roles = dv.get(f"systemusers({ids[key]['systemuserid']})/systemuserroles_association"
                       f"?$select=name&$filter=name eq '{q(CATALOGUE_ROLE)}'")["value"]
        report.check(f"{USERS[key]} does not have {CATALOGUE_ROLE}", len(roles) == 0)
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

    products(dv, report, users, track)
    run_quota(dv, report, track, users)


def products(dv, report, users, track):
    """Products (#99): everyone reads, only the Catalogue Manager writes, nobody deletes."""
    print("Products: Catalogue Manager creates and changes, salespeople read", flush=True)
    adele, megan = users["adele"], users["megan"]
    unit = dv.get("GlobalOptionSetDefinitions(Name='vibe_productunit')/Microsoft.Dynamics.CRM.OptionSetMetadata")["Options"][0]["Value"]
    vat = dv.get("GlobalOptionSetDefinitions(Name='vibe_vatrate')/Microsoft.Dynamics.CRM.OptionSetMetadata")["Options"][0]["Value"]
    code = f"{TAG}-P1"

    def body(**changes):
        return {"vibe_name": f"{TAG} Product", "vibe_productcode": code, "vibe_unit": unit, "vibe_vatrate": vat,
                "vibe_listprice": 100, **changes}

    report.expect_status("Adele creates a Product", dv.call("POST", "vibe_products", body(), as_user=adele), 403)
    result = dv.call("POST", "vibe_products", body(), as_user=megan)
    report.expect_status("Megan creates a Product", result, 204)
    if not result[3]:
        return
    product = track("vibe_products", result[3])
    report.expect_status("Megan creates a second Product with the same code", dv.call(
        "POST", "vibe_products", body(vibe_name=f"{TAG} Duplicate"), as_user=megan), 412)
    for key in ("adele", "alex", "diego"):
        who = USERS[key]
        report.expect_status(f"{who} reads the Product", dv.call(
            "GET", f"vibe_products({product})?$select=vibe_name,vibe_listprice", as_user=users[key]), 200)
        report.expect_status(f"{who} changes the List price", dv.call(
            "PATCH", f"vibe_products({product})", {"vibe_listprice": 1}, as_user=users[key]), 403)
        report.expect_status(f"{who} retires the Product", dv.call(
            "PATCH", f"vibe_products({product})", {"statecode": 1, "statuscode": 2}, as_user=users[key]), 403)
    report.expect_status("Megan changes the List price", dv.call(
        "PATCH", f"vibe_products({product})", {"vibe_listprice": 120}, as_user=megan), 204)
    report.expect_status("Megan retires the Product", dv.call(
        "PATCH", f"vibe_products({product})", {"statecode": 1, "statuscode": 2}, as_user=megan), 204)
    report.expect_status("Adele still reads the retired Product", dv.call(
        "GET", f"vibe_products({product})?$select=vibe_name,statecode", as_user=adele), 200)
    report.expect_status("Megan reactivates the Product", dv.call(
        "PATCH", f"vibe_products({product})", {"statecode": 0, "statuscode": 1}, as_user=megan), 204)
    report.expect_status("Megan deletes the Product (nobody may)", dv.call(
        "DELETE", f"vibe_products({product})", as_user=megan), 403)




QUOTA_MONTH = "2099-01-01"


def run_quota(dv, report, track, users):
    """Quota (#104): owned by the salesperson, set by their manager, QuotaGuardPlugin backs it up."""
    megan, adele, alex, diego = (users[k] for k in ("megan", "adele", "alex", "diego"))
    print("Quota: owned by the salesperson, set by the manager, never by oneself", flush=True)

    def body(person, month=QUOTA_MONTH, amount=1000):
        return {"vibe_name": f"{TAG} Quota", "vibe_month": month, "vibe_amount": amount,
                "vibe_SalespersonId@odata.bind": f"/systemusers({person})"}

    adele_quota = None
    result = dv.call("POST", "vibe_quotas", body(adele), as_user=megan)
    report.expect_status("Megan sets Adele's Quota", result, 204)
    if result[3]:
        adele_quota = track("vibe_quotas", result[3])
    result = dv.call("POST", "vibe_quotas", body(alex), as_user=megan)
    report.expect_status("Megan sets Alex's Quota", result, 204)
    if result[3]:
        track("vibe_quotas", result[3])
    report.expect_status("Megan sets Megan's own Quota", dv.call("POST", "vibe_quotas", body(megan), as_user=megan), 400)
    report.expect_status("Megan sets Diego's Quota (not her report)", dv.call("POST", "vibe_quotas", body(diego), as_user=megan), 400)
    report.expect_status("Megan sets Adele's Quota for a month that is not the first", dv.call(
        "POST", "vibe_quotas", body(adele, "2099-02-15"), as_user=megan), 400)
    report.expect_status("Megan adds a second Quota for Adele and the same month", dv.call(
        "POST", "vibe_quotas", body(adele), as_user=megan), 412)
    report.expect_status("Adele sets her own Quota", dv.call("POST", "vibe_quotas", body(adele, "2099-03-01"), as_user=adele), 403)
    report.expect_status("A system administrator sets Adele's Quota (she has a manager)", dv.call(
        "POST", "vibe_quotas", body(adele, "2099-03-01")), 400)
    result = dv.call("POST", "vibe_quotas", body(megan))
    report.expect_status("A system administrator sets Megan's Quota (she has no manager)", result, 204)
    megan_quota = track("vibe_quotas", result[3]) if result[3] else None

    if adele_quota:
        print("Quota: who reads and writes which row", flush=True)
        report.expect_status("Adele reads her Quota", dv.call(
            "GET", f"vibe_quotas({adele_quota})?$select=vibe_amount", as_user=adele), 200)
        report.expect_status("Alex reads Adele's Quota", dv.call(
            "GET", f"vibe_quotas({adele_quota})?$select=vibe_amount", as_user=alex), 403)
        report.expect_status("Diego reads Adele's Quota", dv.call(
            "GET", f"vibe_quotas({adele_quota})?$select=vibe_amount", as_user=diego), 403)
        report.expect_status("Megan reads Adele's Quota", dv.call(
            "GET", f"vibe_quotas({adele_quota})?$select=vibe_amount", as_user=megan), 200)
        report.expect_status("Megan changes Adele's Quota", dv.call(
            "PATCH", f"vibe_quotas({adele_quota})", {"vibe_amount": 2000}, as_user=megan), 204)
        report.expect_status("Adele changes her own Quota", dv.call(
            "PATCH", f"vibe_quotas({adele_quota})", {"vibe_amount": 9999}, as_user=adele), 403)
        report.expect_status("Alex changes Adele's Quota", dv.call(
            "PATCH", f"vibe_quotas({adele_quota})", {"vibe_amount": 9999}, as_user=alex), 403)
        report.expect_status("Megan makes Adele's Quota negative", dv.call(
            "PATCH", f"vibe_quotas({adele_quota})", {"vibe_amount": -1}, as_user=megan), 400)
        report.expect_status("Megan moves Adele's Quota to another month", dv.call(
            "PATCH", f"vibe_quotas({adele_quota})", {"vibe_month": "2099-04-01"}, as_user=megan), 400)
        report.expect_status("Megan hands Adele's Quota to herself", dv.call(
            "PATCH", f"vibe_quotas({adele_quota})", {"ownerid@odata.bind": f"/systemusers({megan})"}, as_user=megan), 400)
    if megan_quota:
        report.expect_status("Megan reads her own Quota", dv.call(
            "GET", f"vibe_quotas({megan_quota})?$select=vibe_amount", as_user=megan), 200)
        report.expect_status("Megan changes her own Quota", dv.call(
            "PATCH", f"vibe_quotas({megan_quota})", {"vibe_amount": 9999}, as_user=megan), 400)
        report.expect_status("Adele reads Megan's Quota", dv.call(
            "GET", f"vibe_quotas({megan_quota})?$select=vibe_amount", as_user=adele), 403)

    def months(user):
        rows = dv.get(f"vibe_quotas?$select=_vibe_salespersonid_value&$filter=vibe_month eq {QUOTA_MONTH}", as_user=user)["value"]
        return sorted(r["_vibe_salespersonid_value"] for r in rows)

    report.check("Adele sees only her own row that month", months(adele) == [adele])
    report.check("Alex sees only his own row that month", months(alex) == [alex])
    report.check("Megan sees hers, Adele's and Alex's rows that month", months(megan) == sorted([megan, adele, alex]))
    report.check("Diego sees neither Adele's nor Alex's", months(diego) == [])


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
