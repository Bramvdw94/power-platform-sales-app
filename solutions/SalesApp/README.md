# SalesApp solution

The unpacked, unmanaged **SalesApp** solution from dev-salesapp
(publisher `vibe`, prefix `vibe_`, option value prefix 84120). It holds
the Lead and Opportunity tables, the five global choices, and Account and
Contact as existing tables without subcomponents.

## Sync after a schema change

Sync after every change to the schema, role or custom API in dev-salesapp:

```bash
pac auth select --name salesapp
pac org who          # confirm: dev-salesapp
cd solutions/SalesApp && pac solution sync
```

Review the diff and commit it. `bin/` and `obj/` are ignored, so leave them
out of the commit.

## Cascade outcomes (#24)

| Relationship | Wanted | Outcome |
|---|---|---|
| `vibe_lead_*` and `vibe_opportunity_*` → activities (Tasks, PhoneCalls, Appointments, Emails, Faxes, Letters, RecurringAppointmentMasters, SocialActivities, chats, ActivityPointers) | Assign = Cascade Active | **Works.** Assign = `Active` (`ActiveOnly` in XML) on all 20. Reassigning a Lead or Opportunity moves only its open activities, so the gateway does not need its own fallback for this. |
| `vibe_account_vibe_opportunity_accountid` (Account → Opportunity) | Delete Restrict, others NoCascade | **Works.** Set when the relationship was created. |
| `vibe_contact_…_primarycontactid`, `vibe_lead_…_originatingleadid` | Delete RemoveLink, others NoCascade | **Works.** Set when the relationship was created. |
| `contact_customer_accounts` (standard Account → Contact, `parentcustomerid`) | Assign = NoCascade | **Works.** Assign = `NoCascade`. Dataverse accepted Assign on its own, so Delete, Share, Unshare, Reparent and Merge keep their standard `Cascade`. The relationship is in the solution as a component (type 10), so the change travels with it. Reassigning an Account no longer moves its Contacts. |

Two things to know when editing a relationship with
`PUT RelationshipDefinitions(<id>)`:

- **Leave `AssociatedMenuConfiguration` out of the body.** On the
  system-generated activity relationships, echoing it back fails with
  `0x80044329 The nav pane properties … are not customizable`.
- **Sending the solution header on the update adds the activity tables to
  the solution as shells** (`rootcomponentbehavior` 2), along with the
  relationships themselves.

## Security role (#25)

Both roles are built by `scripts/setup_security_role.py` (dry run by default,
`--apply` to change dev-salesapp). It sets each role to exactly the
privileges it declares, gives the roles to the demo users and checks the
Manager fields. `scripts/security_check.py` verifies the result; see
`docs/security-check.md`.

**SalesApp Salesperson** (root business unit; Megan, Adele, Alex, Diego):

| Table | Read | Create | Write | Append | Append To | Assign | Delete |
|---|---|---|---|---|---|---|---|
| Lead, Opportunity | Organization | User | User | User | User | User | none |
| Account, Contact | Organization | User | User | User | Organization | User | none |
| Note | Organization | User | User | User | none | User | none |
| Activity (covers Task and Phone Call) | Organization | User | User | User | none | User | none |

Extras beyond the spec, each proven by a failing call:

| Privilege | Depth | Why |
|---|---|---|
| `prvReadAsyncOperation` | User | Creating a Note starts a System Job owned by the caller; without it the create fails with `0x80040299 … missing prvReadAsyncOperation`. |
| `prvReadUser` | Organization | The code app reads the signed-in user, their direct reports and Owner names from `systemuser`; without it the app fails on load with `0x80040220 … missing prvReadUser` (seen as Diego, #27). |

Dataverse also keeps `prvReadSharePointData`, `prvCreateSharePointData`,
`prvWriteSharePointData` and `prvReadSharePointDocument` (Organization) on
every role, even straight after a `ReplacePrivilegesRole` that leaves them
out, so the script declares them instead of fighting them.

**SalesApp Sales Manager** (fallback from #21; Megan only): Assign at
Business Unit on Lead, Opportunity, Account and Contact.

Outcomes:

- **Reassign:** Manager hierarchy (depth 1) gives Megan Write on her
  reports' records but **not Assign**: `0x80048306 … does not have
  AssignAccess right(s)`. With the Sales Manager role she reassigns Adele's
  Opportunity (its open Task moves along through Cascade Active) and Adele's
  deactivated Lead. Assign at Business Unit looks wider than intended in a
  one-business-unit environment, but an Owner change sent as a PATCH
  (`ownerid@odata.bind`, the shape the app uses) also needs **Write** on the
  record. Megan therefore still can't reassign Diego's Lead (`0x80048306 …
  does not have WriteAccess`), so "Owner or Owner's manager" holds on the
  server, not only in the app. (A bare `AssignRequest` was not tested; the app
  doesn't use it.)
- **Polymorphic writes:** all work through the Web API with the navigation
  property read from metadata: Contact under an Account
  (`parentcustomerid_account`), Note on a Lead (`objectid_vibe_lead`), Task
  and Phone Call on an Opportunity
  (`regardingobjectid_vibe_opportunity_task` / `_phonecall`), and Owner change
  to a systemuser (`ownerid@odata.bind`). No custom API fallback (#12) needed.
- **Story 97 is enforced in Dataverse** (Bram's choice, 2026-10-09). The spec
  first asked for Append To at Organization on all four sales tables, but on
  Lead and Opportunity that let any salesperson add a Note, Task or Phone Call
  to anyone's record (204). Append To there is now **User**: only the Owner,
  and through hierarchy the Owner's manager, can add activities (peer and
  outsider get `0x80048306`, Megan gets 204). Account and Contact keep
  Organization, so anyone can still put their Opportunity or Contact on an
  Account someone else owns (story 33; checked as Alex and Diego).

## Process engine (#94)

Definitions live in `vibe_Process`, `vibe_ProcessVersion`, `vibe_BusinessRule` and
`vibe_EngineError` (`scripts/setup_process_engine.py`). One plug-in,
`ProcessEnginePlugin`, runs synchronously: pre-operation on create and update of
Lead, Opportunity, Account and Contact, and post-operation on Lead and Opportunity
for the Action Tasks (same transaction). It runs the engine in
`plugins/SalesApp.Plugins/Engine`, which `plugins/SalesApp.Plugins.Tests` holds to
the shared cases in `process-engine/cases` (the TypeScript engine runs the same files).

- **Kill switch:** environment variable `vibe_ProcessEngineEnabled`, `on` (default) or
  `off`. Set a current value in the environment to switch the engine off at once.
- **Bypass:** `MSCRM.BypassCustomPluginExecution: true` skips the engine (the sample-data
  loader sends it).
- **Fails open:** a rule or Action the engine can't run is skipped and a `vibe_EngineError`
  row says why. A rejection (Gate, required, read-only, block save, Switch Process) comes back
  as an ordinary plug-in error with the message the app shows.
- **Roles:** Salesperson reads definitions; **SalesApp Process Builder** (Megan) writes them,
  reads Engine errors and has Write on all Leads and Opportunities, so Switch Process, Move to
  latest version and the bulk switch work on any record (spec #91).
- **One package:** all plug-ins ship in one package, `vibe_SalesApp.Plugins`. A push replaces
  the whole package, so rebase on main before pushing, and switch the steps off and on
  afterwards (`register_plugin_package.py` does) or users hit `missing prvReadPluginType`.
- `scripts/engine_check.py` (also run by `security_check.py`) proves it end to end as the
  demo users.
