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
