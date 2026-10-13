# Power Platform Sales App

A sales app built as an alternative to Dynamics 365 Sales. The UI is a
[Power Apps code app](https://learn.microsoft.com/power-apps/developer/code-apps/overview)
and the data lives in Dataverse on Power Platform.

## Stack

- Vite, React and TypeScript
- `@microsoft/power-apps` SDK and the `@microsoft/power-apps-vite` plugin
- Tailwind CSS and shadcn/ui components
- React Router, TanStack Query, TanStack Table and Zustand

Scaffolded from Microsoft's
[starter template](https://github.com/microsoft/PowerAppsCodeApps/tree/main/templates/starter).

## Prerequisites

- Node.js 22 or later
- The npm Power Apps CLI (`pa`, `npm i -g @microsoft/power-apps-cli`) for data
  sources and deploys
- [Power Platform CLI](https://learn.microsoft.com/power-platform/developer/cli/introduction) (`pac`)
  for solution sync
- A Power Platform environment with code apps enabled

## Getting started

```bash
npm install

# Sign in (first time only); power.config.json already points at dev-salesapp
BROWSER=chromium pa auth login

npm run dev          # against Dataverse
npm run dev:memory   # on the in-memory seed data, no environment needed
```

`dev:memory` signs in as Adele Vance; set `VITE_SALES_USER` to `megan`,
`alex`, `diego` or `bram` (for example in `.env.memory.local`) to be someone else.

## Tests

```bash
npm test          # Vitest, once
npm run test:watch
npm run lint
npm run build     # includes the typecheck
```

Run all three before opening a pull request.

## Code layout

- `src/sales/`: the sales rules, plain TypeScript with no React or Dataverse
  imports (Lead status transitions, Stage defaults, Close and reopen, "can
  edit", Pipeline totals, Qualify matching and carry-over).
- `src/data/gateway.ts`: the `SalesGateway` interface, the one seam between
  the app and its data. Pages and hooks get it through `useGateway()`.
- `src/data/in-memory/`: the in-memory gateway with seed data (Megan Bowen
  manages Adele Vance and Alex Wilber; Diego Siciliani is outside her team),
  used by tests and local development.
- `src/data/dataverse/`: the Dataverse gateway, the only code allowed to import
  the generated Dataverse services (ESLint enforces this). It reaches Dataverse
  through a small `DataverseClient` port (`client.ts`); `generated-client.ts`
  implements it over `src/generated`.
- `src/components/shell/` and `src/routes.tsx`: the app shell (sidebar and top
  bar on a desktop, bottom tabs on a phone) and every route in the spec.

UI tests render with `renderWithGateway()` from `src/test/render.tsx`.

## Dataverse data sources

Generated with the npm Power Apps CLI (`pa`) into `src/generated/` and committed.
Add a table or Dataverse function with:

```bash
pa app add data-source --non-interactive --connector dataverse --table <logical-name>
pa app add dataverse-api --non-interactive --api-name <name>
```

Each writes `src/generated/`, `.power/schemas/` and `power.config.json`;
commit all three. `pa app find-dataverse-api --search <text>` finds an API's
exact name.

Then wire it into `src/data/dataverse/generated-client.ts`. Tables so far:
`systemuser`, `account`, `contact`, `vibe_lead` (registered as `leads`) and
`vibe_opportunity` (registered as `opportunities`), `annotation` (Notes),
`task` and `phonecall`, `vibe_product` (registered as `products`), `vibe_quota`
(registered as `quotas`), `vibe_productline` (registered as `productLines`), `vibe_quote` (`quotes`),
`vibe_quoteline` (`quoteLines`), `vibe_quotetemplate` (`quoteTemplates`),
`vibe_quotesettings` (`quoteSettings`), `vibe_process` and `vibe_processversion` (`processes`, `processVersions`: the Processes the process bar shows and the Automation page builds and publishes), `vibe_businessrule` and `vibe_engineerror` (`businessRules`, `engineErrors`: read by Publish checks and the Process page's Engine errors), `environmentvariabledefinition` and `environmentvariablevalue` (read only, for the process engine's kill switch), plus the `WhoAmI` function and the
Office 365 Outlook connector (`shared_office365`, used only to send a Quote's PDF from the
user's own mailbox; each user creates their own connection the first time they send).

The generated models list no bind key for polymorphic lookups such as a
Contact's company (`parentcustomerid`). The SDK sends the body to the Web API
as is, so the gateway binds the per-target navigation property itself
(`parentcustomerid_account@odata.bind`) and clears it by setting
`parentcustomerid_account` to null.
Notes, Tasks and Phone Calls link to their record the same way:
`objectid_<table>@odata.bind` for a Note and
`regardingobjectid_<table>_<task|phonecall>@odata.bind` for a Task or Phone
Call, where `<table>` is `vibe_lead`, `vibe_opportunity`, `account` or
`contact`.

## Deploy

```bash
npm run deploy
```

This builds and runs `pa app push` pinned to the SalesApp solution
(`f31fe92d-d5c3-f111-b377-7c1e5253a39d`); never push without the solution id,
or the app lands in the environment's preferred solution. If `pa` reports
"not signed in" right after signing in, push with the global CLI:
`PA_CLI=$(which pa) npm run deploy`.

Then bring the solution folder up to date and commit it:

```bash
cd solutions/SalesApp
pac solution sync
```

The app is **Sales App** (app id `4ef54f2e-5c41-4b99-803d-763351b2cc01`) in
dev-salesapp:
<https://apps.powerapps.com/play/e/553590c6-6bcb-e2f3-bd06-7d21eb695ff6/app/4ef54f2e-5c41-4b99-803d-763351b2cc01>

## Quote PDF, templates and Send

`python scripts/setup_quote_pdf.py` creates the Quote template and Quote settings tables and the
Quote's template lookup and Stored PDF file column; `python scripts/setup_quote_templates.py` loads
the three starter templates and the settings row from `data/quote-templates.json` (it never
overwrites what a Catalogue manager changed). The PDF is drawn in the browser by `src/lib/quote-pdf.ts`
from a plain document model (`src/sales/quote-document.ts`), so tests read the model, not PDF
bytes. Send stores the exact PDF in the Quote's file column (`vibe_storedpdf`, uploaded with the
Power Apps SDK's file upload) and, for the email route, sends it with the connector's
`SendEmailV2`. The logo is kept in Quote settings as a PNG or JPEG data URL (under 300 KB).

## Sample data

`python scripts/load_sample_data.py --apply` loads fictional demo data into
dev-salesapp and `python scripts/reset_sample_data.py --apply` removes it
again; see [docs/sample-data.md](docs/sample-data.md).
