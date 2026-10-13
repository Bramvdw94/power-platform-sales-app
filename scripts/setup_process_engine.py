"""
setup_process_engine.py -- the process engine's schema in dev-salesapp (issue #94).

Idempotent: every step checks first, so it is safe to run twice.

  * global choice vibe_enginetable (Lead, Opportunity, Account, Contact)
  * vibe_ProcessVersion (the shell from #92): Process, version number, definition,
    published on / by
  * vibe_Process: name, table, priority, fallback, retired, draft definition, latest version
  * vibe_BusinessRule: name, table, on/off, definition
  * vibe_EngineError: rule or Process, action, code, message, record, occurred on
  * Task.vibe_actionid, so an Action Task is tied to the Action that made it
  * environment variable vibe_ProcessEngineEnabled (the kill switch; "on" / "off")

Roles are in setup_security_role.py, plug-in steps in register_plugin_package.py.

Run:  python scripts/setup_process_engine.py
Then: cd solutions/SalesApp && pac solution sync
"""

import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from auth import get_token, load_env  # noqa: E402

load_env()
BASE = os.environ["DATAVERSE_URL"].rstrip("/") + "/api/data/v9.2/"
SOLUTION = os.environ.get("SOLUTION_NAME") or "SalesApp"
H = {
    "Authorization": "Bearer " + get_token(),
    "Accept": "application/json",
    "Content-Type": "application/json",
    "MSCRM.SolutionUniqueName": SOLUTION,
}
LCID = 1033
CHOICE_BASE = 841200000
DEFINITION_LENGTH = 1048576


def label(text):
    return {"@odata.type": "Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", "Label": text, "LanguageCode": LCID}]}


def call(method, path, body=None, headers=None, ok=(200, 201, 204)):
    r = requests.request(method, BASE + path, headers={**H, **(headers or {})}, json=body)
    if r.status_code not in ok:
        sys.exit(f"{method} {path} -> {r.status_code}: {r.text[:600]}")
    return r


def exists(path):
    return requests.get(BASE + path, headers=H).status_code == 200


def attr_exists(table, name):
    return exists(f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{name}')")


def global_choice(name, display, options):
    if exists(f"GlobalOptionSetDefinitions(Name='{name}')"):
        print(f"= global choice {name}")
        return
    call("POST", "GlobalOptionSetDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
        "Name": name, "DisplayName": label(display), "OptionSetType": "Picklist", "IsGlobal": True,
        "Options": [{"Value": CHOICE_BASE + i, "Label": label(t)} for i, t in enumerate(options)],
    })
    print(f"+ global choice {name}")


def choice_id(name):
    return requests.get(BASE + f"GlobalOptionSetDefinitions(Name='{name}')?$select=MetadataId", headers=H).json()["MetadataId"]


def table(schema, display, plural, description, owner="OrganizationOwned"):
    logical = schema.lower()
    if exists(f"EntityDefinitions(LogicalName='{logical}')"):
        print(f"= table {logical}")
        return
    call("POST", "EntityDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": schema,
        "DisplayName": label(display),
        "DisplayCollectionName": label(plural),
        "Description": label(description),
        "OwnershipType": owner,
        "HasActivities": False,
        "HasNotes": False,
        "PrimaryNameAttribute": "vibe_name",
        "Attributes": [{
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "SchemaName": "vibe_name", "IsPrimaryName": True,
            "RequiredLevel": {"Value": "ApplicationRequired"}, "MaxLength": 200,
            "FormatName": {"Value": "Text"}, "DisplayName": label("Name"),
        }],
    })
    print(f"+ table {logical}")


def add(tbl, schema, body):
    if attr_exists(tbl, schema.lower()):
        print(f"= {tbl}.{schema.lower()}")
        return
    call("POST", f"EntityDefinitions(LogicalName='{tbl}')/Attributes", {"SchemaName": schema, **body})
    print(f"+ {tbl}.{schema.lower()}")


def string(tbl, schema, display, description, length=200, required="None"):
    add(tbl, schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "DisplayName": label(display), "Description": label(description),
        "RequiredLevel": {"Value": required}, "MaxLength": length, "FormatName": {"Value": "Text"},
    })


def memo(tbl, schema, display, description, length=DEFINITION_LENGTH):
    add(tbl, schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        "DisplayName": label(display), "Description": label(description),
        "RequiredLevel": {"Value": "None"}, "MaxLength": length, "Format": "TextArea",
    })


def integer(tbl, schema, display, description, minimum=0, maximum=100000, required="None"):
    add(tbl, schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
        "DisplayName": label(display), "Description": label(description),
        "RequiredLevel": {"Value": required}, "Format": "None", "MinValue": minimum, "MaxValue": maximum,
    })


def boolean(tbl, schema, display, description, default=False):
    add(tbl, schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
        "DisplayName": label(display), "Description": label(description),
        "RequiredLevel": {"Value": "None"}, "DefaultValue": default,
        "OptionSet": {"TrueOption": {"Value": 1, "Label": label("Yes")}, "FalseOption": {"Value": 0, "Label": label("No")}, "OptionSetType": "Boolean"},
    })


def datetime_(tbl, schema, display, description):
    add(tbl, schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        "DisplayName": label(display), "Description": label(description),
        "RequiredLevel": {"Value": "None"}, "Format": "DateAndTime", "DateTimeBehavior": {"Value": "UserLocal"},
    })


