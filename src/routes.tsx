import type { RouteObject } from "react-router-dom"
import { AppShell } from "@/components/shell/app-shell"
import AccountListPage from "@/pages/accounts/account-list"
import AccountRecordPage from "@/pages/accounts/account-record"
import ContactListPage from "@/pages/contacts/contact-list"
import ContactRecordPage from "@/pages/contacts/contact-record"
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
      { path: "accounts", element: <AccountListPage /> },
      { path: "accounts/:id", element: <AccountRecordPage /> },
      { path: "contacts", element: <ContactListPage /> },
      { path: "contacts/:id", element: <ContactRecordPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "menu", element: <MenuPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]
