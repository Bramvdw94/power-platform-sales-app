import { createContext } from "react"
import type { SalesGateway } from "./gateway"

export const SalesGatewayContext = createContext<SalesGateway | null>(null)
