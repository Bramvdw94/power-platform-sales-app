import starters from "../../../data/processes.json"
import type { ProcessDefinition, ProcessRow, ProcessVersionRow } from "@/sales/engine"
import { SEED_IDS } from "./seed"
import type { InMemorySalesStore } from "./store"

// The two starter Processes the sample data loads (data/processes.json), plus the
// seeded Leads and Opportunities that follow them. The default seed carries no
// Processes, so records behave as in v1 unless a test or `dev:memory` adds these.

export const STARTER_PROCESS_IDS = {
  lead: "proc-lead-starter",
  opportunity: "proc-opportunity-starter",
  leadVersion: "procver-lead-starter-1",
  opportunityVersion: "procver-opportunity-starter-1",
} as const

export const STARTER_PROCESSES: ProcessRow[] = starters.processes.map((p, index) => ({
  id: p.id,
  name: p.name,
  table: p.table as ProcessRow["table"],
  priority: p.priority + index,
  isFallback: p.isFallback,
  retired: false,
  latestVersionId: p.versionId,
}))

export const STARTER_VERSIONS: ProcessVersionRow[] = starters.processes.map((p) => ({
  id: p.versionId,
  processId: p.id,
  definition: p.definition as ProcessDefinition,
}))

/** Where each seeded open record stands: the Step it is on. Closed ones keep the Process on its last Step. */
const SEED_STEPS: Record<string, { version: string; step: string }> = {
  [SEED_IDS.leads.notContacted]: { version: STARTER_PROCESS_IDS.leadVersion, step: "make-contact" },
  [SEED_IDS.leads.working]: { version: STARTER_PROCESS_IDS.leadVersion, step: "judge-fit" },
  [SEED_IDS.leads.diegos]: { version: STARTER_PROCESS_IDS.leadVersion, step: "make-contact" },
  [SEED_IDS.opportunities.qualification]: { version: STARTER_PROCESS_IDS.opportunityVersion, step: "qualify-deal" },
  [SEED_IDS.opportunities.proposal]: { version: STARTER_PROCESS_IDS.opportunityVersion, step: "make-offer" },
  [SEED_IDS.opportunities.negotiation]: { version: STARTER_PROCESS_IDS.opportunityVersion, step: "close-deal" },
  [SEED_IDS.opportunities.diegosProposal]: { version: STARTER_PROCESS_IDS.opportunityVersion, step: "make-offer" },
}

/** Publishes the two starter Processes in the store and puts the seeded open records on them. */
export function addStarterProcesses(store: InMemorySalesStore): InMemorySalesStore {
  store.processes.push(...structuredClone(STARTER_PROCESSES))
  store.processVersions.push(...structuredClone(STARTER_VERSIONS))
  const entered = new Date().toISOString()
  for (const [id, place] of Object.entries(SEED_STEPS)) {
    const row = store.leads.get(id) ?? store.opportunities.get(id)
    if (row) Object.assign(row, { processVersionId: place.version, currentStepId: place.step, stepEnteredOn: entered })
  }
  return store
}
