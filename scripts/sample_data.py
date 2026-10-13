"""
sample_data.py — the shared part of the sample data scripts (issue #35).

`data/sample-data.json` holds fictional NL/BE IT-services records. Records
refer to each other by key ("acc-vandijk", "lead-devries", ...); every key
maps to a fixed Dataverse ID (a UUID derived from the key), so a reload
updates the same rows and a reset deletes exactly those rows.

Dates in the file are day offsets from the load day ("createdDaysAgo",
"expectedCloseInDays", "dueInDays", ...), so every load gives a pipeline
that looks current. Creation dates are backdated through
`overriddencreatedon`.

Entry points:
    python scripts/load_sample_data.py   # dry run; --apply to load
    python scripts/reset_sample_data.py  # dry run; --apply to delete

The data rules (validation, IDs, payloads) need no Dataverse access, so
`scripts/test_sample_data.py` tests them offline; the Dataverse helpers at
the end import `security_check` (and through it `auth`) only when called.
"""

import json
import uuid
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "sample-data.json"

# Never change: every sample record's ID is derived from it and its key.
ID_NAMESPACE = uuid.UUID("5f6b2c1e-35a0-4d7e-9b35-5a3e1d0c0035")

# Global choices: values are 841200000 + index (solutions/SalesApp/src/OptionSets).
CHOICE_BASE = 841200000
LEAD_SOURCES = ["website", "referral", "event", "coldOutreach", "partner", "other"]
LEAD_STATUSES = ["notContacted", "working", "qualified", "disqualified"]
DISQUALIFY_REASONS = ["noBudget", "noNeed", "cantReachThem", "choseCompetitor", "duplicate", "other"]
STAGES = ["qualification", "needsAnalysis", "proposal", "negotiation", "closedWon", "closedLost"]
OPEN_STAGES = STAGES[:4]
FORECAST_CATEGORIES = ["pipeline", "bestCase", "commit", "omitted"]
STAGE_DEFAULT_FORECAST = {"qualification": "pipeline", "needsAnalysis": "pipeline", "proposal": "bestCase", "negotiation": "commit"}
LOST_REASONS = ["price", "choseCompetitor", "noBudget", "noDecision", "other"]
STAGE_DEFAULT_PROBABILITY = {
    "qualification": 10, "needsAnalysis": 25, "proposal": 50,
    "negotiation": 75, "closedWon": 100, "closedLost": 0,
}

# Same names as scripts/security_check.py; Bram (System Administrator) owns nothing.
USER_KEYS = ["megan", "adele", "alex", "diego"]
PRODUCT_UNITS = ["piece", "hour", "day", "month", "year"]
VAT_RATES = [21, 9, 0]


@dataclass(frozen=True)
class Table:
    section: str        # list name in the data file
    prefix: str         # key prefix
    logical: str        # Dataverse logical name
    entity_set: str
    id_attribute: str
    # statecode/statuscode while open, or None for tables without state (Notes)
    open_state: tuple | None
    # False for organisation-owned tables such as Products: no Owner to bind
    owned: bool = True


TABLES = [
    Table("products", "prod-", "vibe_product", "vibe_products", "vibe_productid", (0, 1), owned=False),
    Table("accounts", "acc-", "account", "accounts", "accountid", (0, 1)),
    Table("contacts", "con-", "contact", "contacts", "contactid", (0, 1)),
    Table("leads", "lead-", "vibe_lead", "vibe_leads", "vibe_leadid", (0, 1)),
    Table("opportunities", "opp-", "vibe_opportunity", "vibe_opportunities", "vibe_opportunityid", (0, 1)),
    # After the Opportunities, which are closed only once everything is loaded. Owned by the
    # Opportunity's owner; written with the plug-in bypass, so the amounts are worked out here.
    Table("productLines", "line-", "vibe_productline", "vibe_productlines", "vibe_productlineid", (0, 1)),
    Table("notes", "note-", "annotation", "annotations", "annotationid", None),
    Table("tasks", "task-", "task", "tasks", "activityid", (0, 2)),
    Table("phoneCalls", "call-", "phonecall", "phonecalls", "activityid", (0, 1)),
    # Last, so a reset deletes Quotas first. Owned by the salesperson; written with the
    # plug-in bypass because the loader is neither the salesperson nor their manager.
    Table("quotas", "quota-", "vibe_quota", "vibe_quotas", "vibe_quotaid", (0, 1)),
]
TABLE_BY_SECTION = {t.section: t for t in TABLES}
# Things a record can be "regarding" (Notes, Tasks, Phone Calls).
REGARDING_PREFIXES = {"acc-": "accounts", "con-": "contacts", "lead-": "leads", "opp-": "opportunities"}


