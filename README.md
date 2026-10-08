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

npm run dev
```

## Deploy

```bash
npm run build
pac code push
```
