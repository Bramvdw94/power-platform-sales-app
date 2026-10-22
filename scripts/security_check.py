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
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from auth import get_plugin_headers, get_token, load_env  # noqa: E402

ROLE_NAME = "SalesApp Salesperson"
CATALOGUE_ROLE = "SalesApp Catalogue Manager"
TAG = "[security-check]"
RUN_STARTED = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
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
        "firstname": "Check", "lastname": f"{TAG} Contact", "emailaddress1": "security-check@example.com",
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
    # Megan is also a Process builder (#94): her role writes any Lead and Opportunity so Switch Process works anywhere.
    report.expect_status("Megan (Process builder) updates Diego's Lead", dv.call(
        "PATCH", f"vibe_leads({diego_lead})", {"vibe_jobtitle": "Updated by Megan"}, as_user=megan), 204)
    report.expect_status("Megan reassigns Diego's Lead", dv.call(
        "PATCH", f"vibe_leads({diego_lead})", {"ownerid@odata.bind": f"/systemusers({megan})"}, as_user=megan), 204)
    report.expect_status("Adele (no builder role) can't update Diego's Lead", dv.call(
        "PATCH", f"vibe_leads({diego_lead})", {"vibe_jobtitle": "Updated by Adele"}, as_user=adele), 403)

    admin_id = dv.get("WhoAmI")["UserId"]
    administrator(dv, report, users, track, admin_id, diego_lead)
    products(dv, report, users, track)
    product_lines(dv, report, users, track, account)
    quotes(dv, report, users, track, account)
    run_quota(dv, report, track, users, admin_id)
    v3_foundation(dv, report, users, track)
    reassign_notifications(dv, report, users, track)
    import engine_check  # imported here: it imports this module
    engine_check.run(dv, report, users, track)


def v3_foundation(dv, report, users, track):
    """v3 foundation (#169): own User settings and Notifications only, plus the shared columns."""
    print("v3 foundation: User settings and Notifications are personal", flush=True)
    adele, alex = users["adele"], users["alex"]
    recipient = nav_property(dv, "vibe_notification", "systemuser", "vibe_recipientid")
    kind = dv.get("GlobalOptionSetDefinitions(Name='vibe_notificationkind')/Microsoft.Dynamics.CRM.OptionSetMetadata")["Options"][0]["Value"]

    def denied(name, result):
        status = result[0]
        report.check(name, status in (403, 404), f"{status}" + (f" {result[2]}" if result[2] else ""))

    def notification(owner, text):
        return track("vibe_notifications", dv.create("vibe_notifications", {
            "vibe_name": f"{TAG} {text}", "vibe_kind": kind, "vibe_regardingtable": "vibe_lead",
            "vibe_regardingid": "00000000-0000-0000-0000-000000000000", "vibe_isread": False,
            f"{recipient}@odata.bind": f"/systemusers({owner})", "ownerid@odata.bind": f"/systemusers({owner})"}))

    # Created as the administrator: in production the system (plug-ins, the gateway's server paths) creates them.
    mine, theirs = notification(adele, "for Adele"), notification(alex, "for Alex")
    report.expect_status("Adele reads her own Notification", dv.call("GET", f"vibe_notifications({mine})?$select=vibe_isread", as_user=adele), 200)
    report.expect_status("Adele marks it read", dv.call("PATCH", f"vibe_notifications({mine})", {"vibe_isread": True}, as_user=adele), 204)
    denied("Adele can't read Alex's Notification", dv.call("GET", f"vibe_notifications({theirs})?$select=vibe_isread", as_user=adele))
    denied("Adele can't mark Alex's Notification read", dv.call("PATCH", f"vibe_notifications({theirs})", {"vibe_isread": True}, as_user=adele))
    listed = dv.get(f"vibe_notifications?$select=vibe_notificationid&$filter=contains(vibe_name,'security-check] for')", as_user=adele)["value"]
    report.check("Adele's list holds only her Notification", [r["vibe_notificationid"] for r in listed] == [mine], f"{len(listed)} rows")
    result = dv.call("POST", "vibe_notifications", {"vibe_name": f"{TAG} forged", "vibe_kind": kind,
                                                    f"{recipient}@odata.bind": f"/systemusers({adele})"}, as_user=adele)
    if result[3]:
        track("vibe_notifications", result[3])
    denied("Adele can't create a Notification (the system does)", result)
    denied("Adele can't delete her Notification (the bulk delete job does)", dv.call("DELETE", f"vibe_notifications({mine})", as_user=adele))

    own = dv.call("POST", "vibe_usersettingses", {"vibe_name": f"{TAG} Adele", "vibe_teamscopies": True}, as_user=adele)
    report.expect_status("Adele creates her own User settings", own, 204)
    alex_settings = track("vibe_usersettingses", dv.create("vibe_usersettingses", {
        "vibe_name": f"{TAG} Alex", "ownerid@odata.bind": f"/systemusers({alex})"}))
    if own[3]:
        mine_s = track("vibe_usersettingses", own[3])
        report.expect_status("Adele reads her own User settings", dv.call("GET", f"vibe_usersettingses({mine_s})?$select=vibe_teamscopies", as_user=adele), 200)
        report.expect_status("Adele switches Teams copies off", dv.call("PATCH", f"vibe_usersettingses({mine_s})", {"vibe_teamscopies": False}, as_user=adele), 204)
        report.expect_status("Adele sets Away until", dv.call("PATCH", f"vibe_usersettingses({mine_s})", {"vibe_away": True, "vibe_awayuntil": "2027-01-15"}, as_user=adele), 204)
    denied("Adele can't read Alex's User settings", dv.call("GET", f"vibe_usersettingses({alex_settings})?$select=vibe_teamscopies", as_user=adele))
    # Adele may create settings, so a PATCH she can't see becomes an upsert that collides with the row (412).
    result = dv.call("PATCH", f"vibe_usersettingses({alex_settings})", {"vibe_teamscopies": False}, as_user=adele)
    report.check("Adele can't change Alex's User settings", result[0] in (403, 404, 412), f"{result[0]} {result[2] or ''}")
    report.check("... and his Teams copies stay on", dv.get(f"vibe_usersettingses({alex_settings})?$select=vibe_teamscopies")["vibe_teamscopies"] is True)
    report.expect_status("Alex reads his own User settings", dv.call("GET", f"vibe_usersettingses({alex_settings})?$select=vibe_teamscopies", as_user=alex), 200)
    default = dv.get(f"vibe_usersettingses({alex_settings})?$select=vibe_teamscopies")["vibe_teamscopies"]
    report.check("Teams copies default to on", default is True)

    lead = dv.get("EntityDefinitions(LogicalName='vibe_lead')?$select=IsActivityParty")
    report.check("Lead is email enabled (Sending email)", lead["IsActivityParty"] is True)
    # Lines this run made are new; the backfill covers the ones that existed before it started.
    lines = dv.get("vibe_quotelines?$select=vibe_listpriceatadd,createdon&$expand=vibe_QuoteId($select=statuscode)")["value"]
    old = [l for l in lines if l["createdon"] < RUN_STARTED and (l.get("vibe_QuoteId") or {}).get("statuscode") == 1]
    report.check("Every existing Draft Quote line carries a List price at add", all(l["vibe_listpriceatadd"] is not None for l in old), f"{len(old)} lines")


