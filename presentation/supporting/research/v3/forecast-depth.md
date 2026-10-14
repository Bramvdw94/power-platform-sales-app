# Forecast snapshots, trends, manager adjustments, stale deals, Last activity and Lead KPIs (research for issue #137)

Researched 2026-10-13. Sources are Microsoft Learn, Salesforce Help and developer docs, and the HubSpot Knowledge Base, all cited inline. I also used this repo (`solutions/SalesApp`, `plugins/SalesApp.Plugins`, `src/sales/forecast.ts`) and the earlier notes `research/v2/forecasting-dashboards.md`, `research/code-apps-dataverse.md` and `research/v3/outlook-teams.md`. I couldn't query `dev-salesapp` live because the Dataverse MCP server didn't connect. Cost rule: no Azure subscription and no card on the tenant. Nothing below needs either.

## Answer

- **What the big three do.** Live forecasts are computed from current Opportunity fields in all three. History is extra:
  - Microsoft **removed** D365 forecast snapshots, trend charts and deal flow on 2024-06-30. It tells customers to build their own daily sync instead.
  - Salesforce marks changes from the last 7 days and counts how often a close date was pushed.
  - HubSpot keeps up to a year of forecast submissions and records stage-entry dates on every record.
  - Manager adjustments in Salesforce and D365 work the same way. The adjustment sits on top of the calculated value and never changes the Opportunities. It rolls up the hierarchy, and the original value stays visible.
- **Recommendation for v3, all inside Power Apps Premium:**
  1. **Weekly Forecast snapshot**: a `vibe_forecastsnapshot` table with one row per open Opportunity per week. It holds the five audited fields plus Owner and the weighted value. One **scheduled cloud flow** writes it: Recurrence on Monday morning, then one call to a new custom API, `vibe_TakeForecastSnapshot`, in the existing C# plug-in assembly. The flow is owned by Bram, lives in the SalesApp solution and is **associated with the app**, so his Power Apps Premium covers it ([Power Automate licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/faqs)). Trend and movement views compare two snapshots in the app.
  2. **Manager adjustments** go in a `vibe_forecastadjustment` overlay table (salesperson, month, Forecast category, amount, note). Only the salesperson's manager writes it, and a guard plug-in enforces that, as for Quotas. The calculated value is always shown next to the adjusted one.
  3. **Stale deals, Last activity and Lead KPIs need no schedule.** Store a few dates and counters on the records: Last activity on, Stage entered on, Next step changed on, Push count, First touch on, Qualified on. The existing synchronous plug-in keeps them up to date. The app works out "stale" and the KPIs at read time.
  4. **Keep auditing on** as the source of truth and for a per-record History panel. Don't build lists or trends straight from audit data: you can't filter it by column, it needs one call per record, and it isn't in the SQL endpoint ([retrieve audit data](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/auditing/retrieve-audit-data)). Because auditing has been on since v2, `vibe_TakeForecastSnapshot` can **rebuild a missed week from audit history**.
