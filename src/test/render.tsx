import type { ReactElement } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { SalesGatewayProvider } from "@/data/gateway-provider"
import { InMemorySalesGateway, SEED_USERS, createSeededStore, type InMemorySalesStore } from "@/data/in-memory"
import type { Id } from "@/sales"

type Options = {
  /** Who is signed in; defaults to Adele Vance (a salesperson in Megan Bowen's team). */
  userId?: Id
  /** Share one store between renders, for example to sign in as another user. */
  store?: InMemorySalesStore
  now?: Date
}

/** Renders UI the way the app does, with the in-memory sales data gateway behind it. */
export function renderWithGateway(ui: ReactElement, options: Options = {}) {
  const now = options.now ?? new Date()
  const store = options.store ?? createSeededStore(now)
  const gateway = new InMemorySalesGateway(store, { userId: options.userId ?? SEED_USERS.adele.id, now: () => now })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <SalesGatewayProvider gateway={gateway}>{ui}</SalesGatewayProvider>
    </QueryClientProvider>,
  )
  return { ...result, gateway, store }
}