def reassign_notifications(dv, report, users, track):
    """Reassign (#171): the plug-in posts "assigned to you" to the new Owner as the system, never to yourself."""
    print("Reassign posts a Notification to the new Owner", flush=True)
    adele, alex = users["adele"], users["alex"]
    lead = track("vibe_leads", dv.create("vibe_leads", {"vibe_lastname": f"{TAG} Reassign", "vibe_company": f"{TAG} Company", "vibe_name": f"{TAG} Reassign"}, as_user=adele))

    def reassign(caller, owner):
        return dv.call("PATCH", f"vibe_leads({lead})", {"ownerid@odata.bind": f"/systemusers({owner})"}, as_user=caller)

    def notifications(recipient):
        rows = dv.get(f"vibe_notifications?$select=vibe_notificationid,vibe_name,vibe_kind,vibe_isread,_vibe_recipientid_value"
                      f"&$filter=_vibe_recipientid_value eq {recipient} and vibe_regardingid eq '{lead}'")["value"]
        for row in rows:
            track("vibe_notifications", row["vibe_notificationid"])
        return rows

    report.expect_status("Adele reassigns her Lead to Alex", reassign(adele, alex), 204)
    alex_rows = notifications(alex)
    report.check("Alex gets exactly one Notification", len(alex_rows) == 1, f"{len(alex_rows)} rows")
    if alex_rows:
        row = alex_rows[0]
        report.check("... of kind Reassign, unread", row["vibe_kind"] == 841200000 and row["vibe_isread"] is False, f"kind {row['vibe_kind']}")
        report.check("... saying who assigned what", row["vibe_name"].startswith("Adele Vance assigned you the Lead "), row["vibe_name"])
        report.expect_status("Alex reads it", dv.call("GET", f"vibe_notifications({row['vibe_notificationid']})?$select=vibe_isread", as_user=alex), 200)
        status = dv.call("GET", f"vibe_notifications({row['vibe_notificationid']})?$select=vibe_isread", as_user=adele)[0]
        report.check("Adele can't read Alex's Notification", status in (403, 404), f"{status}")
    report.check("Adele, who handed it over, gets none", len(notifications(adele)) == 0)

    report.expect_status("Alex reassigns the Lead to himself", reassign(alex, alex), 204)
    report.check("... which posts nothing", len(notifications(alex)) == 1 and len(notifications(adele)) == 0)
    report.expect_status("Alex reassigns the Lead to Adele", reassign(alex, adele), 204)
    report.check("Adele gets one", len(notifications(adele)) == 1)
    report.expect_status("Adele reassigns the Lead to herself", reassign(adele, adele), 204)
    report.check("... which posts nothing", len(notifications(adele)) == 1 and len(notifications(alex)) == 1)


