# Sample data

Fictional demo data for dev-salesapp: a made-up IT services firm selling
business software and services to mid-size companies in the Netherlands and
Belgium. Everything is in English; people, companies and addresses sound
Dutch or Belgian. E-mail addresses and websites end in `.example`, so nothing
reaches a real company. Decided in #20, built in #35.

| Data | Amount |
|---|---|
| Products (#99) | 16: hourly consulting, day rates, fixed-price packages, monthly licences and bundles, a yearly support contract, a generic "Services" Product, 9 % and 0 % VAT examples, and one Retired (`SUP-OLD`) |
| Product lines (#100) | 37 lines on 13 Opportunities (10 open, 3 Closed Won); each of those Opportunities' Estimated value is the total of its lines. Rijnmond has a negotiated day rate below the List price |
| Accounts | 25 |
| Contacts | 50 (two per Account) |
| Leads | 30: 8 Not Contacted, 12 Working, 6 Qualified, 4 Disqualified (with reason) |
| Opportunities | 30: 20 open (5 Qualification, 5 Needs Analysis, 6 Proposal, 4 Negotiation), 6 Closed Won, 4 Closed Lost (with Lost reason) |
| Quotas | 18: Adele, Alex and Megan, this month and the next 5 |
| Notes, Tasks, Phone Calls | 40, 30 (8 overdue, 6 due today, 5 completed), 20 (16 logged, 4 planned) |

Products are organisation-owned, so they have no Owner and every user reads
them; only Megan (Catalogue Manager) changes them. The loader writes them
first; re-running it updates the same Products.

Records are spread over **Megan Bowen** (manager), **Adele Vance** and
**Alex Wilber** (her reports) and **Diego Siciliani** (outside her team).
Bram owns none: sign in as a demo user, for example in a private window.
Each demo user has overdue Tasks, Tasks due today, Not Contacted Leads and
open Opportunities, so Home and the Pipeline have something to show.

Some records exist for demos of specific features:

- The six Qualified Leads became the Accounts, Contacts and Opportunities
  that Qualify would have made: Company = Account name, the Lead's person is
  the Primary Contact, and the Opportunity has the Lead's Owner, Lead source
  and Description and links back to the Lead.
- Working Lead *Bart Verhoeven* has the same e-mail as an existing Contact
  (one strong match in the Qualify dialog); *Scheldepoort Shipping* and
  *Noordkaap Retail* Leads partly match an existing Account name.
- Every open Opportunity has a Forecast category, defaulted from its Stage;
  five are overridden (three to Omitted, one to Commit on a Proposal, one to
  Best case on Needs Analysis) so the forecast has parked and promoted deals
  to show. Closed deals have none.
- Quotas belong to the salesperson and are written with the plug-in bypass,
  because the loader is neither the salesperson nor their manager.
- Qualified and Disqualified Leads, closed deals, completed Tasks and logged
  Phone Calls are inactive, as the app leaves them.

## Files

- `data/sample-data.json`: the data. Records refer to each other by key
  (`prod-…`, `acc-…`, `con-…`, `lead-…`, `opp-…`, `note-…`, `task-…`, `call-…`).
  Dates are day offsets from the load day: `createdDaysAgo`,
  `expectedCloseInDays`, `closedDaysAgo`, `disqualifiedDaysAgo`, `dueInDays`.
  Activities belong to the Owner of the record they are about.
- `scripts/load_sample_data.py`, `scripts/reset_sample_data.py`: the scripts.
- `scripts/sample_data.py`: validation, fixed IDs and Dataverse payloads.
- `scripts/test_sample_data.py`: offline tests (`python3 -m unittest discover -s scripts`).

Sample data is not part of the SalesApp solution.

## Run

From the repo root on Bram's machine, with `.env` holding `DATAVERSE_URL` and
`TENANT_ID` (see `scripts/auth.py`). Both scripts are a dry run unless you
add `--apply`.

```bash
python scripts/load_sample_data.py --apply    # load or refresh, then check
python scripts/load_sample_data.py --check    # only the check
python scripts/reset_sample_data.py --apply   # delete the sample records
```

Before a demo, run the load again: it moves every date back to "relative to
today". The demo users need the SalesApp Salesperson role first
(`scripts/setup_security_role.py --apply`).

## How it works

- **Fixed IDs.** Every record's ID is a UUID derived from its key
  (`uuid5` with a fixed namespace in `sample_data.py`). The load creates a
  missing record with that ID and updates an existing one, so loading twice
  never duplicates. To update an inactive record it reactivates it first and
  closes it again at the end.
- **Backdated.** New records get `overriddencreatedon` from `createdDaysAgo`.
  An update keeps the creation date of the first load. "Created by" is the
  admin who ran the script; Owner is the demo user.
- **Validated.** The load refuses a data file with broken references,
  unknown choice values, missing reasons, a child created before its parent,
  or a Qualified Lead that does not match its Opportunity.
- **Checked.** After loading, the script reads as each demo user (through
  `MSCRMCallerID`) what Home and the Pipeline would show, and confirms that
  every Account, Contact, Lead and Opportunity in the file exists exactly
  once, and that each demo user reads only the Quotas they may (Adele and Alex
  their own, Megan her own and her reports', Diego none). It fails if a user's Home would have an empty section; an empty
  "closing this month" is only a note, since it can happen at a month's end.
- **Reset** deletes exactly the IDs from the data file, activities first.
  Hand-made records are left alone, except what Dataverse cascades from a
  deleted sample record: the Notes, Tasks and Phone Calls attached to it and
  the Contacts under a sample Account. A sample Account that a hand-made
  Opportunity points to stays (the relationship restricts the delete); the
  script reports it and exits 1.

Renaming a key or removing a record from the file means the next reset no
longer knows that record: run the reset before such a change.
