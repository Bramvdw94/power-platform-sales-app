"""
setup_forecast_quotas.py -- schema for Forecast category and Quotas (issue #104).

Idempotent: every step checks first, so it is safe to run twice.

  * table vibe_Quota (user-owned): Name, Salesperson (lookup to systemuser),
    Month (date only, always the first day of the month), Amount (euros);
    alternate key on Salesperson + Month. The row's Owner is the salesperson,
    so a manager reads and writes a direct report's row through the manager
    hierarchy; the QuotaGuardPlugin (plugins/) refuses anyone else.
  * Dataverse auditing: on for the organisation and the Opportunity table, and
    on for exactly Stage, Estimated value, Expected close date, Probability and
    Forecast category (every other custom Opportunity column is switched off).

Run:  python scripts/setup_forecast_quotas.py
Then: python scripts/setup_security_role.py --apply
      python scripts/register_plugin_package.py   (plug-in + steps)
      cd solutions/SalesApp && pac solution sync
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
AUDITED = ["vibe_stage", "vibe_estimatedvalue", "vibe_expectedclosedate", "vibe_probability", "vibe_forecastcategory"]


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


def quota_table():
    if exists("EntityDefinitions(LogicalName='vibe_quota')"):
        print("= table vibe_quota")
        return
    call("POST", "EntityDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": "vibe_Quota",
        "DisplayName": label("Quota"),
        "DisplayCollectionName": label("Quotas"),
        "Description": label("The amount in euros a salesperson is expected to win in one month. Owned by the salesperson; set by their manager."),
        "OwnershipType": "UserOwned",
        "HasActivities": False,
        "HasNotes": False,
        "PrimaryNameAttribute": "vibe_name",
        "Attributes": [{
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "SchemaName": "vibe_name",
            "IsPrimaryName": True,
            "RequiredLevel": {"Value": "None"},
            "MaxLength": 200,
            "FormatName": {"Value": "Text"},
            "DisplayName": label("Name"),
        }],
    })
    print("+ table vibe_quota")


def quota_month():
    if attr_exists("vibe_quota", "vibe_month"):
        print("= vibe_quota.vibe_month")
        return
    call("POST", "EntityDefinitions(LogicalName='vibe_quota')/Attributes", {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        "SchemaName": "vibe_Month",
        "DisplayName": label("Month"),
        "Description": label("The first day of the month the Quota is for."),
        "RequiredLevel": {"Value": "ApplicationRequired"},
        "Format": "DateOnly",
        "DateTimeBehavior": {"Value": "DateOnly"},
    })
    print("+ vibe_quota.vibe_month")


def quota_amount():
    if attr_exists("vibe_quota", "vibe_amount"):
        print("= vibe_quota.vibe_amount")
        return
    call("POST", "EntityDefinitions(LogicalName='vibe_quota')/Attributes", {
        "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
        "SchemaName": "vibe_Amount",
        "DisplayName": label("Amount"),
        "Description": label("The month's Quota in euros."),
        "RequiredLevel": {"Value": "ApplicationRequired"},
        "PrecisionSource": 2,
        "MinValue": 0,
        "MaxValue": 1000000000,
    })
    print("+ vibe_quota.vibe_amount")


def quota_salesperson():
    if attr_exists("vibe_quota", "vibe_salespersonid"):
        print("= vibe_quota.vibe_salespersonid")
        return
    call("POST", "RelationshipDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        "SchemaName": "vibe_systemuser_quota",
        "ReferencedEntity": "systemuser",
        "ReferencingEntity": "vibe_quota",
        "Lookup": {
            "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            "SchemaName": "vibe_SalespersonId",
            "DisplayName": label("Salesperson"),
            "Description": label("The salesperson the Quota is for."),
            "RequiredLevel": {"Value": "ApplicationRequired"},
        },
        "CascadeConfiguration": {
            "Assign": "NoCascade", "Delete": "Restrict", "Merge": "NoCascade",
            "Reparent": "NoCascade", "Share": "NoCascade", "Unshare": "NoCascade",
        },
    })
    print("+ vibe_quota.vibe_salespersonid")


def quota_key():
    keys = requests.get(BASE + "EntityDefinitions(LogicalName='vibe_quota')/Keys?$select=SchemaName", headers=H).json().get("value", [])
    if any(k["SchemaName"] == "vibe_quota_person_month" for k in keys):
        print("= key vibe_quota_person_month")
        return
    call("POST", "EntityDefinitions(LogicalName='vibe_quota')/Keys", {
        "SchemaName": "vibe_quota_person_month",
        "DisplayName": label("One Quota per person and month"),
        "KeyAttributes": ["vibe_salespersonid", "vibe_month"],
    })
    print("+ key vibe_quota_person_month")


def auditing():
    org = requests.get(BASE + "organizations?$select=organizationid", headers=H).json()["value"][0]["organizationid"]
    call("PATCH", f"organizations({org})", {"isauditenabled": True}, ok=(204,))
    print("~ organisation auditing on")
    ent = "EntityDefinitions(LogicalName='vibe_opportunity')"
    call("PUT", ent, {"@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
                       **requests.get(BASE + ent + "?$select=MetadataId,SchemaName,LogicalName", headers=H).json(),
                       "IsAuditEnabled": {"Value": True}},
         headers={"MSCRM.MergeLabels": "true"})
    print("~ vibe_opportunity auditing on")
    attrs = requests.get(BASE + ent + "/Attributes?$select=LogicalName,IsAuditEnabled,IsCustomAttribute,AttributeType,SchemaName,MetadataId,AttributeOf", headers=H).json()["value"]
    for a in attrs:
        name = a["LogicalName"]
        if not name.startswith("vibe_") or a["AttributeType"] in ("Virtual", "Uniqueidentifier") or a["AttributeOf"]:
            continue
        want = name in AUDITED
        if a["IsAuditEnabled"]["Value"] == want:
            continue
        path = f"{ent}/Attributes({a['MetadataId']})"
        full = requests.get(BASE + path, headers=H).json()
        full.pop("@odata.context", None)
        full["IsAuditEnabled"] = {"Value": want}
        call("PUT", path, full, headers={"MSCRM.MergeLabels": "true"})
        print(f"~ vibe_opportunity.{name} audit {'on' if want else 'off'}")


def publish():
    call("POST", "PublishAllXml", {})
    print("published")


if __name__ == "__main__":
    quota_table()
    quota_salesperson()
    quota_month()
    quota_amount()
    quota_key()
    auditing()
    publish()