def administrator(dv, report, users, track, admin_id, lead):
    """The System Administrator (the user running this script) can do everything in the app."""
    print("System Administrator: holds every privilege on every vibe_ table", flush=True)
    admin_role = dv.get("roles?$select=roleid&$filter=name eq 'System Administrator'")["value"][0]["roleid"]
    held = {p["PrivilegeName"].lower(): p["Depth"] for p in
            dv.get(f"RetrieveRolePrivilegesRole(RoleId={admin_role})")["RolePrivileges"]}
    report.check(f"The script runs as a System Administrator", bool(dv.get(
        f"systemusers({admin_id})/systemuserroles_association?$select=name&$filter=name eq 'System Administrator'")["value"]))
    wanted = sorted(admin_privileges(dv))
    missing = [n for n in wanted if held.get(n.lower()) != "Global"]
    report.check(f"System Administrator holds all {len(wanted)} vibe_ and kill-switch privileges at Organization depth",
                 not missing, ", ".join(missing[:6]))

    entities = dv.get("EntityDefinitions?$select=LogicalName,EntitySetName&$filter=IsCustomEntity eq true")["value"]
    for e in sorted(entities, key=lambda e: e["LogicalName"]):
        if e["LogicalName"].startswith("vibe_"):
            report.expect_status(f"System Administrator reads {e['EntitySetName']}", dv.call(
                "GET", f"{e['EntitySetName']}?$top=1&$select={e['LogicalName']}id"), 200)

    print("System Administrator: changes and reassigns records they do not own", flush=True)
    report.expect_status("System Administrator updates Diego's Lead", dv.call(
        "PATCH", f"vibe_leads({lead})", {"vibe_jobtitle": "Updated by the administrator"}), 204)
    report.expect_status("System Administrator reassigns Diego's Lead to Adele", dv.call(
        "PATCH", f"vibe_leads({lead})", {"ownerid@odata.bind": f"/systemusers({users['adele']})"}), 204)
    report.check("Lead owner is now Adele", owner_of(dv, "vibe_leads", lead) == users["adele"])


def admin_privileges(dv):
    """Every privilege on a vibe_ table, found in the environment so a new table is covered without editing this."""
    names = set()
    for row in dv.get("privileges?$select=name&$filter=contains(name,'vibe_')&$top=5000")["value"]:
        names.add(row["name"])
    names.add("prvReadEnvironmentVariableDefinition")
    return names


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




