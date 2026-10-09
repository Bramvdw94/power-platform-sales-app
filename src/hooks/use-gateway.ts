import { useContext } from "react"
import { SalesGatewayContext } from "@/data/gateway-context"
import type { SalesGateway } from "@/data/gateway"

export function useGateway(): SalesGateway {
  const gateway = useContext(SalesGatewayContext)
  if (!gateway) throw new Error("useGateway must be used within a SalesGatewayProvider")
  return gateway
}
