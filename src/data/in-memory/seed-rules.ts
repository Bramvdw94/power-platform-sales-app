import starters from "../../../data/business-rules.json"
import type { BusinessRuleDefinition, BusinessRuleRow } from "@/sales/engine"
import type { InMemorySalesStore } from "./store"

// The starter Business rules the sample data loads (data/business-rules.json). The default
// seed carries none, so records behave as in v1 unless a test or `dev:memory` adds these.

export const STARTER_RULE_IDS = {
  largeDealNextStep: "rule-large-deal-next-step",
  customerIndustry: "rule-customer-industry",
  partnerBestCase: "rule-partner-best-case",
  leadWithoutEmail: "rule-lead-without-email",
  bigDealReview: "rule-big-deal-review",
  contactReachable: "rule-contact-reachable",
} as const

export const STARTER_RULES: BusinessRuleRow[] = starters.rules.map((r) => ({
  id: r.id,
  name: r.name,
  enabled: r.enabled,
  definition: r.definition as BusinessRuleDefinition,
}))

/** Publishes the starter Business rules in the store. */
export function addStarterRules(store: InMemorySalesStore): InMemorySalesStore {
  store.businessRules.push(...structuredClone(STARTER_RULES))
  return store
}