def product_lines(dv, report, users, track, account):
    """Product lines (#100): follow the Opportunity's security; the plug-in keeps Estimated value."""
    print("Product lines: follow the Opportunity; Estimated value follows the lines", flush=True)
    adele, megan, alex = users["adele"], users["megan"], users["alex"]
    unit = dv.get("GlobalOptionSetDefinitions(Name='vibe_productunit')/Microsoft.Dynamics.CRM.OptionSetMetadata")["Options"][0]["Value"]
    vat = dv.get("GlobalOptionSetDefinitions(Name='vibe_vatrate')/Microsoft.Dynamics.CRM.OptionSetMetadata")["Options"][0]["Value"]
    stage = dv.get("GlobalOptionSetDefinitions(Name='vibe_stage')/Microsoft.Dynamics.CRM.OptionSetMetadata")["Options"][0]["Value"]
    opportunity_account = nav_property(dv, "vibe_opportunity", "account", "vibe_accountid")

    def product(n, price):
        return track("vibe_products", dv.create("vibe_products", {
            "vibe_name": f"{TAG} Line product {n}", "vibe_productcode": f"{TAG}-L{n}", "vibe_unit": unit,
            "vibe_vatrate": vat, "vibe_listprice": price}, as_user=megan))

    product_1, product_2 = product(1, 100), product(2, 40)
    retired = product(3, 10)
    dv.call("PATCH", f"vibe_products({retired})", {"statecode": 1, "statuscode": 2}, as_user=megan)

    def opportunity(owner, name):
        return track("vibe_opportunities", dv.create("vibe_opportunities", {
            "vibe_name": f"{TAG} {name}", f"{opportunity_account}@odata.bind": f"/accounts({account})",
            "vibe_stage": stage, "vibe_estimatedvalue": 1000, "vibe_expectedclosedate": "2026-12-31"}, as_user=owner))

    def line(opp, prod, quantity=1, price=None, discount=0):
        body = {"vibe_name": f"{TAG} Line", "vibe_OpportunityId@odata.bind": f"/vibe_opportunities({opp})",
                "vibe_ProductId@odata.bind": f"/vibe_products({prod})", "vibe_quantity": quantity,
                "vibe_discountpercent": discount}
        if price is not None:
            body["vibe_unitprice"] = price
        return body

    def value(opp):
        return dv.get(f"vibe_opportunities({opp})?$select=vibe_estimatedvalue")["vibe_estimatedvalue"]

    opp = opportunity(adele, "Lines Opportunity")
    result = dv.call("POST", "vibe_productlines", line(opp, product_1, 2, 100, 10), as_user=adele)
    report.expect_status("Adele adds a Product line", result, 204)
    if not result[3]:
        return
    first = track("vibe_productlines", result[3])
    row = dv.get(f"vibe_productlines({first})?$select=vibe_lineamount,vibe_listpriceatadd,vibe_description,_ownerid_value")
    report.check("Line amount is 2 x 100 less 10% = 180", row["vibe_lineamount"] == 180)
    report.check("List price at add is the Product's List price", row["vibe_listpriceatadd"] == 100)
    report.check("The line is owned by the Opportunity's Owner", row["_ownerid_value"] == adele)
    report.check("Estimated value is now the line total (180)", value(opp) == 180)

    result = dv.call("POST", "vibe_productlines", line(opp, product_2, 1.5, 33.33), as_user=adele)
    report.expect_status("Adele adds a second line (1.5 x 33.33)", result, 204)
    second = track("vibe_productlines", result[3]) if result[3] else None
    report.check("Each line is rounded to cents, then summed (180 + 50.00)", value(opp) == 230)

    report.expect_status("Adele types over the Estimated value while lines exist", dv.call(
        "PATCH", f"vibe_opportunities({opp})", {"vibe_estimatedvalue": 5}, as_user=adele), 400)
    report.expect_status("Adele saves the Estimated value unchanged", dv.call(
        "PATCH", f"vibe_opportunities({opp})", {"vibe_estimatedvalue": 230, "vibe_nextstep": "Call"}, as_user=adele), 204)
    report.expect_status("A system administrator types over the Estimated value", dv.call(
        "PATCH", f"vibe_opportunities({opp})", {"vibe_estimatedvalue": 5}), 400)

    report.expect_status("Adele changes the quantity to 3", dv.call(
        "PATCH", f"vibe_productlines({first})", {"vibe_quantity": 3}, as_user=adele), 204)
    report.check("Estimated value follows the update (270 + 50 = 320)", value(opp) == 320)
    report.expect_status("Adele writes Line amount directly", dv.call(
        "PATCH", f"vibe_productlines({first})", {"vibe_lineamount": 1}, as_user=adele), 204)
    report.check("Line amount is recalculated, not taken (still 320)", value(opp) == 320)
    report.expect_status("Adele changes the List price at add", dv.call(
        "PATCH", f"vibe_productlines({first})", {"vibe_listpriceatadd": 1}, as_user=adele), 400)
    report.expect_status("Adele sets a quantity of zero", dv.call(
        "PATCH", f"vibe_productlines({first})", {"vibe_quantity": 0}, as_user=adele), 400)
    report.expect_status("Adele sets a discount of 101%", dv.call(
        "PATCH", f"vibe_productlines({first})", {"vibe_discountpercent": 101}, as_user=adele), 400)
    report.expect_status("Adele adds a retired Product", dv.call(
        "POST", "vibe_productlines", line(opp, retired), as_user=adele), 400)

    for key in ("alex", "diego"):
        who, caller = USERS[key], users[key]
        report.expect_status(f"{who} adds a line to Adele's Opportunity", dv.call(
            "POST", "vibe_productlines", line(opp, product_1), as_user=caller), 403)
        report.expect_status(f"{who} changes Adele's line", dv.call(
            "PATCH", f"vibe_productlines({first})", {"vibe_quantity": 9}, as_user=caller), 403)
        report.expect_status(f"{who} removes Adele's line", dv.call(
            "DELETE", f"vibe_productlines({first})", as_user=caller), 403)
        report.expect_status(f"{who} reads Adele's line", dv.call(
            "GET", f"vibe_productlines({first})?$select=vibe_lineamount", as_user=caller), 200)

    result = dv.call("POST", "vibe_productlines", line(opp, product_2, 2), as_user=megan)
    report.expect_status("Megan adds a line to Adele's Opportunity", result, 204)
    if result[3]:
        by_megan = track("vibe_productlines", result[3])
        report.check("Megan's line is owned by Adele", owner_of(dv, "vibe_productlines", by_megan) == adele)
        report.check("Estimated value includes it (320 + 80)", value(opp) == 400)
        report.expect_status("Megan removes it", dv.call("DELETE", f"vibe_productlines({by_megan})", as_user=megan), 204)
        report.check("Estimated value drops back to 320", value(opp) == 320)

    report.expect_status("Adele removes the second line", dv.call("DELETE", f"vibe_productlines({second})", as_user=adele), 204)
    report.check("Estimated value follows the removal (270)", value(opp) == 270)
    report.expect_status("Adele removes the last line", dv.call("DELETE", f"vibe_productlines({first})", as_user=adele), 204)
    report.check("The Estimated value keeps its last total (270)", value(opp) == 270)
    report.expect_status("Adele types the Estimated value again (no lines)", dv.call(
        "PATCH", f"vibe_opportunities({opp})", {"vibe_estimatedvalue": 777}, as_user=adele), 204)

    reassigned = opportunity(adele, "Reassigned lines")
    result = dv.call("POST", "vibe_productlines", line(reassigned, product_1), as_user=adele)
    if result[3]:
        moving = track("vibe_productlines", result[3])
        report.expect_status("Megan reassigns the Opportunity to Alex", dv.call(
            "PATCH", f"vibe_opportunities({reassigned})", {"ownerid@odata.bind": f"/systemusers({alex})"}, as_user=megan), 204)
        report.check("Its line moved to Alex (parental cascade)", owner_of(dv, "vibe_productlines", moving) == alex)
        report.expect_status("Alex now changes the line", dv.call(
            "PATCH", f"vibe_productlines({moving})", {"vibe_quantity": 2}, as_user=alex), 204)

    closed = opportunity(adele, "Closed lines")
    result = dv.call("POST", "vibe_productlines", line(closed, product_1), as_user=adele)
    if result[3]:
        stuck = track("vibe_productlines", result[3])
        report.expect_status("Adele closes the Opportunity", dv.call(
            "PATCH", f"vibe_opportunities({closed})", {"statecode": 1, "statuscode": 2}, as_user=adele), 204)
        report.expect_status("Adele adds a line to a closed Opportunity", dv.call(
            "POST", "vibe_productlines", line(closed, product_2), as_user=adele), 400)
        report.expect_status("Adele changes a line on a closed Opportunity", dv.call(
            "PATCH", f"vibe_productlines({stuck})", {"vibe_quantity": 5}, as_user=adele), 400)
        report.expect_status("Adele removes a line from a closed Opportunity", dv.call(
            "DELETE", f"vibe_productlines({stuck})", as_user=adele), 400)

    report.expect_status("Megan deletes a Product that is on a line", dv.call(
        "DELETE", f"vibe_products({product_1})", as_user=megan), 403)


