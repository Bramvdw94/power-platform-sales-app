# Security check

`scripts/security_check.py` verifies the **SalesApp Salesperson** role and the
manager hierarchy against dev-salesapp. It calls the Web API as each demo user
through impersonation (`MSCRMCallerID`), so the signed-in account must be able
to act on behalf of other users (System Administrator can).

## Run

From the repo root, with `.env` holding `DATAVERSE_URL` and `TENANT_ID`
(see `scripts/auth.py`):

```bash
python scripts/security_check.py          # run, then delete its records
python scripts/security_check.py --keep   # leave the records for a look
```

It exits 0 when every check passes. Run it after any change to the role,
the hierarchy settings or the tables.

## What it checks

Prerequisites: Megan Bowen, Adele Vance, Alex Wilber and Diego Siciliani each
hold SalesApp Salesperson; Adele and Alex have Megan as Manager; Diego does not.

The script creates its own records as Adele, all named `[security-check] …`:

| Check | Expected |
|---|---|
| Adele creates an Account, a Contact under it, a Lead and an Opportunity | allowed |
| Note on a Lead, Task and Phone Call (no parties) on an Opportunity | allowed (polymorphic bind via the navigation property read from metadata) |
| Alex (peer) and Diego (outsider) read Adele's Lead | 200 |
| Alex and Diego update or reassign Adele's Lead, update her Opportunity, add a Note | 403 |
| Adele deletes her own Lead | 403 (no Delete in v1) |
| Megan updates Adele's Lead and Opportunity, adds a Note | 204 |
| Megan reassigns Adele's Opportunity to Alex | 204, and its open Task moves along |
| Megan reassigns Adele's deactivated Lead | 204 |
| Megan updates or reassigns Diego's Lead | 403 |

Cleanup deletes the records as the signed-in admin.