- **Rejected:** rollup columns for Last activity (they run hourly at best and follow direct relationships only). Classic workflows (they can't run on a schedule). A service-principal-owned flow (needs a paid Process licence). Snapshots written only by the app when someone opens the page (they would miss weeks and depend on who logs in). That last one stays as a fallback if the flow can't be associated with a code app.

## 1. How the three CRMs do it

### Forecast snapshots

| | What exists | Cadence | What is stored |
|---|---|---|---|
| **Dynamics 365 Sales** | Deprecated. "Effective June 30, 2024, the snapshot capability in sales forecasting is deprecated. Snapshots and related charts such as deal flow, trend chart, and forecast grid history are no longer available." The alternative is the Forecast API "to set up daily data sync" ([View snapshots](https://learn.microsoft.com/en-us/dynamics365/sales/view-snapshots)). | The live forecast recalculates as a delta immediately after edits made on the Forecasts page. A full recalculation runs "at the end of every day for the current period", and past periods only recalculate manually ([recalculation methods](https://learn.microsoft.com/en-us/dynamics365/sales/forecast-recalculation-methods)). | Whatever the customer's own sync stores. |
| **Salesforce** | No forecast snapshot as such. Pipeline Inspection relies on **Historical Trending** on Opportunities, which must be turned on ([SalesforceBen guide](https://www.salesforceben.com/ultimate-guide-to-salesforce-pipeline-inspection/), secondary). The `RecentFieldChange` object shows "how an opportunity has changed in the past seven days": the old value, who changed it and when ([RecentFieldChange](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/api/sforce_api_objects_recentfieldchange.htm)). | Field history, kept continuously. | Field-level history of amount, close date, stage and forecast category. |
| **HubSpot** | **Forecast submissions**: a user or manager "submit[s] a custom forecast for the month or quarter" with a note. Past submissions are listed, and the History tab goes back "up to one year previous" ([use the forecast tool](https://knowledge.hubspot.com/forecast/use-the-forecast-tool)). | Whenever someone submits, with optional reminders set by a Super Admin. | The submitted amount, the deals included, and a note. |

In short, nobody gives you a weekly snapshot for free any more. Microsoft explicitly leaves it to a scheduled sync you build yourself.

### Trend and movement ("what changed since last week")

- **Salesforce Pipeline Inspection** highlights "the most recent changes that occurred in the past seven days". It colours changes to amount, close date, forecast category and stage green or red, and groups deals as **New, Increased, Decreased, Moved In, Moved Out**. A **push counter** shows "how many times the Opportunity Close Date has been pushed from one calendar month to the next". A waterfall chart covers created, increased, decreased, won and lost ([SalesforceBen guide](https://www.salesforceben.com/ultimate-guide-to-salesforce-pipeline-inspection/), secondary).
- **HubSpot**: in a user's drill-down, green or red dots show whether a deal's stage moved forward or back in the date range, and carets show whether the weighted amount went up or down ([use the forecast tool](https://knowledge.hubspot.com/forecast/use-the-forecast-tool)). Every deal has "Date entered current stage", "Time in current stage" and cumulative time per stage ([default deal properties](https://knowledge.hubspot.com/properties/hubspots-default-deal-properties)).
- **D365**: the trend chart and deal flow went with the snapshots in 2024 (see above).

### Manager adjustments

| | Who can adjust | How it rolls up | Is the original visible? |
|---|---|---|---|
| **Salesforce** | The admin chooses: managers adjust subordinates one level down, users adjust their own forecast, or both. Only Best Case and Commit can be adjusted. | Lower-level adjustments roll up. When both have adjusted, "only the manager's adjustment rolls up the forecast hierarchy". A manager's adjustment isn't shown on the subordinate's own page. | Yes. Hovering shows the original value, and "An adjustment doesn't change the underlying gross rollup and doesn't appear in reports" ([forecast adjustments](https://help.salesforce.com/s/articleView?id=sales.forecasts3_adjustments_overview.htm&type=5)). Manager and owner adjustments are separate objects, `ForecastingAdjustment` and `ForecastingOwnerAdjustment` ([ForecastingAdjustment](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_forecastingadjustment.htm)). |
| **D365** | "Sales managers have the ability to adjust their own or a direct report's forecast", but never anyone above them. Only columns the forecast owner marked **Allow adjustments** can be adjusted. | "On saving the adjustment, the changes will be rolled up to the parent record and up the hierarchy." Rows above see an *indirect adjustment*. | The adjust dialog shows the system-calculated value. **Reset** rolls back to it and requires a note. A **History** tab lists every adjustment ([adjust values](https://learn.microsoft.com/en-gb/dynamics365/sales/adjust-values-in-forecast)). |
| **HubSpot** | No separate adjustment. A manager submits a forecast for a user or for the team. | The team's submission is "the sum of forecast submissions for your team", or the sum of user submissions when there is no team submission ([use the forecast tool](https://knowledge.hubspot.com/forecast/use-the-forecast-tool)). | Submissions are listed over time. |

### Stale deals

- **Salesforce**: a red clock shows when Next Step "has not been updated in seven days or more". Deal Insights flags deals stuck in a stage or with "not enough activities". The push counter and days in stage add to the picture ([SalesforceBen guide](https://www.salesforceben.com/ultimate-guide-to-salesforce-pipeline-inspection/), secondary).
- **HubSpot**: the system property **Is Stalled After Timestamp** is the "timestamp when Time in stage became 20% longer than the deal owner's closed-won average for that stage". Next activity date and Last activity date are also there for filters ([default deal properties](https://knowledge.hubspot.com/properties/hubspots-default-deal-properties)).
- **D365**: I found no stale-deal list in the forecasting docs. Not checked further.

### Last activity date on Accounts

- **Salesforce** `Account.LastActivityDate` is, as I remember it, the most recent of the latest event's due date and the latest *closed* task's due date. The object reference page didn't render here, so treat that wording as **unverified**.
- **HubSpot** has a Last Activity Date on contacts, companies, deals and leads. It is "the most recent already past date and time" of a logged note, call, email, meeting or completed task, set from the activity's own date ([default deal properties](https://knowledge.hubspot.com/properties/hubspots-default-deal-properties), [default lead properties](https://knowledge.hubspot.com/properties/hubspots-default-lead-properties)). In 2025 HubSpot announced it would count only *completed* tasks, then paused and cancelled the change ([changelog](https://developers.hubspot.com/changelog/updates-to-next-activity-and-last-activity-property-groups)).
- **Dataverse** has no such column on `account`. A rollup column could compute a MAX over activities, but only over direct relationships ([rollup columns](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/define-rollup-fields)). That misses most of our **Related activity** (Contacts', Opportunities' and the originating Lead's).

### Lead KPIs

HubSpot's lead object carries the KPI fields directly ([default lead properties](https://knowledge.hubspot.com/properties/hubspots-default-lead-properties)):
- **Time to First Touch** ("the time between lead creation and first outreach activity") and **First Outreach Date**.
- **Date entered / exited** and **latest / cumulative time** per stage.
- **Disqualification Reason** with a note.
- Last Activity Date and Next Activity Date.

There is no time-to-qualify property, but it can be worked out from the create date and "date entered" for the qualified stage. Salesforce and D365 leave Lead KPIs to reports. I didn't dig into those.

## 2. How to store and compute each one in plain Dataverse

### Tools available, and which to use for what

| Tool | Runs when | Cost under our licences | Use it for |
|---|---|---|---|
| **Synchronous plug-in** (the existing assembly) | On every save, in the same transaction | Included. Custom tables and server logic are covered by Power Apps Premium | Derived dates and counters on records: Last activity on, Push count, Stage entered on and similar |
| **Custom API** in the same assembly | When called by the app or a flow | Included | `vibe_TakeForecastSnapshot`. Unbound actions are callable from the code app ([code apps research](../code-apps-dataverse.md)) |
| **Scheduled cloud flow** (Recurrence trigger) | On a clock | Included **only if** the flow supports the app, is associated with it, and its owner has Power Apps Premium. "Automated and scheduled flows always run in the context of the flow owner." The limit is 40,000 Power Platform requests per day per Premium licence. A service-principal owner outside D365 needs a Process licence, which is paid ([licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/faqs)) | The weekly snapshot trigger only. That's 2 requests a week |
| Rollup column | Async system job, at least hourly. The mass job runs 12 h after a definition change | Included | Not used: too slow, and limited to direct relationships ([rollup columns](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/define-rollup-fields)) |
| Classic background workflow | On events. "Run on a schedule" is **No** | Included | Not used. Microsoft says to "use the recurrence trigger" in Power Automate instead ([replace workflows with flows](https://learn.microsoft.com/en-us/power-automate/replace-workflows-with-flows)) |
| Dataverse auditing (on since v2 for Stage, Estimated value, Expected close date, Probability and Forecast category) | Every change | Uses **log capacity**. Retention is Forever by default ([manage auditing](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing)) | History panel on a record, rebuilding missed snapshots, and an audit trail |

### What auditing can and can't do for us

- **Can:** `RetrieveRecordChangeHistory` returns one record's full history and `RetrieveAttributeChangeHistory` one column's history, with old and new values. The `audits` entity set can be filtered by table, operation, action and `createdon`. Users need `prvReadRecordAuditHistory` and `prvReadAuditSummary` ([retrieve audit data](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/auditing/retrieve-audit-data)).
- **Can't:**
  - There's no supported filter on *which column* changed ("Don't use this data" for `AttributeMask`/`ChangeData`).
  - The change-history functions take one Target record at a time.
  - Audit data isn't in the TDS (SQL) endpoint.
  - It joins only to `systemuser`.
  - Logs "might show up with a delay" because they live in log storage ([manage auditing](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing)).
- **So:** use audit data for one record at a time (the History panel) and for backfills run on the server. Don't use it for team-wide lists or trends. Rebuilding last week's forecast from audit data means one call per changed Opportunity. That's fine in a plug-in for a small team, but too slow for every page load.

### 2.1 Forecast snapshots

- **Table `vibe_forecastsnapshot`** (one row per Opportunity per week): snapshot date (Monday), Opportunity, Owner, Stage, Estimated value, Expected close date, Probability, Forecast category (stored as the effective category, using the same default rule as `effectiveForecastCategory` in `src/sales/forecast.ts`), weighted value, and open/won/lost.
  - Include Opportunities closed since the previous snapshot, so Won and Lost movement is visible.
  - Owner-level read security, like Opportunities.
  - A rough size estimate: 200 open Opportunities × 52 weeks is about 10,000 small rows a year, which is a few MB of database capacity.
- **Why one row per Opportunity rather than per-salesperson totals:** any total (by month, category, person or team) can be rebuilt from these rows, and movement views need deal-level rows anyway. Code apps have no FetchXML, so aggregation happens in the app ([code apps research](../code-apps-dataverse.md)). That's fine at this volume.
- **Writer:** the custom API `vibe_TakeForecastSnapshot(date?)`.
  - It is idempotent: if rows for that Monday already exist, it does nothing.
  - Given a past date, it rebuilds values as of that date. It starts from the current values and undoes changes made after the date, using audit history. This only works back to when auditing was switched on in v2.
- **Trigger:** a scheduled flow (Recurrence, Monday 06:00, Europe/Amsterdam) with one "Perform an unbound action" step. It is owned by Bram, lives in the SalesApp solution and is associated with the app.
- **Fallback:** if the flow can't be associated with a code app (see Open points), the Forecast page calls the same custom API when it opens and finds no snapshot for this week. The backfill fills any gap with values as of Monday, so the data stays correct even when nobody opened the page that week.

### 2.2 Trend and movement views

- **Forecast trend:** for each of the last N snapshots, total the Commit, Best case, Pipeline and weighted values for the chosen period, and plot them against the Quota.
- **Movement since last week:** compare this week's snapshot with last week's per Opportunity, using Salesforce's buckets:
  - **New**: not in last week's snapshot.
  - **Increased / Decreased**: Estimated value went up or down.
  - **Moved in / Moved out**: Expected close date entered or left the period.
  - **Category changed**: for example Best case to Commit.
  - **Won / Lost**.
  - Show each with old → new values.
- **Per-record History panel:** `RetrieveRecordChangeHistory` on the Opportunity page, limited to the five audited fields.
- **Push count:** new column `vibe_PushCount` on Opportunity. The plug-in adds 1 when an update moves Expected close date into a *later month*. This follows Salesforce's definition.

### 2.3 Manager adjustments

- **Table `vibe_forecastadjustment`:** salesperson, month, Forecast category (Commit or Best case, as in Salesforce), adjusted amount, note, plus the standard created by and created on.
  - Never update a row; add a new one for each change. The latest row wins, and the earlier rows are the History tab D365 has.
  - A **Reset** is a row with no amount.
- **Rules:**
  - Only the salesperson's manager may adjust, the same rule as Quota.
  - The salesperson sees the adjustment (unlike Salesforce) but can't change it.
  - Visibility is the same as Quota: only the salesperson and their manager.
  - A guard plug-in enforces all of this, following the existing `QuotaGuardPlugin`.
- **Roll-up:** a manager's team figure is the sum of each report's *adjusted* figure, or the calculated one where there is no adjustment. The manager's own manager may adjust the team figure again, as D365 does.
- **Display:** the adjusted figure has a marker. Hover or expand to see the calculated figure, who adjusted it, when and the note. Adjustments never change Opportunities, Forecast categories or the calculated totals.
- **No owner adjustments in v3:** the Owner already gives their judgement per deal through Forecast category and Probability.

### 2.4 Stale deals

Computed in the app from columns. No schedule is needed, because staleness depends on today's date. An open Opportunity is stale when any of these hold, each with its reason shown:
- **No activity for N days**, from Last activity on (2.5). Default 14 days.
- **Expected close date in the past.**
- **Next step not changed for 7+ days**, using a new `vibe_NextStepChangedOn` set by the plug-in. This is Salesforce's clock.
- **In the same Stage for more than X days**, using a new `vibe_StageEnteredOn` set by the plug-in.
  - Opportunities on a Process already have `vibe_StepEnteredOn`, but a Stage can span several Steps, and Opportunities without a Process have no such date.
  - HubSpot's "20% longer than the Owner's won average" could come later, once there's enough closed history.

Show these as a list on Home and as a badge on the Pipeline board.

### 2.5 Last activity on Accounts

- **New column `vibe_LastActivityOn`** on Account, and also on Opportunity, Lead and Contact. Set it with new synchronous plug-in steps on Task, Phone Call and Note create and update:
  - A completed Task counts on its completion date.
  - A Phone Call counts on its actual date once it is logged, not while it is only planned.
  - A Note counts on its created date.
  - Only move the date forward.
- **Account propagation follows the glossary's Related activity:** an activity on one of the Account's current Contacts, on one of its Opportunities, or on the Lead such an Opportunity was qualified from also updates the Account.
- **On delete:** recalculate that record's date from its remaining activities.
- **Backfill:** a one-off script sets the value for existing records.
- **Why not rollup columns:** they update hourly at best, follow only direct relationships, and Activity Party rollups count parties, not our Related activity paths.

### 2.6 Lead KPIs

New Lead columns, set by the plug-in or the app's Qualify step:
- **`vibe_FirstTouchOn`**: the first completed Phone Call or Task on the Lead, or the first change from Not Contacted to Working, whichever comes first.
- **`vibe_QualifiedOn`**: set on Qualify. Today only `vibe_DisqualifiedOn` exists. You could also take it from the created on of the Opportunity whose Originating Lead is this Lead.

KPIs, computed in the app per month or quarter and per Owner and Lead source:
- New Leads.
- **Time to first touch**: median of FirstTouchOn − created on.
- **Not Contacted older than 2 days**: a stale-Lead list.
- **Qualify rate**: Qualified ÷ (Qualified + Disqualified) for Leads closed in the period.
- **Time to qualify.**
- Disqualify reasons breakdown.
- Open Lead age.
- **Lead-to-won rate**: Leads whose Opportunity was Closed Won.

## Open points

- **Can a scheduled flow be associated with a code app?** The licensing FAQ says to associate it "by using a PowerShell script" or "from the Power Automate portal". I didn't verify that code apps appear in that picker. If they don't, use the app-triggered fallback in 2.1, or check whether Bram's own Power Automate rights cover it.
- **Calling `RetrieveRecordChangeHistory` from the code app.** Its Target parameter is an entity reference, and polymorphic shapes are a known code-app weak spot. If it fails, put it behind a small custom API, for example `vibe_GetOpportunityHistory`, in the plug-in.
- **Audit read privileges** (`prvReadRecordAuditHistory`, `prvReadAuditSummary`) must be added to the sales role. Check whether that lets salespeople see history of records they can't read; I didn't verify this.
- **Log and database capacity:** check the tenant's figures under Power Platform admin center > Resources > Capacity. The docs only state the default environment's 1 GB log and 3 GB database ([capacity](https://learn.microsoft.com/en-us/power-platform/admin/capacity-storage)). `dev-salesapp` isn't the default environment.
- **Rebuilding a snapshot from audit data** depends on the audit start date in `dev-salesapp`. Weeks before auditing was switched on can't be rebuilt, so start the flow early, as the v2 note already said.
- **Salesforce `LastActivityDate` wording** is unverified (the page didn't render).
- **Glossary terms to add** once decided: Forecast snapshot, Adjustment, Stale (deal), Last activity, First touch, Push count.
