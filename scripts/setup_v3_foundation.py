"""
setup_v3_foundation.py -- v3 foundation schema in dev-salesapp (issue #169, spec #168).

Idempotent: every step checks first, so it is safe to run twice.

  * Last activity (vibe_lastactivityon) on Account, Contact, Opportunity and Lead
  * Lead: Rating, Rating source, Score, Possible duplicate, First touch
  * Quote line: List price at add, backfilled on Draft Quote lines from the Product
  * Quote: Approval status
  * tables vibe_Notification and vibe_UserSettings (user-owned)
  * Sending email turned on for vibe_lead (irreversible, accepted in the spec)
  * recycle bin retention of 14 days; auditing on the five forecast fields (checked)

Run:  python scripts/setup_v3_foundation.py
Then: python scripts/setup_security_role.py --apply
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
CHOICE_BASE = 841200000  # the publisher option prefix, as in setup_v2_foundation.py and the gateways
RECYCLE_BIN_DAYS = 14

CHOICES = {
    "vibe_leadrating": ("Rating", ["Hot", "Warm", "Cold"]),
    "vibe_ratingsource": ("Rating source", ["Rule", "Hand"]),
    "vibe_quoteapprovalstatus": ("Approval status", ["None", "Pending", "Approved", "Rejected"]),
    "vibe_notificationkind": ("Notification kind", [
        "Reassign", "Notify action", "Approval requested", "Approval decided",
        "Engine error", "Needs review", "New web Lead assigned"]),
    "vibe_ailanguage": ("AI language", ["English", "Nederlands"]),
}
FORECAST_FIELDS = ["vibe_stage", "vibe_estimatedvalue", "vibe_expectedclosedate", "vibe_probability", "vibe_forecastcategory"]


def label(text):
    return {"@odata.type": "Microsoft.Dynamics.CRM.Label", "LocalizedLabels": [{"@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", "Label": text, "LanguageCode": LCID}]}


def call(method, path, body=None, headers=None, ok=(200, 201, 204)):
    r = requests.request(method, BASE + path, headers={**H, **(headers or {})}, json=body)
    if r.status_code not in ok:
        sys.exit(f"{method} {path} -> {r.status_code}: {r.text[:800]}")
    return r


def get(path):
    r = requests.get(BASE + path, headers=H)
    if r.status_code != 200:
        sys.exit(f"GET {path} -> {r.status_code}: {r.text[:600]}")
    return r.json()


def exists(path):
    return requests.get(BASE + path, headers=H).status_code == 200


def attr_exists(table, name):
    return exists(f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{name}')")


def choice(name):
    title, options = CHOICES[name]
    if exists(f"GlobalOptionSetDefinitions(Name='{name}')"):
        print(f"= global choice {name}")
        return
    call("POST", "GlobalOptionSetDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
        "Name": name, "DisplayName": label(title), "OptionSetType": "Picklist", "IsGlobal": True,
        "Options": [{"Value": CHOICE_BASE + i, "Label": label(t)} for i, t in enumerate(options)],
    })
    print(f"+ global choice {name}")


def attribute(table, schema, display, description, body, required="None"):
    """Add one column unless it exists. body holds the type-specific metadata."""
    if attr_exists(table, schema.lower()):
        print(f"= {table}.{schema.lower()}")
        return
    call("POST", f"EntityDefinitions(LogicalName='{table}')/Attributes", {
        "SchemaName": schema, "DisplayName": label(display), "Description": label(description),
        "RequiredLevel": {"Value": required}, **body,
    })
    print(f"+ {table}.{schema.lower()}")


def datetime_col(table, schema, display, description):
    attribute(table, schema, display, description, {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        "Format": "DateAndTime", "DateTimeBehavior": {"Value": "UserLocal"}})


def dateonly_col(table, schema, display, description):
    attribute(table, schema, display, description, {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        "Format": "DateOnly", "DateTimeBehavior": {"Value": "DateOnly"}})


def string_col(table, schema, display, description, length):
    attribute(table, schema, display, description, {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        "MaxLength": length, "FormatName": {"Value": "Text"}})


def memo_col(table, schema, display, description, length):
    attribute(table, schema, display, description, {
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        "MaxLength": length, "Format": "TextArea"})


def bool_col(table, schema, display, description, default):
    attribute(table, schema, display, description, {
        "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
        "DefaultValue": default,
        "OptionSet": {"TrueOption": {"Value": 1, "Label": label("Yes")}, "FalseOption": {"Value": 0, "Label": label("No")}}})


def int_col(table, schema, display, description):
    attribute(table, schema, display, description, {
        "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
        "Format": "None", "MinValue": -2147483648, "MaxValue": 2147483647})


def money_col(table, schema, display, description):
    attribute(table, schema, display, description, {
        "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
        "PrecisionSource": 2, "MinValue": -100000000000, "MaxValue": 100000000000})


def choice_col(table, schema, display, description, global_name):
    if attr_exists(table, schema.lower()):
        print(f"= {table}.{schema.lower()}")
        return
    gid = get(f"GlobalOptionSetDefinitions(Name='{global_name}')?$select=MetadataId")["MetadataId"]
    attribute(table, schema, display, description, {
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        "GlobalOptionSet@odata.bind": f"/GlobalOptionSetDefinitions({gid})"})


def create_table(logical, schema, display, plural, description, name_display, name_length):
    if exists(f"EntityDefinitions(LogicalName='{logical}')"):
        print(f"= table {logical}")
        return
    call("POST", "EntityDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": schema, "DisplayName": label(display), "DisplayCollectionName": label(plural),
        "Description": label(description), "OwnershipType": "UserOwned",
        "HasActivities": False, "HasNotes": False, "PrimaryNameAttribute": "vibe_name",
        "Attributes": [{
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "SchemaName": "vibe_name", "IsPrimaryName": True,
            "RequiredLevel": {"Value": "ApplicationRequired"}, "MaxLength": name_length,
            "FormatName": {"Value": "Text"}, "DisplayName": label(name_display)}],
    })
    print(f"+ table {logical}")


def user_lookup(table, schema, display, description, rel_name):
    if attr_exists(table, schema.lower()):
        print(f"= {table}.{schema.lower()}")
        return
    call("POST", "RelationshipDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        "SchemaName": rel_name, "ReferencedEntity": "systemuser", "ReferencingEntity": table,
        "Lookup": {
            "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata", "SchemaName": schema,
            "DisplayName": label(display), "Description": label(description),
            "RequiredLevel": {"Value": "ApplicationRequired"}},
        "CascadeConfiguration": {
            "Assign": "NoCascade", "Delete": "RemoveLink", "Merge": "NoCascade",
            "Reparent": "NoCascade", "Share": "NoCascade", "Unshare": "NoCascade"},
    })
    print(f"+ {table}.{schema.lower()}")


def shared_columns():
    for t in ("account", "contact", "vibe_opportunity", "vibe_lead"):
        datetime_col(t, "vibe_LastActivityOn", "Last activity", "When the latest Activity on this record happened (kept by a plug-in).")
    choice_col("vibe_lead", "vibe_Rating", "Rating", "How promising the Lead is.", "vibe_leadrating")
    choice_col("vibe_lead", "vibe_RatingSource", "Rating source", "Whether the Rating came from a rule or was set by hand.", "vibe_ratingsource")
    int_col("vibe_lead", "vibe_Score", "Score", "Points a scoring rule gave the Lead.")
    bool_col("vibe_lead", "vibe_PossibleDuplicate", "Possible duplicate", "Set when another Lead or Contact looks like the same person.", False)
    datetime_col("vibe_lead", "vibe_FirstTouchOn", "First touch", "When the Owner first got in touch with the Lead.")
    money_col("vibe_quoteline", "vibe_ListPriceAtAdd", "List price at add", "The Product's list price when the line was added.")
    choice_col("vibe_quote", "vibe_ApprovalStatus", "Approval status", "Where the Quote stands in discount approval.", "vibe_quoteapprovalstatus")


def notification_table():
    create_table("vibe_notification", "vibe_Notification", "Notification", "Notifications",
                 "Something that happened that the recipient should know about.", "Text", 500)
    user_lookup("vibe_notification", "vibe_RecipientId", "Recipient", "Who the Notification is for. Also the Owner.", "vibe_notification_recipient")
    choice_col("vibe_notification", "vibe_Kind", "Event kind", "What happened.", "vibe_notificationkind")
    string_col("vibe_notification", "vibe_RegardingTable", "Record table", "Logical name of the table of the record it is about.", 100)
    string_col("vibe_notification", "vibe_RegardingId", "Record id", "Id of the record it is about.", 50)
    bool_col("vibe_notification", "vibe_IsRead", "Read", "Whether the recipient has dealt with it.", False)


def user_settings_table():
    create_table("vibe_usersettings", "vibe_UserSettings", "User settings", "User settings",
                 "One row per user: personal switches and defaults.", "Name", 200)
    bool_col("vibe_usersettings", "vibe_TeamsCopies", "Teams copies", "Send a copy of every Notification in Teams.", True)
    bool_col("vibe_usersettings", "vibe_Away", "Away", "Skip this person when web Leads are assigned.", False)
    dateonly_col("vibe_usersettings", "vibe_AwayUntil", "Away until", "Last day the person is away.")
    memo_col("vibe_usersettings", "vibe_DefaultViews", "Default views", "JSON: the default Saved view id per list (Leads, Opportunities, Accounts, Contacts).", 4000)
    choice_col("vibe_usersettings", "vibe_AiLanguage", "AI language", "Language AI assist writes in.", "vibe_ailanguage")


def backfill_list_price():
    """Draft Quote lines get the Product's current list price; lines that already carry one are left alone."""
    lines = []
    url = ("vibe_quotelines?$select=vibe_quotelineid,_vibe_productid_value&$expand=vibe_QuoteId($select=statuscode)"
           "&$filter=vibe_listpriceatadd eq null")
    while url:
        page = get(url)
        lines += page["value"]
        url = page.get("@odata.nextLink", "").replace(BASE, "") or None
    drafts = [l for l in lines if (l.get("vibe_QuoteId") or {}).get("statuscode") == 1 and l.get("_vibe_productid_value")]
    done = 0
    for l in drafts:
        price = get(f"vibe_products({l['_vibe_productid_value']})?$select=vibe_listprice").get("vibe_listprice")
        if price is None:
            continue
        call("PATCH", f"vibe_quotelines({l['vibe_quotelineid']})", {"vibe_listpriceatadd": price})
        done += 1
    print(f"~ backfilled List price at add on {done} of {len(drafts)} Draft Quote lines")


