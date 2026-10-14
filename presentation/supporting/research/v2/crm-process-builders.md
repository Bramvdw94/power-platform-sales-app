# How Dynamics 365, Salesforce and HubSpot let admins build processes and rules (issue #60)

Researched 2026-10-10 against vendor documentation: Microsoft Learn, Salesforce Help, Trailhead and Developer docs, and the HubSpot Knowledge Base. Each claim links to its source. Where the docs were silent or would not load, the gap is marked **(not in docs)** or **(inference)**.

## Answer

- **All three use the same core shape:** an ordered list of **stages** on one record field, plus per-stage **key/required fields**, plus **automation that fires on stage change** (for example, create a Task). They differ in where the gate lives and how a process is picked for a record.
- **Dynamics 365** has the richest *in-record process*: a business process flow (BPF) with stages, steps (fields), required steps that block moving on, branching, and workflows fired on stage entry or exit. A BPF is picked by **security role plus a process order**, and users can **switch process**. Business rules add if/then field logic (require, show/hide, lock, set value, error).
- **Salesforce** splits the job into separate tools. A **record type** picks the **sales process** (a subset of Stage values). **Path** shows the stages with up to 5 key fields and guidance per stage, but it **does not enforce**. **Validation rules** enforce ("Stage = Proposal AND Amount blank → error"). **Flow Builder** record-triggered flows run actions. **Dynamic Forms** shows, hides or requires fields per page using visibility rules.
- **HubSpot** is the simplest and most manager-friendly. A **pipeline** is a list of stages with win %. **Conditional stage properties** make fields required when a deal enters a stage. **Pipeline rules** block skipping stages or moving backward. **Per-stage automation** ("create and assign a task" when a deal enters a stage) is built from the board itself. Full **workflows** cover the rest. The pipeline is picked **per deal** (one pipeline field). There is no criteria-based auto-selection.
- **Versioning:** Salesforce Flow keeps **numbered versions** (one active, older ones kept). HubSpot workflows keep a **revision history with revert**. Dynamics BPFs and business rules are **edited in place** with no version history in the docs, and changed rules do not re-apply to existing records.
- **Recommendation for v2 (small team):** use **HubSpot's model with Salesforce's names**. One process = an ordered list of steps mapped to Opportunity stages. Per step: key fields (shown, as in Path), required fields (the gate, as in HubSpot conditional stage properties), guidance text, and "on enter" actions (create Task). Pick the process automatically by **simple criteria** (Lead source, Account type) with a fixed **priority order** (the D365 idea), and let a manager override it. Keep **business rules** as a separate, small if/then list (require / show / lock / error). **Snapshot the process version onto each record** so editing a process never breaks open deals.

## Side-by-side

| Aspect | Dynamics 365 (Dataverse) | Salesforce | HubSpot |
|---|---|---|---|
| **Process container** | Business process flow (BPF), one per table, up to 10 active per table; can span up to 5 tables (Lead → Opportunity) [1][2] | Sales process (subset of Stage picklist) + Path; one Path per object + record type + picklist [5][6][7] | Pipeline (ordered stages) per object; Starter 15, Pro 100–350, Ent 350 custom pipelines [10] |
| **Stages** | Up to 30 stages, each with an optional category shown as a chevron [2] | Values of the Stage picklist, filtered by sales process [7] | Stages with colour and **win probability** (feeds weighted amount); needs Won 100% / Lost 0% [10] |
| **Steps / key fields** | Up to 30 steps per stage; each step binds a column [2] | Path: up to **5 key fields** + up to 1,000 characters of **guidance** per stage [6] | Conditional stage properties: fields shown when a deal is created in or moved to a stage [10] |
| **Gates** | Required steps block **save and Next Stage**; a Two Option field must be Yes [1][2] | Path does **not** enforce. **Validation rules** (formula true → error) block the save, also via API [5][8] | Conditional property marked **Required** blocks the stage move; **pipeline rules**: no skipping, no going back, edit-lock by stage, approvals (Ent) [10][11] |
| **Branching** | Condition between stages on previous-stage steps; AND or OR (not both); max 10 levels [2] | Separate record types / sales processes; Flow decisions [7][9] | Separate pipelines; workflow branches [10][13] |
| **Actions** | On-demand workflows on **stage entry/exit**, global workflows on complete/abandon, action steps run with **Execute** [1][2] | **Record-triggered flow**: entry conditions, "only when updated to meet the condition", Create Records (for example, a Task) [9] | Per-stage automation: **create and assign task**, internal email, edit record; or a full workflow (filter/event/schedule triggers, create task, assign owner) [12][13] |
| **Field rules** | **Business rules**: condition → set/clear value, default, error, required, show/hide, enable/disable, recommendation; scope Entity / All forms / one form [3] | Validation rules + **Dynamic Forms** visibility rules (record data, user, device) and per-page required/read-only [8][14] | Conditional stage properties only; anything more needs workflows [10][13] |
| **How a process is chosen** | First active BPF the user's **security role** can see, by **process order**; user can **Switch Process** (old one kept in background) [1][2] | **Record type** chosen on create (each maps to a sales process and Path); access by profile [7][15] | User picks the **pipeline** on the deal; no auto-selection by criteria (not in docs). Workflows could set it **(inference)** |
| **Shown on record** | Stage bar at top of form, stage flyout or pinned side pane; each BPF instance is its own table row (reportable) [1] | **Path** component on the Lightning record page: chevrons, key fields, guidance, confetti [4][6] | Stage on deal record and **board (kanban) view**; required-property popup on stage move [10] |
| **Versioning** | No version history in docs; Draft vs Activated only; renaming does not update existing instances [1][2] | Flow: **numbered versions**, a new active version on deploy; a version with paused interviews can't be deleted [16] | Workflows: **revision history**, view and **revert**; undo within 30 days [17][13] |
| **Who authors** | Makers in solutions; System Administrator / Customizer get access by default; access per BPF via security role [2] | Path needs **Customize Application** or Modify All Data [4]; Flow, validation rules and Dynamic Forms are admin Setup tools | Pipelines and stage properties: **Edit property settings**; pipeline rules: **Super Admin**; workflows: Workflows edit/publish permission [10][11][13] |
| **Bypass** | n/a | Quick Create skips validation rules [8] | Super Admins, workflows and API bypass most pipeline rules [11] |

