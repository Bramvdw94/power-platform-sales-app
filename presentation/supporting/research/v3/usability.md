# Saved views, Note attachments, CSV import, duplicate detection and Delete from a code app (research for issue #133)

Researched 2026-10-13. Sources are Microsoft Learn (cited inline), the official HubSpot and Salesforce help pages, this repo (`solutions/SalesApp`, `src/data/dataverse`, `docs/security-check.md`), and the typings of the code-app SDK `@microsoft/power-apps` 1.5.0, the newest version on npm. The repo pins `^1.2.5`. I didn't query `dev-salesapp` live. The checks that need the real environment are listed under [Open points](#open-points).

Cost: everything recommended below uses only what the team already has, which is Dataverse with Power Apps Premium plus free open-source libraries. Nothing needs Azure, a credit card or another licence.

## Answer

- **The code app can do more than plain CRUD.** The SDK gives create, read, update, delete, file upload and download, and `executeAsync`. Since `@microsoft/power-apps` 1.1.1, `pa app add dataverse-api --api-name <Name>` generates a typed service for **built-in** Dataverse actions and functions as well as custom ones ([add Dataverse actions and functions](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-dataverse-action-function), updated 2026-08-13). Some things are still missing: request headers can't be set, FetchXML and polymorphic writes are listed as unsupported, and query options stop at `select`, `filter`, `orderBy`, `top`, `skip` and `count` ([connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse), updated 2026-08-19; SDK `types/index.d.ts`).
- **Saved views: store them in the app's own table**, `vibe_SavedView`, not in `userquery`. A personal view is FetchXML plus layout XML, and the app can't run FetchXML or pass `userQuery=` from a code app. The app would end up with a second filter language it can't use. A small user-owned table that holds the list's filter, sort and columns as JSON works directly with the query API. It also follows the user across devices, and a "shared with the team" flag can come later.
- **Note attachments: use the `annotation` columns the app already writes, and keep files small.** Notes on Leads and Opportunities already work (`addNote` binds the polymorphic `objectid`). An attachment is the same create call with `documentbody` (base64), `filename`, `mimetype` and `isdocument = true` added. The default size limit is **5 MB measured in base64** (`Organization.MaxUploadFileSize`; the maximum setting is 128 MB), and Microsoft suggests single-call uploads only "under 4 MB" ([file size limits](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/attachment-annotation-files#file-size-limits)). Cap uploads at about **3.5 MB of real file** in the app and you never need chunked upload. A short spike closes the v2 accepted risk (see Open points).
- **CSV import: parse in the browser and write in small batches.** Don't use the Data Import API. Read the file with an MIT library such as Papa Parse, let the user map columns, show a preview with errors and possible duplicates, then create the records with 4 to 6 requests running at a time, retrying on HTTP 429. Each row goes through the same gateway validation and process engine as a typed-in record. The Data Import API is four tables, XML data maps and three asynchronous jobs to poll ([run data import](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/run-data-import)). That's a lot of machinery for importing a few thousand Leads or Contacts.
- **Duplicate detection: do it in the app, not with Dataverse duplicate rules.** Rules only block a Web API create when the request sends `MSCRM.SuppressDuplicateDetection: false` ([detect duplicates on create and update](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/manage-duplicate-detection-create-update)), and the code-app SDK can't send headers. The app should instead run a cheap filtered query before saving a Lead, Contact or Account (same email, same email domain, or same name) and show "Possible duplicates". The user can open one of them or save anyway. This is the Salesforce "alert, allow" default. The same check runs on every row of an import.
- **Delete: cascades are mostly safe already, with one trap.** Deleting an Opportunity also deletes its Product lines and Quotes, and Quotes take their Quote lines. Accounts with Opportunities and Products on lines are protected by Restrict. The trap is that **deleting an Account silently deletes all its Contacts** (standard `contact_customer_accounts`, Cascade). Turn on Dataverse **Keep deleted records** in the admin center. It is GA since 2026-04-27, free apart from storage, and keeps records 1 to 30 days; I suggest 14. Only a system administrator restores records, in the admin center. In the app, give Delete only where a mistake is the normal reason. Disqualify, Close and Retire stay the everyday way to end a record.

## 1. What the code app can call

| Need | How a code app does it | Status |
|---|---|---|
| CRUD on tables | Generated `<Table>Service` (`createRecordAsync` and the rest) | Supported |
| File column upload/download | `uploadFileToRecord`, `downloadFileFromRecord`; up to 128 MB (SDK `uploadRecord.d.ts`). Already used for the Quote PDF. | Preview ([connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)) |
| Built-in or custom actions/functions (`Restore`, `RetrieveDuplicates`, `CreateMultiple`, `GrantAccess` ...) | `pa app find-dataverse-api --search X`, then `pa app add dataverse-api --api-name X`. This produces a `XService`, which runs through `executeAsync` with `action: 'customapi'` (SDK `dataverseDataOperationExecutor.js`). | Documented; none of these messages is named or tested in the docs |
| Request headers (`MSCRM.SuppressDuplicateDetection`, `MSCRM.BypassCustomPluginExecution`) | Not possible: the SDK methods take no headers | Missing |
| FetchXML, `userQuery=` / `savedQuery=` | Not possible | Unsupported |
| `$batch` | The SDK builds batches internally, but the app can't control them | Not exposed |

Because the action route exists, a feature that needs a Dataverse message isn't blocked outright. It needs a spike to check that the generator handles that message's parameter types. `RetrieveDuplicates` takes a `crmbaseentity`, for example ([RetrieveDuplicates](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveduplicates)).

## 2. Saved views

**What Dataverse offers.** `savedquery` holds system views, which are organisation-owned and visible to everyone. `userquery` holds personal views, which are user-owned and "can be assigned and shared with other users" ([saved queries](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/saved-queries)). Both store the query as **FetchXML** and the columns as layout XML. A model-driven app runs them from its view picker. Users can save as a new view, set a personal default, share, hide and delete ([work with views in grids](https://learn.microsoft.com/en-us/power-apps/user/grid-filters-advanced), updated 2026-08-25).

**Why not `userquery` from this app.**
- The code app can't execute it. FetchXML is unsupported, and `IOperationOptions` has no `userQuery` option.
- The app would have to turn its own filter state into FetchXML and then parse FetchXML back into its filter UI. That is two-way translation for no gain, since no model-driven app is in use (the team works only in the code app).
- Sharing through `userquery` uses record sharing (`GrantAccess`). That would need the action route and its own spike.

**Recommendation: `vibe_SavedView`** (user/team-owned):

| Column | Meaning |
|---|---|
| `vibe_name` | What the user called it, e.g. "My hot Leads" |
| `vibe_list` | Which list it belongs to: Leads, Opportunities, Accounts, Contacts, Quotes, Products |
| `vibe_definition` | JSON: filters, sort, visible columns. Versioned with a `v` field so the app can upgrade old views |
| `vibe_isdefault` | This user's default view for that list |
| `vibe_isshared` | v3 optional: visible to the whole team (read at organisation level, edit by owner only) |

The app's built-in views ("My open Opportunities", "All open Opportunities", and so on) stay in code. That way they are versioned with the app and can't be deleted by accident. Security: everyone gets Basic create/read/write/delete on their own rows. If `vibe_isshared` ships, read becomes organisation level and the app filters on "mine or shared". Keep `localStorage` only for "last used view on this device".

**Gotchas.** Filters must stay inside what the query API delegates (`filter`, `orderBy`, `top`). The SDK's `count` stops at 5,000. A saved filter that points to a removed column or choice value has to fail softly. Show "this view needs updating" and don't let the list crash.

## 3. Note attachments

**What Dataverse offers.** A Note (`annotation`) holds at most one file in `documentbody` (base64 text) with `filename`, `mimetype` and `isdocument` ([files and images overview](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/files-images-overview)). There are two ways to upload:
1. **One call:** set `documentbody` on create or update. Microsoft says this "should be fine as long as the files aren't too large, for example under 4 MB".
2. **Chunked:** `InitializeAnnotationBlocksUpload`, then `UploadBlock` repeated, then `CommitAnnotationBlocksUpload`, for files above that ([attachment and annotation files](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/attachment-annotation-files)).

**Limits and gotchas.**
- `MaxUploadFileSize` defaults to **5 MB (5,242,880 bytes)** and can go up to 128 MB. The limit applies to the **base64** size, which is about a third bigger than the file, so the real ceiling at the default is about 3.75 MB.
- Blocked extensions (`Organization.BlockedAttachments`, the default list includes `exe`, `js` and `svg`) and MIME-type allow/block lists. A blocked file fails with `AttachmentBlocked` `0x80043e09`. The app should check the extension first and show a friendly message.
- **Reading:** never select `documentbody` in the timeline query, because it would pull every file into every list. Fetch it with `get(id, select documentbody)` only when the user clicks the file. Then decode the base64 into a Blob and download it.
- Attachments count against **file** capacity, not database capacity.
- Our custom Lead and Opportunity already have Notes on (`HasRelatedNotes`), and `addNote` already writes the polymorphic `objectid_<table>@odata.bind`. So the v2 risk is narrower than "polymorphic writes": it is whether `documentbody` makes it through the generated service.

**Recommendation.** Add an optional file to the Add Note dialog. Cap it at 3.5 MB in the app and check the extension against the blocked list. Write it in the same create call. Show a paperclip on the Note in the timeline. Leave chunked upload and a raised `MaxUploadFileSize` out unless people really need bigger files. If they do, the chunked messages can be added through `pa app add dataverse-api`. A file column on a custom table is the fallback, because it is the path the Quote PDF already proves.

## 4. CSV import

**Option A: Data Import API (server).** You create `import` and `importfile` records and an `importmap` with column mappings. Then you call `ParseImport`, `TransformImport` and `ImportRecordsImport`, each of which "submits an asynchronous job", and read failures from `importlog` ([import data](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/import-data), [run data import](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/run-data-import)). The model-driven Import Data Wizard sits on top of it, with an **8 MB** file limit (32 MB zipped) and a recommendation of **20K rows or fewer** ([import data (all record types)](https://learn.microsoft.com/en-us/power-platform/admin/import-data-all-record-types)).
- For: Dataverse does the work, and it can run duplicate detection during import.
- Against: from a code app it is six or more record types and three actions through the unproven action route, plus polling of async jobs. Mapping uses Dataverse XML maps, not our glossary's fields. Lookups such as Account by name need `LookupMap` XML. Gateway validation (Lead status, Lead source, Owner rules) is bypassed, and only the plug-in still runs.

**Option B: parse in the browser and write in batches (recommended).**
1. The user picks Leads, Contacts or Accounts and drops a `.csv` file. Papa Parse is MIT-licensed and runs in the browser.
2. Map columns. Remember the mapping per user in `localStorage`, or in `vibe_SavedView`-style JSON if it should travel between devices.
3. Run a dry run in memory: validate each row with the same rules as the forms (`src/sales/validation.ts`), resolve lookups (Account by name, Owner by email) with one query per distinct value, and run the duplicate check from section 5. Show a preview table with OK, error and possible-duplicate rows.
4. Create the OK rows through the existing gateway, 4 to 6 at a time. On HTTP 429, wait for `Retry-After` and retry. Show a progress bar and let the user download an "errors.csv" of the failed rows.
5. Stamp each row with an import tag, for example a `vibe_importbatch` text column, so a bad import can be found and deleted in one go.

**Limits that matter.**
- Service protection: **6,000 requests, 20 minutes of execution time and 52 concurrent requests per user per 5 minutes** ([API limits](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/api-limits)). Each row costs one create plus its share of the lookup and duplicate queries. 2,000 rows with 3 requests each is 6,000, so imports above about 1,500 rows should slow down or batch.
- Daily entitlement: **40,000 requests per Premium user per 24 hours**, and Microsoft says enforcement "won't start until at least six months after" usage reporting is GA ([request limits and allocations](https://learn.microsoft.com/en-us/power-platform/admin/api-request-limits-allocations), updated 2026-09-22).
- `CreateMultiple` would cut the request count, at 100 to 1,000 rows per request. However, on standard and custom tables "all operations roll back on error", and the per-row `Create` plug-in still fires ([bulk operations](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/bulk-operations)). It is worth a spike later. Single creates are simpler and give per-row errors.
- Browser memory: a 5 MB CSV of a few tens of thousands of rows is fine. Cap the file at about 5,000 rows for v3. The product is for one sales team.

**For a one-off migration from Dynamics 365,** an admin can also use the maker portal's import (Power Query) into the custom tables. It comes with the licence. It is not a salesperson feature, though, and it skips the app's rules.

## 5. Duplicate detection

**What Dataverse offers.**
- Duplicate detection rules (`duplicaterule`, `duplicaterulecondition`). When a rule is published, a matchcode is built for every record. **At most five published rules per table.** You must unpublish a rule to edit it. Default rules exist only for Account and Contact ([set up duplicate detection rules](https://learn.microsoft.com/en-us/power-platform/admin/set-up-duplicate-detection-rules-keep-data-clean)), and we would need one for `vibe_lead`.
- Detection runs in model-driven forms, in the Import Wizard, in bulk detection jobs, and on Web API create only with the header `MSCRM.SuppressDuplicateDetection: false`. On update it is suppressed by default. A hit returns HTTP 500 `0x80040333` ([detect duplicates on create and update](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/manage-duplicate-detection-create-update)).
- `RetrieveDuplicates(BusinessEntity, MatchingEntityName, PagingInfo)` returns the duplicates of a record that hasn't been saved yet, using the published rules.

**Why not from this app.** The code app can't send the header, so rules never block an app create. `RetrieveDuplicates` might work through the action route, but it needs published rules, the org-wide setting and a spike on the `crmbaseentity` parameter, all to get matching we can write ourselves as a filter.

**Recommendation: an app-side "possible duplicates" check.**

| Record | Match on (normalised: trimmed, lower-case) |
|---|---|
| Lead | Same email; or same company name and last name |
| Contact | Same email; or same first and last name at the same Account |
| Account | Same name; or same website domain |

These are one or two filtered queries (`eq` on email or name, `top 5`) when the user saves the form or leaves the email field. The dialog shows the matches with links, plus "Save anyway". It never blocks; that matches Salesforce's default of allow, alert and report. Store a normalised email column only if case or space differences show up in real data. When the user Disqualifies the new Lead with the Disqualify reason "Duplicate", the dialog can offer to open the existing record.

If one day there must be a hard rule ("no two Accounts with the same name"), use a Dataverse **alternate key**. That is a unique index enforced on every write, including imports and plug-ins. The app can't *use* alternate keys for lookups, but the key still blocks the duplicate insert.

## 6. Delete

**Cascade behaviour today** (from `solutions/SalesApp/src/Other/Relationships`):

| Delete a ... | What happens to related records |
|---|---|
| Opportunity | Product lines **deleted**, Quotes **deleted**, and with them their Quote lines (Cascade). Notes, Tasks and Phone Calls regarding it are deleted (system parental relationships). |
| Quote | Quote lines **deleted**. The stored PDF (file column) goes with the record. |
| Account | **Blocked** while it has Opportunities (Restrict). Quotes lose the link (RemoveLink). **All its Contacts are deleted** (standard `contact_customer_accounts`, Cascade), together with their own Notes and activities. |
| Contact | Opportunities and Quotes lose the Primary Contact link (RemoveLink). |
| Lead | The Opportunity's originating Lead link is cleared (RemoveLink). |
| Product | **Blocked** while it is on any Product line or Quote line (Restrict). This matches the glossary: a Product is retired, never deleted. |
| Process / Process version | The engine's links are cleared (RemoveLink). The engine already treats versions as never deleted. |

Security today: v1 deliberately gives **no Delete on Leads** (`docs/security-check.md`). Only Draft Quotes can be deleted, and nobody can delete Products.

**Recycle bin ("Keep deleted Dataverse records").** An admin turns it on per environment in the Power Platform admin center (Settings, Product, Features), with 1 to 30 days. It works for most tables, custom ones included, but not virtual or elastic tables or tables with more than 600 columns. Records deleted before it was turned on can't be restored. Cascade-deleted children must be restored after their parent. A **system administrator** restores records under Settings, Data management, Deleted records ([restore deleted table records](https://learn.microsoft.com/en-us/power-platform/admin/restore-deleted-table-records)). From code, `Restore` takes the full record by primary key. Plug-ins should do their work in PostOperation, since the record isn't there in PreOperation. The developer page is still marked prerelease ([restore deleted records with code](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/restore-deleted-records)). The admin feature went GA on **2026-04-27**. From then on, kept records count toward storage, and "Delete all records" frees the space (Message Center MC1262315, via [itelio](https://www.itelio.com/en/microsoft-message-center/MC1262315)).

**Recommendation.**
- Turn on Keep deleted records in `dev-salesapp` (and later prod) with **14 days**. It costs only storage.
- In the app, deleting means **confirm, then delete**, and the confirm text lists what goes with it, for example "This also deletes 3 Product lines and 1 Quote". Keep the app's own wording: Delete is for mistakes, and Disqualify, Close and Retire end real records.
- **Account delete:** block it in the app (and in the existing plug-in, if it should hold for every client) while the Account has Contacts, or ask explicitly "Delete the Account and its 4 Contacts?". The default cascade is too quiet.
- Who may delete: the Owner deletes their own Leads, Contacts and Notes, and their own Opportunities only while open with no Quotes sent. Managers delete at business-unit level. Restore stays an admin job in the admin center. A salesperson asks, and no restore UI is built into the app in v3. If restore turns out to be a frequent need, `Restore` via the action route is the later option.

## 7. How Salesforce, Dynamics 365 and HubSpot do it

| | Salesforce | Dynamics 365 Sales | HubSpot | Our v3 plan |
|---|---|---|---|---|
| **Saved views** | List views: private, or shared with groups and roles by users with "Manage Public List Views". Up to 10 filter fields and 15 columns ([create a custom list view](https://help.salesforce.com/s/articleView?id=xcloud.customviews.htm&type=5)) | System views plus personal views (`userquery`): save as new, share with users or teams, personal default, hide ([views in grids](https://learn.microsoft.com/en-us/power-apps/user/grid-filters-advanced)) | Saved views: private (default), team, everyone, or custom. The leftmost tab is the default ([saved views](https://knowledge.hubspot.com/records/create-and-manage-saved-views)) | `vibe_SavedView`: private now, optional "shared with team", personal default |
| **Import** | Data Import Wizard: up to 50,000 records, matching by name, email or record ID, overwrite only when ticked ([import cheat sheet](https://resources.docs.salesforce.com/206/latest/en-us/sfdc/pdf/salesforce_import_cheatsheet.pdf)) | Import Data Wizard: CSV/XML/zip, 8 MB (32 MB zip), 20K rows recommended, data maps, optional duplicate detection ([import data](https://learn.microsoft.com/en-us/power-platform/admin/import-data-all-record-types)) | CSV/XLSX, 512 MB and 1,048,576 rows on paid plans (20 MB on free), matching rows update existing records ([set up your import file](https://knowledge.hubspot.com/crm-setup/set-up-your-import-file)) | Browser CSV import with mapping, preview, duplicate check, error file; about 5,000 rows |
| **Dedupe** | Matching rules plus duplicate rules for Account, Contact and Lead. On create the default is allow, alert and report, or Block ([create duplicate rules](https://help.salesforce.com/s/articleView?id=sales.duplicate_rules_create.htm&type=5)) | Duplicate detection rules (5 published per table), in forms, import and bulk jobs ([duplicate rules](https://learn.microsoft.com/en-us/power-platform/admin/set-up-duplicate-detection-rules-keep-data-clean)) | Automatic: Contacts by email, Companies by domain. Up to 10 unique-value properties per object ([deduplication of records](https://knowledge.hubspot.com/records/deduplication-of-records)) | App-side "possible duplicates" alert on save and import; alternate key only for hard rules |

The common pattern: views are personal by default with optional sharing. Import is a wizard with mapping, a preview and matching. Dedupe warns by default and blocks only on a strong key (email, domain or record ID). The plan above follows that pattern at the smallest size that fits one team.

## Open points

1. **Spike (closes the v2 accepted risk):** create a Note with `documentbody`, `filename`, `mimetype` and `isdocument` through the generated `AnnotationsService` on a `vibe_lead`. Then read it back with `select documentbody`. Also try a file just over the base64 limit and a blocked extension, to see what error the SDK surfaces.
2. **Read `dev-salesapp` settings:** `organization.maxuploadfilesize`, `blockedattachments` and `allowedmimetypes`, and whether Keep deleted records is already on. MC1262315 suggests it may be on with 30 days. Also check the environment's file and database capacity.
3. **Account delete rule:** decide between blocking while Contacts exist and an explicit "and its Contacts" confirm. If it is a block, decide whether the plug-in should enforce it too.
4. **Who deletes what:** the security-role change from "no Delete" to Owner-level delete on Leads, Contacts and Notes needs a decision and new rows in `docs/security-check.md`.
5. **Shared views:** whether v3 needs team-shared saved views, or private only.
6. **Import size and volume:** confirm about 5,000 rows is enough for the move off Dynamics 365. If the first migration is bigger, an admin does it once with the maker-portal import.
7. **Optional later spikes on the action route:** `CreateMultiple` for faster imports, `Restore` for a restore button, and `RetrieveDuplicates` if Dataverse rules are ever wanted.
8. **SDK version:** the repo pins `^1.2.5` and npm has 1.5.0. The action route needs 1.1.1 or later, so it is already available, but the upgrade is worth doing before any spike.
