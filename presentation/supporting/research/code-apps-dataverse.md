# Power Apps code apps + Dataverse: what is supported (research for issue #9)

Researched 2026-10-08. Sources are Microsoft Learn, the official `microsoft/PowerAppsCodeApps` repo, and the published npm packages `@microsoft/power-apps@1.5.0` and `@microsoft/power-apps-cli@1.2.0` (read from the tarballs, not installed).

## Answer

- **Status:** Code apps have been **generally available since 5 Feb 2026** ([GA blog](https://www.microsoft.com/en-us/power-platform/blog/power-apps/generally-available-host-and-run-code-apps-in-power-apps/)), so production use is supported. Two parts are still preview: **Dataverse image/file upload and download** ([Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)) and the old **`pac code` commands** ([pac code](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/code)). Microsoft says preview features "shouldn't be used in production" ([feature stages](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/working-with-experimental-preview)).
- **CLI:** The current tool is the npm-based Power Apps CLI (`pa`). The command is `pa app add data-source --connector dataverse --table <logical-name>`, and it generates `<Table>Model.ts` and `<Table>Service.ts` ([CLI ref](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/reference/cli)). `pac code add-data-source` still exists but is preview and "will be deprecated".
- **Supported:** create, get, getAll, update and delete. Queries support `select`, OData `filter`, `orderBy`, `top`, `skip`, `count` and paging with `skipToken`/`maxPageSize` (default page size 500). Choice labels come back as formatted values. Lookups are set with `<nav>@odata.bind` and read as `_x_value`. Dataverse actions and functions are supported, for example **WhoAmI** to get the current user's `systemuserid`. File and image columns can be uploaded, downloaded and deleted (preview).
- **Not supported:** polymorphic lookups, FetchXML, alternate keys, and creating or changing table schema. The query API has no `$expand`. This affects **notes**, because `annotation.objectid` is polymorphic, and **owner** (`ownerid`), because it can point to a user or a team. Expect workarounds there.
- **Licence:** Every end user needs **Power Apps Premium**, **pay-as-you-go**, or an **App Pass** (auto-claim of an available Premium licence also counts) ([Overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)). The admin must also turn on code apps for the environment.

## 1. This repo's starting point

- `package.json` declares `@microsoft/power-apps` `^1.2.5`. `package-lock.json` resolves it to **1.5.0**, published 2026-09-29. `@microsoft/power-apps-vite` `^1.0.2` is a dev dependency.
- No data sources have been added yet: there is no `power.config.json` and no `src/generated/`. Nothing in `src/` imports the SDK except a logo asset.
- 1.5.0 is above every minimum version in the docs: v1.0+ API ([migrate to v1](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/migrate-to-v1)), 1.0.4+ npm CLI ([pac code](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/code)), and 1.1.1+ for Dataverse actions ([actions/functions](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-dataverse-action-function)). From v1.0 there is no `initialize()` call.

## 2. Generated services and models (adding a data source)

- **Current command:** `pa app add data-source --connector dataverse --table account`. Native Dataverse takes one `--table` per command, and `--org-url` selects the Dataverse org ([CLI ref](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/reference/cli)). Install with `npm install --global @microsoft/power-apps-cli`, then use `pa app init`, `pa app run` and `pa app push` ([quickstart](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/create-an-app-from-scratch)).
- **Legacy command:** `pac code add-data-source --apiId <api-id> --table <table> ...` is labelled "(Preview)". The docs say: "For the latest features and improvements, use the npm-based Power Apps CLI instead… will replace these commands, which will be deprecated in a future release" ([pac code](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/code)).
- **Output:** `generated/models/AccountsModel.ts` and `generated/services/AccountsService.ts` ([Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)), plus schema files under `.power/` and an updated `power.config.json` ([sample README](https://github.com/microsoft/PowerAppsCodeApps/blob/main/samples/Dataverse/README.md)).
- **Metadata:** `AccountsService.getMetadata({ schema: { columns: 'all', manyToOne: true } })` returns attributes and relationships. It **cannot return choice options**, because "properties from derived types aren't available" ([table metadata](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/get-table-metadata)).
- **Results:** Every service method returns `IOperationResult<T>` with `success`, `data`, `error?`, `skipToken?`, `count?` and `fileName?` (SDK source, `dist/internal/data/core/types/index.d.ts` in [@microsoft/power-apps 1.5.0](https://www.npmjs.com/package/@microsoft/power-apps)).

## 3. CRUD and queries

- **Operations:** Create, Retrieve, RetrieveMultiple, Update and Delete are supported, along with "Delegation for Filter, Sort, Top" and "Paging support" ([Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)). The methods are `create(record)`, `get(id, options?)`, `getAll(options?)`, `update(id, changedFields)` and `delete(id)`.
- **Docs guidance:** On create, leave out the primary key and the owner fields (`ownerid`, `owneridtype` and so on). On update, send only the fields that changed, because unchanged fields still trigger business logic and audit entries. Always pass `select` (same page).
- **Query options:** `{ maxPageSize?, select?: string[], filter?: string /* OData */, orderBy?: string[], top?, skip?, count?: boolean, skipToken?, partitionId? }` (SDK `IOperationOptions`). The SDK turns these into `$select`, `$filter`, `$orderby`, `$top`, `$skip`, `$count` and `$skiptoken`. It has **no `$expand` or `$apply`** (SDK `stringQueryOptions.js`).
- **Paging:** The SDK sends `Prefer: odata.maxpagesize=<n>,odata.include-annotations=*`, with a **default page size of 500**. It returns `skipToken`, taken from `@odata.nextLink`, for the next page. `count` comes from `@odata.count` and is capped at 5000 (SDK `dataverseDataOperationExecutor.js` and `types/index.d.ts`).
- **No FetchXML and no alternate keys** ([Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)), so aggregates and grouped reports need another route.
- **Dataverse actions and functions:** Find one with `pa app find-dataverse-api --search X`, then add it with `pa app add dataverse-api --api-name X`. This generates a typed `XService` and works for unbound functions, unbound actions and bound actions ([actions/functions](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-dataverse-action-function)).

## 4. Relationships and lookups

- The docs list lookups as supported but point to the generic Web API guidance for now: "A dedicated how-to guide is coming soon" ([Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)).
- **Setting a lookup:** `record['parentcustomerid_account@odata.bind'] = `/accounts(${id})`` or `record['TransactionCurrencyId@odata.bind'] = `/transactioncurrencies(${id})``. To clear one, set the bind property to `null` ([sample LOOKUPS.md](https://github.com/microsoft/PowerAppsCodeApps/blob/main/samples/Dataverse/LOOKUPS.md)).
- **Reading a lookup:** Select `_<lookup>_value` to get the GUID, then call `get()` on the related table's service to fetch its name. The sample says: "Do not use `$expand`" (same file). Because the SDK sends `include-annotations=*`, the response should also carry the lookup's display name as a formatted-value annotation. That follows from standard Web API behaviour; the code-apps docs do not show it.
- **Generated models:** The generator creates `<nav>@odata.bind` (write) and `_<col>_value` (read) properties for lookup, customer and owner columns, using the table's navigation properties (CLI bundle `@microsoft/power-apps-cli@1.2.0`, functions `jYe`, `UYe` and `vWt`).
- **Not supported:** "Polymorphic lookups" ([Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)). The docs do not say exactly what fails, such as generation, binding or reading. Test customer-type columns like `parentcustomerid` early. The official sample does bind `parentcustomerid_account@odata.bind`, which suggests explicit per-target binding works.

## 5. Choice columns

- **Labels at runtime:** "Retrieve formatted values (labels) for option sets option values" is supported ([Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)). The SDK requests all annotations, so `<col>@OData.Community.Display.V1.FormattedValue` comes back with each record (SDK `dataverseDataOperationExecutor.js`).
- **Generated code:** At generation time the CLI reads option sets for Picklist, MultiSelectPicklist, State, Status and Boolean columns. It emits an exported `const` map of value to label plus a union type for each choice column (CLI bundle, `enrichWithOptionSetMetadata` and `nVt`). These labels are a snapshot from generation time in the developer's language, so regenerate after changing a choice.
- **Multi-select choices:** These are typed as `number[]`. The generated service converts them to and from Dataverse's comma-separated string, and an empty array becomes `null` (SDK `serializeMultiSelectPicklistFields` and `deserializeMultiSelectPicklistFields`).
- **Options at runtime:** `getMetadata` cannot list choice options ([table metadata](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/get-table-metadata)). Use the generated constants instead.

## 6. Record ownership and current user

- **Context API:** `getContext()` from `@microsoft/power-apps/app` returns `user.fullName`, `user.objectId`, `user.tenantId` and `user.userPrincipalName` ([context](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/retrieve-context)). It does **not** return the Dataverse `systemuserid`.
- **Getting `systemuserid`:** Option one is to add the `WhoAmI` function (`pa app add dataverse-api --api-name WhoAmI`) and call `WhoAmIService.WhoAmI()`, which returns `UserId`, `BusinessUnitId` and `OrganizationId` ([actions/functions](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-dataverse-action-function); the sample has a `useCurrentUser.ts` hook, see [sample README](https://github.com/microsoft/PowerAppsCodeApps/blob/main/samples/Dataverse/README.md)). Option two is to query `systemuser` with a filter on `azureactivedirectoryobjectid eq <objectId>` ([systemuser reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/systemuser)).
- **"My records" filter:** Use `filter: "_ownerid_value eq <systemuserid>"`. Reading `_ownerid_value` or `_owninguser_value` is plain lookup reading.
- **Ownership on create:** Leave out `ownerid`, and Dataverse makes the calling user the owner ([Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)).
- **Assigning or reassigning the owner:** This means writing `ownerid`, which can point to a systemuser or a team ([annotation reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/annotation)). That falls under the unsupported polymorphic case, and the docs have no code-apps example. Possible workarounds, all unverified: `ownerid@odata.bind = /systemusers(<id>)`, a Power Automate flow ([add flows](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-flows)), or a custom action.
- **Permissions:** Security roles apply as normal, because calls run as the signed-in user through Entra authentication ([Overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)).

## 7. Notes and attachments

- **File and image columns (preview):** The generated service gets `upload(id, column, file, name)`, `downloadFile(id, column)`, `downloadImage(id, column, fullSize)` and `deleteFileOrImage(id, column)` ([Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse) marks this "(preview)"; method names are from the [sample README](https://github.com/microsoft/PowerAppsCodeApps/blob/main/samples/Dataverse/README.md)). The SDK accepts `string | Uint8Array | ArrayBuffer | Blob` and returns `fileName` on download (SDK `Data.types.d.ts`). The model also gets `<Table>FileColumnName` and `<Table>ImageColumnName` union types.
- **Notes (`annotation`):** No code-apps doc or sample covers notes. Technically, `annotation` is a normal table you can add, with `documentbody` (base64 text), `filename`, `mimetype` and `isdocument` columns ([annotation reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/annotation)). However, its `objectid` ("Regarding") is a **polymorphic** lookup across many tables. That is exactly what code apps list as unsupported. Reading notes for a record with `filter: "_objectid_value eq <id>"` is likely to work. Creating one with `objectid_<table>@odata.bind` is unverified and needs a spike.
- **Recommendation:** For attachments in a new design, prefer a **File column** on your own table. It is the documented, sample-backed path, but it is still preview.

## 8. Other limitations

From [Overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview):
- Code apps have no Secure Implicit Connections.
- They have no Power Platform Git integration.
- They do not run in Power Apps for Windows.
- They have no PowerBIIntegration function.
- They have no SharePoint forms integration.
- The Storage SAS IP binding setting does not apply to them.

From [system configuration](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/system-limits-configuration):
- Published assets are on a public endpoint without IP restriction, so do not put sensitive data in the bundle.

From [Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse):
- Code apps cannot create or change table schema (entity metadata CRUD).

## 9. Licensing

- **End users** must have one of these: "Power Apps Premium license; Pay-as-you-go enabled; An App Pass; Auto-claim enabled (automatically assigns a premium license… if one is available)" ([Overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)). The requirement is the same whether or not the app uses Dataverse. Dataverse use also requires a standalone Power Apps plan and Dataverse capacity ([licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq)). An M365-included licence is **not** enough.
- **Admins** must turn on Settings > Product > Features > **Enable code apps** for each environment ([Overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)).

## 10. GA vs preview and production use

- **GA:** "code apps in Power Apps are now generally available" (5 Feb 2026, [blog](https://www.microsoft.com/en-us/power-platform/blog/power-apps/generally-available-host-and-run-code-apps-in-power-apps/)). The current Learn pages have no preview banner ([Overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)).
- **Still preview:** Dataverse image and file upload/download ([Connect to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)), and the `pac code` command group ([pac code](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/code)).
- **What preview means:** Microsoft says preview features "aren't GA, shouldn't be used in production, and are covered by the Preview terms of service" ([feature stages](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/working-with-experimental-preview)). That page is written for canvas apps, but it is the Power Apps definition.
- **Practical upshot:** CRUD, queries, lookups, choices and actions are fine for production. Treat file-column attachments as preview, meaning they may change and come with limited support. Use `pa`, not `pac code`. Expect the lookup developer experience to keep changing, since Microsoft says it is "actively working to make lookups easier".

## Open questions to spike

1. Can `annotation` records be created with `objectid_<table>@odata.bind` through the generated service, or does it fail because the lookup is polymorphic?
2. Can `ownerid` be reassigned with `ownerid@odata.bind` = `/systemusers(<id>)`?
3. Do customer-type lookups (`parentcustomerid`) generate and bind correctly for both account and contact?