## Details per vendor

### Dynamics 365: business process flows and business rules

- **Building blocks:** Stage → Step (bound column, optional **Required**) → Condition (branch) → Workflow (stage entry/exit or global) → Action step. Limits: 30 stages, 30 steps per stage, 5 tables, branches 10 deep [2].
- **Gate:** "you must fill in the columns on those stages *before* you save the form or move to a new stage" [1]. Users can move back to a previous stage [2].
- **Choice:** The order list plus security roles give the default process. Switch Process keeps the old instance's state. A user's switch only changes their own default view. Pinning one BPF for everyone needs a form script [1].
- **Visual:** A process bar on the form. Changes made in the BPF hit the form, so business rules run right away [1].
- **Caveats:** A Stage Exit workflow on the last stage never fires [1]. BPF-backed tables can't have custom forms [1]. Enabling BPF on a custom table can't be undone [1].
- **Business rules:** Condition with AND/OR, then actions on the true and false branches. Form-only actions: required, show/hide, enable/disable, recommendation. Keep to 150 or fewer rules per table. Deactivate before editing. Updating a rule **doesn't apply it to existing records** [3].

### Salesforce: record types, Path, validation rules, Flow, Dynamic Forms

- **Process selection:** A record type ties a record to a business process (sales, lead or support lifecycle) and its picklist values. All values live in the master picklist [15][7].
- **Path:** One per object + record type + picklist. Per stage it shows up to 5 key fields, guidance and optional confetti. It is available in all main editions and works on mobile [4][6]. Path only **highlights**. Enforcement is done with validation rules.
- **Validation rules:** A formula returns true when the data is invalid. The error shows at a field or at the top of the page. Rules run on save and through the API [8].
- **Flow Builder (record-triggered):** Start element (object, created/updated), entry conditions, run "only when a record is updated to meet the condition requirements", optimize for actions, Create Records [9]. Before-save flows are fast but only update the triggering record [18].
- **Dynamic Forms:** Fields and sections are placed in Lightning App Builder, with visibility rules on record data, user or device. Fields can be made required or read-only on that page only [14].
- **Versions:** Deploying changes to an active flow makes a new active version. Inactive versions without paused interviews can be deleted [16]. The rule of one active version per flow is standard behaviour, but the pages fetched here did not say it outright.

### HubSpot: pipelines, stage requirements, pipeline rules, workflows

