import { describe, expect, it } from "vitest"
import { createGateway } from "./create-gateway"
import { DataverseSalesGateway } from "./dataverse"
import { InMemorySalesGateway } from "./in-memory"

const env = (vars: Partial<ImportMetaEnv>) => ({ ...import.meta.env, VITE_SALES_GATEWAY: undefined, ...vars })

describe("createGateway", () => {
  it("uses Dataverse by default", () => {
    expect(createGateway(env({}))).toBeInstanceOf(DataverseSalesGateway)
  })

  it("uses the in-memory seed data for dev:memory, signed in as the chosen user", async () => {
    const gateway = createGateway(env({ VITE_SALES_GATEWAY: "memory", VITE_SALES_USER: "megan" }))
    expect(gateway).toBeInstanceOf(InMemorySalesGateway)
    expect((await gateway.getCurrentUser()).user.fullName).toBe("Megan Bowen")
  })

  it("signs in as Adele Vance when no user is chosen", async () => {
    const gateway = createGateway(env({ VITE_SALES_GATEWAY: "memory" }))
    expect((await gateway.getCurrentUser()).user.fullName).toBe("Adele Vance")
  })
})
