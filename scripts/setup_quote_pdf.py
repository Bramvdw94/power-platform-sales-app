"""
setup_quote_pdf.py -- the tables and columns behind Quote PDF, templates and Send (issue #102).

Idempotent: every step checks first, so it is safe to run twice.

  * table vibe_QuoteTemplate (organisation-owned): Name, Is default, Definition
    (JSON: the ordered Blocks with their options, plus the page style)
  * table vibe_QuoteSettings (organisation-owned, one row): company details,
    logo (a data URL), KvK, btw-id, IBAN, default validity, terms link and
    text, email subject and message templates
  * on vibe_Quote: lookup Quote template, and the file column Stored PDF that
    keeps the exact PDF the customer received

The roles are in setup_security_role.py; the three starter templates and the
settings row are loaded by setup_quote_templates.py.

Run:  python scripts/setup_quote_pdf.py
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
TEMPLATE = "vibe_quotetemplate"
SETTINGS = "vibe_quotesettings"


def label(text):
    return {"@odata.type": "Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", "Label": text, "LanguageCode": LCID}]}


def call(method, path, body=None, headers=None, ok=(200, 201, 204)):
    r = requests.request(method, BASE + path, headers={**H, **(headers or {})}, json=body)
    if r.status_code not in ok:
        sys.exit(f"{method} {path} -> {r.status_code}: {r.text[:800]}")
    return r


def exists(path):
    return requests.get(BASE + path, headers=H).status_code == 200


def table(logical, schema, display, plural, description, primary_name, required="ApplicationRequired"):
    if exists(f"EntityDefinitions(LogicalName='{logical}')"):
        print(f"= table {logical}")
        return
    call("POST", "EntityDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": schema,
        "DisplayName": label(display),
        "DisplayCollectionName": label(plural),
        "Description": label(description),
        "OwnershipType": "OrganizationOwned",
        "HasActivities": False,
        "HasNotes": False,
        "PrimaryNameAttribute": "vibe_name",
        "Attributes": [{
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "SchemaName": "vibe_name",
            "IsPrimaryName": True,
            "RequiredLevel": {"Value": required},
            "MaxLength": 200,
            "FormatName": {"Value": "Text"},
            "DisplayName": label(primary_name),
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


def text(entity, schema, name, description, length, required="None"):
    add(entity, schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "DisplayName": label(name),
        "Description": label(description),
        "RequiredLevel": {"Value": required},
        "MaxLength": length,
        "FormatName": {"Value": "Text"},
    })


def memo(entity, schema, name, description, length):
    add(entity, schema, {
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        "DisplayName": label(name),
        "Description": label(description),
        "RequiredLevel": {"Value": "None"},
        "MaxLength": length,
        "Format": "TextArea",
    })


def template_columns():
    add(TEMPLATE, "vibe_IsDefault", {
        "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
        "DisplayName": label("Is default"),
        "Description": label("The template a new Quote uses. Exactly one template is the default."),
        "RequiredLevel": {"Value": "None"},
        "DefaultValue": False,
        "OptionSet": {
            "TrueOption": {"Value": 1, "Label": label("Yes")},
            "FalseOption": {"Value": 0, "Label": label("No")},
        },
    })
    memo(TEMPLATE, "vibe_Definition", "Definition",
         "JSON: the ordered Blocks with their options, and the page style (accent colour, typeface, logo position, language).", 1000000)


def settings_columns():
    text(SETTINGS, "vibe_CompanyName", "Company name", "Printed in the header and footer.", 200)
    memo(SETTINGS, "vibe_Address", "Address", "Sender address, one line per row.", 1000)
    text(SETTINGS, "vibe_Phone", "Phone", "Company phone.", 50)
    text(SETTINGS, "vibe_Email", "Email", "Company email.", 200)
    text(SETTINGS, "vibe_Website", "Website", "Company website.", 200)
    text(SETTINGS, "vibe_Kvk", "KvK", "Chamber of Commerce number.", 50)
    text(SETTINGS, "vibe_BtwId", "Btw-id", "VAT identification number.", 50)
    text(SETTINGS, "vibe_Iban", "IBAN", "Bank account for payment.", 50)
    memo(SETTINGS, "vibe_Logo", "Logo", "The logo as a data URL (PNG or JPEG), drawn on the PDF.", 1000000)
    add(SETTINGS, "vibe_DefaultValidityDays", {
        "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
        "DisplayName": label("Default validity (days)"),
        "Description": label("A new Quote is valid this many days from the day it is made."),
        "RequiredLevel": {"Value": "None"},
        "MinValue": 1,
        "MaxValue": 3650,
    })
    text(SETTINGS, "vibe_TermsUrl", "General terms link", "Link to the general terms, printed in the Terms Block.", 500)
    memo(SETTINGS, "vibe_TermsText", "Default terms text", "Terms printed in the Terms Block unless a template has its own text.", 10000)
    text(SETTINGS, "vibe_EmailSubject", "Email subject", "Placeholders: {{quote_number}}, {{company}}, {{contact_name}}, {{valid_until}}, {{owner_name}}.", 300)
    memo(SETTINGS, "vibe_EmailMessage", "Email message", "Same placeholders as the subject.", 10000)


def lookup(entity, schema, target, lookup_schema, display, description):
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
            "RequiredLevel": {"Value": "None"},
        },
        "CascadeConfiguration": {"Assign": "NoCascade", "Delete": "RemoveLink", "Merge": "NoCascade",
                                 "Reparent": "NoCascade", "Share": "NoCascade", "Unshare": "NoCascade"},
    })
    print(f"+ {entity}.{name}")


def quote_columns():
    lookup(QUOTE, "vibe_quotetemplate_quote", TEMPLATE, "vibe_QuoteTemplateId", "Quote template",
           "The template the PDF is drawn with; the Default template unless the Owner picks another while the Quote is a Draft.")
    add(QUOTE, "vibe_StoredPdf", {
        "@odata.type": "Microsoft.Dynamics.CRM.FileAttributeMetadata",
        "DisplayName": label("Stored PDF"),
        "Description": label("The exact PDF the customer received. Set when the Quote is sent."),
        "RequiredLevel": {"Value": "None"},
        "MaxSizeInKB": 32768,
    })


def publish():
    call("POST", "PublishAllXml", {})
    print("published")


if __name__ == "__main__":
    table(TEMPLATE, "vibe_QuoteTemplate", "Quote template", "Quote templates",
          "The layout of a Quote PDF: ordered Blocks with options, and a page style. One is the Default.", "Name")
    table(SETTINGS, "vibe_QuoteSettings", "Quote settings", "Quote settings",
          "The single row of company details, terms and email templates behind every Quote PDF.", "Name", "None")
    template_columns()
    settings_columns()
    quote_columns()
    publish()
