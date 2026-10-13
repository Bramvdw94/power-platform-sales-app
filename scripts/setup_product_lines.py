"""
setup_product_lines.py -- the Product line table in dev-salesapp (issue #100).

Idempotent: every step checks first, so it is safe to run twice.

  * table vibe_ProductLine (user-owned; the plug-in gives each line its
    Opportunity's Owner): Name (the Product's name), Description, Quantity,
    Unit price, List price at add, Discount %, Line amount
  * lookup Opportunity -> Product line: parental, so a line is assigned, shared
    and deleted with its Opportunity
  * lookup Product -> Product line: Restrict on delete, so a Product on any
    line can't be deleted

The plug-in steps are registered by register_plugin_package.py; roles are in
setup_security_role.py.

Run:  python scripts/setup_product_lines.py
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
TABLE = "vibe_productline"


def label(text):
    return {"@odata.type": "Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", "Label": text, "LanguageCode": LCID}]}


def call(method, path, body=None, headers=None, ok=(200, 201, 204)):
    r = requests.request(method, BASE + path, headers={**H, **(headers or {})}, json=body)
    if r.status_code not in ok:
        sys.exit(f"{method} {path} -> {r.status_code}: {r.text[:600]}")
    return r


def exists(path):
    return requests.get(BASE + path, headers=H).status_code == 200


def table():
    if exists(f"EntityDefinitions(LogicalName='{TABLE}')"):
        print(f"= table {TABLE}")
        return
    call("POST", "EntityDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": "vibe_ProductLine",
        "DisplayName": label("Product line"),
        "DisplayCollectionName": label("Product lines"),
        "Description": label("One Product on an Opportunity, with a quantity, a unit price and a discount. Its amounts add up to the Opportunity's Estimated value."),
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
    print(f"+ table {TABLE}")


def attr_exists(name):
    return exists(f"EntityDefinitions(LogicalName='{TABLE}')/Attributes(LogicalName='{name}')")


def add(schema, body):
    if attr_exists(schema.lower()):
        print(f"= {TABLE}.{schema.lower()}")
        return
    call("POST", f"EntityDefinitions(LogicalName='{TABLE}')/Attributes", {"SchemaName": schema, **body})
    print(f"+ {TABLE}.{schema.lower()}")


def money(schema, name, description, required="None"):
    add(schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
        "DisplayName": label(name),
        "Description": label(description),
        "RequiredLevel": {"Value": required},
        "PrecisionSource": 2,
        "MinValue": 0,
        "MaxValue": 100000000,
    })


def decimal(schema, name, description, minimum, maximum, required="None"):
    add(schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata",
        "DisplayName": label(name),
        "Description": label(description),
        "RequiredLevel": {"Value": required},
        "Precision": 2,
        "MinValue": minimum,
        "MaxValue": maximum,
    })


def columns():
    add("vibe_Description", {
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        "DisplayName": label("Description"),
        "Description": label("Copied from the Product when the line is added; the Owner may change it."),
        "RequiredLevel": {"Value": "None"},
        "MaxLength": 2000,
        "Format": "TextArea",
    })
    decimal("vibe_Quantity", "Quantity", "How many Units; positive, up to 2 decimals.", 0.01, 10000000, "ApplicationRequired")
    money("vibe_UnitPrice", "Unit price", "Euro price per Unit, excluding VAT. Starts at the List price.", "ApplicationRequired")
    money("vibe_ListPriceAtAdd", "List price at add", "The Product's List price when the line was added. Never changes.")
    decimal("vibe_DiscountPercent", "Discount %", "Percentage taken off the line, 0 to 100.", 0, 100)
    money("vibe_LineAmount", "Line amount", "Quantity x unit price x (1 - discount %), rounded to cents. Kept by the plug-in.")


def lookup(schema, target, lookup_schema, display, description, required, cascade):
    name = lookup_schema.lower()
    if attr_exists(name):
        print(f"= {TABLE}.{name}")
        return
    call("POST", "RelationshipDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        "SchemaName": schema,
        "ReferencedEntity": target,
        "ReferencingEntity": TABLE,
        "Lookup": {
            "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            "SchemaName": lookup_schema,
            "DisplayName": label(display),
            "Description": label(description),
            "RequiredLevel": {"Value": required},
        },
        "CascadeConfiguration": cascade,
    })
    print(f"+ {TABLE}.{name}")


def lookups():
    lookup("vibe_opportunity_productline", "vibe_opportunity", "vibe_OpportunityId", "Opportunity",
           "The Opportunity the line is on.", "ApplicationRequired",
           {"Assign": "Cascade", "Delete": "Cascade", "Merge": "NoCascade",
            "Reparent": "Cascade", "Share": "Cascade", "Unshare": "Cascade"})
    lookup("vibe_product_productline", "vibe_product", "vibe_ProductId", "Product",
           "The Product being sold.", "ApplicationRequired",
           {"Assign": "NoCascade", "Delete": "Restrict", "Merge": "NoCascade",
            "Reparent": "NoCascade", "Share": "NoCascade", "Unshare": "NoCascade"})


def publish():
    call("POST", "PublishAllXml", {})
    print("published")


if __name__ == "__main__":
    table()
    columns()
    lookups()
    publish()
