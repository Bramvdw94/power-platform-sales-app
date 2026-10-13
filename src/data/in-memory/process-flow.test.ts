import { describe, expect, it } from "vitest"
import { GatewayError } from "@/data/gateway"
import { SEED_IDS, SEED_USERS, createInMemoryGateway, createSeededStore } from "."
import { STARTER_PROCESS_IDS, addStarterProcesses } from "./seed-processes"

const NOW = new Date("2026-10-13T09:00:00Z")
const { adele, alex, megan } = SEED_USERS
const O = SEED_IDS.opportunities
const L = SEED_IDS.leads

function setup(userId: string = adele.id) {
  const store = addStarterProcesses(createSeededStore(NOW))
  return { store, gateway: createInMemoryGateway(userId, { store, now: () => NOW }) }
}

const opp = (store: ReturnType<typeof setup>["store"], id: string) => store.opportunities.get(id)!
const tasksNamed = (store: ReturnType<typeof setup>["store"], subject: string) =>
  [...store.activities.values()].filter((a) => a.kind === "task" && a.subject === subject)

async function refusal(promise: Promise<unknown>): Promise<GatewayError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(GatewayError)
    return error as GatewayError
  }
  throw new Error("expected a refusal")
}

describe("a record that follows a Process", () => {
  it("serves the published Processes of a table", async () => {
    const { gateway } = setup()
    const { engineEnabled, processes, versions } = await gateway.getProcessDefinitions("opportunity")
    expect(engineEnabled).toBe(true)
    expect(processes.map((p) => p.id)).toEqual([STARTER_PROCESS_IDS.opportunity])
    expect(versions[0].definition.steps.map((s) => s.id)).toEqual(["qualify-deal", "find-need", "make-offer", "close-deal"])
  })

  it("gets a Process and its first Step when it is created", async () => {
    const { gateway } = setup()
    const created = await gateway.createLead({ lastName: "Nieuw", company: "Nieuw BV" })
    expect(created.processVersionId).toBe(STARTER_PROCESS_IDS.leadVersion)
    expect(created.currentStepId).toBe("make-contact")
    expect(created.stepEnteredOn).toBe(NOW.toISOString())
    expect(tasksNamed(setup().store, "Make first contact")).toHaveLength(0)
  })

  it("creates the first Step's Action Task in the same save", async () => {
    const { gateway, store } = setup()
    await gateway.createLead({ lastName: "Nieuw", company: "Nieuw BV" })
    expect(tasksNamed(store, "Make first contact")).toHaveLength(1)
  })

  it("refuses Next while Gate checks are open and allows it once the Key fields are filled", async () => {
    const { gateway, store } = setup()
    await gateway.moveStep({ type: "opportunity", id: O.qualification }, "find-need")
    expect(opp(store, O.qualification)).toMatchObject({ currentStepId: "find-need", stage: "needsAnalysis" })

    const error = await refusal(gateway.moveStep({ type: "opportunity", id: O.qualification }, "make-offer"))
    expect(error.message).toBe("1 open check on “Find the need”.")
    expect(opp(store, O.qualification).currentStepId).toBe("find-need")

    await gateway.updateOpportunity(O.qualification, { description: "Needs 20 seats" })
    await gateway.moveStep({ type: "opportunity", id: O.qualification }, "make-offer")
    expect(opp(store, O.qualification)).toMatchObject({ currentStepId: "make-offer", stage: "proposal", probability: 50 })
  })

  it("keeps the Owner's Probability when moving between Steps of the same Stage", async () => {
    const { gateway, store } = setup()
    const def = store.processVersions.find((v) => v.id === STARTER_PROCESS_IDS.opportunityVersion)!.definition
    def.steps.splice(1, 0, { id: "extra", name: "Extra", mapsTo: "qualification" })
    await gateway.updateOpportunity(O.qualification, { probability: 33 })
    await gateway.moveStep({ type: "opportunity", id: O.qualification }, "extra")
    expect(opp(store, O.qualification)).toMatchObject({ currentStepId: "extra", stage: "qualification", probability: 33 })
  })

  it("makes an Action Task once, not again after going back and forward", async () => {
    const { gateway, store } = setup()
    await gateway.updateOpportunity(O.qualification, { description: "Needs 20 seats", estimatedValue: 5000 })
    await gateway.moveStep({ type: "opportunity", id: O.qualification }, "make-offer")
    expect(tasksNamed(store, "Follow up on the proposal")).toHaveLength(1)

    await gateway.moveStep({ type: "opportunity", id: O.qualification }, "find-need")
    await gateway.moveStep({ type: "opportunity", id: O.qualification }, "make-offer")
    expect(tasksNamed(store, "Follow up on the proposal")).toHaveLength(1)
  })

  it("moves back without checks", async () => {
    const { store } = setup(alex.id)
    await createInMemoryGateway(alex.id, { store, now: () => NOW }).moveStep({ type: "opportunity", id: O.proposal }, "find-need")
    expect(opp(store, O.proposal)).toMatchObject({ currentStepId: "find-need", stage: "needsAnalysis" })
  })

  it("refuses Closed Won with open checks on the last Step but allows Closed Lost", async () => {
    const { gateway, store } = setup(megan.id)
    const error = await refusal(gateway.closeOpportunity(O.negotiation, { outcome: "won", actualValue: 1000 }))
    expect(error.message).toMatch(/open checks? on “Close the deal”/)
    expect(opp(store, O.negotiation).stage).toBe("negotiation")

    await gateway.closeOpportunity(O.negotiation, { outcome: "lost", lostReason: "price" })
    expect(opp(store, O.negotiation).stage).toBe("closedLost")
  })

  it("allows Closed Won once the last Step's Gate passes", async () => {
    const { gateway, store } = setup(megan.id)
    await gateway.updateOpportunity(O.negotiation, { nextStep: "Sign" })
    store.quotes.set("quote-n", {
      id: "quote-n", opportunityId: O.negotiation, number: "Q-90001", revision: 0, status: "sent", accountId: SEED_IDS.accounts.northwind,
      netTotal: 100, vat21: 0, vat9: 0, grossTotal: 100, ownerId: megan.id, createdOn: NOW.toISOString(),
    })
    await gateway.closeOpportunity(O.negotiation, { outcome: "won", actualValue: 1000 })
    expect(opp(store, O.negotiation).stage).toBe("closedWon")
  })

  it("moves to the first Step of a Stage picked on the Board, through the Gate when moving forward", async () => {
    const { gateway, store } = setup()
    const error = await refusal(gateway.changeStage(O.qualification, "proposal"))
    expect(error.message).toMatch(/open check/)
    await createInMemoryGateway(alex.id, { store, now: () => NOW }).changeStage(O.proposal, "needsAnalysis")
    expect(opp(store, O.proposal)).toMatchObject({ currentStepId: "find-need", stage: "needsAnalysis" })
  })

  it("qualifies a Lead only from the last Step, after its Gate passes", async () => {
    const { gateway, store } = setup(alex.id)
    const input = { account: { createNew: true as const }, contact: { createNew: true as const }, opportunity: { name: "Tailspin - deal", estimatedValue: 1000, expectedCloseDate: "2026-12-01" } }
    const before = store.accounts.size
    const error = await refusal(gateway.qualifyLead(L.working, input))
    expect(error.message).toMatch(/can only be qualified from its last Step/)
    expect(store.accounts.size).toBe(before)
  })

  it("qualifies from the last Step, and the Opportunity is matched after its Account is linked", async () => {
    const { gateway, store } = setup(alex.id)
    await gateway.updateLead(L.working, { jobTitle: "Head of IT", description: "Ready", email: "thomas@fabrikam.example" })
    await gateway.moveStep({ type: "lead", id: L.working }, "ready-to-qualify")
    const result = await gateway.qualifyLead(L.working, {
      account: { existingId: SEED_IDS.accounts.fabrikam },
      contact: { existingId: SEED_IDS.contacts.pieter },
      opportunity: { name: "Fabrikam - managed", estimatedValue: 9000, expectedCloseDate: "2026-12-01" },
    })
    expect(store.leads.get(L.working)!.status).toBe("qualified")
    expect(store.opportunities.get(result.opportunityId)).toMatchObject({
      processVersionId: STARTER_PROCESS_IDS.opportunityVersion,
      currentStepId: "qualify-deal",
      stage: "qualification",
    })
  })

  it("lets the Owner's manager and Process builders Switch Process, not the Owner or a peer", async () => {
    const { store } = setup()
    const other = store.processVersions.find((v) => v.id === STARTER_PROCESS_IDS.opportunityVersion)!
    store.processes.push({ id: "proc-b", name: "Other", table: "opportunity", priority: 5, isFallback: false, retired: false, latestVersionId: "procver-b" })
    store.processVersions.push({ id: "procver-b", processId: "proc-b", definition: { ...structuredClone(other.definition), steps: structuredClone(other.definition.steps).slice(1) } })

    for (const userId of [adele.id, alex.id]) {
      const gateway = createInMemoryGateway(userId, { store, now: () => NOW })
      const error = await refusal(gateway.switchProcess({ type: "opportunity", id: O.qualification }, "procver-b"))
      expect(error.message).toMatch(/Owner's manager or a Process builder/)
    }
    await createInMemoryGateway(megan.id, { store, now: () => NOW }).switchProcess({ type: "opportunity", id: O.qualification }, "procver-b")
    expect(opp(store, O.qualification)).toMatchObject({ processVersionId: "procver-b", currentStepId: "find-need", stage: "needsAnalysis" })
  })

  it("lets a Process builder Switch Process to none", async () => {
    const { store } = setup(megan.id)
    await createInMemoryGateway(megan.id, { store, now: () => NOW }).switchProcess({ type: "opportunity", id: O.qualification }, null)
    expect(opp(store, O.qualification).processVersionId).toBeUndefined()
    expect(opp(store, O.qualification).currentStepId).toBeUndefined()
  })

  it("behaves as in v1 when the kill switch is off", async () => {
    const { gateway, store } = setup()
    store.engineEnabled = false
    expect((await gateway.getProcessDefinitions("lead")).engineEnabled).toBe(false)
    await gateway.changeStage(O.qualification, "proposal")
    expect(opp(store, O.qualification).stage).toBe("proposal")
  })

  it("leaves records without a Process alone", async () => {
    const { gateway, store } = setup()
    store.processes.length = 0
    const created = await gateway.createOpportunity({ name: "Plain", accountId: SEED_IDS.accounts.tailwind, stage: "proposal", estimatedValue: 1, expectedCloseDate: "2026-12-01" })
    expect(created.processVersionId).toBeUndefined()
    await gateway.changeStage(created.id, "negotiation")
    expect(opp(store, created.id).stage).toBe("negotiation")
  })
})
