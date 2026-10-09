import type { RouteObject } from "react-router-dom"
import { AppShell } from "@/components/shell/app-shell"
import HomePage from "@/pages/home"
import MenuPage from "@/pages/menu"
import NotFoundPage from "@/pages/not-found"
import { ListPlaceholder, PlaceholderPage, RecordPlaceholder } from "@/pages/placeholder"
import SearchPage from "@/pages/search"

/** Every page in the spec (#23). Placeholders are replaced by the ticket they name. */
export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "pipeline", element: <PlaceholderPage title="Pipeline" ticket="#32" /> },
      { path: "leads", element: <ListPlaceholder title="Leads" ticket="#29" /> },
      { path: "leads/:id", element: <RecordPlaceholder title="Lead" ticket="#29" /> },
      { path: "opportunities", element: <ListPlaceholder title="Opportunities" ticket="#30" /> },
      { path: "opportunities/:id", element: <RecordPlaceholder title="Opportunity" ticket="#30" /> },
      { path: "accounts", element: <ListPlaceholder title="Accounts" ticket="#28" /> },
      { path: "accounts/:id", element: <RecordPlaceholder title="Account" ticket="#28" /> },
      { path: "contacts", element: <ListPlaceholder title="Contacts" ticket="#28" /> },
      { path: "contacts/:id", element: <RecordPlaceholder title="Contact" ticket="#28" /> },
      { path: "search", element: <SearchPage /> },
      { path: "menu", element: <MenuPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]
