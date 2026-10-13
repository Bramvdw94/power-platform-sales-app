"""
setup_quotes.py -- the Quote and Quote line tables in dev-salesapp (issue #101).

Idempotent: every step checks first, so it is safe to run twice.

  * table vibe_Quote (user-owned; the plug-in gives each Quote its Opportunity's
    Owner): Quote number (autonumber Q-00001, the primary name), Revision,
    Valid until, Net total, VAT 21 %, VAT 9 %, Gross total, Sent on, Sent via,
    Sent to; lookups Opportunity (parental, so a Quote is assigned, shared and
    deleted with its Opportunity), Account, Contact and Sent by
  * Status is the table's own status reason: Draft is the Active state; Sent,
    Accepted, Rejected and Revised are Inactive-state reasons, so a Quote that
    leaves Draft is read-only server-side
  * table vibe_QuoteLine (user-owned, Owner kept equal to the Quote's): Name
    (the Product's name), Description, Quantity, Unit price, Discount %, VAT
    rate, Line amount; lookups Quote (parental) and Product (Restrict on delete)

The plug-in steps are registered by register_plugin_package.py; roles are in
setup_security_role.py.

Run:  python scripts/setup_quotes.py
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
QUOTE = "vibe_quote"
LINE = "vibe_quoteline"

# Status reasons beyond the two every table starts with (1 Active, 2 Inactive).
# value -> (label, state): the app's QUOTE_STATUSES (src/sales/types.ts) are these, in this order, and QuoteRules.cs numbers them the same.
STATUSES = {1: ("Draft", 0), 2: ("Sent", 1), 3: ("Accepted", 1), 4: ("Rejected", 1), 5: ("Revised", 1)}


def label(text):
    return {"@odata.type": "Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", "Label": text, "LanguageCode": LCID}]}


def call(method, path, body=None, headers=None, ok=(200, 201, 204)):
    r = requests.request(method, BASE + path, headers={**H, **(headers or {})}, json=body)
    if r.status_code not in ok:
        sys.exit(f"{method} {path} -> {r.status_code}: {r.text[:800]}")
    return r


def exists(path):
    return requests.get(BASE + path, headers=H).status_code == 200


def table(logical, schema, display, plural, description, primary_name, primary_extra=None):
    if exists(f"EntityDefinitions(LogicalName='{logical}')"):
        print(f"= table {logical}")
        return
    call("POST", "EntityDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": schema,
        "DisplayName": label(display),
        "DisplayCollectionName": label(plural),
        "Description": label(description),
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
            "DisplayName": label(primary_name),
            **(primary_extra or {}),
        }],
    })
    print(f"+ table {logical}")


def attr_exists(entity, name):
    return exists(f"EntityDefinitions(LogicalName='{entity}')/Attributes(LogicalName='{name}')")


def add(entity, schema, body):
    if attr_exists(entity, schema.lower()):
        print(f"= {entity}.{schema.lower()}")
        return
    call("POST", f"EntityDefinitions(LogicalName='{entity}')/Attributes", {"SchemaName": schema, **body})
    print(f"+ {entity}.{schema.lower()}")


def money(entity, schema, name, description, required="None"):
    add(entity, schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
        "DisplayName": label(name),
        "Description": label(description),
        "RequiredLevel": {"Value": required},
        "PrecisionSource": 2,
        "MinValue": 0,
        "MaxValue": 100000000,
    })


def decimal(entity, schema, name, description, minimum, maximum, required="None"):
    add(entity, schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata",
        "DisplayName": label(name),
        "Description": label(description),
        "RequiredLevel": {"Value": required},
        "Precision": 2,
        "MinValue": minimum,
        "MaxValue": maximum,
    })


def text(entity, schema, name, description, length):
    add(entity, schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "DisplayName": label(name),
        "Description": label(description),
        "RequiredLevel": {"Value": "None"},
        "MaxLength": length,
        "FormatName": {"Value": "Text"},
    })


def choice_id(name):
    return requests.get(BASE + f"GlobalOptionSetDefinitions(Name='{name}')?$select=MetadataId", headers=H).json()["MetadataId"]


def quote_columns():
    add(QUOTE, "vibe_Revision", {
        "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
        "DisplayName": label("Revision"),
        "Description": label("0 for a new Quote; Revise keeps the Quote number and adds 1."),
        "RequiredLevel": {"Value": "None"},
        "MinValue": 0,
        "MaxValue": 1000,
    })
    add(QUOTE, "vibe_ValidUntil", {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        "DisplayName": label("Valid until"),
        "Description": label("The last day the offer stands. A Sent Quote past it shows as expired."),
        "RequiredLevel": {"Value": "None"},
        "Format": "DateOnly",
        "DateTimeBehavior": {"Value": "DateOnly"},
    })
    money(QUOTE, "vibe_NetTotal", "Net total", "The lines' amounts added up, excluding VAT. Kept by the plug-in.")
    money(QUOTE, "vibe_Vat21", "VAT 21 %", "21 % of the net total of the lines at that rate, rounded to cents. Kept by the plug-in.")
    money(QUOTE, "vibe_Vat9", "VAT 9 %", "9 % of the net total of the lines at that rate, rounded to cents. Kept by the plug-in.")
    money(QUOTE, "vibe_GrossTotal", "Gross total", "Net total plus VAT. Kept by the plug-in.")
    add(QUOTE, "vibe_SentOn", {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        "DisplayName": label("Sent on"),
        "Description": label("When the Quote was set to Sent."),
        "RequiredLevel": {"Value": "None"},
        "Format": "DateAndTime",
        "DateTimeBehavior": {"Value": "UserLocal"},
    })
    text(QUOTE, "vibe_SentVia", "Sent via", "How the Quote reached the customer (set by the send flow).", 100)
    text(QUOTE, "vibe_SentTo", "Sent to", "The address the Quote was sent to (set by the send flow).", 200)


def line_columns():
    add(LINE, "vibe_Description", {
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        "DisplayName": label("Description"),
        "Description": label("Copied from the Product when the line is added; the Owner may change it."),
        "RequiredLevel": {"Value": "None"},
        "MaxLength": 2000,
        "Format": "TextArea",
    })
    decimal(LINE, "vibe_Quantity", "Quantity", "How many Units; positive, up to 2 decimals.", 0.01, 10000000, "ApplicationRequired")
    money(LINE, "vibe_UnitPrice", "Unit price", "Euro price per Unit, excluding VAT.", "ApplicationRequired")
    decimal(LINE, "vibe_DiscountPercent", "Discount %", "Percentage taken off the line, 0 to 100.", 0, 100)
    add(LINE, "vibe_VatRate", {
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        "DisplayName": label("VAT rate"),
        "Description": label("The Product's VAT percentage when the line was added."),
        "RequiredLevel": {"Value": "ApplicationRequired"},
        "GlobalOptionSet@odata.bind": f"/GlobalOptionSetDefinitions({choice_id('vibe_vatrate')})",
    })
    money(LINE, "vibe_LineAmount", "Line amount", "Quantity x unit price x (1 - discount %), rounded to cents. Kept by the plug-in.")


def lookup(entity, schema, target, lookup_schema, display, description, required, cascade):
    name = lookup_schema.lower()
    if attr_exists(entity, name):
        print(f"= {entity}.{name}")
        return
    call("POST", "RelationshipDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        "SchemaName": schema,
        "ReferencedEntity": target,
        "ReferencingEntity": entity,
        "Lookup": {
            "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            "SchemaName": lookup_schema,
            "DisplayName": label(display),
            "Description": label(description),
            "RequiredLevel": {"Value": required},
        },
        "CascadeConfiguration": cascade,
    })
    print(f"+ {entity}.{name}")


PARENTAL = {"Assign": "Cascade", "Delete": "Cascade", "Merge": "NoCascade",
            "Reparent": "Cascade", "Share": "Cascade", "Unshare": "Cascade"}
REFERENTIAL = {"Assign": "NoCascade", "Delete": "RemoveLink", "Merge": "NoCascade",
               "Reparent": "NoCascade", "Share": "NoCascade", "Unshare": "NoCascade"}
RESTRICT = {**REFERENTIAL, "Delete": "Restrict"}


def lookups():
    lookup(QUOTE, "vibe_opportunity_quote", "vibe_opportunity", "vibe_OpportunityId", "Opportunity",
           "The Opportunity the Quote is for.", "ApplicationRequired", PARENTAL)
    lookup(QUOTE, "vibe_account_quote", "account", "vibe_AccountId", "Account",
           "The customer the Quote is for; copied from the Opportunity.", "None", REFERENTIAL)
    lookup(QUOTE, "vibe_contact_quote", "contact", "vibe_ContactId", "Contact",
           "Who the Quote is addressed to; starts as the Opportunity's Primary Contact.", "None", REFERENTIAL)
    lookup(QUOTE, "vibe_quote_sentby_systemuser", "systemuser", "vibe_SentBy", "Sent by",
           "Who set the Quote to Sent.", "None", REFERENTIAL)
    lookup(LINE, "vibe_quote_quoteline", QUOTE, "vibe_QuoteId", "Quote",
           "The Quote the line is on.", "ApplicationRequired", PARENTAL)
    lookup(LINE, "vibe_product_quoteline", "vibe_product", "vibe_ProductId", "Product",
           "The Product being offered.", "ApplicationRequired", RESTRICT)


def statuses():
    url = f"EntityDefinitions(LogicalName='{QUOTE}')/Attributes(LogicalName='statuscode')/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)"
    current = {o["Value"]: o for o in requests.get(BASE + url, headers=H).json()["OptionSet"]["Options"]}
    for value, (name, state) in STATUSES.items():
        have = current.get(value)
        if have is None:
            call("POST", "InsertStatusValue", {
                "EntityLogicalName": QUOTE, "AttributeLogicalName": "statuscode",
                "Label": label(name), "StateCode": state, "Value": value,
            })
            print(f"+ status {value} {name}")
        elif have["Label"]["UserLocalizedLabel"]["Label"] != name:
            call("POST", "UpdateOptionValue", {
                "EntityLogicalName": QUOTE, "AttributeLogicalName": "statuscode",
                "Value": value, "Label": label(name), "MergeLabels": True,
            })
            print(f"~ status {value} {name}")
        else:
            print(f"= status {value} {name}")
    after = {o["Value"]: (o["Label"]["UserLocalizedLabel"]["Label"], o.get("State")) for o in
             requests.get(BASE + url, headers=H).json()["OptionSet"]["Options"]}
    for value, (name, state) in STATUSES.items():
        if after.get(value) != (name, state):
            sys.exit(f"status {value} is {after.get(value)}, expected {(name, state)}")


def seed():
    """New autonumber columns start at 1000; the spec wants Q-00001. Only moved while no Quote has a number."""
    first = requests.get(BASE + f"vibe_quotes?$select=vibe_quoteid&$top=1", headers=H).json()["value"]
    if first:
        print("= autonumber seed (Quotes exist)")
        return
    call("POST", "SetAutoNumberSeed", {"EntityName": QUOTE, "AttributeName": "vibe_name", "Value": 1})
    print("+ autonumber seed 1")


def publish():
    call("POST", "PublishAllXml", {})
    print("published")


if __name__ == "__main__":
    table(QUOTE, "vibe_Quote", "Quote", "Quotes",
          "A priced offer to a customer, made from an Opportunity. It moves Draft, Sent, then Accepted, Rejected or Revised.",
          "Quote number", {"AutoNumberFormat": "Q-{SEQNUM:5}"})
    table(LINE, "vibe_QuoteLine", "Quote line", "Quote lines",
          "One Product on a Quote, with a quantity, a unit price, a discount and a VAT rate.", "Name")
    quote_columns()
    line_columns()
    lookups()
    statuses()
    seed()
    publish()
