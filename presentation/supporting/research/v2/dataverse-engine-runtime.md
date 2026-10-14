# Running manager-built processes and rules server-side in Dataverse (research for issue #59)

Researched 2026-10-10 against Microsoft Learn (primary) plus one vendor blog where Learn was silent. Context: Power Apps code app (React/Vite/TS) on Dataverse env `dev-salesapp`, custom `vibe_` tables in unmanaged solution `SalesApp`, no D365 Sales tables. v2 lets managers author **processes** (steps mapped to Opportunity stages, gates, actions such as "create a Task") and **business rules** (condition on a field such as Lead source -> make required / set value / show warning) **as data**, inside the app, with no per-rule Power Platform customisation.

## Answer

- **Recommendation: a hybrid "shared rule interpreter".** Store definitions as rows in `vibe_` tables (with a compiled JSON column for fast reads). Evaluate them in **two places from one spec**:
  1. **In the code app (TypeScript)** for instant UX: show required markers, set values, warnings, gate status while the user edits.
  2. **In one generic C# plug-in** (a plug-in package, registered once, shipped in `SalesApp`) on `Create`/`Update` of the governed tables (Opportunity, Lead, ...) that re-evaluates the same definitions **server-side** and blocks invalid saves / applies set-value rules (**PreOperation, synchronous**), plus a **PostOperation async** step (or a custom API) for side-effect actions like creating Tasks.
  3. Optionally a **custom API** (e.g. `vibe_AdvanceStage`, `vibe_EvaluateRules`) so stage moves and "dry-run" checks run atomically on the server and the code app calls them as typed services.
