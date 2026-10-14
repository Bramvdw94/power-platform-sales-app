# Dataverse notes and activities for custom Lead/Opportunity (issue #10)

Researched 2026-10-08 against Microsoft Learn and the live dev-salesapp environment (orgd91f3edf.crm3.dynamics.com), using read-only Dataverse tools only.

## Answer

- **The standard tables exist in dev-salesapp:** `annotation` (Note), `task`, `phonecall`, `appointment`, `email`, `letter`, `recurringappointmentmaster`, `activitypointer` (Activity) and `activityparty`. All of them are empty: 0 notes and 0 activities.
- **Custom tables can be linked to them.** On a custom Lead/Opportunity table, turn on **Notes** (Enable attachments) and **Activities** (Creating a new activity). Both can be turned on **after** the table is created, but once on they **cannot be turned off** ([edit-entities](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/edit-entities)). The table must be user/team-owned to be useful for activities. Activity tables themselves are user/team-owned only.
- **Code app caveat:** the code-apps Dataverse docs list **polymorphic lookups as unsupported** ([connect-to-dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)). `annotation.objectid`, `*.regardingobjectid` and the activity-party fields are all polymorphic. Reading them works; whether the generated SDK can write them is unproven.
- **Recommendation for v1:** ship **Notes (annotation) plus Task and Phone Call**, regarding the custom Lead and Opportunity. Show them in an app-built timeline: `activitypointer` filtered by regarding, merged with `annotation` filtered by objectid. Leave out Email (needs mailbox / server-side sync and parties), Appointment (Outlook/Exchange sync, required/optional attendees) and Letter.
- **Do a short spike first:** create a note and a task regarding a custom row from the code app. If the SDK can't bind polymorphic lookups, the fallback is (a) a Power Automate flow or custom API that does the bind, or (b) custom `Note`/`Activity` tables with plain single-table lookups.
- **Turn on Notes and Activities when Lead and Opportunity are created.** It is harmless and saves a later irreversible metadata change.

## 1. Which standard tables are involved

| Table (logical name) | Purpose | Activity? |
|---|---|---|
| `annotation` | Note, optionally with one attached file (`isdocument`, `documentbody`, `filename`, `mimetype`). Linked to its parent through polymorphic `objectid` plus `objecttypecode`. | No. Notes are not activities and do not appear in `activitypointer`. |
| `activitypointer` | Base "Activity" table. Each activity has one row here; security is inherited through it. | Read-only view across all activity types. |
| `task` | To-do item with `scheduledend` (due), `prioritycode`, `percentcomplete`. No parties. | Yes |
| `phonecall` | Call log with `from`/`to` parties, `phonenumber`, `directioncode`, `leftvoicemail`. | Yes |
| `appointment` | Meeting with `organizer`, `requiredattendees`, `optionalattendees`, `scheduledstart`/`end` (required), `location`. | Yes |
| `email` | Email with sender/to/cc/bcc parties. Sending needs a mailbox (server-side sync). | Yes |
| `activityparty` | Rows that link an activity to people: `partyid` (polymorphic), `participationtypemask` (1 = Sender, 2 = To, 5 = Required attendee, 7 = Organizer, 8 = Regarding, ...). | Child of activitypointer |

Sources:
- [Activity tables](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/activity-entities): "Each activity record is represented by a single row in the ActivityPointer table". It also defines activity parties.
- [ActivityParty table](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/activityparty-entity): which party types each activity supports. PhoneCall supports Sender and ToRecipient. Appointment supports Organizer, RequiredAttendee and OptionalAttendee. Email supports Sender, To, Cc, Bcc and Related. Task has none.

## 2. What the environment shows (read-only)

- `search` returned all of: phonecall, annotation, email, task, appointment, recurringappointmentmaster, activityparty, activitypointer, letter, plus email-related tables (template, emailsignature, emailserverprofile, ...).
- `SELECT COUNT(annotationid) FROM annotation` returned 0. `SELECT TOP 5 ... FROM activitypointer` returned no rows.
- There are no standard `lead`/`opportunity` tables in the environment (no Dynamics 365 Sales), which confirms they will be custom.
- The current polymorphic targets are what an environment without Sales looks like. No custom table is enabled yet:
  - `task/phonecall/appointment.regardingobjectid` targets account, contact, knowledgearticle, knowledgebaserecord, adx_invitation and mspp_* (Power Pages) tables.
  - `annotation.objectid` targets account, contact, all activity tables, and various system tables.
  - `activityparty.partyid` targets account, contact, knowledgearticle, queue and systemuser.
  - `phonecall.from`/`to` targets account, contact and systemuser.
