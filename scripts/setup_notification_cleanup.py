"""
setup_notification_cleanup.py -- the 30 day clean-up of Notifications (#171, spec #168).

Creates a recurring Dataverse bulk delete job, "SalesApp: delete Notifications older than 30 days",
that runs every day and removes every Notification created more than 30 days ago, read or not.
Bulk delete jobs are not solution components, so this job is environment setup, not part of the
unpacked solution: run this script once per environment (it does nothing when the job exists).

Run:  python scripts/setup_notification_cleanup.py
Check: python scripts/setup_notification_cleanup.py --check   (exit 1 when the job is missing)
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import requests

sys.path.insert(0, os.path.dirname(__file__))
from auth import get_token, load_env  # noqa: E402

load_env()
BASE = os.environ["DATAVERSE_URL"].rstrip("/") + "/api/data/v9.2/"
NAME = "SalesApp: delete Notifications older than 30 days"
H = {"Authorization": "Bearer " + get_token(), "Accept": "application/json", "Content-Type": "application/json"}


def existing():
    """The job while it is still scheduled: Waiting (10), In Progress (20) or Retrying (21)."""
    r = requests.get(BASE + "bulkdeleteoperations?$select=bulkdeleteoperationid,name,statuscode,statecode&$filter="
                     f"name eq '{NAME}'", headers=H)
    r.raise_for_status()
    return [j for j in r.json()["value"] if j["statuscode"] in (10, 20, 21)]


def main():
    found = existing()
    if "--check" in sys.argv:
        print(f"{'ok' if found else 'MISSING'}: {NAME}")
        sys.exit(0 if found else 1)
    if found:
        print(f"= job exists ({found[0]['bulkdeleteoperationid']})")
        return
    # First run tomorrow at 02:00 UTC, then every day.
    start = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
    body = {
        "JobName": NAME,
        "SendEmailNotification": False,
        "ToRecipients": [],
        "CCRecipients": [],
        "RecurrencePattern": "FREQ=DAILY;INTERVAL=1;",
        "StartDateTime": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "QuerySet": [{
            "@odata.type": "Microsoft.Dynamics.CRM.QueryExpression",
            "EntityName": "vibe_notification",
            "ColumnSet": {"AllColumns": False, "Columns": []},
            "Criteria": {
                "FilterOperator": "And",
                "Conditions": [{"AttributeName": "createdon", "Operator": "OlderThanXDays", "Values": [{"Value": "30", "Type": "System.Int32"}]}],
            },
        }],
    }
    r = requests.post(BASE + "BulkDelete", headers=H, json=body)
    if not r.ok:
        sys.exit(f"BulkDelete -> {r.status_code}: {r.text[:800]}")
    print("+ job created:", r.json().get("JobId"))
    found = existing()
    print(f"  scheduled jobs named '{NAME}': {len(found)}")
    if not found:
        sys.exit("the job was created but is not scheduled")


main()
