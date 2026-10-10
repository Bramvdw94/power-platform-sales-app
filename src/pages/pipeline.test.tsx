import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele } = SEED_USERS
const { opportunities } = SEED_IDS

function renderPipeline(userId: Id) {
  const router = createMemoryRouter(routes, { initialEntries: ["/pipeline"] })
  return renderWithGateway(<RouterProvider router={router} />, { userId })
}

/** The header figure under a label: Open pipeline, Weighted pipeline or Open Opportunities. */
function headerFigure(label: string) {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent
}

function column(stage: string) {
  return screen.getByRole("region", { name: stage })
}

function card(name: string) {
  return screen.getByRole("article", { name })
}

/** HTML5 drag and drop as the browser fires it: drag start on the card, then over and drop on the column. */
function drag(from: HTMLElement, to: HTMLElement) {
  fireEvent.dragStart(from)
  fireEvent.dragOver(to)
  fireEvent.drop(to)
  fireEvent.dragEnd(from)
}

async function pick(user: ReturnType<typeof userEvent.setup>, filter: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: filter }))
  await user.click(await screen.findByRole("option", { name: option }))
}

beforeEach(() => setViewport("desktop"))

describe("Pipeline flow", () => {
  it("opens the Board on My team with closed deals hidden, with totals and weighted totals", async () => {
    renderPipeline(megan.id)

    expect(await screen.findByRole("article", { name: "Northwind BV - Cloud migration" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Board", selected: true })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Owner" })).toHaveTextContent("My team")
    expect(screen.getByRole("combobox", { name: "Close date" })).toHaveTextContent("Any close date")
    expect(screen.getByRole("checkbox", { name: "Show closed" })).not.toBeChecked()

    // Megan's team: her Negotiation deal, Adele's Qualification and Alex's Proposal; not Diego's, not closed ones.
    expect(screen.queryByRole("article", { name: "Northwind BV - Backup service" })).not.toBeInTheDocument()
    expect(screen.queryByRole("article", { name: "Fabrikam NV - Laptops" })).not.toBeInTheDocument()
    expect(headerFigure("Open pipeline")).toBe("€188,000")
    expect(headerFigure("Weighted pipeline")).toBe("€110,800")
    expect(headerFigure("Open Opportunities")).toBe("3")
    expect(column("Negotiation")).toHaveTextContent("1 · Total €120,000 · weighted €96,000")
    expect(column("Proposal")).toHaveTextContent("1 · Total €20,000 · weighted €10,000")

    const migration = card("Northwind BV - Cloud migration")
    expect(migration).toHaveTextContent("Northwind BV")
    expect(migration).toHaveTextContent("80%")
    expect(within(migration).getByRole("img", { name: "Owner Megan Bowen" })).toHaveTextContent("MB")
    expect(card("Fabrikam NV - Security audit")).toHaveTextContent("Overdue")
  })

  it("opens the Funnel on a phone, expanding a Stage to its Opportunities", async () => {
    setViewport("phone")
    const user = userEvent.setup()
    renderPipeline(megan.id)

    expect(await screen.findByRole("tab", { name: "Funnel", selected: true })).toBeInTheDocument()
    const negotiation = await screen.findByRole("button", { name: /Negotiation/ })
    expect(negotiation).toHaveAttribute("aria-expanded", "false")
    await user.click(negotiation)
    const row = within(column("Negotiation")).getByRole("listitem", { name: "Northwind BV - Cloud migration" })
    expect(within(row).getByRole("combobox", { name: "Stage of Northwind BV - Cloud migration" })).toHaveValue("negotiation")
  })

  it("shows closed deals and everyone's on request, Closed Won counting the actual value", async () => {
    const user = userEvent.setup()
    renderPipeline(megan.id)
    await screen.findByRole("article", { name: "Northwind BV - Cloud migration" })

    await pick(user, "Owner", "Everyone")
    await user.click(screen.getByRole("checkbox", { name: "Show closed" }))

    expect(await screen.findByRole("article", { name: "Fabrikam NV - Laptops" })).toBeInTheDocument()
    expect(card("Northwind BV - Backup service")).toBeInTheDocument()
    expect(column("Closed Won")).toHaveTextContent("1 · Total €27,500")
    // Closed deals don't count toward the open pipeline.
    expect(headerFigure("Open Opportunities")).toBe("4")
  })

  it("moves a card to another Stage, resetting its Probability", async () => {
    const { store } = renderPipeline(adele.id)
    const tailwind = await screen.findByRole("article", { name: "Tailwind Traders - Managed workplace" })

    drag(tailwind, column("Proposal"))

    expect(await within(column("Proposal")).findByRole("article", { name: "Tailwind Traders - Managed workplace" })).toBeInTheDocument()
    expect(store.opportunities.get(opportunities.qualification)).toMatchObject({ stage: "proposal", probability: 50 })
  })

  it("asks for a Lost reason when a card is dropped on Closed Lost", async () => {
    const user = userEvent.setup()
    const { store } = renderPipeline(adele.id)
    const tailwind = await screen.findByRole("article", { name: "Tailwind Traders - Managed workplace" })

    drag(tailwind, column("Closed Lost"))

    const dialog = await screen.findByRole("dialog", { name: "Close Opportunity" })
    expect(within(dialog).getByRole("radio", { name: "Closed Lost" })).toBeChecked()
    await user.click(within(dialog).getByRole("button", { name: "Close as lost" }))
    expect(within(dialog).getByText("Pick a Lost reason.")).toBeInTheDocument()
    expect(store.opportunities.get(opportunities.qualification)?.stage).toBe("qualification")

    await user.selectOptions(within(dialog).getByLabelText(/Lost reason/), "Price")
    await user.click(within(dialog).getByRole("button", { name: "Close as lost" }))

    await waitFor(() => expect(screen.queryByRole("article", { name: "Tailwind Traders - Managed workplace" })).not.toBeInTheDocument())
    expect(store.opportunities.get(opportunities.qualification)).toMatchObject({ stage: "closedLost", lostReason: "price" })
  })

  it("reopens a closed card dragged back to an open Stage", async () => {
    const user = userEvent.setup()
    const { store } = renderPipeline(adele.id)
    await screen.findByRole("article", { name: "Tailwind Traders - Managed workplace" })
    await user.click(screen.getByRole("checkbox", { name: "Show closed" }))
    const lost = await within(column("Closed Lost")).findByRole("article", { name: "Tailwind Traders - Network refresh" })

    drag(lost, column("Needs Analysis"))

    expect(await within(column("Needs Analysis")).findByRole("article", { name: "Tailwind Traders - Network refresh" })).toBeInTheDocument()
    expect(store.opportunities.get(opportunities.lost)).toMatchObject({ stage: "needsAnalysis", probability: 25, lostReason: undefined })
  })

  it("won't move a peer's card", async () => {
    const user = userEvent.setup()
    const { store } = renderPipeline(adele.id)
    await screen.findByRole("article", { name: "Tailwind Traders - Managed workplace" })
    await pick(user, "Owner", "Everyone")

    const peers = await screen.findByRole("article", { name: "Fabrikam NV - Security audit" })
    expect(peers).toHaveAttribute("draggable", "false")
    expect(within(peers).queryByRole("combobox")).not.toBeInTheDocument()
    drag(peers, column("Negotiation"))
    expect(store.opportunities.get(opportunities.proposal)?.stage).toBe("proposal")

    await user.click(screen.getByRole("tab", { name: "Funnel" }))
    await user.click(screen.getByRole("button", { name: /Proposal/ }))
    expect(screen.getByRole("combobox", { name: "Stage of Fabrikam NV - Security audit" })).toBeDisabled()
  })
})
