import type { RouteObject } from "react-router-dom"
import { AppShell } from "@/components/shell/app-shell"
import AccountListPage from "@/pages/accounts/account-list"
import AccountRecordPage from "@/pages/accounts/account-record"
import ContactListPage from "@/pages/contacts/contact-list"
import ContactRecordPage from "@/pages/contacts/contact-record"
import HomePage from "@/pages/home"
import LeadListPage from "@/pages/leads/lead-list"
import LeadRecordPage from "@/pages/leads/lead-record"
import MenuPage from "@/pages/menu"
import NotFoundPage from "@/pages/not-found"
import OpportunityListPage from "@/pages/opportunities/opportunity-list"
import OpportunityRecordPage from "@/pages/opportunities/opportunity-record"
import PipelinePage from "@/pages/pipeline/pipeline-page"
import ProductListPage from "@/pages/products/product-list"
import ProductRecordPage from "@/pages/products/product-record"
import QuoteRecordPage from "@/pages/quotes/quote-record"
import SearchPage from "@/pages/search"

/** Every page in the spec (#23). Placeholders are replaced by the ticket they name. */
export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "pipeline", element: <PipelinePage /> },
      { path: "leads", element: <LeadListPage /> },
      { path: "leads/:id", element: <LeadRecordPage /> },
      { path: "opportunities", element: <OpportunityListPage /> },
      { path: "opportunities/:id", element: <OpportunityRecordPage /> },
      { path: "accounts", element: <AccountListPage /> },
      { path: "accounts/:id", element: <AccountRecordPage /> },
      { path: "contacts", element: <ContactListPage /> },
      { path: "contacts/:id", element: <ContactRecordPage /> },
      { path: "products", element: <ProductListPage /> },
      { path: "products/:id", element: <ProductRecordPage /> },
      { path: "quotes/:id", element: <QuoteRecordPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "menu", element: <MenuPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]