- When Activities is enabled on the custom Lead, Dataverse adds it as a target of `regardingobjectid`. When Notes is enabled, Dataverse adds it as a target of `annotation.objectid`. Each one creates a relationship such as `<prefix>_lead_Tasks` or `<prefix>_lead_Annotations`.

## 3. Enabling notes and activities on custom tables

- When you create a table in the maker portal, the advanced options include **"Creating a new activity: Associate activities to records for this table."** and **"Enable Attachments ... to append notes and files to records for this table."** ([Create and edit tables](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-edit-entities-portal)).
- **Can they be enabled later? Yes.** [Edit a table](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/edit-entities) has a list headed "options that you can enable for a table, but after these items are enabled, they can't be disabled". The list includes **Activities**, **Notes** ("Notes include the ability to add attachments"), **Sending email**, Connections, Queues, Feedback and Business process flows. So these are one-way switches, not create-time-only switches. The training module agrees: "You cannot undo the addition of attachments to a table." ([Enable attachments](https://learn.microsoft.com/en-us/training/modules/create-manage-entities/3-enable-attachments)).
- **"Sending email"** on a custom table lets its rows be email recipients. It adds an email column and makes the table usable as an activity party (inferred: enabling it is what lets a table be a `partyid` target). It is not needed for v1 when the parties are users and contacts.
- Do not choose "Activity table" as the *type* of Lead or Opportunity. That option makes the table itself an activity (custom activity), which is a different thing. Activity tables can only be user/team-owned ([create-edit-entities-portal](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-edit-entities-portal)).
- **Implication for #10 and the table-creation work:** create Lead and Opportunity as standard, user/team-owned tables with Notes and Activities ticked. There is no risk if we never use them, and it avoids a later irreversible change in a managed solution.

## 4. Reading and writing from a Power Apps code app

- Code apps use the Dataverse connector through generated TypeScript models and services. The documented **unsupported scenarios** are "Polymorphic lookups, Schema definition (entity metadata) CRUD, FetchXML support, Alternate key support". For lookups, makers are told to follow the Web API "associate with a single-valued navigation property" / "associate on create" guidance ([connect-to-dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse); [create with associations](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-entity-web-api)).
- In the Web API, a polymorphic lookup is written through the target-specific navigation property. Examples: `"regardingobjectid_<prefix>_lead@odata.bind": "/<prefix>_leads(<id>)"` and `"objectid_<prefix>_lead@odata.bind": "/<prefix>_leads(<id>)"` on an annotation. Each of these is a single-valued navigation property, so it may work through the generated service even though "polymorphic lookups" are listed as unsupported. **Verify this in a spike.**
- **Reading** should work: query `task`/`phonecall`/`annotation` filtered on `_regardingobjectid_value` / `_objectid_value` equal to the record id, or query `activitypointer` for a merged list (`activitytypecode`, `subject`, `scheduledend`, `statecode`). `activitypointer` is read-only. Create rows in the concrete table (`task`, `phonecall`).
- **Activity parties** (phonecall from/to, appointment attendees, email recipients) are written as a collection (`<entity>_activity_parties` with `partyid_systemuser@odata.bind` / `partyid_contact@odata.bind` and `participationtypemask`). That is a polymorphic collection, so it is the least likely to work through the code-app SDK today. Task needs no parties. For phone calls, v1 can omit or default from/to: in the environment's metadata the from/to columns are marked NOT NULL, but the platform usually fills `from` with the current user. Confirm this in the spike.
- **Attachments on notes:** `documentbody` is base64 in the annotation row. That works for small files. For larger files, chunked upload is not exposed through the code-app SDK.
- **Fallbacks if the spike fails:** (1) a Power Automate cloud flow or Dataverse custom API that takes `{recordId, table, subject, ...}` and does the polymorphic bind server-side; (2) custom `<prefix>_note` / `<prefix>_activity` tables with ordinary lookups to Lead and Opportunity. Option (2) is simplest in a code app, but you lose the standard timeline, Outlook integration, and later reuse in model-driven apps.

## 5. v1 scope suggestion

| Item | v1? | Why |
|---|---|---|
| Notes (annotation), text plus small attachment | Yes | Simplest, no parties |
| Task | Yes | No parties, just regarding + due date + status |
| Phone call (log a call) | Yes, if the spike succeeds with defaulted parties | Core sales activity. Otherwise defer, or log it as a task with a category |
| Appointment | Later | Attendees are parties; Exchange sync expectations |
| Email | Later | Needs mailbox / server-side sync, sender/recipient parties |
| Timeline view | Yes, app-built | Merge activitypointer and annotation by regarding id, sorted by createdon/sortdate |