def line_amount(quantity, unit_price, discount_percent):
    """Quantity x unit price x (1 - discount %), rounded to cents: the plug-in's sum."""
    amount = Decimal(str(quantity)) * Decimal(str(unit_price)) * (100 - Decimal(str(discount_percent or 0))) / 100
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def lines_total(data, opportunity_key):
    """The Estimated value an Opportunity with Product lines must have, or None without lines."""
    products = {p["key"]: p for p in data.get("products", [])}
    amounts = [line_amount(l["quantity"], l.get("unitPrice", products[l["product"]]["listPrice"]), l.get("discountPercent"))
               for l in data.get("productLines", []) if l.get("opportunity") == opportunity_key and l.get("product") in products]
    return sum(amounts) if amounts else None


def record_id(key):
    """The fixed Dataverse ID of the sample record with this key."""
    return str(uuid.uuid5(ID_NAMESPACE, key))


def load_data(path=DATA_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def choice(values, name):
    return CHOICE_BASE + values.index(name)


# --- validation -------------------------------------------------------------

def validate(data):
    """Return a list of problems with the data file; empty when it is sound."""
    errors = []
    err = errors.append

    users = data.get("users", {})
    if sorted(users) != sorted(USER_KEYS):
        err(f"users must be exactly {USER_KEYS}, got {sorted(users)}")

    records = {}
    for table in TABLES:
        for rec in data.get(table.section, []):
            key = rec.get("key", "")
            if not key.startswith(table.prefix):
                err(f"{table.section}: key {key!r} must start with {table.prefix!r}")
            if key in records:
                err(f"duplicate key {key!r}")
            records[key] = rec
            if rec.get("owner", "megan") not in USER_KEYS:
                err(f"{key}: unknown owner {rec.get('owner')!r}")
            if not isinstance(rec.get("createdDaysAgo"), int) or rec["createdDaysAgo"] < 0:
                err(f"{key}: createdDaysAgo must be a whole number >= 0")

    def ref(rec, attr, prefix, required=False):
        target = rec.get(attr)
        if target is None:
            if required:
                err(f"{rec['key']}: {attr} is required")
            return None
        if not target.startswith(prefix) or target not in records:
            err(f"{rec['key']}: {attr} {target!r} is not a known {prefix}* record")
            return None
        if records[target].get("createdDaysAgo", 0) < rec.get("createdDaysAgo", 0):
            err(f"{rec['key']}: created before its {attr} {target}")
        return records[target]

    def required(rec, *attrs):
        for attr in attrs:
            if rec.get(attr) in (None, ""):
                err(f"{rec['key']}: {attr} is required")

    codes = set()
    for prod in data.get("products", []):
        required(prod, "name", "code", "unit", "listPrice", "vatRate")
        if prod.get("unit") not in PRODUCT_UNITS:
            err(f"{prod['key']}: unknown unit {prod.get('unit')!r}")
        if prod.get("vatRate") not in VAT_RATES:
            err(f"{prod['key']}: vatRate must be one of {VAT_RATES}")
        price = prod.get("listPrice")
        if not isinstance(price, (int, float)) or price < 0 or abs(price * 100 - round(price * 100)) > 1e-6:
            err(f"{prod['key']}: listPrice must be 0 or more, in whole cents")
        code = str(prod.get("code", "")).lower()
        if code in codes:
            err(f"{prod['key']}: duplicate Product code {prod['code']!r}")
        codes.add(code)

    for acc in data.get("accounts", []):
        required(acc, "name", "owner")

    for con in data.get("contacts", []):
        required(con, "lastName", "owner")
        ref(con, "account", "acc-", required=True)

    for lead in data.get("leads", []):
        required(lead, "lastName", "company", "owner")
        if lead.get("leadSource") is not None and lead["leadSource"] not in LEAD_SOURCES:
            err(f"{lead['key']}: unknown leadSource {lead['leadSource']!r}")
        status = lead.get("status")
        if status not in LEAD_STATUSES:
            err(f"{lead['key']}: unknown status {status!r}")
        disq = ("disqualifyReason", "disqualifiedDaysAgo", "disqualifiedBy")
        if status == "disqualified":
            required(lead, *disq)
            if lead.get("disqualifyReason") not in DISQUALIFY_REASONS:
                err(f"{lead['key']}: unknown disqualifyReason {lead.get('disqualifyReason')!r}")
            if lead.get("disqualifiedBy") not in USER_KEYS:
                err(f"{lead['key']}: disqualifiedBy must be a demo user")
            if lead.get("disqualifiedDaysAgo", 0) > lead.get("createdDaysAgo", 0):
                err(f"{lead['key']}: disqualified before it was created")
        elif any(attr in lead for attr in disq + ("disqualifyComment",)):
            err(f"{lead['key']}: only Disqualified Leads have Disqualify fields")

    originating = {}
    for opp in data.get("opportunities", []):
        key = opp["key"]
        required(opp, "name", "stage", "estimatedValue", "expectedCloseInDays", "owner")
        account = ref(opp, "account", "acc-", required=True)
        contact = ref(opp, "primaryContact", "con-")
        lead = ref(opp, "originatingLead", "lead-")
        if contact and account and contact.get("account") != account["key"]:
            err(f"{key}: Primary Contact {contact['key']} works at another Account")
        if opp.get("leadSource") is not None and opp["leadSource"] not in LEAD_SOURCES:
            err(f"{key}: unknown leadSource {opp['leadSource']!r}")
        stage = opp.get("stage")
        if stage not in STAGES:
            err(f"{key}: unknown stage {stage!r}")
            continue
        probability = opp.get("probability", STAGE_DEFAULT_PROBABILITY[stage])
        if not 0 <= probability <= 100:
            err(f"{key}: probability must be 0-100")
        closed_attrs = ("actualValue", "closedDaysAgo", "lostReason", "lostComment")
        if opp.get("forecastCategory") is not None:
            if stage not in OPEN_STAGES:
                err(f"{key}: a closed Opportunity has no Forecast category")
            elif opp["forecastCategory"] not in FORECAST_CATEGORIES:
                err(f"{key}: unknown forecastCategory {opp['forecastCategory']!r}")
        if stage in OPEN_STAGES:
            if any(attr in opp for attr in closed_attrs):
                err(f"{key}: an open Opportunity has no close fields")
        else:
            required(opp, "closedDaysAgo")
            if opp.get("closedDaysAgo", 0) > opp.get("createdDaysAgo", 0):
                err(f"{key}: closed before it was created")
            if stage == "closedWon":
                required(opp, "actualValue")
                if "lostReason" in opp or "lostComment" in opp:
                    err(f"{key}: a Closed Won Opportunity has no Lost reason")
            else:
                if opp.get("lostReason") not in LOST_REASONS:
                    err(f"{key}: Closed Lost needs a Lost reason from {LOST_REASONS}")
                if "actualValue" in opp:
                    err(f"{key}: a Closed Lost Opportunity has no Actual value")
        if lead:
            if lead["key"] in originating:
                err(f"{lead['key']}: is the originating Lead of two Opportunities")
            originating[lead["key"]] = opp
            check_carry_over(lead, opp, account, contact, err)

    product_keys = {p["key"]: p for p in data.get("products", [])}
    opportunity_by_key = {o["key"]: o for o in data.get("opportunities", [])}
    for line in data.get("productLines", []):
        key = line["key"]
        required(line, "opportunity", "product", "quantity")
        opp = ref(line, "opportunity", "opp-", required=True)
        if line.get("product") not in product_keys:
            err(f"{key}: product {line.get('product')!r} is not a known prod-* record")
            continue
        if product_keys[line["product"]].get("retired"):
            err(f"{key}: a Retired Product cannot be on a line")
        quantity, price, discount = line.get("quantity"), line.get("unitPrice", product_keys[line["product"]]["listPrice"]), line.get("discountPercent", 0)
        if not isinstance(quantity, (int, float)) or quantity <= 0 or abs(quantity * 100 - round(quantity * 100)) > 1e-6:
            err(f"{key}: quantity must be above 0, with at most 2 decimals")
        if not isinstance(price, (int, float)) or price < 0 or abs(price * 100 - round(price * 100)) > 1e-6:
            err(f"{key}: unitPrice must be 0 or more, in whole cents")
        if not isinstance(discount, (int, float)) or not 0 <= discount <= 100:
            err(f"{key}: discountPercent must be 0-100")
        if opp and opp.get("owner") and line.get("owner", opp["owner"]) != opp["owner"]:
            err(f"{key}: a line belongs to its Opportunity's owner")
    for opp_key, opp in opportunity_by_key.items():
        total = lines_total(data, opp_key)
        if total is not None and Decimal(str(opp["estimatedValue"])) != total:
            err(f"{opp_key}: estimatedValue {opp['estimatedValue']} must equal its Product lines' total {total}")

    for lead in data.get("leads", []):
        if lead.get("status") == "qualified" and lead["key"] not in originating:
            err(f"{lead['key']}: Qualified but no Opportunity has it as originatingLead")
        if lead.get("status") != "qualified" and lead["key"] in originating:
            err(f"{lead['key']}: only a Qualified Lead can be an originatingLead")

    for section in ("notes", "tasks", "phoneCalls"):
        for act in data.get(section, []):
            reg = act.get("regarding") or ""
            prefix = next((p for p in REGARDING_PREFIXES if reg.startswith(p)), None)
            if prefix is None:
                err(f"{act['key']}: regarding {reg!r} must be an Account, Contact, Lead or Opportunity")
            else:
                ref(act, "regarding", prefix, required=True)
            required(act, "subject")
    for task in data.get("tasks", []):
        if not isinstance(task.get("dueInDays"), int):
            err(f"{task['key']}: dueInDays is required")
        elif task.get("completed") and task["dueInDays"] > 0:
            err(f"{task['key']}: a completed Task cannot be due in the future")
    for call in data.get("phoneCalls", []):
        if call.get("direction") not in ("incoming", "outgoing"):
            err(f"{call['key']}: direction must be incoming or outgoing")
        if not call.get("completed") and not isinstance(call.get("dueInDays"), int):
            err(f"{call['key']}: an open Phone Call needs dueInDays")
    for note in data.get("notes", []):
        required(note, "text")

    seen_quotas = set()
    for quota in data.get("quotas", []):
        required(quota, "salesperson", "monthOffset", "amount")
        if quota.get("salesperson") not in USER_KEYS:
            err(f"{quota['key']}: salesperson must be a demo user")
        if not isinstance(quota.get("monthOffset"), int) or not 0 <= quota["monthOffset"] <= 11:
            err(f"{quota['key']}: monthOffset must be a whole number from 0 (this month) to 11")
        if not isinstance(quota.get("amount"), (int, float)) or quota["amount"] < 0:
            err(f"{quota['key']}: amount must be 0 or more")
        person_month = (quota.get("salesperson"), quota.get("monthOffset"))
        if person_month in seen_quotas:
            err(f"{quota['key']}: a second Quota for {person_month[0]} in month {person_month[1]}")
        seen_quotas.add(person_month)

    return errors


def check_carry_over(lead, opp, account, contact, err):
    """A Qualified Lead and its Opportunity must look like Qualify made them (#5)."""
    key = lead["key"]
    if lead.get("owner") != opp.get("owner"):
        err(f"{key}: its Opportunity must have the Lead's owner")
    for attr in ("leadSource", "description"):
        if lead.get(attr) != opp.get(attr):
            err(f"{key}: its Opportunity must carry over {attr}")
    if account and account["name"].strip().lower() != lead["company"].strip().lower():
        err(f"{key}: Company must equal the Account name {account['name']!r}")
    if contact is None:
        err(f"{key}: its Opportunity needs the Lead's person as Primary Contact")
    else:
        for attr in ("firstName", "lastName", "jobTitle", "email", "phone"):
            if lead.get(attr) != contact.get(attr):
                err(f"{key}: {attr} differs from Primary Contact {contact['key']}")
    if opp.get("createdDaysAgo", 0) > lead.get("createdDaysAgo", 0):
        err(f"{key}: its Opportunity was created before the Lead")


# --- payloads ----------------------------------------------------------------

@dataclass
class Record:
    table: Table
    key: str
    id: str
    body: dict                        # fields written on create and update
    created_on: str                   # overriddencreatedon, create only
    final_state: tuple | None = None  # (statecode, statuscode) once everything is loaded


class Clock:
    """Turns the file's day offsets into dates, relative to the load moment."""

    def __init__(self, now=None):
        self.now = now if now is not None else datetime.now().astimezone()
        self.today = self.now.date()

    def day(self, offset):
        return self.today + timedelta(days=offset)

    def date_only(self, offset):
        return self.day(offset).isoformat()

    def moment(self, offset, hour):
        """Local `hour` o'clock on that day, as UTC, never later than now for past days."""
        local = datetime.combine(self.day(offset), time(hour), tzinfo=self.now.tzinfo)
        if offset <= 0:
            local = min(local, self.now - timedelta(minutes=10))
        return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def created(self, days_ago):
        return self.moment(-days_ago, 9)


def bind(nav, entity_set, key):
    return {f"{nav}@odata.bind": f"/{entity_set}({record_id(key)})"}


def user_bind(nav, user_id):
    return {f"{nav}@odata.bind": f"/systemusers({user_id})"}


def build_records(data, users, nav, clock):
    """Every sample record as a Dataverse payload, in load order.

    users: demo user key -> systemuserid.
    nav:   navigation property names, see `NAV_LOOKUPS` (read from metadata).
    """
    out = []

    def add(section, rec, body, final_state=None):
        table = TABLE_BY_SECTION[section]
        if table.owned:
            body = {**body, **user_bind("ownerid", users[rec.get("owner") or owner_of(data, rec)])}
        out.append(Record(table, rec["key"], record_id(rec["key"]), body,
                          clock.created(rec["createdDaysAgo"]), final_state))

    for prod in data["products"]:
        add("products", prod, {
            "vibe_name": prod["name"],
            "vibe_productcode": prod["code"],
            "vibe_description": prod.get("description"),
            "vibe_unit": choice(PRODUCT_UNITS, prod["unit"]),
            "vibe_listprice": prod["listPrice"],
            "vibe_vatrate": choice(VAT_RATES, prod["vatRate"]),
        }, (1, 2) if prod.get("retired") else None)  # Retired Products are deactivated

    for acc in data["accounts"]:
        add("accounts", acc, {
            "name": acc["name"],
            "websiteurl": acc.get("website"),
            "telephone1": acc.get("phone"),
            "address1_line1": acc.get("street"),
            "address1_postalcode": acc.get("postcode"),
            "address1_city": acc.get("city"),
            "address1_country": acc.get("country"),
            "description": acc.get("description"),
        })

    for con in data["contacts"]:
        add("contacts", con, {
            "firstname": con.get("firstName"),
            "lastname": con["lastName"],
            "jobtitle": con.get("jobTitle"),
            "emailaddress1": con.get("email"),
            "telephone1": con.get("phone"),
            "mobilephone": con.get("mobile"),
            **bind(nav["contact.account"], "accounts", con["account"]),
        })

    for lead in data["leads"]:
        status = lead["status"]
        body = {
            "vibe_name": " ".join(p for p in (lead.get("firstName"), lead["lastName"]) if p),
            "vibe_firstname": lead.get("firstName"),
            "vibe_lastname": lead["lastName"],
            "vibe_company": lead["company"],
            "vibe_jobtitle": lead.get("jobTitle"),
            "vibe_email": lead.get("email"),
            "vibe_phone": lead.get("phone"),
            "vibe_website": lead.get("website"),
            "vibe_leadsource": choice(LEAD_SOURCES, lead["leadSource"]) if lead.get("leadSource") else None,
            "vibe_description": lead.get("description"),
            "vibe_leadstatus": choice(LEAD_STATUSES, status),
            "vibe_disqualifyreason": None,
            "vibe_disqualifycomment": None,
            "vibe_disqualifiedon": None,
        }
        if status == "disqualified":
            body.update({
                "vibe_disqualifyreason": choice(DISQUALIFY_REASONS, lead["disqualifyReason"]),
                "vibe_disqualifycomment": lead.get("disqualifyComment"),
                "vibe_disqualifiedon": clock.moment(-lead["disqualifiedDaysAgo"], 14),
                **user_bind(nav["lead.disqualifiedby"], users[lead["disqualifiedBy"]]),
            })
        # Qualified and Disqualified Leads are read-only: deactivated (spec #23).
        final = (1, 2) if status in ("qualified", "disqualified") else None
        add("leads", lead, body, final)

    for opp in data["opportunities"]:
        stage = opp["stage"]
        body = {
            "vibe_name": opp["name"],
            **bind(nav["opportunity.account"], "accounts", opp["account"]),
            "vibe_stage": choice(STAGES, stage),
            "vibe_probability": opp.get("probability", STAGE_DEFAULT_PROBABILITY[stage]),
            "vibe_forecastcategory": choice(FORECAST_CATEGORIES, opp.get("forecastCategory") or STAGE_DEFAULT_FORECAST[stage])
            if stage in OPEN_STAGES else None,
            "vibe_estimatedvalue": opp["estimatedValue"],
            "vibe_expectedclosedate": clock.date_only(opp["expectedCloseInDays"]),
            "vibe_nextstep": opp.get("nextStep"),
            "vibe_description": opp.get("description"),
            "vibe_leadsource": choice(LEAD_SOURCES, opp["leadSource"]) if opp.get("leadSource") else None,
            "vibe_actualvalue": opp.get("actualValue"),
            "vibe_closedate": clock.date_only(-opp["closedDaysAgo"]) if "closedDaysAgo" in opp else None,
            "vibe_lostreason": choice(LOST_REASONS, opp["lostReason"]) if opp.get("lostReason") else None,
            "vibe_lostcomment": opp.get("lostComment"),
        }
        if opp.get("primaryContact"):
            body.update(bind(nav["opportunity.primarycontact"], "contacts", opp["primaryContact"]))
        if opp.get("originatingLead"):
            body.update(bind(nav["opportunity.originatinglead"], "vibe_leads", opp["originatingLead"]))
        final = None
        if stage not in OPEN_STAGES:
            body.update(user_bind(nav["opportunity.closedby"], users[opp["owner"]]))
            final = (1, 2)  # closed deals are read-only: deactivated (spec #23)
        add("opportunities", opp, body, final)

    products = {p["key"]: p for p in data["products"]}
    for line in data.get("productLines", []):
        product = products[line["product"]]
        price = line.get("unitPrice", product["listPrice"])
        discount = line.get("discountPercent", 0)
        add("productLines", line, {
            "vibe_name": product["name"],
            "vibe_description": line.get("description") or product.get("description"),
            "vibe_quantity": line["quantity"],
            "vibe_unitprice": price,
            "vibe_listpriceatadd": product["listPrice"],
            "vibe_discountpercent": discount,
            "vibe_lineamount": float(line_amount(line["quantity"], price, discount)),
            **bind(nav["productline.opportunity"], "vibe_opportunities", line["opportunity"]),
            **bind(nav["productline.product"], "vibe_products", line["product"]),
        })

    for note in data["notes"]:
        target = regarding_table(note["regarding"])
        add("notes", note, {
            "subject": note["subject"],
            "notetext": note["text"],
            **bind(nav[f"note.{target.logical}"], target.entity_set, note["regarding"]),
        })

    for task in data["tasks"]:
        target = regarding_table(task["regarding"])
        due = clock.moment(task["dueInDays"], 12)
        add("tasks", task, {
            "subject": task["subject"],
            "description": task.get("description"),
            "scheduledend": due,
            "actualend": due if task.get("completed") else None,
            **bind(nav[f"task.{target.logical}"], target.entity_set, task["regarding"]),
        }, (1, 5) if task.get("completed") else None)  # Completed

    for call in data["phoneCalls"]:
        target = regarding_table(call["regarding"])
        outgoing = call["direction"] == "outgoing"
        body = {
            "subject": call["subject"],
            "description": call.get("description"),
            "directioncode": outgoing,
            "phonenumber": call.get("phoneNumber") or phone_of(data, call["regarding"]),
            **bind(nav[f"phonecall.{target.logical}"], target.entity_set, call["regarding"]),
        }
        final = None
        if call.get("completed"):
            final = (1, 2 if outgoing else 4)  # Made / Received
            body["actualend"] = clock.moment(-call["createdDaysAgo"], 10)
        else:
            body["scheduledend"] = clock.moment(call["dueInDays"], 11)
        add("phoneCalls", call, body, final)

    for quota in data.get("quotas", []):
        person = quota["salesperson"]
        month = first_of_month(clock.today, quota["monthOffset"])
        add("quotas", quota, {
            "vibe_name": f"{data['users'][person]} {month[:7]}",
            "vibe_month": month,
            "vibe_amount": quota["amount"],
            **user_bind(nav["quota.salesperson"], users[person]),
        })

    return out


def first_of_month(today, offset):
    """The first day of the month `offset` months after today's, as YYYY-MM-DD."""
    total = today.year * 12 + today.month - 1 + offset
    return f"{total // 12}-{total % 12 + 1:02d}-01"


def regarding_table(key):
    for prefix, section in REGARDING_PREFIXES.items():
        if key.startswith(prefix):
            return TABLE_BY_SECTION[section]
    raise ValueError(f"cannot be regarding {key!r}")


def _find(data, key):
    section = REGARDING_PREFIXES[next(p for p in REGARDING_PREFIXES if key.startswith(p))]
    return next(r for r in data[section] if r["key"] == key)


def owner_of(data, rec):
    """Activities without an owner belong to the owner of what they are regarding; a Quota to its salesperson."""
    if "salesperson" in rec:
        return rec["salesperson"]
    if "opportunity" in rec:
        return next(o for o in data["opportunities"] if o["key"] == rec["opportunity"])["owner"]
    return _find(data, rec["regarding"])["owner"]


def phone_of(data, key):
    """The number a Phone Call dials: the record's own, or for an Opportunity its contact's or Account's."""
    rec = _find(data, key)
    if not key.startswith("opp-"):
        return rec.get("phone")
    contact = _find(data, rec["primaryContact"]) if rec.get("primaryContact") else {}
    return contact.get("phone") or _find(data, rec["account"]).get("phone")


# (referencing table, lookup attribute, referenced table) per navigation property.
NAV_LOOKUPS = {
    "contact.account": ("contact", "parentcustomerid", "account"),
    "lead.disqualifiedby": ("vibe_lead", "vibe_disqualifiedby", "systemuser"),
    "opportunity.account": ("vibe_opportunity", "vibe_accountid", "account"),
    "opportunity.primarycontact": ("vibe_opportunity", "vibe_primarycontactid", "contact"),
    "opportunity.originatinglead": ("vibe_opportunity", "vibe_originatingleadid", "vibe_lead"),
    "opportunity.closedby": ("vibe_opportunity", "vibe_closedby", "systemuser"),
    "quota.salesperson": ("vibe_quota", "vibe_salespersonid", "systemuser"),
    "productline.opportunity": ("vibe_productline", "vibe_opportunityid", "vibe_opportunity"),
    "productline.product": ("vibe_productline", "vibe_productid", "vibe_product"),
    **{f"note.{t}": ("annotation", "objectid", t) for t in ("account", "contact", "vibe_lead", "vibe_opportunity")},
    **{f"task.{t}": ("task", "regardingobjectid", t) for t in ("account", "contact", "vibe_lead", "vibe_opportunity")},
    **{f"phonecall.{t}": ("phonecall", "regardingobjectid", t) for t in ("account", "contact", "vibe_lead", "vibe_opportunity")},
}


def summary(data):
    """One line of counts per table, for the scripts' output."""
    leads = data["leads"]
    opps = data["opportunities"]
    by = lambda rows, attr, values: ", ".join(f"{sum(r[attr] == v for r in rows)} {v}" for v in values)
    return [
        f"{len(data['accounts'])} Accounts, {len(data['contacts'])} Contacts",
        f"{len(leads)} Leads: {by(leads, 'status', LEAD_STATUSES)}",
        f"{len(opps)} Opportunities: {by(opps, 'stage', STAGES)}",
        f"{len(data.get('productLines', []))} Product lines on {len({l['opportunity'] for l in data.get('productLines', [])})} Opportunities",
        f"{len(data['products'])} Products ({sum(bool(p.get('retired')) for p in data['products'])} retired)",
        f"{len(data['notes'])} Notes, {len(data['tasks'])} Tasks, {len(data['phoneCalls'])} Phone Calls",
        f"{len(data.get('quotas', []))} Quotas",
    ]


# --- Dataverse helpers (need a signed-in admin, see scripts/auth.py) ---------

def connect():
    from security_check import Dataverse
    return Dataverse()


def find_users(dv, names):
    """Demo user key -> systemuserid, by full name; fails loudly if one is missing."""
    from security_check import q
    users = {}
    for key, fullname in names.items():
        rows = dv.get(f"systemusers?$select=systemuserid&$filter=fullname eq '{q(fullname)}'")["value"]
        if len(rows) != 1:
            raise RuntimeError(f"expected one user named {fullname}, found {len(rows)}")
        users[key] = rows[0]["systemuserid"]
    return users


def resolve_nav(dv):
    """Navigation property names for every lookup the payloads bind, read from metadata."""
    from security_check import nav_property
    return {name: nav_property(dv, referencing, referenced, attribute)
            for name, (referencing, attribute, referenced) in NAV_LOOKUPS.items()}


def has_attribute(dv, table, attribute):
    rows = dv.get(f"EntityDefinitions(LogicalName='{table}')/Attributes"
                  f"?$select=LogicalName&$filter=LogicalName eq '{attribute}'")["value"]
    return len(rows) == 1


def current_state(dv, table, rec_id):
    """None when the record does not exist, else its statecode (0 for tables without state)."""
    select = table.id_attribute + (",statecode" if table.open_state else "")
    status, body, code, _ = dv.call("GET", f"{table.entity_set}({rec_id})?$select={select}")
    if status == 404:
        return None
    if status != 200:
        raise RuntimeError(f"GET {table.entity_set}({rec_id}) failed: {status} {code}")
    return body.get("statecode", 0)
