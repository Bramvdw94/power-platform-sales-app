"""
setup_security_role.py — create or reconcile the SalesApp security roles in
dev-salesapp, give them to the demo users and set the demo Managers (#25).

Idempotent: re-running it brings the live role back to exactly the privileges
declared below (ReplacePrivilegesRole), so a privilege removed here is removed
there too. Every privilege beyond the spec is listed in EXTRAS with its reason.

Usage (repo root, .env with DATAVERSE_URL and TENANT_ID):
    python scripts/setup_security_role.py            # show what would change
    python scripts/setup_security_role.py --apply    # make the changes
    python scripts/setup_security_role.py --apply --refresh
        # also remove and re-add each user's role, which rebuilds the user's
        # cached privilege set after a change to a role they already hold
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

SOLUTION = "SalesApp"

BASIC, LOCAL, GLOBAL = "Basic", "Local", "Global"

# The spec (#23): everyone reads everything; the Owner (and through hierarchy
# the Owner's manager) changes and reassigns; nobody deletes.
SALES_TABLES = ["vibe_Lead", "vibe_Opportunity", "Account", "Contact"]
# Append To decides who may attach something to a record. On Account and
# Contact it is Organization, so anyone can link their Opportunity or Contact
# to an Account someone else owns (story 33). On Lead and Opportunity it is
# User: only the Owner, and through hierarchy the Owner's manager, can add a
# Note, Task or Phone Call (story 97, enforced in Dataverse by Bram's choice).
APPEND_TO = {"vibe_Lead": BASIC, "vibe_Opportunity": BASIC, "Account": GLOBAL, "Contact": GLOBAL}
SPEC = {}
for t in SALES_TABLES:
    SPEC.update({
        f"prvRead{t}": GLOBAL, f"prvAppendTo{t}": APPEND_TO[t],
        f"prvCreate{t}": BASIC, f"prvWrite{t}": BASIC,
        f"prvAppend{t}": BASIC, f"prvAssign{t}": BASIC,
    })
# Note covers annotation; Activity covers Task and Phone Call (and every other
# activity type, which share one privilege set).
for t in ["Note", "Activity"]:
    SPEC.update({
        f"prvRead{t}": GLOBAL,
        f"prvCreate{t}": BASIC, f"prvWrite{t}": BASIC,
        f"prvAppend{t}": BASIC, f"prvAssign{t}": BASIC,
    })

# Products (#99) are organisation-owned, so the only depth is Global. Everyone
# reads the catalogue; only the Catalogue Manager role creates and changes it,
# and nobody deletes. Retire is a state change, which needs Write.
PRODUCT_READ = {"prvReadvibe_Product": GLOBAL}
PRODUCT_MANAGE = {"prvCreatevibe_Product": GLOBAL, "prvWritevibe_Product": GLOBAL}

# Product lines (#100) follow their Opportunity: the plug-in gives a line the
# Opportunity's Owner, so User-level create, write and delete reach the Owner and,
# through the hierarchy, the Owner's manager. Adding a line also needs Append To on
# the Opportunity (already User level, so a peer cannot add one) and on the Product.
PRODUCT_LINE = {
    "prvReadvibe_ProductLine": GLOBAL,
    "prvCreatevibe_ProductLine": BASIC, "prvWritevibe_ProductLine": BASIC,
    "prvDeletevibe_ProductLine": BASIC, "prvAppendvibe_ProductLine": BASIC,
    "prvAssignvibe_ProductLine": BASIC, "prvAppendTovibe_Product": GLOBAL,
}

# Quotes (#101) follow their Opportunity the same way: everyone reads them, and the plug-in
# gives a Quote and its lines the Opportunity's Owner, so User-level create, write and delete
# reach the Owner and, through the hierarchy, the Owner's manager. Adding a Quote also needs
# Append To on the Opportunity (User level) and, for the lines, on the Quote.
QUOTE_TABLES = ["vibe_Quote", "vibe_QuoteLine"]
QUOTES = {"prvReadvibe_Quote": GLOBAL, "prvReadvibe_QuoteLine": GLOBAL}
for _t in QUOTE_TABLES:
    QUOTES.update({
        f"prvCreate{_t}": BASIC, f"prvWrite{_t}": BASIC, f"prvDelete{_t}": BASIC,
        f"prvAppend{_t}": BASIC, f"prvAppendTo{_t}": BASIC, f"prvAssign{_t}": BASIC,
    })

# Quote templates and Quote settings (#102) are organisation-owned like Products: everyone reads
# them (the PDF is drawn in the salesperson's browser), only the Catalogue Manager role creates and
# changes them, and only a template can be deleted (#103, from the template list). Pointing a Quote at a template needs Append To on the template.
QUOTE_PDF_TABLES = ["vibe_QuoteTemplate", "vibe_QuoteSettings"]
QUOTE_PDF_READ = {f"prvRead{t}": GLOBAL for t in QUOTE_PDF_TABLES}
QUOTE_PDF_READ["prvAppendTovibe_QuoteTemplate"] = GLOBAL
QUOTE_PDF_MANAGE = {f"prv{verb}{t}": GLOBAL for t in QUOTE_PDF_TABLES for verb in ("Create", "Write")}
QUOTE_PDF_MANAGE["prvDeletevibe_QuoteTemplate"] = GLOBAL

# Quota (#104) is owned by the salesperson it is for. Everyone reads their own
# row (a manager reads and writes direct reports' rows through the hierarchy);
# only the Sales Manager role writes them. Who may write which row is decided by
# QuotaGuardPlugin, not by these depths.
QUOTA = "prvReadvibe_Quota"

# Process engine (#94). Definitions are organisation-owned, so Global is the only depth.
# Everyone reads Processes and Business rules (story 45); only the Process Builder role
# writes them. Engine errors are the builders' to read. AppendTo on Process version lets
# the plug-in's pick (and a Switch Process) set the lookup on a salesperson's own Lead or
# Opportunity, which Dataverse checks against the caller.
ENGINE_READ = {f"prvRead{t}": GLOBAL for t in ["vibe_Process", "vibe_ProcessVersion", "vibe_BusinessRule"]}
ENGINE_APPEND_TO = {"prvAppendTovibe_ProcessVersion": GLOBAL}
ENGINE_MANAGE = {
    f"prv{verb}{t}": GLOBAL
    for t in ["vibe_Process", "vibe_ProcessVersion", "vibe_BusinessRule"]
    for verb in ["Create", "Write", "Delete", "Append", "AppendTo"]
}
ENGINE_ERRORS = {"prvReadvibe_EngineError": GLOBAL}
# The process bar reads the kill switch (the environment variable vibe_ProcessEngineEnabled) so the
# app's engine goes off together with the plug-in (#95). Without these, a salesperson's read fails
# with 0x80040220 and the bar would stay on while the plug-in no longer enforces anything.
# (The value table has no privileges of its own; it follows the definition.)
ENGINE_KILL_SWITCH = {"prvReadEnvironmentVariableDefinition": GLOBAL}
# Switch Process on any record (spec #91, Security summary; stories 31 and 66), including
# Move to latest version and the bulk switch for a retired Process, writes other people's
# Leads and Opportunities. So a Process builder has Write on all of them (Bram, 2026-10-13).
SWITCH_ANY_RECORD = {"prvWritevibe_Lead": GLOBAL, "prvWritevibe_Opportunity": GLOBAL}

# Privileges beyond the spec, each proven necessary by security_check.py or a
# real call. name -> (depth, why).
EXTRAS = {
    "prvReadAsyncOperation": (BASIC, "creating a Note starts a System Job (asyncoperation) owned by the "
                              "caller, and the create fails with 0x80040299 'missing prvReadAsyncOperation' "
                              "without it"),
    "prvReadUser": (GLOBAL, "the app reads the signed-in user, their direct reports and every Owner's "
                    "name from systemuser; without it the app fails with 0x80040220 'missing "
                    "prvReadUser' on load (seen as Diego, #27)"),
    "prvAppendToUser": (GLOBAL, "Disqualify sets vibe_DisqualifiedBy and Close sets vibe_ClosedBy, both "
                        "lookups to systemuser; binding them fails with 0x80040220 'missing "
                        "prvAppendToUser' without it (seen as Adele and Megan, #29)"),
    "prvReadRole": (LOCAL, "Reassign lists who can own a record by filtering systemuser on "
                    "systemuserroles_association/any(r:r/name eq 'SalesApp Salesperson'); that "
                    "fails with 0x80040220 'missing prvReadRole' without it (seen as Adele and "
                    "Megan, #34). Roles belong to a business unit and every user is in the root "
                    "one, so Local is enough"),
}

# Dataverse puts these back on every role, even straight after a
# ReplacePrivilegesRole that leaves them out, so they are declared rather than
# fought. (A new role also starts with five read privileges on plug-in
# registration tables; those the replace does remove, and nothing needs them.)
PLATFORM = {
    "prvReadSharePointData": GLOBAL, "prvCreateSharePointData": GLOBAL,
    "prvWriteSharePointData": GLOBAL, "prvReadSharePointDocument": GLOBAL,
}

ROLES = {
    "SalesApp Salesperson": {
        "privileges": {**SPEC, **PRODUCT_READ, **PRODUCT_LINE, **QUOTES, **QUOTE_PDF_READ, **ENGINE_READ, **ENGINE_APPEND_TO, **ENGINE_KILL_SWITCH, **PLATFORM, **{k: v[0] for k, v in EXTRAS.items()}, QUOTA: BASIC},
        "users": ["Megan Bowen", "Adele Vance", "Alex Wilber", "Diego Siciliani"],
    },
    # Fallback from #21: Manager hierarchy gives a manager Write on a direct
    # report's records but not Assign (0x80048306 "does not have AssignAccess
    # right(s)"). This role adds Assign at Business Unit for managers only.
    # An Owner change sent as a PATCH also needs Write on the record, so this
    # reaches only records the manager can already write: their own and their
    # direct reports' (through hierarchy). Verified by security_check.py.
    "SalesApp Sales Manager": {
        "privileges": {
            **{f"prvAssign{t}": LOCAL for t in SALES_TABLES},
            **PLATFORM,
            "prvCreatevibe_Quota": LOCAL, "prvWritevibe_Quota": BASIC,
            "prvAppendvibe_Quota": BASIC, "prvAppendTovibe_Quota": BASIC,
            # A manager adding a line to a report's Opportunity: the plug-in gives the line the
            # report as Owner, and creating a record for another owner needs Create at that depth.
            "prvCreatevibe_ProductLine": LOCAL, "prvDeletevibe_ProductLine": LOCAL,
            # The same for a Quote and its lines on a report's Opportunity (#101).
            **{f"prv{verb}{t}": LOCAL for t in QUOTE_TABLES for verb in ("Create", "Delete")},
        },
        "users": ["Megan Bowen"],
    },
    # Megan in the demo (#99). The role holds only what Salesperson lacks; she
    # keeps reading everything through Salesperson.
    "SalesApp Catalogue Manager": {
        "privileges": {**PRODUCT_READ, **PRODUCT_MANAGE, **QUOTE_PDF_MANAGE, **PLATFORM},
        "users": ["Megan Bowen"],
    },
    # Megan in the demo (#94). Holds only what Salesperson lacks; she keeps reading
    # everything through Salesperson.
    "SalesApp Process Builder": {
        "privileges": {**ENGINE_MANAGE, **ENGINE_ERRORS, **SWITCH_ANY_RECORD, **PLATFORM},
        "users": ["Megan Bowen"],
    },
}

MANAGERS = {"Adele Vance": "Megan Bowen", "Alex Wilber": "Megan Bowen"}
NOT_UNDER = {"Diego Siciliani": "Megan Bowen"}


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

    def call(self, method, path, body=None, headers=None):
        h = dict(self.headers)
        h.update(headers or {})
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path.replace(" ", "%20"), data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None, resp.headers.get("OData-EntityId")
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{method} {path} failed: {e.code} {e.read().decode(errors='replace')}") from None

    def get(self, path):
        return self.call("GET", path)[0]


def q(value):
    return value.replace("'", "''")


def user_id(dv, fullname):
    rows = dv.get(f"systemusers?$select=systemuserid,_parentsystemuserid_value&$filter=fullname eq '{q(fullname)}'")["value"]
    if len(rows) != 1:
        raise RuntimeError(f"expected one user named {fullname}, found {len(rows)}")
    return rows[0]


def privilege_ids(dv, names):
    ids = {}
    for name in names:
        rows = dv.get(f"privileges?$select=privilegeid,name&$filter=name eq '{name}'")["value"]
        if len(rows) != 1:
            raise RuntimeError(f"privilege {name} not found")
        ids[name] = rows[0]["privilegeid"]
    return ids


def ensure_role(dv, name, spec, root_bu, solution_id, apply, refresh):
    print(f"Role {name}")
    rows = dv.get(f"roles?$select=roleid&$filter=name eq '{q(name)}' and _businessunitid_value eq {root_bu}")["value"]
    if rows:
        role = rows[0]["roleid"]
        print(f"  exists ({role})")
    elif apply:
        _, location = dv.call("POST", "roles", {
            "name": name, "businessunitid@odata.bind": f"/businessunits({root_bu})",
        }, headers={"MSCRM.SolutionUniqueName": SOLUTION})
        role = location.rsplit("(", 1)[1].rstrip(")")
        print(f"  created ({role})")
    else:
        print("  would create")
        return

    members = dv.get(f"solutioncomponents?$select=solutioncomponentid&$filter=_solutionid_value eq {solution_id}"
                     f" and componenttype eq 20 and objectid eq {role}")["value"]
    if not members:
        print("  not in SalesApp" + ("; adding" if apply else "; would add"))
        if apply:
            dv.call("POST", "AddSolutionComponent", {
                "ComponentId": role, "ComponentType": 20, "SolutionUniqueName": SOLUTION,
                "AddRequiredComponents": False,
            })

    wanted = spec["privileges"]
    ids = privilege_ids(dv, wanted)
    current = dv.get(f"RetrieveRolePrivilegesRole(RoleId={role})")["RolePrivileges"]
    have = {p["PrivilegeName"]: p["Depth"] for p in current}
    want = dict(wanted)
    if have != want:
        for n in sorted(set(have) | set(want)):
            if have.get(n) != want.get(n):
                print(f"  {n}: {have.get(n)} -> {want.get(n)}")
        if apply:
            dv.call("POST", f"roles({role})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole", {"Privileges": [
                {"PrivilegeId": ids[n], "Depth": d, "BusinessUnitId": root_bu} for n, d in want.items()
            ]})
            after = {p["PrivilegeName"]: p["Depth"] for p in
                     dv.get(f"RetrieveRolePrivilegesRole(RoleId={role})")["RolePrivileges"]}
            if after != want:
                raise RuntimeError(f"role {name} privileges did not land: {after}")
            print(f"  privileges set ({len(want)})")
            refresh = True
    else:
        print(f"  privileges match ({len(want)})")

    for fullname in spec["users"]:
        uid = user_id(dv, fullname)["systemuserid"]
        held = dv.get(f"systemusers({uid})/systemuserroles_association?$select=roleid&$filter=roleid eq {role}")["value"]
        ref = {"@odata.id": f"{dv.base}roles({role})"}
        if held and refresh and apply:
            dv.call("DELETE", f"systemusers({uid})/systemuserroles_association({role})/$ref")
            dv.call("POST", f"systemusers({uid})/systemuserroles_association/$ref", ref)
            print(f"  {fullname}: re-associated (refreshes cached privileges)")
        elif held:
            print(f"  {fullname}: has role")
        elif apply:
            dv.call("POST", f"systemusers({uid})/systemuserroles_association/$ref", ref)
            print(f"  {fullname}: role given")
        else:
            print(f"  {fullname}: would give role")


def ensure_administrator(dv, apply):
    """System Administrator must hold every privilege on every vibe_ table, plus the kill-switch read.

    Dataverse normally adds these to the role itself; this finds them in the environment (so a future
    table is covered without editing this file) and tops up anything missing. It only adds, never removes.
    """
    print("Role System Administrator")
    role = dv.get("roles?$select=roleid&$filter=name eq 'System Administrator'")["value"][0]["roleid"]
    held = {p["PrivilegeName"].lower(): p["Depth"] for p in dv.get(f"RetrieveRolePrivilegesRole(RoleId={role})")["RolePrivileges"]}
    rows = dv.get("privileges?$select=privilegeid,name&$filter=contains(name,'vibe_')&$top=5000")["value"]
    rows += dv.get("privileges?$select=privilegeid,name&$filter=name eq 'prvReadEnvironmentVariableDefinition'")["value"]
    missing = [r for r in rows if held.get(r["name"].lower()) != GLOBAL]
    if not missing:
        print(f"  holds all {len(rows)} vibe_ and kill-switch privileges at Global")
        return
    for r in missing:
        print(f"  {r['name']}: {held.get(r['name'].lower())} -> {GLOBAL}")
    if apply:
        root_bu = dv.get("businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null")["value"][0]["businessunitid"]
        dv.call("POST", f"roles({role})/Microsoft.Dynamics.CRM.AddPrivilegesRole", {"Privileges": [
            {"PrivilegeId": r["privilegeid"], "Depth": GLOBAL, "BusinessUnitId": root_bu} for r in missing]})
        print(f"  added {len(missing)}")


def ensure_managers(dv, apply):
    print("Managers")
    for report, manager in MANAGERS.items():
        r, m = user_id(dv, report), user_id(dv, manager)["systemuserid"]
        if r["_parentsystemuserid_value"] == m:
            print(f"  {report} -> {manager}: set")
        elif apply:
            dv.call("PATCH", f"systemusers({r['systemuserid']})", {"parentsystemuserid@odata.bind": f"/systemusers({m})"})
            print(f"  {report} -> {manager}: updated")
        else:
            print(f"  {report} -> {manager}: would set")
    for user, manager in NOT_UNDER.items():
        if user_id(dv, user)["_parentsystemuserid_value"] == user_id(dv, manager)["systemuserid"]:
            raise RuntimeError(f"{user} reports to {manager}; fix that by hand")
        print(f"  {user} does not report to {manager}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="make the changes (default: dry run)")
    parser.add_argument("--refresh", action="store_true", help="re-associate roles users already hold")
    args = parser.parse_args()

    dv = Dataverse()
    org = dv.get("organizations?$select=ishierarchicalsecuritymodelenabled,maxdepthforhierarchicalsecuritymodel,"
                 "usepositionhierarchy")["value"][0]
    print(f"Hierarchy security: enabled={org['ishierarchicalsecuritymodelenabled']} "
          f"depth={org['maxdepthforhierarchicalsecuritymodel']} position={org['usepositionhierarchy']}")
    if not org["ishierarchicalsecuritymodelenabled"] or org["usepositionhierarchy"] \
            or org["maxdepthforhierarchicalsecuritymodel"] != 1:
        raise SystemExit("expected Manager hierarchy, depth 1")
    root_bu = dv.get("businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null")["value"][0]["businessunitid"]
    solution_id = dv.get(f"solutions?$select=solutionid&$filter=uniquename eq '{SOLUTION}'")["value"][0]["solutionid"]
    for name, spec in ROLES.items():
        ensure_role(dv, name, spec, root_bu, solution_id, args.apply, args.refresh)
    ensure_administrator(dv, args.apply)
    ensure_managers(dv, args.apply)
    if not args.apply:
        print("\nDry run. Re-run with --apply to make these changes.")


if __name__ == "__main__":
    main()