QUOTA_MONTH = "2099-01-01"


def run_quota(dv, report, track, users, admin_id):
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
    result = dv.call("POST", "vibe_quotas", body(adele, "2099-03-01"))
    report.expect_status("A system administrator sets Adele's Quota (she has a manager)", result, 204)
    if result[3]:
        track("vibe_quotas", result[3])
    report.expect_status("A system administrator sets their own Quota", dv.call(
        "POST", "vibe_quotas", body(admin_id)), 400)
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


def quotes(dv, report, users, track, account):
    """Quotes (#101): follow the Opportunity's security; only a Draft changes; the plug-ins keep the totals."""
    print("Quotes: follow the Opportunity; only a Draft changes; totals follow the lines", flush=True)
    adele, megan, alex, diego = users["adele"], users["megan"], users["alex"], users["diego"]
    unit = dv.get("GlobalOptionSetDefinitions(Name='vibe_productunit')/Microsoft.Dynamics.CRM.OptionSetMetadata")["Options"][0]["Value"]
    vat_options = dv.get("GlobalOptionSetDefinitions(Name='vibe_vatrate')/Microsoft.Dynamics.CRM.OptionSetMetadata")["Options"]
    vat21, vat9 = vat_options[0]["Value"], vat_options[1]["Value"]
    stage = dv.get("GlobalOptionSetDefinitions(Name='vibe_stage')/Microsoft.Dynamics.CRM.OptionSetMetadata")["Options"][0]["Value"]
    opportunity_account = nav_property(dv, "vibe_opportunity", "account", "vibe_accountid")
    SENT, ACCEPTED, REJECTED, REVISED = 2, 3, 4, 5

    def product(n, price, vat):
        return track("vibe_products", dv.create("vibe_products", {
            "vibe_name": f"{TAG} Quote product {n}", "vibe_productcode": f"{TAG}-Q{n}", "vibe_unit": unit,
            "vibe_vatrate": vat, "vibe_listprice": price}, as_user=megan))

    product_21, product_21b, product_9 = product(1, 100, vat21), product(2, 40, vat21), product(3, 100, vat9)

    def opportunity(owner, name):
        return track("vibe_opportunities", dv.create("vibe_opportunities", {
            "vibe_name": f"{TAG} {name}", f"{opportunity_account}@odata.bind": f"/accounts({account})",
            "vibe_stage": stage, "vibe_estimatedvalue": 1000, "vibe_expectedclosedate": "2026-12-31"}, as_user=owner))

    def quote_body(opp, **extra):
        return {"vibe_OpportunityId@odata.bind": f"/vibe_opportunities({opp})",
                "vibe_AccountId@odata.bind": f"/accounts({account})", "vibe_validuntil": "2026-12-31", **extra}

    def line(quote, prod, quantity=1, price=None, discount=0):
        body = {"vibe_QuoteId@odata.bind": f"/vibe_quotes({quote})", "vibe_ProductId@odata.bind": f"/vibe_products({prod})",
                "vibe_quantity": quantity, "vibe_discountpercent": discount}
        if price is not None:
            body["vibe_unitprice"] = price
        return body

    def row(quote):
        return dv.get(f"vibe_quotes({quote})?$select=vibe_name,vibe_revision,statuscode,statecode,vibe_nettotal,vibe_vat21,"
                      "vibe_vat9,vibe_grosstotal,_ownerid_value,vibe_validuntil")

    def move(quote, status, caller):
        return dv.call("PATCH", f"vibe_quotes({quote})", {"statecode": 0 if status == 1 else 1, "statuscode": status}, as_user=caller)

    def new_quote(opp, caller, **extra):
        result = dv.call("POST", "vibe_quotes", quote_body(opp, **extra), as_user=caller)
        return (track("vibe_quotes", result[3]) if result[3] else None), result

    opp = opportunity(adele, "Quotes Opportunity")
    first, result = new_quote(opp, adele)
    report.expect_status("Adele makes a Quote on her Opportunity", result, 204)
    if not first:
        return
    created = row(first)
    report.check("A new Quote is a Draft, Revision 0, active", (created["statuscode"], created["statecode"], created["vibe_revision"]) == (1, 0, 0))
    report.check("The Quote number is an autonumber (Q-00001 style)", len(created["vibe_name"] or "") == 7 and created["vibe_name"].startswith("Q-"), created["vibe_name"] or "")
    report.check("The Quote is owned by the Opportunity's Owner", created["_ownerid_value"] == adele)
    second, result = new_quote(opp, adele)
    report.expect_status("Adele makes a second Quote on the same Opportunity", result, 204)
    if second:
        report.check("The next Quote gets the next number", int(row(second)["vibe_name"][2:]) == int(created["vibe_name"][2:]) + 1)

    for key in ("alex", "diego"):
        who = USERS[key]
        _, result = new_quote(opp, users[key])
        report.expect_status(f"{who} makes a Quote on Adele's Opportunity", result, 403)
    mine, result = new_quote(opp, megan)
    report.expect_status("Megan (Adele's manager) makes a Quote on Adele's Opportunity", result, 204)
    if mine:
        report.check("Megan's Quote is owned by Adele", row(mine)["_ownerid_value"] == adele)
        report.expect_status("Megan adds a line to it", dv.call("POST", "vibe_quotelines", line(mine, product_21), as_user=megan), 204)

    result = dv.call("POST", "vibe_quotelines", line(first, product_21, 2, 100, 10), as_user=adele)
    report.expect_status("Adele adds a Quote line", result, 204)
    if not result[3]:
        return
    one = track("vibe_quotelines", result[3])
    line_row = dv.get(f"vibe_quotelines({one})?$select=vibe_lineamount,vibe_vatrate,vibe_description,_ownerid_value")
    report.check("Line amount is 2 x 100 less 10% = 180", line_row["vibe_lineamount"] == 180)
    report.check("The line keeps the Product's VAT rate (21 %)", line_row["vibe_vatrate"] == vat21)
    report.check("The line is owned by the Quote's Owner", line_row["_ownerid_value"] == adele)
    result = dv.call("POST", "vibe_quotelines", line(first, product_21b, 1.5, 33.33), as_user=adele)
    report.expect_status("Adele adds a second line (1.5 x 33.33)", result, 204)
    two = track("vibe_quotelines", result[3]) if result[3] else None
    result = dv.call("POST", "vibe_quotelines", line(first, product_9, 1, 100), as_user=adele)
    report.expect_status("Adele adds a line at 9 % VAT", result, 204)
    if result[3]:
        track("vibe_quotelines", result[3])
    totals = row(first)
    report.check("Net total is the lines added up (180 + 50 + 100 = 330)", totals["vibe_nettotal"] == 330, str(totals["vibe_nettotal"]))
    report.check("VAT 21 % is on the net of the 21 % lines (230 x 21 % = 48.30)", totals["vibe_vat21"] == 48.3, str(totals["vibe_vat21"]))
    report.check("VAT 9 % is on the net of the 9 % lines (100 x 9 % = 9.00)", totals["vibe_vat9"] == 9, str(totals["vibe_vat9"]))
    report.check("Gross total is net plus VAT (387.30)", totals["vibe_grosstotal"] == 387.3, str(totals["vibe_grosstotal"]))
    report.expect_status("Adele changes a quantity", dv.call("PATCH", f"vibe_quotelines({one})", {"vibe_quantity": 3}, as_user=adele), 204)
    report.check("Totals follow the update (270 + 50 + 100 = 420)", row(first)["vibe_nettotal"] == 420)
    report.expect_status("Adele writes a total directly", dv.call("PATCH", f"vibe_quotes({first})", {"vibe_nettotal": 1}, as_user=adele), 400)
    report.expect_status("Adele writes Line amount directly", dv.call("PATCH", f"vibe_quotelines({one})", {"vibe_lineamount": 1}, as_user=adele), 204)
    report.check("Line amount is recalculated, not taken (net still 420)", row(first)["vibe_nettotal"] == 420)
    report.expect_status("Adele moves the Quote to another Opportunity", dv.call(
        "PATCH", f"vibe_quotes({first})", {"vibe_OpportunityId@odata.bind": f"/vibe_opportunities({opportunity(adele, 'Other Opportunity')})"}, as_user=adele), 400)
    report.expect_status("Adele gives the Quote to Alex", dv.call(
        "PATCH", f"vibe_quotes({first})", {"ownerid@odata.bind": f"/systemusers({alex})"}, as_user=adele), 400)
    report.expect_status("Adele sets a quantity of zero", dv.call("PATCH", f"vibe_quotelines({one})", {"vibe_quantity": 0}, as_user=adele), 400)
    report.expect_status("Adele sets a discount of 101%", dv.call("PATCH", f"vibe_quotelines({one})", {"vibe_discountpercent": 101}, as_user=adele), 400)
    report.expect_status("Adele changes Valid until on the Draft", dv.call(
        "PATCH", f"vibe_quotes({first})", {"vibe_validuntil": "2027-01-31"}, as_user=adele), 204)

    for key in ("alex", "diego"):
        who, caller = USERS[key], users[key]
        report.expect_status(f"{who} reads Adele's Quote", dv.call("GET", f"vibe_quotes({first})?$select=vibe_name", as_user=caller), 200)
        report.expect_status(f"{who} reads Adele's Quote line", dv.call("GET", f"vibe_quotelines({one})?$select=vibe_name", as_user=caller), 200)
        report.expect_status(f"{who} changes Adele's Quote", dv.call("PATCH", f"vibe_quotes({first})", {"vibe_validuntil": "2027-02-01"}, as_user=caller), 403)
        report.expect_status(f"{who} adds a line to Adele's Quote", dv.call("POST", "vibe_quotelines", line(first, product_21), as_user=caller), 403)
        report.expect_status(f"{who} changes Adele's Quote line", dv.call("PATCH", f"vibe_quotelines({one})", {"vibe_quantity": 9}, as_user=caller), 403)
        report.expect_status(f"{who} sends Adele's Quote", move(first, SENT, caller), 403)
        report.expect_status(f"{who} deletes Adele's Quote", dv.call("DELETE", f"vibe_quotes({first})", as_user=caller), 403)

    report.expect_status("Adele skips Sent and accepts a Draft", move(first, ACCEPTED, adele), 400)
    report.expect_status("Adele sends the Quote", move(first, SENT, adele), 204)
    sent = row(first)
    report.check("A Sent Quote is Sent and inactive", (sent["statuscode"], sent["statecode"]) == (SENT, 1))
    report.expect_status("Adele changes Valid until on the Sent Quote", dv.call("PATCH", f"vibe_quotes({first})", {"vibe_validuntil": "2027-03-01"}, as_user=adele), 400)
    report.expect_status("Adele adds a line to the Sent Quote", dv.call("POST", "vibe_quotelines", line(first, product_21), as_user=adele), 400)
    report.expect_status("Adele changes a line of the Sent Quote", dv.call("PATCH", f"vibe_quotelines({one})", {"vibe_quantity": 5}, as_user=adele), 400)
    report.expect_status("Adele removes a line of the Sent Quote", dv.call("DELETE", f"vibe_quotelines({two})", as_user=adele), 400)
    report.expect_status("Adele deletes the Sent Quote", dv.call("DELETE", f"vibe_quotes({first})", as_user=adele), 400)
    report.expect_status("Adele sets the Sent Quote back to Draft", move(first, 1, adele), 400)
    report.expect_status("Alex accepts Adele's Sent Quote", move(first, ACCEPTED, alex), 403)
    report.expect_status("Adele accepts the Sent Quote", move(first, ACCEPTED, adele), 204)
    report.expect_status("An Accepted Quote can't be Rejected", move(first, REJECTED, adele), 400)
    report.expect_status("An Accepted Quote can't be Sent again", move(first, SENT, adele), 400)

    if second:
        report.expect_status("Adele sends the second Quote", move(second, SENT, adele), 204)
        report.expect_status("Adele revises it (Sent to Revised)", move(second, REVISED, adele), 204)
        number = row(second)["vibe_name"]
        revision, result = new_quote(opp, adele, vibe_name=number, vibe_revision=1)
        report.expect_status("Adele makes the new Revision with the same number", result, 204)
        if revision:
            report.check("The Revision keeps the number and adds 1", (row(revision)["vibe_name"], row(revision)["vibe_revision"]) == (number, 1))
        rejected, result = new_quote(opp, adele)
        if rejected:
            dv.call("PATCH", f"vibe_quotes({rejected})", {"statecode": 1, "statuscode": SENT}, as_user=adele)
            report.expect_status("Adele rejects a Sent Quote", move(rejected, REJECTED, adele), 204)

    reassigned = opportunity(adele, "Reassigned Quotes")
    draft, _ = new_quote(reassigned, adele)
    sent_one, _ = new_quote(reassigned, adele)
    if draft and sent_one:
        dv.call("POST", "vibe_quotelines", line(sent_one, product_21), as_user=adele)
        move(sent_one, SENT, adele)
        report.expect_status("Megan reassigns the Opportunity to Alex", dv.call(
            "PATCH", f"vibe_opportunities({reassigned})", {"ownerid@odata.bind": f"/systemusers({alex})"}, as_user=megan), 204)
        report.check("Its Draft Quote moved to Alex (parental cascade)", owner_of(dv, "vibe_quotes", draft) == alex)
        report.check("Its Sent Quote moved to Alex too", owner_of(dv, "vibe_quotes", sent_one) == alex)
        report.expect_status("Alex now changes the Draft", dv.call("PATCH", f"vibe_quotes({draft})", {"vibe_validuntil": "2027-04-01"}, as_user=alex), 204)
        report.expect_status("Alex accepts the Sent Quote", move(sent_one, ACCEPTED, alex), 204)
        report.expect_status("Adele can no longer change the Draft", dv.call("PATCH", f"vibe_quotes({draft})", {"vibe_validuntil": "2027-05-01"}, as_user=adele), 403)

    closed = opportunity(adele, "Closed Quotes")
    report.expect_status("Adele closes the Opportunity", dv.call(
        "PATCH", f"vibe_opportunities({closed})", {"statecode": 1, "statuscode": 2}, as_user=adele), 204)
    _, result = new_quote(closed, adele)
    report.expect_status("Adele makes a Quote on a closed Opportunity", result, 400)

    deletable, result = new_quote(opp, adele)
    report.expect_status("Adele makes a Draft to delete", result, 204)
    if deletable:
        report.expect_status("Adele deletes the Draft", dv.call("DELETE", f"vibe_quotes({deletable})", as_user=adele), 204)


def cleanup(dv, created):
    # Reassigns made by the checks make the plug-in post Notifications about the "[security-check]" records.
    leftovers = dv.get(f"vibe_notifications?$select=vibe_notificationid&$filter=contains(vibe_name,'security-check')")["value"]
    created.extend(("vibe_notifications", row["vibe_notificationid"]) for row in leftovers)
    for entity_set, record_id in reversed(created):
        # Lines on a closed Opportunity can only be removed with the plug-ins bypassed.
        bypass = {"MSCRM.BypassCustomPluginExecution": "true"} if entity_set in ("vibe_productlines", "vibe_quotes", "vibe_quotelines") else None
        status, _, code, _ = dv.call("DELETE", f"{entity_set}({record_id})", headers=bypass)
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
