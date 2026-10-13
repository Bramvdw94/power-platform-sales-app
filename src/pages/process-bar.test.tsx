import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, addStarterProcesses, createSeededStore, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele, alex } = SEED_USERS
const { opportunities, leads } = SEED_IDS

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const store = options.store ?? addStarterProcesses(createSeededStore())
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = renderWithGateway(<RouterProvider router={router} />, { ...options, store })
  return { ...result, router, store }
}

const bar = async () => screen.findByRole("region", { name: "Process" })
const next = async (name: RegExp) => within(await bar()).findByRole("button", { name })

beforeEach(() => setViewport("desktop"))

describe("the process bar on an Opportunity", () => {
  it("shows the Steps with their Stage, in place of the Stage path", async () => {
    renderApp(`/opportunities/${opportunities.qualification}`)
    const region = await bar()
    const steps = within(within(region).getByRole("navigation", { name: "Steps" })).getAllByRole("listitem")
    expect(steps.map((s) => s.textContent)).toEqual([
      "Qualify the dealQualification",
      "Find the needNeeds Analysis",
      "Make an offerProposal",
      "Close the dealNegotiation",
      "Closed",
    ])
    expect(within(region).getByRole("button", { name: /Qualify the deal/ })).toHaveAttribute("aria-current", "step")
    expect(screen.queryByRole("navigation", { name: "Stage" })).not.toBeInTheDocument()
  })

  it("disables Next with the number of open checks until the Key fields are filled", async () => {
    const user = userEvent.setup()
    renderApp(`/opportunities/${opportunities.qualification}`)
    await user.click(await next(/Next: Find the need/))
    const button = await next(/Next: Make an offer/)
    expect(button).toBeDisabled()
    expect(within(await bar()).getByText("1 open check")).toBeInTheDocument()

    const panel = within(await bar()).getByRole("region", { name: "Coaching" })
    expect(within(panel).getByText("Description has a value")).toBeInTheDocument()
    await user.type(within(panel).getByLabelText("Description"), "Needs 20 seats")
    await user.tab()
    await waitFor(() => expect(next(/Next: Make an offer/)).resolves.toBeEnabled())
    expect(within(await bar()).queryByText(/open check/)).not.toBeInTheDocument()
  })

  it("moves the Stage with the Step and lets the user go Back", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${opportunities.qualification}`)
    await user.click(await next(/Next: Find the need/))
    await waitFor(() => expect(store.opportunities.get(opportunities.qualification)!.stage).toBe("needsAnalysis"))
    await user.click(await within(await bar()).findByRole("button", { name: /Back/ }))
    await waitFor(() => expect(store.opportunities.get(opportunities.qualification)!.stage).toBe("qualification"))
  })

  it("previews another Step read-only and returns to the current one", async () => {
    const user = userEvent.setup()
    renderApp(`/opportunities/${opportunities.proposal}`, { userId: alex.id })
    const region = await bar()
    await user.click(within(within(region).getByRole("navigation", { name: "Steps" })).getByRole("button", { name: /Close the deal/ }))
    expect(within(region).getByText(/Previewing “Close the deal”/)).toBeInTheDocument()
    expect(within(region).getByText("Agree the final terms. The Quote must be Sent before you can Close as won.")).toBeInTheDocument()
    expect(within(region).queryByLabelText("Next step")).not.toBeInTheDocument()
    await user.click(within(region).getByRole("button", { name: "Back to the current Step" }))
    expect(within(region).queryByText(/Previewing/)).not.toBeInTheDocument()
  })

  it("hides and shows the coaching panel", async () => {
    const user = userEvent.setup()
    renderApp(`/opportunities/${opportunities.qualification}`)
    const region = await bar()
    expect(within(region).getByRole("region", { name: "Coaching" })).toBeInTheDocument()
    await user.click(within(region).getByRole("button", { name: "Hide coaching" }))
    expect(within(region).queryByRole("region", { name: "Coaching" })).not.toBeInTheDocument()
    await user.click(within(region).getByRole("button", { name: "Show coaching" }))
    expect(within(region).getByRole("region", { name: "Coaching" })).toBeInTheDocument()
  })

  it("ends with Close on the last Step", async () => {
    const user = userEvent.setup()
    renderApp(`/opportunities/${opportunities.negotiation}`, { userId: megan.id })
    await user.click(await next(/^Close$/))
    expect(await screen.findByRole("dialog", { name: "Close Opportunity" })).toBeInTheDocument()
  })

  it("labels a Process that was retired", async () => {
    const store = addStarterProcesses(createSeededStore())
    store.processes.find((p) => p.table === "opportunity")!.retired = true
    renderApp(`/opportunities/${opportunities.qualification}`, { store })
    expect(await within(await bar()).findByText("Retired process")).toBeInTheDocument()
  })

  it("offers Switch Process to the Owner's manager but not to the Owner or a peer", async () => {
    const store = addStarterProcesses(createSeededStore())
    store.processes.push({ id: "proc-b", name: "Enterprise deals", table: "opportunity", priority: 5, isFallback: false, retired: false, latestVersionId: "procver-b" })
    store.processVersions.push({ id: "procver-b", processId: "proc-b", definition: structuredClone(store.processVersions.find((v) => v.id === "procver-opportunity-starter-1")!.definition) })

    const peer = renderApp(`/opportunities/${opportunities.qualification}`, { userId: alex.id, store })
    await bar()
    expect(screen.queryByRole("button", { name: "Switch Process" })).not.toBeInTheDocument()
    peer.unmount()

    const owner = renderApp(`/opportunities/${opportunities.qualification}`, { userId: adele.id, store })
    await bar()
    expect(screen.queryByRole("button", { name: "Switch Process" })).not.toBeInTheDocument()
    owner.unmount()

    const user = userEvent.setup()
    renderApp(`/opportunities/${opportunities.qualification}`, { userId: megan.id, store })
    await user.click(await within(await bar()).findByRole("button", { name: "Switch Process" }))
    const dialog = await screen.findByRole("dialog", { name: "Switch Process" })
    await user.click(within(dialog).getByRole("radio", { name: "Enterprise deals" }))
    await user.click(within(dialog).getByRole("button", { name: "Switch" }))
    await waitFor(() => expect(store.opportunities.get(opportunities.qualification)!.processVersionId).toBe("procver-b"))
  })

  it("keeps the v1 Stage path on a record that follows no Process", async () => {
    const store = createSeededStore()
    renderApp(`/opportunities/${opportunities.qualification}`, { store })
    expect(await screen.findByRole("navigation", { name: "Stage" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Process" })).not.toBeInTheDocument()
  })
})

describe("the process bar on a Lead", () => {
  it("replaces the status buttons: Next, then Qualify only on the last Step", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/leads/${leads.working}`, { userId: alex.id })
    await bar()
    expect(screen.queryByRole("button", { name: "Back to Not Contacted" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Qualify" })).not.toBeInTheDocument()

    const panel = within(await bar()).getByRole("region", { name: "Coaching" })
    await user.type(within(panel).getByLabelText("Job title"), "Head of IT")
    await user.type(within(panel).getByLabelText("Description"), "Ready")
    await user.tab()
    await waitFor(() => expect(next(/Next: Ready to qualify/)).resolves.toBeEnabled())
    await user.click(await next(/Next: Ready to qualify/))
    await waitFor(() => expect(store.leads.get(leads.working)!.currentStepId).toBe("ready-to-qualify"))
    expect(await next(/^Qualify$/)).toBeEnabled()
  })
})

describe("the process bar on a phone", () => {
  it("collapses to the current Step with arrows and Step n of m", async () => {
    setViewport("phone")
    const user = userEvent.setup()
    renderApp(`/opportunities/${opportunities.proposal}`, { userId: alex.id })
    const region = await bar()
    expect(within(region).getByText("Step 3 of 4 · Proposal")).toBeInTheDocument()
    await user.click(within(region).getByRole("button", { name: "Next Step" }))
    expect(within(region).getByText("Step 4 of 4 · Negotiation")).toBeInTheDocument()
    expect(within(region).getByText(/Previewing “Close the deal”/)).toBeInTheDocument()
  })
})
