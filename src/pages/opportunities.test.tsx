import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import { toDateOnly, type Id } from "@/sales"

const { megan, adele, alex, diego } = SEED_USERS
const { accounts, opportunities } = SEED_IDS

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = renderWithGateway(<RouterProvider router={router} />, options)
  return { ...result, router }
}

/** The names in the first column of a record list. */
async function listedNames(listName: string) {
  const table = await screen.findByRole("table", { name: listName })
  await within(table).findAllByRole("link")
  return within(table)
    .getAllByRole("link")
    .map((link) => link.textContent)
}

/** The record page's header, holding the name and key fields. */
function recordHeader() {
  return screen.getByRole("heading", { level: 1 }).closest("header")!
}

function highlight(label: string) {
  const term = within(recordHeader()).getByText(label, { selector: "dt" })
  return term.nextElementSibling?.textContent
}

beforeEach(() => setViewport("desktop"))

describe("Opportunities flow", () => {
  it("creates an Opportunity with the required fields and the Stage's Probability", async () => {
    const user = userEvent.setup()
    const { router, store } = renderApp("/opportunities?new=1")

    const dialog = await screen.findByRole("dialog", { name: "New Opportunity" })
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(within(dialog).getByText("Name is required.")).toBeInTheDocument()
    expect(within(dialog).getByText("Account is required.")).toBeInTheDocument()
    expect(within(dialog).getByText("Estimated value is required (0 or more).")).toBeInTheDocument()
    expect(within(dialog).getByText("Expected close date is required.")).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/Name/), "Northwind BV - Teams rollout")
    await user.type(within(dialog).getByRole("combobox", { name: /Account/ }), "north")
    await user.click(await within(dialog).findByRole("option", { name: /Northwind BV/ }))
    await user.selectOptions(within(dialog).getByLabelText(/Stage/), "Needs Analysis")
    await user.type(within(dialog).getByLabelText(/Estimated value/), "36000")
    fireEvent.change(within(dialog).getByLabelText(/Expected close date/), { target: { value: "2026-12-15" } })
    await user.click(within(dialog).getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("heading", { name: "Northwind BV - Teams rollout" })).toBeInTheDocument()
    const id = router.state.location.pathname.split("/").pop()!
    expect(store.opportunities.get(id)).toMatchObject({
      accountId: accounts.northwind,
      stage: "needsAnalysis",
      probability: 25,
      estimatedValue: 36000,
      expectedCloseDate: "2026-12-15",
      ownerId: adele.id,
    })
    expect(highlight("Probability")).toBe("25%")
  })

  it("starts a New Opportunity from its Account", async () => {
    const user = userEvent.setup()
    renderApp(`/accounts/${accounts.tailwind}`)
    await user.click(await screen.findByRole("button", { name: "New Opportunity" }))
    const dialog = await screen.findByRole("dialog", { name: "New Opportunity" })
    expect(within(dialog).getByText("Tailwind Traders")).toBeInTheDocument()
  })

  it("resets the Probability when the Stage changes", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${opportunities.qualification}`)

    const path = await screen.findByRole("navigation", { name: "Stage" })
    expect(within(path).getByRole("button", { name: /Qualification/ })).toHaveAttribute("aria-current", "step")
    await user.click(within(path).getByRole("button", { name: "Proposal" }))

    expect(await within(path).findByRole("button", { name: "Proposal" })).toHaveAttribute("aria-current", "step")
    expect(store.opportunities.get(opportunities.qualification)).toMatchObject({ stage: "proposal", probability: 50 })
    expect(highlight("Probability")).toBe("50%")

    // Back a Stage is fine too.
    await user.click(within(path).getByRole("button", { name: /Needs Analysis/ }))
    await within(path).findByRole("button", { name: /Needs Analysis/, current: "step" })
    expect(store.opportunities.get(opportunities.qualification)).toMatchObject({ stage: "needsAnalysis", probability: 25 })
  })

  it("lets the Owner override the Probability, until the next Stage change", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${opportunities.qualification}`)

    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit Opportunity" })
    const probability = within(form).getByLabelText(/Probability/)
    await user.clear(probability)
    await user.type(probability, "35")
    await user.type(within(form).getByLabelText("Next step"), "Book a demo")
    await user.click(within(form).getByRole("button", { name: "Save" }))

    await screen.findByRole("button", { name: "Edit" })
    expect(store.opportunities.get(opportunities.qualification)).toMatchObject({
      stage: "qualification",
      probability: 35,
      nextStep: "Book a demo",
    })

    const path = screen.getByRole("navigation", { name: "Stage" })
    await user.click(within(path).getByRole("button", { name: "Negotiation" }))
    await within(path).findByRole("button", { name: "Negotiation", current: "step" })
    expect(store.opportunities.get(opportunities.qualification)?.probability).toBe(75)
  })

  it("shows the Forecast category from the Stage, and resets an override when the Stage changes", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${opportunities.qualification}`)
    await screen.findByRole("button", { name: "Edit" })
    expect(highlight("Forecast category")).toBe("Pipeline")

    await user.click(screen.getByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit Opportunity" })
    await user.selectOptions(within(form).getByLabelText("Forecast category"), "Commit")
    await user.click(within(form).getByRole("button", { name: "Save" }))
    await screen.findByRole("button", { name: "Edit" })
    expect(store.opportunities.get(opportunities.qualification)?.forecastCategory).toBe("commit")
    expect(highlight("Forecast category")).toBe("Commit")

    await user.click(within(screen.getByRole("navigation", { name: "Stage" })).getByRole("button", { name: "Proposal" }))
    await waitFor(() => expect(highlight("Forecast category")).toBe("Best case"))
    expect(store.opportunities.get(opportunities.qualification)?.forecastCategory).toBe("bestCase")
  })

  it("lets the Owner pick a Forecast category when creating, defaulting from the Stage", async () => {
    const user = userEvent.setup()
    const { router, store } = renderApp("/opportunities?new=1")
    const dialog = await screen.findByRole("dialog", { name: "New Opportunity" })
    await user.type(within(dialog).getByLabelText(/Name/), "Northwind BV - Omitted")
    await user.type(within(dialog).getByRole("combobox", { name: /Account/ }), "north")
    await user.click(await within(dialog).findByRole("option", { name: /Northwind BV/ }))
    await user.selectOptions(within(dialog).getByLabelText(/Stage/), "Proposal")
    expect(within(dialog).getByLabelText("Forecast category")).toHaveValue("bestCase")
    await user.selectOptions(within(dialog).getByLabelText("Forecast category"), "Omitted")
    await user.type(within(dialog).getByLabelText(/Estimated value/), "1000")
    fireEvent.change(within(dialog).getByLabelText(/Expected close date/), { target: { value: "2026-12-15" } })
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await screen.findByRole("heading", { name: "Northwind BV - Omitted" })
    const id = router.state.location.pathname.split("/").pop()!
    expect(store.opportunities.get(id)?.forecastCategory).toBe("omitted")
  })

  it("refuses a Probability above 100", async () => {
    const user = userEvent.setup()
    renderApp(`/opportunities/${opportunities.qualification}`)
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit Opportunity" })
    const probability = within(form).getByLabelText(/Probability/)
    await user.clear(probability)
    await user.type(probability, "120")
    await user.click(within(form).getByRole("button", { name: "Save" }))
    expect(within(form).getByText("Probability is a whole number from 0 to 100.")).toBeInTheDocument()
  })

  it("closes as won with the Estimated value and today, then shows no Edit", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${opportunities.qualification}`)

    await user.click(await screen.findByRole("button", { name: "Close" }))
    const dialog = await screen.findByRole("dialog", { name: "Close Opportunity" })
    expect(within(dialog).getByLabelText(/Actual value/)).toHaveValue(48000)
    expect(within(dialog).getByLabelText(/Close date/)).toHaveValue(toDateOnly(new Date()))
    await user.click(within(dialog).getByRole("button", { name: "Close as won" }))

    expect(await screen.findByRole("button", { name: "Reopen" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
    expect(store.opportunities.get(opportunities.qualification)).toMatchObject({
      stage: "closedWon",
      probability: 100,
      actualValue: 48000,
      closeDate: toDateOnly(new Date()),
      closedById: adele.id,
    })
    const close = screen.getByRole("region", { name: "Close" })
    expect(within(close).getByText("Adele Vance")).toBeInTheDocument()
    // The Stage path is read-only too.
    const path = screen.getByRole("navigation", { name: "Stage" })
    for (const button of within(path).getAllByRole("button")) expect(button).toBeDisabled()
  })

  it("closes as lost only with a Lost reason", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${opportunities.qualification}`)

    await user.click(await screen.findByRole("button", { name: "Close" }))
    const dialog = await screen.findByRole("dialog", { name: "Close Opportunity" })
    await user.click(within(dialog).getByLabelText("Closed Lost"))
    fireEvent.change(within(dialog).getByLabelText(/Close date/), { target: { value: "2026-10-01" } })
    await user.click(within(dialog).getByRole("button", { name: "Close as lost" }))
    expect(within(dialog).getByText("Pick a Lost reason.")).toBeInTheDocument()

    await user.selectOptions(within(dialog).getByLabelText(/Lost reason/), "Chose a competitor")
    await user.type(within(dialog).getByLabelText("Comment"), "Went with the incumbent")
    await user.click(within(dialog).getByRole("button", { name: "Close as lost" }))

    expect(await screen.findByRole("button", { name: "Reopen" })).toBeInTheDocument()
    expect(store.opportunities.get(opportunities.qualification)).toMatchObject({
      stage: "closedLost",
      probability: 0,
      closeDate: "2026-10-01",
      lostReason: "choseCompetitor",
      lostComment: "Went with the incumbent",
      closedById: adele.id,
    })
    expect(within(screen.getByRole("region", { name: "Close" })).getByText("Chose a competitor")).toBeInTheDocument()
  })

  it("reopens a closed Opportunity to an open Stage for its Owner", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${opportunities.lost}`)

    await user.click(await screen.findByRole("button", { name: "Reopen" }))
    const dialog = await screen.findByRole("dialog", { name: "Reopen Opportunity" })
    await user.selectOptions(within(dialog).getByLabelText(/Stage/), "Proposal")
    await user.click(within(dialog).getByRole("button", { name: "Reopen" }))

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument()
    const reopened = store.opportunities.get(opportunities.lost)!
    expect(reopened).toMatchObject({ stage: "proposal", probability: 50 })
    expect(reopened.lostReason).toBeUndefined()
    expect(reopened.closeDate).toBeUndefined()
    expect(reopened.closedById).toBeUndefined()
  })

  it("lets a manager reopen a report's closed Opportunity", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${opportunities.won}`, { userId: megan.id })

    await user.click(await screen.findByRole("button", { name: "Reopen" }))
    const dialog = await screen.findByRole("dialog", { name: "Reopen Opportunity" })
    await user.click(within(dialog).getByRole("button", { name: "Reopen" }))

    await screen.findByRole("button", { name: "Edit" })
    expect(store.opportunities.get(opportunities.won)).toMatchObject({ stage: "negotiation", probability: 75, ownerId: alex.id })
  })

  it.each([
    ["a peer", alex.id],
    ["someone outside the team", diego.id],
  ])("hides Reopen, Close, Edit and Stage changes from %s", async (_, userId) => {
    renderApp(`/opportunities/${opportunities.lost}`, { userId })
    expect(await screen.findByRole("heading", { name: "Tailwind Traders - Network refresh" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reopen" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()

    renderApp(`/opportunities/${opportunities.qualification}`, { userId })
    const path = (await screen.findAllByRole("navigation", { name: "Stage" })).at(-1)!
    for (const button of within(path).getAllByRole("button")) expect(button).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
  })

  it("lists open Opportunities by default and filters by Stage", async () => {
    renderApp("/opportunities?view=all")
    expect(await listedNames("Opportunities")).toEqual([
      "Fabrikam NV - Security audit",
      "Northwind BV - Cloud migration",
      "Northwind BV - Backup service",
      "Tailwind Traders - Managed workplace",
    ])
  })

  it("filters by a closed Stage", async () => {
    renderApp("/opportunities?view=all&filter=closedLost")
    expect(await listedNames("Opportunities")).toEqual(["Tailwind Traders - Network refresh"])
  })

  it("picks the Stage filter from the list", async () => {
    const user = userEvent.setup()
    const { router } = renderApp("/opportunities?view=all")
    await listedNames("Opportunities")
    await user.click(screen.getByRole("combobox", { name: "Stage" }))
    await user.click(await screen.findByRole("option", { name: "Closed Won" }))
    expect(router.state.location.search).toBe("?view=all&filter=closedWon")
    expect(await listedNames("Opportunities")).toEqual(["Fabrikam NV - Laptops"])
  })

  it("marks an open Opportunity past its Expected close date as Overdue", async () => {
    renderApp("/opportunities", { userId: alex.id })
    const table = await screen.findByRole("table", { name: "Opportunities" })
    const row = (await within(table).findByRole("link", { name: "Fabrikam NV - Security audit" })).closest("tr")!
    expect(within(row).getByText("Overdue")).toBeInTheDocument()
  })

  it("shows Overdue on the record page", async () => {
    renderApp(`/opportunities/${opportunities.proposal}`, { userId: alex.id })
    await screen.findByRole("heading", { name: "Fabrikam NV - Security audit" })
    expect(within(recordHeader()).getByText("Overdue")).toBeInTheDocument()
  })

  it("finds Opportunities in global search", async () => {
    renderApp("/search?q=cloud")
    const group = await screen.findByRole("region", { name: "Opportunities (1)" })
    expect(within(group).getByRole("link", { name: "Northwind BV - Cloud migration" })).toBeInTheDocument()
  })
})
