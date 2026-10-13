import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, addStarterProcesses, createInMemoryGateway, createSeededStore, type InMemorySalesStore } from "@/data/in-memory"
import { STARTER_PROCESS_IDS } from "@/data/in-memory/seed-processes"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele } = SEED_USERS
const OPP = STARTER_PROCESS_IDS.opportunity

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const store = options.store ?? addStarterProcesses(createSeededStore())
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = renderWithGateway(<RouterProvider router={router} />, { ...options, store })
  return { ...result, router, store }
}

beforeEach(() => setViewport("desktop"))

const step = async (name: RegExp | string) => screen.findByRole("button", { name })

/** A store with the starter Processes, changed through a builder's gateway before the page opens. */
async function prepared(change: (gateway: ReturnType<typeof createInMemoryGateway>, store: InMemorySalesStore) => Promise<void> | void) {
  const store = addStarterProcesses(createSeededStore())
  await change(createInMemoryGateway(megan.id, { store }), store)
  return store
}

describe("the Automation page", () => {
  it("lists the Processes of Opportunities and Leads with their status and Entry criteria", async () => {
    const user = userEvent.setup()
    renderApp("/automation", { userId: megan.id })
    const list = await screen.findByRole("list", { name: "Processes" })
    const row = within(list).getAllByRole("listitem")[0]
    expect(within(row).getByRole("link", { name: "Starter Opportunity process" })).toBeInTheDocument()
    expect(within(row).getByText("Published v1")).toBeInTheDocument()
    expect(within(row).getByText(/Fallback: every new record no other Process matches/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Leads" }))
    expect(await screen.findByRole("link", { name: "Starter Lead process" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Starter Opportunity process" })).not.toBeInTheDocument()
  })

  it("is in the sidebar and, on a phone, under Menu", async () => {
    const user = userEvent.setup()
    const desktop = renderApp("/")
    expect(await within(screen.getByRole("navigation", { name: "Main" })).findByRole("link", { name: "Automation" })).toBeInTheDocument()
    desktop.unmount()

    setViewport("phone")
    const { router } = renderApp("/menu")
    await user.click(await within(screen.getByRole("navigation", { name: "Pages" })).findByRole("link", { name: "Automation" }))
    expect(router.state.location.pathname).toBe("/automation")
    expect(await screen.findByRole("tab", { name: "Business rules" })).toBeInTheDocument()
  })

  it("lets a salesperson read a Process but not change it", async () => {
    const user = userEvent.setup()
    renderApp("/automation", { userId: adele.id })
    await screen.findByRole("list", { name: "Processes" })
    expect(screen.queryByRole("button", { name: "New process" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Move .* up/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole("link", { name: "Starter Opportunity process" }))
    expect(await screen.findByRole("heading", { name: "Starter Opportunity process", level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/Only a Process builder can change it/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Retire" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Insert Step here|Add Step/ })).not.toBeInTheDocument()

    await user.click(await step("Step 1: Qualify the deal"))
    expect(screen.getByLabelText("Step name")).toBeDisabled()
    expect(screen.getByLabelText("Guidance")).toBeDisabled()
    expect(screen.getByRole("group", { name: "Check 1" })).toBeInTheDocument()
    expect(screen.getByLabelText("Check 1 field")).toBeDisabled()
    expect(screen.queryByRole("button", { name: /Remove check/ })).not.toBeInTheDocument()
  })
})

describe("building a Process", () => {
  it("creates a draft, builds a Step with a Gate and an Action, and publishes it", async () => {
    const user = userEvent.setup()
    const { store, gateway } = renderApp("/automation?table=lead", { userId: megan.id })
    await user.click(await screen.findByRole("button", { name: "New process" }))
    await user.type(screen.getByLabelText(/Name/), "Partner leads")
    await user.click(screen.getByRole("button", { name: "Create" }))

    expect(await screen.findByLabelText("Process name")).toHaveValue("Partner leads")
    expect(screen.getByText("Draft")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Add Step" }))
    const name = screen.getByLabelText("Step name")
    await user.clear(name)
    await user.type(name, "First call{Enter}")
    await user.selectOptions(screen.getByLabelText("Lead status"), "Working")

    await user.click(screen.getByRole("button", { name: "Add check" }))
    await user.selectOptions(screen.getByLabelText("Check 1 field"), "Phone")
    await user.click(screen.getByRole("button", { name: "Add related-record check" }))
    await user.selectOptions(screen.getByLabelText("Check 2 records"), "Phone Calls")
    await user.click(screen.getByRole("button", { name: "Add Create Task" }))
    const subject = screen.getByLabelText("Action 1 subject")
    await user.clear(subject)
    await user.type(subject, "Call them{Enter}")

    await waitFor(async () => {
      const [saved] = (await gateway.listProcessAdmin("lead")).filter((p) => p.name === "Partner leads")
      expect(saved.draft.steps[0]).toMatchObject({
        name: "First call",
        mapsTo: "working",
        gate: { checks: [{ field: "phone", op: "isNotEmpty" }, { related: "phoneCalls", atLeast: 1 }] },
        actions: [{ type: "createTask", subject: "Call them", dueInDays: 2, assignTo: "owner" }],
      })
    })

    await user.click(screen.getByRole("button", { name: "Publish" }))
    const dialog = await screen.findByRole("dialog")
    expect(await within(dialog).findByText("No open records follow this Process.")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Publish version 1" }))
    expect(await screen.findByText(/Published version 1/)).toBeInTheDocument()
    expect(await screen.findByText("Published v1")).toBeInTheDocument()
    expect(store.processes.find((p) => p.name === "Partner leads")!.latestVersionId).toBeTruthy()
  })

  it("refuses Publish with Steps out of Stage order and says so", async () => {
    const user = userEvent.setup()
    const store = await prepared(async (gateway) => {
      const draft = (await gateway.getProcessAdmin(OPP)).draft
      await gateway.saveProcessDraft(OPP, { definition: { ...draft, steps: [draft.steps[2], draft.steps[0], ...draft.steps.slice(3)] } })
    })
    renderApp(`/automation/processes/${OPP}`, { userId: megan.id, store })

    const publish = await screen.findByRole("button", { name: "Publish" })
    await waitFor(() => expect(screen.getByRole("status", { name: "Before you can Publish" })).toHaveTextContent(/earlier Stage/))
    await user.click(publish)
    const dialog = await screen.findByRole("dialog")
    expect(await within(dialog).findByText(/This Process can't be published yet/)).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: /Publish version 2/ })).toBeDisabled()
  })

  it("moves Steps up and down, inserts a Step and deletes one", async () => {
    const user = userEvent.setup()
    const { gateway } = renderApp(`/automation/processes/${OPP}`, { userId: megan.id })
    await screen.findByRole("list", { name: "Steps" })
    await user.click(screen.getByRole("button", { name: "Move Find the need down" }))
    await user.click(screen.getAllByRole("button", { name: "Insert Step here" })[0])
    await user.click(screen.getByRole("button", { name: "Delete Close the deal" }))
    await waitFor(async () => {
      const { draft } = await gateway.getProcessAdmin(OPP)
      expect(draft.steps.map((s) => s.name)).toEqual(["New Step", "Qualify the deal", "Make an offer", "Find the need"])
    })
  })

  it("edits Entry criteria with the condition builder, parents one hop up included", async () => {
    const user = userEvent.setup()
    const { gateway } = renderApp(`/automation/processes/${OPP}`, { userId: megan.id })
    await user.click(await screen.findByRole("checkbox", { name: /Use as the fallback/ }))
    await user.click(await screen.findByRole("button", { name: "Add condition" }))
    await user.selectOptions(screen.getByLabelText("Condition 1 field"), "Account's account type")
    await user.selectOptions(screen.getByLabelText("Condition 1 operator"), "is")
    await user.selectOptions(screen.getByLabelText("Condition 1 value"), "Partner")
    expect(screen.queryByRole("button", { name: "Add related-record check" })).not.toBeInTheDocument()
    await waitFor(async () => {
      const { draft } = await gateway.getProcessAdmin(OPP)
      expect(draft.entryCriteria).toEqual({ match: "all", conditions: [{ id: "c-1", field: "account.accountType", op: "equals", value: "partner" }] })
    })
  })

  it("stops the builder at 20 Steps", async () => {
    const store = await prepared(async (gateway) => {
      const draft = (await gateway.getProcessAdmin(OPP)).draft
      const many = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, name: `Step ${i}`, mapsTo: "qualification" as const }))
      await gateway.saveProcessDraft(OPP, { definition: { ...draft, steps: many } })
    })
    renderApp(`/automation/processes/${OPP}`, { userId: megan.id, store })
    expect(await screen.findByRole("button", { name: "Add Step" })).toBeDisabled()
    expect(screen.getByText("The most is 20 Steps.")).toBeInTheDocument()
  })
})

describe("versions and retiring", () => {
  it("shows open records per version and moves them to the latest version", async () => {
    const user = userEvent.setup()
    const store = await prepared(async (gateway) => {
      const draft = (await gateway.getProcessAdmin(OPP)).draft
      await gateway.saveProcessDraft(OPP, { definition: { ...draft, steps: draft.steps.map((s) => (s.id === "qualify-deal" ? { ...s, guidance: "New advice" } : s)) } })
      await gateway.publishProcess(OPP)
    })
    renderApp(`/automation/processes/${OPP}`, { userId: megan.id, store })

    const versions = await screen.findByRole("list", { name: "Process versions" })
    await waitFor(() => expect(within(versions).getAllByRole("listitem")).toHaveLength(2))
    expect(within(versions).getAllByRole("listitem")[0]).toHaveTextContent("Version 2")
    expect(within(versions).getAllByRole("listitem")[1]).toHaveTextContent(/Version 1.*[1-9]\d* records? open/)

    await user.click(screen.getByRole("button", { name: "Move to latest version" }))
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Move records" }))
    expect(await screen.findByText(/Moved \d+ records? to version 2/)).toBeInTheDocument()
    const latest = store.processes.find((p) => p.id === OPP)!.latestVersionId
    expect(store.opportunities.get(SEED_IDS.opportunities.qualification)!.processVersionId).toBe(latest)
    await waitFor(() => expect(screen.queryByRole("button", { name: "Move to latest version" })).not.toBeInTheDocument())
  })

  it("retires a Process and then switches all its open records to none", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/automation/processes/${OPP}`, { userId: megan.id })
    await user.click(await screen.findByRole("button", { name: "Retire" }))
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Retire" }))
    expect(await screen.findByText(/Retired\. No new record gets this Process/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument()

    await user.click(await screen.findByRole("button", { name: "Switch all records" }))
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Switch records" }))
    expect(await screen.findByText(/to no Process/)).toBeInTheDocument()
    expect(store.opportunities.get(SEED_IDS.opportunities.qualification)!.processVersionId).toBeUndefined()
  })

  it("shows a red Error badge and the Engine errors of a Process", async () => {
    const store = await prepared((_, s) => {
      s.engineErrors.push({ id: "e1", processId: OPP, actionId: "a1", code: "noManager", message: "The Owner has no manager.", occurredOn: "2026-10-12T10:00:00Z" })
    })
    renderApp("/automation", { userId: megan.id, store })
    expect(await screen.findByLabelText(/Error: 1 Engine error/)).toBeInTheDocument()
  })

  it("lists Engine errors on the Process page", async () => {
    const store = addStarterProcesses(createSeededStore())
    store.engineErrors.push({ id: "e1", processId: OPP, actionId: "a1", code: "noManager", message: "The Owner has no manager.", occurredOn: "2026-10-12T10:00:00Z" })
    renderApp(`/automation/processes/${OPP}`, { userId: megan.id, store })
    const list = await screen.findByRole("list", { name: "Engine errors" })
    expect(within(list).getByText("The Owner has no manager.")).toBeInTheDocument()
  })
})
