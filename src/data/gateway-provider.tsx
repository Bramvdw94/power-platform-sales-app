import type { ReactNode } from "react"
import type { SalesGateway } from "./gateway"
import { SalesGatewayContext } from "./gateway-context"

/** Makes a sales data gateway (Dataverse, or in-memory in tests) available to pages and hooks. */
export function SalesGatewayProvider({ gateway, children }: { gateway: SalesGateway; children: ReactNode }) {
  return <SalesGatewayContext.Provider value={gateway}>{children}</SalesGatewayContext.Provider>
}