def email_enable_lead():
    ent = get("EntityDefinitions(LogicalName='vibe_lead')?$select=MetadataId,IsActivityParty")
    if ent["IsActivityParty"]:
        print("= vibe_lead is email enabled")
        return
    full = get(f"EntityDefinitions({ent['MetadataId']})")
    full["IsActivityParty"] = True
    call("PUT", f"EntityDefinitions({ent['MetadataId']})", full, headers={"MSCRM.MergeLabels": "true"})
    print("+ vibe_lead email enabled (Sending email)")


def recycle_bin():
    org = get("recyclebinconfigs?$select=recyclebinconfigid,cleanupintervalindays&$filter=name eq 'organization'")["value"]
    if not org:
        # The organization row cannot be created through the API (0x8004023b); the admin center makes it.
        print("! recycle bin is off in this environment: no recyclebinconfig row named 'organization'. "
              "Turn it on in the Power Platform admin center (Environment > Settings > Product > Features > "
              f"Recycle bin, {RECYCLE_BIN_DAYS} days), then re-run this script.")
        return
    if org[0]["cleanupintervalindays"] == RECYCLE_BIN_DAYS:
        print(f"= recycle bin keeps {RECYCLE_BIN_DAYS} days")
        return
    call("PATCH", f"recyclebinconfigs({org[0]['recyclebinconfigid']})", {"cleanupintervalindays": RECYCLE_BIN_DAYS})
    print(f"~ recycle bin now keeps {RECYCLE_BIN_DAYS} days")


def auditing():
    if not get("organizations?$select=isauditenabled")["value"][0]["isauditenabled"]:
        sys.exit("Auditing is off for the organization")
    for f in FORECAST_FIELDS:
        a = get(f"EntityDefinitions(LogicalName='vibe_opportunity')/Attributes(LogicalName='{f}')?$select=IsAuditEnabled")
        if not a["IsAuditEnabled"]["Value"]:
            sys.exit(f"auditing is off on vibe_opportunity.{f}")
    print("= auditing on the five forecast fields")


def publish():
    call("POST", "PublishAllXml", {})
    print("published")


if __name__ == "__main__":
    for c in CHOICES:
        choice(c)
    shared_columns()
    notification_table()
    user_settings_table()
    backfill_list_price()
    email_enable_lead()
    auditing()
    publish()
    recycle_bin()
