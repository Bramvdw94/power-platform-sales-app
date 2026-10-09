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

Prerequisites, set by `python scripts/setup_security_role.py --apply`: Megan
Bowen, Adele Vance, Alex Wilber and Diego Siciliani each hold SalesApp
Salesperson; Megan also holds SalesApp Sales Manager (the #21 fallback, since
hierarchy does not grant Assign); Adele and Alex have Megan as Manager; Diego
does not.

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

## Last run

2026-10-09, dev-salesapp. The two failures are the open question in
`solutions/SalesApp/README.md` (Security role): Append To at Organization on
Lead lets anyone add a Note to any Lead.

```text
Preflight
  PASS  Megan Bowen has SalesApp Salesperson
  PASS  Adele Vance has SalesApp Salesperson
  PASS  Alex Wilber has SalesApp Salesperson
  PASS  Diego Siciliani has SalesApp Salesperson
  PASS  Adele Vance reports to Megan
  PASS  Alex Wilber reports to Megan
  PASS  Diego is outside Megan's team
Create as Adele (Create privilege, polymorphic writes)
  PASS  Adele creates an Account
  PASS  Contact under an Account (parentcustomerid_account)  (204)
  PASS  Adele creates a Lead and an Opportunity
  PASS  Note on a Lead (objectid_vibe_lead)  (204)
  PASS  Task on an Opportunity (regardingobjectid_vibe_opportunity_task)  (204)
  PASS  Phone Call on an Opportunity, no parties (regardingobjectid_vibe_opportunity_phonecall)  (204)
Peer and outsider: read yes, update and reassign no
  PASS  Alex Wilber reads Adele's Lead  (200)
  PASS  Alex Wilber updates Adele's Lead  (403 0x80048306)
  PASS  Alex Wilber reassigns Adele's Lead to self  (403 0x80048306)
  PASS  Alex Wilber updates Adele's Opportunity  (403 0x80048306)
  FAIL  Alex Wilber adds a Note to Adele's Lead  (204)
  PASS  Diego Siciliani reads Adele's Lead  (200)
  PASS  Diego Siciliani updates Adele's Lead  (403 0x80048306)
  PASS  Diego Siciliani reassigns Adele's Lead to self  (403 0x80048306)
  PASS  Diego Siciliani updates Adele's Opportunity  (403 0x80048306)
  FAIL  Diego Siciliani adds a Note to Adele's Lead  (204)
No Delete privilege
  PASS  Adele deletes her own Lead  (403 0x80040220)
Manager: update and reassign a report's records
  PASS  Megan updates Adele's Lead  (204)
  PASS  Megan updates Adele's Opportunity  (204)
  PASS  Megan adds a Note to Adele's Lead  (204)
  PASS  Megan reassigns Adele's Opportunity to Alex  (204)
  PASS  Opportunity owner is now Alex
  PASS  Open Task moved to Alex (Cascade Active)
Manager: reassign an inactive (Disqualified) Lead
  PASS  Adele deactivates her Lead  (204)
  PASS  Megan reassigns Adele's inactive Lead to Alex  (204)
  PASS  Lead owner is now Alex
Manager: no reach outside the team
  PASS  Megan updates Diego's Lead  (403 0x80048306)
  PASS  Megan reassigns Diego's Lead  (403 0x80048306)
Cleanup

33/35 checks passed
```
