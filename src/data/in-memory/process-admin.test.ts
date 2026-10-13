import { describe, expect, it } from "vitest"
import { GatewayError } from "@/data/gateway"
import { PublishRefused, insertStep, moveStepInDraft, updateStep } from "@/sales"
import { SEED_IDS, SEED_USERS, createInMemoryGateway, createSeededStore } from "."
import { STARTER_PROCESS_IDS, addStarterProcesses } from "./seed-processes"

const NOW = new Date("2026-10-13T09:00:00Z")
const { adele, megan } = SEED_USERS
const O = SEED_IDS.opportunities
const OPP = STARTER_PROCESS_IDS.opportunity

function setup(userId: string = megan.id) {
  const store = addStarterProcesses(createSeededStore(NOW))
  return { store, gateway: createInMemoryGateway(userId, { store, now: () => NOW }) }
}

describe("building Processes", () => {
  it("lists the table's Processes, drafts included, with the number of open records per version", async () => {
    const { gateway } = setup()
    const draft = await gateway.createProcess("opportunity", "Partner deals")
    const list = await gateway.listProcessAdmin("opportunity")
    expect(list.map((p) => p.name)).toEqual(["Starter Opportunity process", "Partner deals"])
    expect(list[0]).toMatchObject({ latestVersionNumber: 1, hasUnpublishedChanges: false, retired: false })
    expect(list[0].versions[0].openRecords).toBeGreaterThan(0)
    expect(draft).toMatchObject({ latestVersionId: null, latestVersionNumber: null, draft: { steps: [] } })
  })

  it("refuses Publish of Steps out of Stage order and of a Process with no Step, and publishes once fixed", async () => {
    const { gateway } = setup()
    const { id } = await gateway.createProcess("opportunity", "Partner deals")
    await expect(gateway.publishProcess(id)).rejects.toThrow(PublishRefused)

    let draft = insertStep((await gateway.getProcessAdmin(id)).draft, 0, "Offer")
    draft = updateStep(draft, "offer", { mapsTo: "proposal" })
    draft = updateStep(insertStep(draft, 1, "Intro"), "intro", { mapsTo: "qualification" })
    await gateway.saveProcessDraft(id, { definition: draft })
    const preview = await gateway.previewPublish(id)
    expect(preview.errors.map((e) => e.code)).toEqual(["stepsOutOfOrder"])
    await expect(gateway.publishProcess(id)).rejects.toThrow(/earlier Stage/)

    await gateway.saveProcessDraft(id, { definition: moveStepInDraft(draft, "intro", "up") })
    const published = await gateway.publishProcess(id)
    expect(published).toMatchObject({ latestVersionNumber: 1, hasUnpublishedChanges: false })
  })

  it("makes a new Process version on Publish while an open record stays on the version it started on", async () => {
    const { gateway, store } = setup()
    const before = await gateway.getProcessAdmin(OPP)
    const draft = updateStep(before.draft, "qualify-deal", { guidance: "New advice" })
    await gateway.saveProcessDraft(OPP, { definition: draft })
    expect((await gateway.getProcessAdmin(OPP)).hasUnpublishedChanges).toBe(true)

    const published = await gateway.publishProcess(OPP)
    expect(published).toMatchObject({ latestVersionNumber: 2, hasUnpublishedChanges: false })
    expect(published.versions.map((v) => [v.number, v.openRecords > 0])).toEqual([[2, false], [1, true]])
    expect(store.opportunities.get(O.qualification)!.processVersionId).toBe(STARTER_PROCESS_IDS.opportunityVersion)

    const created = await gateway.createOpportunity({ name: "Fresh", accountId: SEED_IDS.accounts.tailwind, stage: "qualification", estimatedValue: 1, expectedCloseDate: "2026-12-01" })
    expect(created.processVersionId).toBe(published.latestVersionId)
  })

  it("moves open records to the latest version, keeping those whose Step survives", async () => {
    const { gateway, store } = setup()
    await gateway.moveStep({ type: "opportunity", id: O.qualification }, "find-need")
    expect(store.opportunities.get(O.qualification)).toMatchObject({ currentStepId: "find-need", stage: "needsAnalysis" })
    // v2 drops "find-need": a record on it lands as with Switch Process, on the last earlier Step.
    const draft = (await gateway.getProcessAdmin(OPP)).draft
    await gateway.saveProcessDraft(OPP, { definition: { ...draft, steps: draft.steps.filter((s) => s.id !== "find-need") } })
    await gateway.publishProcess(OPP)

    const onProposal = store.opportunities.get(O.proposal)!
    expect(onProposal.currentStepId).toBe("make-offer")

    const moved = await gateway.moveToLatestVersion(OPP)
    expect(moved).toBeGreaterThan(0)
    const latest = (await gateway.getProcessAdmin(OPP)).latestVersionId
    expect(store.opportunities.get(O.proposal)).toMatchObject({ processVersionId: latest, currentStepId: "make-offer", stage: "proposal" })
    expect(store.opportunities.get(O.qualification)).toMatchObject({ processVersionId: latest, currentStepId: "qualify-deal", stage: "qualification" })
    expect(await gateway.moveToLatestVersion(OPP)).toBe(0)
  })

  it("previews how many open records would be blocked at their current Gate", async () => {
    const { gateway } = setup()
    const draft = (await gateway.getProcessAdmin(OPP)).draft
    const stricter = updateStep(draft, "qualify-deal", { gate: { checks: [{ id: "impossible", field: "nextStep", op: "isNotEmpty" }] } })
    await gateway.saveProcessDraft(OPP, { definition: stricter })
    const { impact } = await gateway.previewPublish(OPP)
    expect(impact.openRecords).toBeGreaterThan(0)
    expect(impact.blocked.map((b) => b.stepName)).toContain("Qualify the deal")
  })

  it("keeps one fallback per table and drops its Entry criteria", async () => {
    const { gateway } = setup()
    const other = await gateway.createProcess("opportunity", "Partner deals")
    await gateway.saveProcessDraft(other.id, { definition: { ...other.draft, entryCriteria: { match: "all", conditions: [{ field: "account.accountType", op: "equals", value: "partner" }] } } })
    const fallback = await gateway.saveProcessDraft(other.id, { isFallback: true })
    expect(fallback.draft.entryCriteria).toBeUndefined()
    const list = await gateway.listProcessAdmin("opportunity")
    expect(list.filter((p) => p.isFallback).map((p) => p.name)).toEqual(["Partner deals"])
  })

  it("reorders the priority and stops at the edges", async () => {
    const { gateway } = setup()
    const a = await gateway.createProcess("lead", "A")
    await gateway.moveProcessPriority(a.id, "up")
    await gateway.moveProcessPriority(a.id, "up")
    expect((await gateway.listProcessAdmin("lead")).map((p) => p.name)).toEqual(["A", "Starter Lead process"])
    await gateway.moveProcessPriority(a.id, "up")
    await gateway.moveProcessPriority(a.id, "down")
    expect((await gateway.listProcessAdmin("lead")).map((p) => p.name)).toEqual(["Starter Lead process", "A"])
  })

  it("retires a Process so new records skip it, and switches all its open records at once", async () => {
    const { gateway, store } = setup()
    const other = await gateway.createProcess("opportunity", "Replacement")
    await gateway.saveProcessDraft(other.id, { definition: insertStep(other.draft, 0, "Only step") })
    const replacement = await gateway.publishProcess(other.id)

    const retired = await gateway.retireProcess(OPP)
    expect(retired).toMatchObject({ retired: true, isFallback: false })
    const created = await gateway.createOpportunity({ name: "Fresh", accountId: SEED_IDS.accounts.tailwind, stage: "qualification", estimatedValue: 1, expectedCloseDate: "2026-12-01" })
    expect(created.processVersionId).toBeUndefined()

    const moved = await gateway.switchAllRecords(OPP, replacement.id)
    expect(moved).toBeGreaterThan(0)
    expect(store.opportunities.get(O.qualification)!.processVersionId).toBe(replacement.latestVersionId)
    expect((await gateway.getProcessAdmin(OPP)).versions.every((v) => v.openRecords === 0)).toBe(true)
  })

  it("switches all open records to none", async () => {
    const { gateway, store } = setup()
    await gateway.retireProcess(OPP)
    await gateway.switchAllRecords(OPP, null)
    expect(store.opportunities.get(O.qualification)!.processVersionId).toBeUndefined()
  })

  it("lists Engine errors against a Process", async () => {
    const { gateway, store } = setup()
    store.engineErrors.push({ id: "e1", processId: OPP, actionId: "a", code: "noManager", message: "No manager", occurredOn: "2026-10-12T10:00:00Z" })
    expect((await gateway.listEngineErrors(OPP)).map((e) => e.code)).toEqual(["noManager"])
    expect((await gateway.getProcessAdmin(OPP)).engineErrorCount).toBe(1)
  })

  it("lets everyone read definitions but only a Process builder change them", async () => {
    const { gateway } = setup(adele.id)
    expect((await gateway.listProcessAdmin("opportunity")).length).toBeGreaterThan(0)
    for (const attempt of [
      () => gateway.createProcess("lead", "Mine"),
      () => gateway.saveProcessDraft(OPP, { name: "Renamed" }),
      () => gateway.publishProcess(OPP),
      () => gateway.retireProcess(OPP),
      () => gateway.moveToLatestVersion(OPP),
      () => gateway.moveProcessPriority(OPP, "down"),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: "forbidden" })
    }
    await expect(gateway.createProcess("lead", "Mine")).rejects.toBeInstanceOf(GatewayError)
  })
})
