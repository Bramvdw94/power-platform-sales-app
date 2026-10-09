import { toDateOnly, type Id } from "@/sales"
import { InMemorySalesGateway } from "./in-memory-gateway"
import { createSeedData } from "./seed"
import { InMemorySalesStore } from "./store"

export { InMemorySalesGateway, type InMemoryGatewayOptions } from "./in-memory-gateway"
export { InMemorySalesStore, type InMemoryData } from "./store"
export { SEED_IDS, SEED_USERS, createSeedData } from "./seed"

/** A store filled with the seed data, dated relative to `now`. */
export function createSeededStore(now: Date = new Date()): InMemorySalesStore {
  return new InMemorySalesStore(createSeedData(toDateOnly(now)))
}

/** An in-memory gateway signed in as `userId`, over a fresh seeded store unless one is given. */
export function createInMemoryGateway(
  userId: Id,
  options: { store?: InMemorySalesStore; now?: () => Date } = {},
): InMemorySalesGateway {
  const now = options.now ?? (() => new Date())
  return new InMemorySalesGateway(options.store ?? createSeededStore(now()), { userId, now })
}
