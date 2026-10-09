import { ThemeProvider } from "@/providers/theme-provider"
import { SonnerProvider } from "@/providers/sonner-provider"
import { QueryProvider } from "./providers/query-provider"
import { RouterProvider } from "react-router-dom"
import { router } from "@/router"
import { SalesGatewayProvider } from "@/data/gateway-provider"
import { createGateway } from "@/data/create-gateway"

const gateway = createGateway()

export default function App() {
  return (
    <ThemeProvider>
      <SonnerProvider>
        <QueryProvider>
          <SalesGatewayProvider gateway={gateway}>
            <RouterProvider router={router} />
          </SalesGatewayProvider>
        </QueryProvider>
      </SonnerProvider>
    </ThemeProvider>
  )
}
