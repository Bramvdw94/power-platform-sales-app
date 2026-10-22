import type { SalesGateway } from "./gateway"
import { DataverseSalesGateway, createGeneratedClient } from "./dataverse"
import { SEED_USERS, addStarterProcesses, addStarterRules, createInMemoryGateway, createSeededStore } from "./in-memory"

type SeedUser = keyof typeof SEED_USERS

/**
 * The gateway the app runs on. Dataverse by default; `npm run dev:memory`
 * (VITE_SALES_GATEWAY=memory) runs on the in-memory seed data instead, signed
 * in as VITE_SALES_USER (megan, adele, alex, diego or bram; default adele).
 */
export function createGateway(env: ImportMetaEnv = import.meta.env): SalesGateway {
  if (env.VITE_SALES_GATEWAY === "memory") {
    const name = (env.VITE_SALES_USER ?? "adele") as SeedUser
    const user = SEED_USERS[name] ?? SEED_USERS.adele
    const store = addStarterRules(addStarterProcesses(createSeededStore()))
    ;(window as unknown as { __store: unknown }).__store = store // PROTOTYPE: the switcher's "New Notification" button
    return createInMemoryGateway(user.id, { store })
  }
  return new DataverseSalesGateway(createGeneratedClient())
}
