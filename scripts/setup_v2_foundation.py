"""
setup_v2_foundation.py -- v2 foundation schema in dev-salesapp (issue #92).

Idempotent: every step checks first, so it is safe to run twice.

  * global choice vibe_forecastcategory + Opportunity.vibe_forecastcategory
  * table vibe_ProcessVersion (empty shell, Organization-owned)
  * Lead and Opportunity: vibe_processversionid (lookup), vibe_currentstep
    (stable Step id, text), vibe_stepenteredon (date and time)
  * Account: Relationship type (customertypecode) trimmed to seven options and
    shown as "Account type"; both it and Industry (industrycode) added to the
    SalesApp solution

Run:  python scripts/setup_v2_foundation.py
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

ACCOUNT_TYPES_KEEP = {8: "Prospect", 3: "Customer", 5: "Partner", 9: "Reseller", 10: "Supplier", 1: "Competitor", 12: "Other"}
FORECAST = ["Pipeline", "Best case", "Commit", "Omitted"]
FORECAST_BASE = 841200000


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


def forecast_choice():
    if exists("GlobalOptionSetDefinitions(Name='vibe_forecastcategory')"):
        print("= global choice vibe_forecastcategory")
        return
    call("POST", "GlobalOptionSetDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
        "Name": "vibe_forecastcategory",
        "DisplayName": label("Forecast category"),
        "OptionSetType": "Picklist",
        "IsGlobal": True,
        "Options": [{"Value": FORECAST_BASE + i, "Label": label(t)} for i, t in enumerate(FORECAST)],
    })
    print("+ global choice vibe_forecastcategory")


def process_version_table():
    if exists("EntityDefinitions(LogicalName='vibe_processversion')"):
        print("= table vibe_processversion")
        return
    call("POST", "EntityDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": "vibe_ProcessVersion",
        "DisplayName": label("Process version"),
        "DisplayCollectionName": label("Process versions"),
        "Description": label("A Process as it stood at one Publish (shell; filled by the process engine tickets)."),
        "OwnershipType": "OrganizationOwned",
        "HasActivities": False,
        "HasNotes": False,
        "PrimaryNameAttribute": "vibe_name",
        "Attributes": [{
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "SchemaName": "vibe_name",
            "IsPrimaryName": True,
            "RequiredLevel": {"Value": "ApplicationRequired"},
            "MaxLength": 200,
            "FormatName": {"Value": "Text"},
            "DisplayName": label("Name"),
        }],
    })
    print("+ table vibe_processversion")


def add_string(table, schema, display, length, description):
    if attr_exists(table, schema.lower()):
        print(f"= {table}.{schema.lower()}")
        return
    call("POST", f"EntityDefinitions(LogicalName='{table}')/Attributes", {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "SchemaName": schema,
        "DisplayName": label(display),
        "Description": label(description),
        "RequiredLevel": {"Value": "None"},
        "MaxLength": length,
        "FormatName": {"Value": "Text"},
    })
    print(f"+ {table}.{schema.lower()}")


def add_datetime(table, schema, display, description):
    if attr_exists(table, schema.lower()):
        print(f"= {table}.{schema.lower()}")
        return
    call("POST", f"EntityDefinitions(LogicalName='{table}')/Attributes", {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        "SchemaName": schema,
        "DisplayName": label(display),
        "Description": label(description),
        "RequiredLevel": {"Value": "None"},
        "Format": "DateAndTime",
        "DateTimeBehavior": {"Value": "UserLocal"},
    })
    print(f"+ {table}.{schema.lower()}")


def add_process_version_lookup(table):
    if attr_exists(table, "vibe_processversionid"):
        print(f"= {table}.vibe_processversionid")
        return
    short = table.removeprefix("vibe_")
    call("POST", "RelationshipDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        "SchemaName": f"vibe_processversion_{short}",
        "ReferencedEntity": "vibe_processversion",
        "ReferencingEntity": table,
        "Lookup": {
            "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            "SchemaName": "vibe_ProcessVersionId",
            "DisplayName": label("Process version"),
            "Description": label("The Process version this record follows."),
            "RequiredLevel": {"Value": "None"},
        },
        "CascadeConfiguration": {
            "Assign": "NoCascade", "Delete": "RemoveLink", "Merge": "NoCascade",
            "Reparent": "NoCascade", "Share": "NoCascade", "Unshare": "NoCascade",
        },
    })
    print(f"+ {table}.vibe_processversionid")


def add_forecast_category():
    if attr_exists("vibe_opportunity", "vibe_forecastcategory"):
        print("= vibe_opportunity.vibe_forecastcategory")
        return
    gid = requests.get(BASE + "GlobalOptionSetDefinitions(Name='vibe_forecastcategory')?$select=MetadataId", headers=H).json()["MetadataId"]
    call("POST", "EntityDefinitions(LogicalName='vibe_opportunity')/Attributes", {
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        "SchemaName": "vibe_ForecastCategory",
        "DisplayName": label("Forecast category"),
        "Description": label("How firmly the Owner counts on this open Opportunity."),
        "RequiredLevel": {"Value": "None"},
        "GlobalOptionSet@odata.bind": f"/GlobalOptionSetDefinitions({gid})",
    })
    print("+ vibe_opportunity.vibe_forecastcategory")


def account_type():
    path = "EntityDefinitions(LogicalName='account')/Attributes(LogicalName='customertypecode')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
    meta = requests.get(BASE + path + "?$expand=OptionSet", headers=H).json()
    for o in meta["OptionSet"]["Options"]:
        if o["Value"] not in ACCOUNT_TYPES_KEEP:
            call("POST", "DeleteOptionValue", {"EntityLogicalName": "account", "AttributeLogicalName": "customertypecode", "Value": o["Value"]})
            print(f"- account.customertypecode option {o['Value']}")
    if meta["DisplayName"]["UserLocalizedLabel"]["Label"] != "Account type":
        call("PUT", path,
             {"@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata", **{k: meta[k] for k in ("MetadataId", "SchemaName", "LogicalName")},
              "DisplayName": label("Account type"), "RequiredLevel": meta["RequiredLevel"]},
             headers={"MSCRM.MergeLabels": "true"})
        print("~ account.customertypecode shown as Account type")
    for name in ("customertypecode", "industrycode"):
        a = requests.get(BASE + f"EntityDefinitions(LogicalName='account')/Attributes(LogicalName='{name}')?$select=MetadataId", headers=H).json()
        call("POST", "AddSolutionComponent", {"ComponentId": a["MetadataId"], "ComponentType": 2, "SolutionUniqueName": SOLUTION, "AddRequiredComponents": False})
        print(f"~ account.{name} in solution")


def publish():
    call("POST", "PublishAllXml", {})
    print("published")


if __name__ == "__main__":
    forecast_choice()
    process_version_table()
    add_forecast_category()
    for t in ("vibe_lead", "vibe_opportunity"):
        add_process_version_lookup(t)
        add_string(t, "vibe_CurrentStep", "Current step", 100, "Stable id of the Step the record is on in its Process version.")
        add_datetime(t, "vibe_StepEnteredOn", "Step entered on", "When the record entered its current Step.")
    account_type()
    publish()