- **Pipelines:** Stages, win %, clone a pipeline with its rules and automations, manage access per pipeline and team [10].
- **Conditional stage properties:** In the "Conditional logic rules" column, pick a stage and its dependent properties. A property marked Required must be filled before saving. Read-only properties can't be used [10].
- **Pipeline rules (Pro/Ent):** Restrict skipping (for all or selected stages; moving to closed is still allowed), restrict moving backward, limit edits by stage, deal approval (Sales Hub Ent). Super Admin configures them. Super Admins, workflows and API can bypass them [11].
- **Stage automation:** From board view, choose a stage and open **Automate**: create and assign a task, send an internal notification, or edit a record. Each one is created as a workflow behind the scenes [12].
- **Workflows:** Filter, event, schedule or webhook triggers. Optional re-enrollment. Actions include create task and assign. Revision history with revert; reverting a workflow that is on starts running the new version right away [13][17].

## Which ideas fit a small team

1. **Stage gates as "required fields per step"** (HubSpot conditional properties / D365 required steps). One concept covers most of what validation rules do, without formulas.
2. **Key fields + guidance per step** (Salesforce Path). This is cheap and very visible on the record. It matches the v1 Salesforce lean.
3. **"On enter step" actions limited to a small set:** create Task (with assignee rule and due-in-days), set field, notify (the HubSpot templated stage automation list). Skip a general flow designer.
4. **Process chosen by criteria + priority order** (D365 order list, but driven by Lead source / Account type instead of security role). Store the chosen process on the Opportunity, allow a manager to switch it (D365 Switch Process), and keep the old progress.
5. **Optional pipeline rules:** "no skipping" and "no going back after stage X" (HubSpot). These are simple toggles that managers understand.
6. **Business rules as a separate if/then list** (D365 business rules): condition → require / show-hide / lock / set value / error. Enforce them on the server (Dataverse plug-in or flow) as well as the client, as Salesforce validation rules do via the API.
7. **Versioning:** Take Salesforce's "versions, one active". Pin each Opportunity to the process version it started on, and offer a "move to latest" option. None of the vendors make this easy for in-flight records. Dynamics edits in place, and HubSpot runs a reverted workflow at once.
8. **Avoid:** D365 multi-table BPFs and branching, Salesforce's spread of four separate tools, and record types as the selector. All three are heavy for one team.

## Sources

1. Business process flows overview, Microsoft Learn: https://learn.microsoft.com/en-us/power-automate/business-process-flows-overview
2. Create a business process flow, Microsoft Learn: https://learn.microsoft.com/en-us/power-automate/create-business-process-flow
3. Create business rules, Microsoft Learn: https://learn.microsoft.com/en-us/power-apps/maker/data-platform/data-platform-create-business-rule
4. Guide users with Path, Salesforce Help: https://help.salesforce.com/s/articleView?id=sf.path_overview.htm&type=5
5. Path / record types (sales process subset), Trailhead: https://trailhead.salesforce.com/content/learn/projects/create-an-opportunity-record-type-for-npsp/create-and-manage-stages-and-sales-processes
6. Create a Path, Salesforce Help: https://help.salesforce.com/s/articleView?id=sf.path_create.htm&type=5
7. Create and manage stages and sales processes, Trailhead: https://trailhead.salesforce.com/content/learn/projects/create-an-opportunity-record-type-for-npsp/create-and-manage-stages-and-sales-processes
8. Validation rules, Salesforce Help: https://help.salesforce.com/s/articleView?id=sf.fields_about_field_validation.htm&type=5
9. Build a record-triggered flow, Trailhead: https://trailhead.salesforce.com/content/learn/modules/record-triggered-flows/build-a-record-triggered-flow
10. Set up and customize pipelines, HubSpot KB: https://knowledge.hubspot.com/object-settings/set-up-and-customize-pipelines
11. Set up pipeline rules, HubSpot KB: https://knowledge.hubspot.com/object-settings/set-up-pipeline-rules
12. Set up pipeline automations, HubSpot KB: https://knowledge.hubspot.com/object-settings/set-up-pipeline-automations-for-objects
13. Create workflows, HubSpot KB: https://knowledge.hubspot.com/workflows/create-workflows
14. Dynamic Forms overview, Salesforce Help: https://help.salesforce.com/s/articleView?id=sf.dynamic_forms_overview.htm&type=5
15. Record types, Salesforce Help: https://help.salesforce.com/s/articleView?id=sf.customize_recordtype.htm&type=5
16. Flow metadata type (versions), Salesforce Developers: https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm
17. View workflow changes (revision history), HubSpot KB: https://knowledge.hubspot.com/workflows/view-workflow-changes
18. Before-save record-triggered flows, Salesforce Help: https://help.salesforce.com/s/articleView?id=sf.flow_concepts_trigger_record.htm&type=5

Gaps: Microsoft Learn does not say how editing an active BPF affects existing instances. Salesforce Help pages for flow version activation returned "page not found", and the profile-to-record-type assignment page did not load.
