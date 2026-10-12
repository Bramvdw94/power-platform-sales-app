"""
setup_products.py -- the Product table in dev-salesapp (issue #99).

Idempotent: every step checks first, so it is safe to run twice.

  * global choices vibe_productunit (Piece, Hour, Day, Month, Year) and
    vibe_vatrate (21 %, 9 %, 0 %)
  * table vibe_Product (organisation-owned): Name, Product code (alternate
    key, so a duplicate code is refused), Description, Unit, List price, VAT
    rate. Active / Retired is the standard state: Retire deactivates.

Roles are in setup_security_role.py.

Run:  python scripts/setup_products.py
Then: cd solutions/SalesApp && pac solution sync
"""

import os
import sys
import time

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

UNITS = ["Piece", "Hour", "Day", "Month", "Year"]
VAT_RATES = ["21 %", "9 %", "0 %"]


def label(text):
    return {"@odata.type": "Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", "Label": text, "LanguageCode": LCID}]}


def call(method, path, body=None, headers=None, ok=(200, 201, 204)):
    r = requests.request(method, BASE + path, headers={**H, **(headers or {})}, json=body)
    if r.status_code not in ok:
        sys.exit(f"{method} {path} -> {r.status_code}: {r.text[:600]}")
    return r


def exists(path):
    return requests.get(BASE + path, headers=H).status_code == 200


def global_choice(name, display, options):
    if exists(f"GlobalOptionSetDefinitions(Name='{name}')"):
        print(f"= global choice {name}")
        return
    call("POST", "GlobalOptionSetDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
        "Name": name,
        "DisplayName": label(display),
        "OptionSetType": "Picklist",
        "IsGlobal": True,
        "Options": [{"Value": CHOICE_BASE + i, "Label": label(t)} for i, t in enumerate(options)],
    })
    print(f"+ global choice {name}")


def choice_id(name):
    return requests.get(BASE + f"GlobalOptionSetDefinitions(Name='{name}')?$select=MetadataId", headers=H).json()["MetadataId"]


def product_table():
    if exists("EntityDefinitions(LogicalName='vibe_product')"):
        print("= table vibe_product")
        return
    call("POST", "EntityDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": "vibe_Product",
        "DisplayName": label("Product"),
        "DisplayCollectionName": label("Products"),
        "Description": label("Something we sell, with one euro List price. Retired Products stay on the lines that use them."),
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
    print("+ table vibe_product")


def attr_exists(name):
    return exists(f"EntityDefinitions(LogicalName='vibe_product')/Attributes(LogicalName='{name}')")


def add(schema, body):
    if attr_exists(schema.lower()):
        print(f"= vibe_product.{schema.lower()}")
        return
    call("POST", "EntityDefinitions(LogicalName='vibe_product')/Attributes", {"SchemaName": schema, **body})
    print(f"+ vibe_product.{schema.lower()}")


def columns():
    add("vibe_ProductCode", {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "DisplayName": label("Product code"),
        "Description": label("Unique code for the Product."),
        "RequiredLevel": {"Value": "ApplicationRequired"},
        "MaxLength": 100,
        "FormatName": {"Value": "Text"},
    })
    add("vibe_Description", {
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        "DisplayName": label("Description"),
        "Description": label("What the Product is; copied to a Product line."),
        "RequiredLevel": {"Value": "None"},
        "MaxLength": 2000,
        "Format": "TextArea",
    })
    add("vibe_Unit", {
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        "DisplayName": label("Unit"),
        "Description": label("What one piece of the quantity is."),
        "RequiredLevel": {"Value": "ApplicationRequired"},
        "GlobalOptionSet@odata.bind": f"/GlobalOptionSetDefinitions({choice_id('vibe_productunit')})",
    })
    add("vibe_ListPrice", {
        "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
        "DisplayName": label("List price"),
        "Description": label("Euro price per Unit, excluding VAT."),
        "RequiredLevel": {"Value": "ApplicationRequired"},
        "PrecisionSource": 2,
        "MinValue": 0,
        "MaxValue": 100000000,
    })
    add("vibe_VatRate", {
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        "DisplayName": label("VAT rate"),
        "Description": label("VAT percentage on this Product."),
        "RequiredLevel": {"Value": "ApplicationRequired"},
        "GlobalOptionSet@odata.bind": f"/GlobalOptionSetDefinitions({choice_id('vibe_vatrate')})",
    })


def alternate_key():
    keys = requests.get(BASE + "EntityDefinitions(LogicalName='vibe_product')/Keys?$select=SchemaName,EntityKeyIndexStatus", headers=H).json()["value"]
    if not any(k["SchemaName"] == "vibe_product_productcode" for k in keys):
        call("POST", "EntityDefinitions(LogicalName='vibe_product')/Keys", {
            "SchemaName": "vibe_product_productcode",
            "DisplayName": label("Product code"),
            "KeyAttributes": ["vibe_productcode"],
        })
        print("+ alternate key vibe_product_productcode")
    else:
        print("= alternate key vibe_product_productcode")
    for _ in range(60):
        keys = requests.get(BASE + "EntityDefinitions(LogicalName='vibe_product')/Keys?$select=SchemaName,EntityKeyIndexStatus", headers=H).json()["value"]
        status = next(k["EntityKeyIndexStatus"] for k in keys if k["SchemaName"] == "vibe_product_productcode")
        if status == "Active":
            print("  key index Active")
            return
        if status == "Failed":
            sys.exit("alternate key index failed")
        time.sleep(5)
    sys.exit("alternate key index did not become Active in time")


def publish():
    call("POST", "PublishAllXml", {})
    print("published")


if __name__ == "__main__":
    global_choice("vibe_productunit", "Product unit", UNITS)
    global_choice("vibe_vatrate", "VAT rate", VAT_RATES)
    product_table()
    columns()
    alternate_key()
    publish()
