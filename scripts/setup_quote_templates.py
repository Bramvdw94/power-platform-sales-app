"""
setup_quote_templates.py -- the three starter Quote templates and the Quote settings row (issue #102).

Reads data/quote-templates.json, the same file the sample data loader and the in-memory seed use.
Idempotent, and it never overwrites what a Catalogue manager has changed: a template is created only
when none has its name, the settings row only when there is none, and the Default is set only while
no template is the Default.

Run:  python scripts/setup_quote_templates.py
"""

import json
import os
import sys
from pathlib import Path

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
import sample_data as sd  # noqa: E402

STARTERS = json.loads((Path(__file__).resolve().parent.parent / "data" / "quote-templates.json").read_text(encoding="utf-8"))
# The sample data loader writes these same records, by the same fixed ids, so loading it later updates them.
SETTINGS_KEY = "qset-company"


def call(method, path, body=None, ok=(200, 201, 204)):
    r = requests.request(method, BASE + path, headers=H, json=body)
    if r.status_code not in ok:
        sys.exit(f"{method} {path} -> {r.status_code}: {r.text[:800]}")
    return r


def templates():
    existing = call("GET", "vibe_quotetemplates?$select=vibe_name,vibe_isdefault,vibe_quotetemplateid").json()["value"]
    have = {t["vibe_name"] for t in existing}
    has_default = any(t["vibe_isdefault"] for t in existing)
    for t in STARTERS["templates"]:
        if t["name"] in have:
            print(f"= template {t['name']}")
            continue
        default = bool(t.get("isDefault")) and not has_default
        call("POST", "vibe_quotetemplates", {
            "vibe_quotetemplateid": sd.record_id("qtpl-" + t["name"].lower().replace(" ", "-")),
            "vibe_name": t["name"],
            "vibe_isdefault": default,
            "vibe_definition": json.dumps(t["definition"], separators=(",", ":")),
        })
        has_default = has_default or default
        print(f"+ template {t['name']}{' (Default)' if default else ''}")


def settings():
    if call("GET", "vibe_quotesettingses?$select=vibe_quotesettingsid&$top=1").json()["value"]:
        print("= Quote settings")
        return
    s = STARTERS["settings"]
    call("POST", "vibe_quotesettingses", {
        "vibe_quotesettingsid": sd.record_id(SETTINGS_KEY),
        "vibe_name": "Quote settings",
        "vibe_companyname": s["companyName"],
        "vibe_address": s["address"],
        "vibe_phone": s["phone"],
        "vibe_email": s["email"],
        "vibe_website": s["website"],
        "vibe_kvk": s["kvk"],
        "vibe_btwid": s["btwId"],
        "vibe_iban": s["iban"],
        "vibe_defaultvaliditydays": s["defaultValidityDays"],
        "vibe_termsurl": s["termsUrl"],
        "vibe_termstext": s["termsText"],
        "vibe_emailsubject": s["emailSubject"],
        "vibe_emailmessage": s["emailMessage"],
    })
    print("+ Quote settings")


if __name__ == "__main__":
    templates()
    settings()
