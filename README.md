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
- [Power Platform CLI](https://learn.microsoft.com/power-platform/developer/cli/introduction) (`pac`)
- A Power Platform environment with code apps enabled

## Getting started

```bash
npm install

# Sign in and connect the app to your environment (first time only)
pac auth create
pac code init --environment <environmentId> --displayName "Sales App"

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
  implements it over `src/generated`. Methods a later ticket builds throw
  `NotAvailableYetError` naming that ticket.
- `src/components/shell/` and `src/routes.tsx`: the app shell (sidebar and top
  bar on a desktop, bottom tabs on a phone) and every route in the spec.

UI tests render with `renderWithGateway()` from `src/test/render.tsx`.

## Dataverse data sources

Generated with the npm Power Apps CLI (`pa`) into `src/generated/` and committed.
Add a table or Dataverse function with:

```bash
pa app add data-source --connector dataverse --table <logical-name>
pa app add dataverse-api --api-name <name>
```

Then wire it into `src/data/dataverse/generated-client.ts`. Tables so far:
`systemuser`, plus the `WhoAmI` function.

## Deploy

```bash
npm run build
pac code push
```
