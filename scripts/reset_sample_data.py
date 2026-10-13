"""
reset_sample_data.py — delete the sample data from dev-salesapp (issue #35).

Deletes exactly the records whose fixed IDs come from data/sample-data.json;
records made by hand are left alone. Two things to know:

- Deleting a sample record also deletes what Dataverse cascades from it,
  including hand-made records: the Notes, Tasks and Phone Calls attached to
  it, and the Contacts under a sample Account.
- A sample Account that a hand-made Opportunity points to cannot be deleted
  (the relationship restricts it). The script reports it and carries on.

Usage (repo root, .env with DATAVERSE_URL and TENANT_ID):
    python scripts/reset_sample_data.py           # dry run: count what would go
    python scripts/reset_sample_data.py --apply   # delete

Run load_sample_data.py --apply afterwards for a fresh set. Exit code 0 when
every sample record is gone, 1 otherwise.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sample_data as sd  # noqa: E402


# Lines on a closed Opportunity can only be removed with the custom plug-ins skipped.
BYPASS = {"MSCRM.BypassCustomPluginExecution": "true"}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="delete from Dataverse (default: dry run)")
    parser.add_argument("--data", default=str(sd.DATA_PATH), help="data file (default: data/sample-data.json)")
    args = parser.parse_args()

    data = sd.load_data(args.data)
    dv = sd.connect()
    print(("Deleting from " if args.apply else "Dry run (add --apply to delete) against ") + dv.base)

    failures = []
    # Activities first, then Opportunities (they restrict Account deletes), then the rest.
    for table in reversed(sd.TABLES):
        deleted = absent = 0
        for rec in data.get(table.section, []):
            rec_id = sd.record_id(rec["key"])
            path = f"{table.entity_set}({rec_id})"
            if not args.apply:
                if sd.current_state(dv, table, rec_id) is None:
                    absent += 1
                else:
                    deleted += 1
                continue
            status, err, code, _ = dv.call("DELETE", path, headers=BYPASS)
            if status == 204:
                deleted += 1
            elif status == 404:
                absent += 1
            else:
                failures.append(f"{rec['key']} ({path}): {status} {code} {(err or {}).get('message', '')}")
        verb = "deleted" if args.apply else "would delete"
        print(f"  {table.section:14} {verb} {deleted:3}   not there {absent:3}")

    if failures:
        print("Not deleted:")
        for f in failures:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