def table_choice(tbl, required="ApplicationRequired"):
    add(tbl, "vibe_TableChoice", {
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        "DisplayName": label("Table"), "Description": label("The table the definition is for."),
        "RequiredLevel": {"Value": required},
        "GlobalOptionSet@odata.bind": f"/GlobalOptionSetDefinitions({choice_id('vibe_enginetable')})",
    })


def lookup(referencing, referenced, schema, display, description, relationship=None):
    if attr_exists(referencing, schema.lower()):
        print(f"= {referencing}.{schema.lower()}")
        return
    call("POST", "RelationshipDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        "SchemaName": relationship or f"{referenced}_{referencing}_{schema.lower()}",
        "ReferencedEntity": referenced,
        "ReferencingEntity": referencing,
        "Lookup": {
            "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            "SchemaName": schema, "DisplayName": label(display), "Description": label(description),
            "RequiredLevel": {"Value": "None"},
        },
        "CascadeConfiguration": {
            "Assign": "NoCascade", "Delete": "RemoveLink", "Merge": "NoCascade",
            "Reparent": "NoCascade", "Share": "NoCascade", "Unshare": "NoCascade",
        },
    })
    print(f"+ {referencing}.{schema.lower()}")


def kill_switch():
    name = "vibe_ProcessEngineEnabled"
    found = requests.get(BASE + f"environmentvariabledefinitions?$select=environmentvariabledefinitionid&$filter=schemaname eq '{name}'", headers=H).json()["value"]
    if found:
        print(f"= environment variable {name}")
        return
    call("POST", "environmentvariabledefinitions", {
        "schemaname": name,
        "displayname": "Process engine enabled",
        "description": "The kill switch of the process engine. \"on\" (default) runs Processes and Business rules; \"off\" turns both the plug-in and the app's engine off so records behave as in v1.",
        "type": 100000000,
        "defaultvalue": "on",
    })
    print(f"+ environment variable {name}")


def publish():
    call("POST", "PublishAllXml", {})
    print("published")


if __name__ == "__main__":
    global_choice("vibe_enginetable", "Engine table", ["Lead", "Opportunity", "Account", "Contact"])

    table("vibe_Process", "Process", "Processes", "A sales Process of Steps for Leads or Opportunities, built by a Process builder.")
    table("vibe_BusinessRule", "Business rule", "Business rules", "A table-wide rule: required, read-only, set value, warning or block save.")
    table("vibe_EngineError", "Engine error", "Engine errors", "A rule or Action the engine could not run. The save went through.")

    # vibe_ProcessVersion exists as a shell from #92.
    lookup("vibe_processversion", "vibe_process", "vibe_ProcessId", "Process", "The Process this version belongs to.", "vibe_process_processversion")
    integer("vibe_processversion", "vibe_VersionNumber", "Version number", "1 for the first Publish, then 2, 3 ...", 1, 100000, "ApplicationRequired")
    memo("vibe_processversion", "vibe_Definition", "Definition", "The published definition, JSON checked against process-engine/schema/definition.schema.json. Never changes.")
    datetime_("vibe_processversion", "vibe_PublishedOn", "Published on", "When this version was published.")
    lookup("vibe_processversion", "systemuser", "vibe_PublishedById", "Published by", "Who published this version.", "vibe_processversion_publishedby")

    table_choice("vibe_process")
    integer("vibe_process", "vibe_Priority", "Priority", "Lower comes first when picking a Process for a new record.", 0, 100000, "ApplicationRequired")
    boolean("vibe_process", "vibe_IsFallback", "Is fallback", "The Process records get when no other one matches. Has no Entry criteria.")
    boolean("vibe_process", "vibe_Retired", "Retired", "No new records get a retired Process; existing records finish on it.")
    memo("vibe_process", "vibe_DraftDefinition", "Draft definition", "The definition being edited, JSON. Publish copies it to a new Process version.")
    lookup("vibe_process", "vibe_processversion", "vibe_LatestVersionId", "Latest version", "The Process version new records get; empty while the Process is a draft.", "vibe_processversion_process_latest")

    table_choice("vibe_businessrule")
    boolean("vibe_businessrule", "vibe_Enabled", "Enabled", "A rule that is off is not evaluated.", True)
    memo("vibe_businessrule", "vibe_Definition", "Definition", "The condition and effects, JSON checked against process-engine/schema/definition.schema.json.")

    lookup("vibe_engineerror", "vibe_businessrule", "vibe_RuleId", "Rule", "The Business rule that could not run.", "vibe_businessrule_engineerror")
    lookup("vibe_engineerror", "vibe_process", "vibe_ProcessId", "Process", "The Process whose Action or Gate could not run.", "vibe_process_engineerror")
    string("vibe_engineerror", "vibe_ActionId", "Action id", "The Action that could not run.", 64)
    string("vibe_engineerror", "vibe_Code", "Code", "What went wrong, e.g. fieldMissing or noManager.", 100)
    string("vibe_engineerror", "vibe_Message", "Message", "What went wrong, in words.", 2000)
    string("vibe_engineerror", "vibe_RecordTable", "Record table", "lead, opportunity, account or contact.", 20)
    string("vibe_engineerror", "vibe_RecordId", "Record id", "The record that was being saved.", 64)
    datetime_("vibe_engineerror", "vibe_OccurredOn", "Occurred on", "When the engine hit the problem.")

    string("task", "vibe_ActionId", "Action id", "The Process Action that created this Task.", 64)

    kill_switch()
    publish()
