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
hierarchy does not grant Assign) and SalesApp Catalogue Manager (#99, the
only holder); Adele and Alex have Megan as Manager; Diego
does not.

The script creates its own records as Adele, all named `[security-check] …`:

| Check | Expected |
|---|---|
| Adele creates an Account, a Contact under it, a Lead and an Opportunity | allowed |
| Note on a Lead, Task and Phone Call (no parties) on an Opportunity | allowed (polymorphic bind via the navigation property read from metadata) |
| Alex (peer) and Diego (outsider) read Adele's Lead | 200 |
| Alex and Diego update or reassign Adele's Lead, update her Opportunity, add a Note to her Lead or a Task to her Opportunity | 403 |
| Alex and Diego create an Opportunity on Adele's Account | 204 (Append To at Organization on Account) |
| Adele deletes her own Lead | 403 (no Delete in v1) |
| Megan updates Adele's Lead and Opportunity, adds a Note and a Task | 204 (hierarchy) |
| Megan reassigns Adele's Opportunity to Alex | 204, and its open Task moves along |
| Megan reassigns Adele's deactivated Lead | 204 |
| Megan updates or reassigns Diego's Lead | 403 |
| Adele, Alex and Diego read a Product | 200 |
| Adele, Alex and Diego create a Product, change its List price or retire it | 403 |
| Megan creates a Product, changes its List price, retires and reactivates it | 204 |
| Megan creates a second Product with the same Product code | 412 (alternate key) |
| Megan deletes a Product | 403 (nobody has Delete) |

The Product checks (#99) use a Product named `[security-check] Product`.
Product lines (#100). A line follows its Opportunity. ProductLinePlugin gives
it the Opportunity's Owner, so Basic create, write and delete reach the Owner
and, through the hierarchy, the Owner's manager; Adding one also needs Append To
on the Opportunity, which is User level, so a peer is refused. The plug-in keeps
Line amount, List price at add and the Opportunity's Estimated value in the same
transaction, and EstimatedValueGuardPlugin refuses a direct change to the
Estimated value while lines exist:

| Check | Expected |
|---|---|
| Adele adds a line (2 x 100, 10 % off) | 204; Line amount 180, List price at add 100, owned by Adele, Estimated value 180 |
| Adele adds a second line (1.5 x 33.33) | 204; Estimated value 230 (each line rounded to cents, then summed) |
| Adele or an admin types a different Estimated value while lines exist | 400 (plug-in) |
| Adele saves the Estimated value unchanged with another field | 204 |
| Adele changes a quantity | 204; Estimated value follows |
| Adele writes Line amount, changes List price at add, uses quantity 0 or 101 % discount, adds a retired Product | recalculated / 400 / 400 / 400 / 400 |
| Alex or Diego add, change or remove Adele's line; read it | 403 / 403 / 403 / 200 |
| Megan adds a line to Adele's Opportunity | 204; owned by Adele; she removes it again, total drops back |
| Adele removes the last line | 204; Estimated value keeps the last total and is typeable again |
| Megan reassigns the Opportunity to Alex | its line moves to Alex (parental cascade); Alex may change it |
| Adele adds, changes or removes a line once the Opportunity is closed | 400 (plug-in) |
| Megan deletes a Product that is on a line | 403 |

Quota (#104). A Quota row is owned by its salesperson, so Basic read shows a
salesperson their own and the manager hierarchy shows a manager her reports'.
Only SalesApp Sales Manager can create and write Quotas, and QuotaGuardPlugin
(`plugins/`, pre-operation on create and update of `vibe_quota`) decides whose:
the salesperson's manager, or a system administrator when there is no manager,
and never the salesperson. The privileges alone cannot say that: with no
plug-in, Megan could create and change her own row and one for Diego. The check
uses a month in 2099 so it never collides with sample Quotas:

| Check | Expected |
|---|---|
| Megan sets Adele's and Alex's Quota | 204 |
| Megan sets her own, or Diego's, or a month that is not the first | 400 (plug-in) |
| Megan adds a second Quota for Adele and the same month | 412 (alternate key) |
| Adele sets her own Quota, changes it, Alex changes it | 403 (no Create or Write) |
| A system administrator sets Adele's Quota (she has a manager) / Megan's (she has none) | 400 / 204 |
| Adele reads her Quota; Megan reads Adele's and her own | 200 |
| Alex or Diego reads Adele's; Adele reads Megan's | 403 |
| Megan changes Adele's Quota; makes it negative, moves its month, or hands it to herself | 204 / 400 / 400 / 400 |
| Megan changes her own Quota | 400 (plug-in) |
| Listing that month: Adele and Alex see their own row, Megan her own and both reports', Diego none | yes |

Cleanup deletes the records as the signed-in admin; lines are deleted with the
custom plug-ins bypassed, as the plug-in refuses changes to a closed Opportunity's lines.

## Last run

2026-10-09, dev-salesapp, after Append To on Lead and Opportunity was lowered
to User (story 97 enforced in Dataverse).

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
Peer and outsider: read yes; update, reassign and add activities no; link to the Account yes
  PASS  Alex Wilber reads Adele's Lead  (200)
  PASS  Alex Wilber updates Adele's Lead  (403 0x80048306)
  PASS  Alex Wilber reassigns Adele's Lead to self  (403 0x80048306)
  PASS  Alex Wilber updates Adele's Opportunity  (403 0x80048306)
  PASS  Alex Wilber adds a Note to Adele's Lead  (403 0x80048306)
  PASS  Alex Wilber adds a Task to Adele's Opportunity  (403 0x80048306)
  PASS  Alex Wilber creates an Opportunity on Adele's Account  (204)
  PASS  Diego Siciliani reads Adele's Lead  (200)
  PASS  Diego Siciliani updates Adele's Lead  (403 0x80048306)
  PASS  Diego Siciliani reassigns Adele's Lead to self  (403 0x80048306)
  PASS  Diego Siciliani updates Adele's Opportunity  (403 0x80048306)
  PASS  Diego Siciliani adds a Note to Adele's Lead  (403 0x80048306)
  PASS  Diego Siciliani adds a Task to Adele's Opportunity  (403 0x80048306)
  PASS  Diego Siciliani creates an Opportunity on Adele's Account  (204)
No Delete privilege
  PASS  Adele deletes her own Lead  (403 0x80040220)
Manager: update and reassign a report's records
  PASS  Megan updates Adele's Lead  (204)
  PASS  Megan updates Adele's Opportunity  (204)
  PASS  Megan adds a Note to Adele's Lead  (204)
  PASS  Megan adds a Task to Adele's Opportunity  (204)
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

40/40 checks passed
```
