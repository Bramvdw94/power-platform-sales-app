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
        "privileges": {**SPEC, **PLATFORM, **{k: v[0] for k, v in EXTRAS.items()}},
        "users": ["Megan Bowen", "Adele Vance", "Alex Wilber", "Diego Siciliani"],
    },
    # Fallback from #21: Manager hierarchy gives a manager Write on a direct
    # report's records but not Assign (0x80048306 "does not have AssignAccess
    # right(s)"). This role adds Assign at Business Unit for managers only.
    # An Owner change sent as a PATCH also needs Write on the record, so this
    # reaches only records the manager can already write: their own and their
    # direct reports' (through hierarchy). Verified by security_check.py.
    "SalesApp Sales Manager": {
        "privileges": {**{f"prvAssign{t}": LOCAL for t in SALES_TABLES}, **PLATFORM},
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
    ensure_managers(dv, args.apply)
    if not args.apply:
        print("\nDry run. Re-run with --apply to make these changes.")


if __name__ == "__main__":
    main()