- **Why:** only a synchronous plug-in runs inside the Dataverse transaction for *every* client (code app, Web API, Excel/import, flows, other apps) and can cancel the save. Everything else is either client-only (code app), asynchronous and after-the-fact (Power Automate), still preview (Power Fx low-code plug-ins / functions), or requires a schema customisation per process (native BPFs and business rules) that contradicts "authored in the app".
- **Key facts:**
  - Hard **2-minute limit** for the whole message operation, including all sync and async plug-ins; exceeding it throws and rolls back. Microsoft advises keeping plug-in logic under ~2 s ([analyze performance](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/analyze-performance)).
  - Exceptions in synchronous stages roll back the whole transaction; PreValidation is for cancelling, PreOperation for changing values, PostOperation async runs outside the transaction ([event framework](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/event-framework)).
  - **Low-code (Power Fx) plug-ins and Dataverse functions are both still preview** ("aren't meant for production use"); instant low-code plug-ins are "deprioritized" ([low-code plug-ins](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/low-code-plug-ins), [functions](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/functions-overview)).
  - Native **BPF definitions must be built in the designer**; each activated BPF creates its own custom instance table (`<prefix>_<uniquename>`), max 10 active BPFs per table by default, 30 stages, 30 steps/stage ([BPFs in code](https://learn.microsoft.com/en-us/power-automate/developer/business-process-flows-code)). Not viable when our own UI is the authoring surface.

## 1. Requirements the runtime must meet

| Need | Implication |
|---|---|
| Rule holds for every client (code app, Web API, data import, flows) | Must run inside Dataverse's event pipeline, synchronously, to block |
| Managers change rules without a deployment | Logic must be a **generic interpreter** that reads definitions at runtime; no per-rule code or metadata |
| Actions (create Task, set field, notify) | Side effects; ideally after commit (async) or atomic with a stage move |
| Client-ready ALM | Everything in solution `SalesApp`, promoted dev -> test -> prod as managed; definitions moved as data (or seeded) |
| UX | Instant feedback in the form without a round trip per keystroke |

## 2. Options

### 2.1 C# plug-ins (generic interpreter)

**How it works.** One `IPlugin` class registered on `Create` and `Update` of each governed table. On execute it loads the active rule/process definitions for that table (from `vibe_` tables or a JSON column), merges `Target` with a PreImage, evaluates conditions, and either throws `InvalidPluginExecutionException` (block with a manager-written message), writes values into `Target` (set value), or queues actions.

- **Stages** ([event framework](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/event-framework)):
  - *PreValidation (10)*: before security checks; Microsoft's recommended place to **cancel**. Runs outside the transaction for the initial operation, so it's cheap to reject.
  - *PreOperation (20)*: inside the transaction; the place to **change values** (set-value / default rules). "Avoid cancelling an operation here" because rollback is costly.
  - *PostOperation (40)*: inside the transaction when sync; outside it when **async** (only PostOperation can be async). Use for side effects (create Task). Don't update the same row here; it triggers a new Update.
  - Practical split: required/validation/gate rules in PreValidation or PreOperation; set-value in PreOperation; actions in PostOperation async (or sync if the Task must exist atomically with the stage change).
- **Sync vs async.** Sync = blocks, transactional, counts against the user's request time. Async = runs via the asynchronous service after commit, retried by the platform, user doesn't wait, cannot block the save.
- **Sandbox limits.** Plug-ins run isolated with CPU/memory/handle limits; Dataverse kills a process that exceeds them ([analyze performance](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/analyze-performance)). Must be stateless (no instance fields; not thread-safe), no parallelism/multithreading, no `ExecuteMultiple`/`ExecuteTransaction` inside plug-ins, use `ITracingService` ([best practices](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/best-practices/business-logic/)).
- **2-minute timeout** covers the whole message including all plug-ins; exceeding it rolls everything back ([analyze performance](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/analyze-performance)).
- **Dependent assemblies.** Target **.NET Framework (net462)**. A **plug-in package** (NuGet, stored in `PluginPackage`) bundles dependencies such as a JSON library or a rule-expression library; signing not required for packages; ILMerge is not supported; SDK-style project required; avoid depending on the sandbox's `System.Text.Json` version (ship your own); 16 MB per assembly; custom workflow activities not supported in packages ([build and package](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/build-and-package)).
- **Registration and ALM.** Register with the Plug-in Registration Tool or Power Platform Tools; registrations land in the Default Solution and the assembly **and each step must be added to `SalesApp` separately**. Secure configuration is not exported with solutions; use filtering attributes (never the primary key) and limit image columns ([register plug-in](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in)). Keep each assembly in one solution ([best practices](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/best-practices/business-logic/)). Once deployed, the plug-in itself rarely changes; managers change rows.
- **Reading definitions at runtime.** `IOrganizationService.RetrieveMultiple` against `vibe_businessrule` / `vibe_processdefinition` filtered by table + active, or one row with a compiled JSON column. Note: the "no caching state in instance fields" rule means caching must be done carefully (static cache keyed on a definition version / `modifiedon`, tolerant of recycled workers) or not at all; one indexed query per save is usually fine.
- **Enforces for every client:** **Yes**, including Web API, imports and flows, because the platform invokes it for every `Create`/`Update` message.
- **Performance:** good if registration is narrow (filtering attributes, minimal images) and definitions are read with one query. Adds latency to every save on governed tables.
- **Licensing:** no extra licence; plug-ins are part of Dataverse. (End users already need Power Apps Premium for code apps; see [code-apps-dataverse.md](../code-apps-dataverse.md).)
- **Fit:** best. Professional, testable (unit tests with a fake context), source-controlled, one-time Power Platform deployment. Cost: a C#/.NET Framework skill set and a build pipeline next to the TS app.

### 2.2 Custom APIs

**How it works.** Define a new message (e.g. `vibe_AdvanceStage(OpportunityId, TargetStageId)` or `vibe_EvaluateRules(Table, RecordJson)`), backed by a plug-in as its main operation (stage 30) ([custom API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/custom-api)).

- Action (POST, can change data) vs function (GET, read-only, 32 KB URL limit); can't switch later. Binding: Global, Entity (implicit `Target`) or EntityCollection. Processing step type "None" stops anyone else hooking in; "Sync and Async" lets others extend.
- **Solution-aware:** custom API, its request/response parameters and plug-in type travel in the solution; ship managed with *Is Customizable = false*.
- **Code app can call it:** code apps support Dataverse actions/functions via `pa app add dataverse-api --api-name X`, which generates a typed service ([actions/functions](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-dataverse-action-function); see also [Inogic, May 2026](https://www.inogic.com/blog/2026/05/calling-dataverse-actions-functions-from-power-apps-code-apps/)).
- **Enforces for every client:** **No on its own** — only callers that use the API go through it. A user editing `vibe_stage` directly via Web API or import bypasses it. Pair it with the plug-in on Update (or lock the stage column so only the API path can change it).
- **Use for:** atomic, server-side operations (stage advance with gate checks + create Tasks in one transaction), dry-run "what would block this?" checks, and returning evaluation results to the UI.
- Same 2-minute/sandbox limits and licensing as plug-ins.

### 2.3 Low-code Power Fx plug-ins / Dataverse functions

- **Status: preview** ("Preview features aren't meant for production use"). Instant low-code plug-ins are "deprioritized" and replaced by **functions (preview)** ([low-code plug-ins](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/low-code-plug-ins), [functions](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/functions-overview)).
- **Automated** low-code plug-ins run on a table event with a configurable stage; **functions** are manually invoked (canvas/custom page/flow) with simple scalar parameters (Boolean, String, Float, Decimal, DateTime, Integer) and up to five referenced tables.
- Known issues: same ~2-minute ceiling, recursion when `Patch`ing the same table in post-operation, APIM auth that "expires" until the plug-in is re-saved ([tips](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/low-code-plug-ins-tips)).
- **Reading a JSON definition:** possible in principle (`LookUp` the definition row, `ParseJSON`), but writing a general rule interpreter in Power Fx is awkward and hard to test.
- **Enforces for every client:** an automated one does fire on the table event, but preview status rules it out for a client-ready product.
- **Fit:** solution-aware, but preview + operational quirks = **not recommended** now. Revisit when GA.

### 2.4 Power Automate cloud flows

- Dataverse trigger "When a row is added, modified or deleted" runs **after the change is saved**; each update can produce a run; filtering by columns and OData row filter; run-as flow owner / row owner / modifying user ([trigger docs](https://learn.microsoft.com/en-us/power-automate/dataverse/create-update-delete-trigger)).
- **Enforces for every client:** fires for every client, but **cannot block or validate** — it is asynchronous and outside the transaction. Can only react (create Task, notify, fix up values afterwards, which causes a second update and visible lag).
- **Reading definitions:** a generic flow can `List rows` of definitions and loop, but expression-based interpretation of arbitrary conditions is clumsy, slow (per-action latency) and hard to version/test.
- **Licensing:** Power Apps licences include flows only "within the context of the app" ([licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq)); otherwise Power Automate Premium per user or a **Process** licence per flow (flow must be in a solution) ([licence types](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/types)). Connection references must be configured per environment.
- **Fit:** acceptable for **non-critical, after-the-fact actions** (e.g. email notifications), solution-aware via connection references. Not for rules or gates.

### 2.5 Code app only (TypeScript interpreter)

- Evaluates JSON definitions in the browser; best UX (instant), simplest stack, no .NET.
- **Enforces for every client: No.** Any Web API call, Excel import, flow or other app bypasses it; a user with table privileges can write invalid data directly. Even in the app, a race or a bug in one screen can skip a check.
- Actions (create Task) run as the user from the browser: not atomic with the save, lost if the tab closes mid-sequence.
- **Fit:** fine for a prototype or for UX-only hints; **not a client-ready guarantee** for gates and required fields. Keep it as the UX layer of the hybrid.

### 2.6 Reusing native BPFs and business rules

**How Dynamics stores them.**
- `workflow` table holds all process definitions; `category` 2 = Business Rule, 3 = Action, 4 = Business Process Flow, 5 = Modern Flow; `xaml` holds the definition, `clientdata` the client-side translation ([workflow reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/workflow)).
- BPF stages live in `processstage`. Each **activated BPF gets its own custom table** `<activesolutionprefix>_<uniquename>` for instances, with `activestageid` and `traversedpath`; `RetrieveProcessInstances` / `RetrieveActivePath` read them; `SetProcess` can no longer switch processes ([BPFs in code](https://learn.microsoft.com/en-us/power-automate/developer/business-process-flows-code)). D365 Sales' opportunity sales process is just one such BPF (`opportunitysalesprocess`).

**Viability with our own authoring UI.**
- **BPFs: no.** Microsoft: "Use the visual business process flow designer to define a business process flow." Only instances (not definitions) are documented as code-creatable. Each new process would create a new table (schema change, solution component, needs publish and an ALM decision), capped at 10 active per table by default, and the BPF control renders only in model-driven forms — our code app would need to re-render it anyway. Hand-writing `xaml` is unsupported.
- **Business rules: no.** Authoring is designer-only (XAML generated by the designer); entity-scope rules have a server component ("XAML generated as synchronous plugins") but the action set is limited (set/clear value, default, error; required-level/show/hide are form-only), not supported for multi-select choices/file columns, recommended max 150 per table, and the doc itself is contradictory about whether they run in Dataverse ([business rules](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/data-platform-create-business-rule)). Generating them from our UI would mean our app performs metadata customisation at runtime: the opposite of "no backend work", and it would create unmanaged layers on top of a managed solution in prod.
- **Takeaway:** borrow the *data model* idea (definition + stages + per-record instance with active stage and traversed path) in our own `vibe_` tables, not the native components.

## 3. Side-by-side

| | C# plug-in (generic) | Custom API | Low-code Power Fx plug-in / function | Power Automate flow | Code app only | Native BPF / business rule |
|---|---|---|---|---|---|---|
| Blocks invalid save for every client | **Yes** (sync Pre-stage) | Only for callers of the API | Automated: yes (preview) | **No** (async, after save) | **No** | Business rule (entity scope): partly; BPF: no hard gate server-side |
| Reads JSON/table definitions at runtime | Yes, `RetrieveMultiple` + JSON lib in package | Yes (same plug-in code) | Possible (`LookUp` + `ParseJSON`), awkward | Possible (List rows + loops), clumsy | Yes, natively in TS | **No**: definitions are designer-made metadata |
| Side-effect actions (create Task) | Yes (PostOp async or sync) | Yes, atomic with operation | Yes | Yes (its strength) | Yes, non-atomic | BPF: via flows/workflows only |
| Performance | ms per save if narrow; 2-min hard cap | Same | Same cap; extra Power Fx/APIM overhead | Seconds-to-minutes lag | Instant | Good, but limits (10 BPFs, 150 rules) |
| Status | GA | GA | **Preview** | GA | GA (code apps GA Feb 2026) | GA |
| Licensing | Included in Dataverse | Included | Included (preview) | In-context Power Apps rights, else PA Premium / Process | Power Apps Premium (already needed) | Included |
| Solution / ALM | Assembly + steps in `SalesApp`; one-time deploy | API + params in `SalesApp` | Solution-aware; quirks | Flow + connection refs in solution | App in solution | Each process/rule is a customisation; conflicts with in-app authoring |
| Skills | C#/.NET Framework 4.6.2 | Same | Power Fx | Low-code | TypeScript | Maker |
| Verdict | **Core enforcement** | **For stage moves / dry runs** | Wait for GA | Notifications only | **UX layer** | Don't reuse |

## 4. Recommended architecture (concrete)

1. **Definition tables** (in `SalesApp`): `vibe_process` (table, version, active), `vibe_processstep` (maps to Opportunity stage, order), `vibe_gate` (condition JSON), `vibe_processaction` (type, parameters JSON), `vibe_businessrule` (table, condition JSON, effect: required/setvalue/warning, message), plus per-record instance state on the record or a `vibe_processinstance` table (active step, traversed path) — mirroring the BPF instance model. Optionally a published/compiled JSON snapshot per table+version so the plug-in reads one row.
2. **One shared rule spec** (a small JSON condition grammar: field, operator, value, and/or), implemented twice — TS in the app, C# in the plug-in — with a **shared golden test suite** (same JSON fixtures run in Vitest and in the C# unit tests) so behaviour cannot drift.
3. **Plug-in package `Vibe.SalesApp.Engine`** registered on Create/Update of governed tables: PreValidation/PreOperation sync for required + gates + set value; PostOperation async for actions. Filtering attributes scoped to fields that rules reference (accept that new rules on unlisted fields need either a broad registration or a re-registration step; broad on a handful of tables is acceptable).
4. **Custom API `vibe_AdvanceStage`** (action, Entity-bound to opportunity) for gate-checked stage moves + Task creation atomically; code app calls it via `pa app add dataverse-api`. Lock the stage column against direct writes by having the Update plug-in reject stage changes that did not come through the API (check `ParentContext`/a shared variable).
5. **Warnings** (non-blocking) stay client-side in the code app; the server ignores or logs them.
6. **ALM:** plug-in package, steps and custom API in `SalesApp`, built in CI, exported managed to test/prod. Process/rule *definitions* are data: migrate with the Configuration Migration tool / a seed script, or let managers author per environment.
7. **Power Automate** only for optional notifications; no Power Fx plug-ins until GA.

Caveat for the project premise ("no Power Platform backend work"): the plug-in and custom API are a **one-time** backend component; after that, managers' processes and rules are pure data. There is no supported way to enforce rules for every client without some server-side component.

## Sources

- Analyze plug-in performance (2-minute limit, resource limits): https://learn.microsoft.com/en-us/power-apps/developer/data-platform/analyze-performance
- Event framework (stages, transactions, sync/async): https://learn.microsoft.com/en-us/power-apps/developer/data-platform/event-framework
- Build and package plug-ins (dependent assemblies, net462, 16 MB): https://learn.microsoft.com/en-us/power-apps/developer/data-platform/build-and-package
- Register a plug-in (solutions, steps, secure config, filtering attributes, images): https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in
- Business logic best practices: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/best-practices/business-logic/
- Custom APIs: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/custom-api
- Code apps: Dataverse actions and functions: https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-dataverse-action-function
- Code apps overview (licensing): https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview
- Inogic, "Calling Dataverse Actions and Functions from Power Apps Code Apps" (May 2026): https://www.inogic.com/blog/2026/05/calling-dataverse-actions-functions-from-power-apps-code-apps/
- Low-code plug-ins (preview): https://learn.microsoft.com/en-us/power-apps/maker/data-platform/low-code-plug-ins
- Low-code plug-ins tips and known issues: https://learn.microsoft.com/en-us/power-apps/maker/data-platform/low-code-plug-ins-tips
- Functions in Dataverse (preview): https://learn.microsoft.com/en-us/power-apps/maker/data-platform/functions-overview
- Dataverse flow trigger: https://learn.microsoft.com/en-us/power-automate/dataverse/create-update-delete-trigger
- Power Automate licence types: https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/types
- Power Apps / Power Automate licensing FAQ: https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq
- Workflow table reference (category, xaml, clientdata): https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/workflow
- Work with business process flows using code: https://learn.microsoft.com/en-us/power-automate/developer/business-process-flows-code
- Create business rules: https://learn.microsoft.com/en-us/power-apps/maker/data-platform/data-platform-create-business-rule
- Related project note: ../code-apps-dataverse.md (code apps GA, licensing, actions support)
