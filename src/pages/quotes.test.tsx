import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele, alex, diego } = SEED_USERS
const { opportunities: O, quotes: Q } = SEED_IDS

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return { ...renderWithGateway(<RouterProvider router={router} />, options), router }
}

function highlight(label: string) {
  const header = screen.getByRole("heading", { level: 1 }).closest("header")!
  return within(header).getByText(label, { selector: "dt" }).nextElementSibling?.textContent
}

async function quotesRegion() {
  return within(await screen.findByRole("region", { name: "Quotes" }))
}

async function linesRegion() {
  return within(await screen.findByRole("region", { name: "Quote lines" }))
}

const action = (name: string) => screen.queryByRole("button", { name })

beforeEach(() => setViewport("desktop"))

describe("The Quotes panel on an Opportunity", () => {
  it("lists each Quote with status, sent date, Valid until and net total, and marks an expired Sent Quote", async () => {
    renderApp(`/opportunities/${O.proposal}`, { userId: alex.id })
    const quotes = await quotesRegion()
    const table = await quotes.findByRole("table", { name: "Quotes" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["Q-00003", "Q-00001 (rev 1)", "Q-00001", "Q-00002"])

    const sent = rows[1]
    expect(within(sent).getByText("Sent")).toBeInTheDocument()
    expect(within(sent).queryByText("Expired")).not.toBeInTheDocument()
    expect(within(sent).getByText("€12,750.00")).toBeInTheDocument()
    expect(within(sent).getAllByRole("cell")[2].textContent).not.toBe("—")

    const expired = rows[3]
    expect(within(expired).getByText("Sent")).toBeInTheDocument()
    expect(within(expired).getByText("Expired")).toBeInTheDocument()
    expect(within(rows[0]).getByText("Draft")).toBeInTheDocument()
    expect(within(rows[0]).getAllByRole("cell")[2].textContent).toBe("—")
  })

  it("makes a Quote from the Opportunity: its Account, Contact and Product lines are copied", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${O.proposal}`, { userId: alex.id })
    await user.click((await quotesRegion()).getByRole("button", { name: "New quote" }))

    expect(await screen.findByRole("heading", { level: 1, name: "Q-00006" })).toBeInTheDocument()
    expect(highlight("Status")).toBe("Draft")
    expect(highlight("Account")).toBe("Fabrikam NV")
    expect(highlight("Net total")).toBe("€20,000.00")
    expect(highlight("Gross total")).toBe("€24,200.00")
    const lines = await linesRegion()
    expect(await lines.findByText("Consulting")).toBeInTheDocument()
    expect(lines.getByText("Workshop day")).toBeInTheDocument()
    expect(lines.getByText("Cloud licence")).toBeInTheDocument()
    expect(store.quotes.size).toBe(7)
    expect(store.opportunities.get(O.proposal)?.estimatedValue).toBe(20000)
  })

  it("offers no new Quote to a peer, nor on a closed Opportunity", async () => {
    renderApp(`/opportunities/${O.proposal}`, { userId: adele.id })
    const quotes = await quotesRegion()
    expect(await quotes.findByText("Q-00003")).toBeInTheDocument()
    expect(quotes.queryByRole("button", { name: "New quote" })).not.toBeInTheDocument()
  })

  it("offers no new Quote on a closed Opportunity", async () => {
    renderApp(`/opportunities/${O.won}`, { userId: alex.id })
    const quotes = await quotesRegion()
    expect(await quotes.findByText("Q-00004")).toBeInTheDocument()
    expect(quotes.queryByRole("button", { name: "New quote" })).not.toBeInTheDocument()
  })

  it("lets the Owner's manager make one", async () => {
    renderApp(`/opportunities/${O.proposal}`, { userId: megan.id })
    expect(await (await quotesRegion()).findByRole("button", { name: "New quote" })).toBeInTheDocument()
  })
})

describe("A Draft Quote", () => {
  it("shows Edit, Send and Delete to its Owner, and no Accept, Reject or Revise", async () => {
    renderApp(`/quotes/${Q.draft}`, { userId: alex.id })
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument()
    expect(action("Send")).toBeInTheDocument()
    expect(action("Delete")).toBeInTheDocument()
    for (const name of ["Accept", "Reject", "Revise"]) expect(action(name)).not.toBeInTheDocument()
  })

  it("edits its lines on the Quote alone, with VAT per rate on the net total per rate", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.draft}`, { userId: alex.id })
    let lines = await linesRegion()
    expect(await lines.findByText("VAT 9 % on €7,250.00")).toBeInTheDocument()
    expect(lines.getByText("€652.50")).toBeInTheDocument()

    await user.click(lines.getByRole("button", { name: "Add line" }))
    const dialog = await screen.findByRole("dialog", { name: "Add Quote line" })
    await user.type(within(dialog).getByRole("combobox", { name: /Product/ }), "consult")
    await user.click(await within(dialog).findByRole("option", { name: /Consulting/ }))
    await waitFor(() => expect(within(dialog).getByLabelText(/Unit price/)).toHaveValue(125))
    await user.clear(within(dialog).getByLabelText(/Unit price/))
    await user.type(within(dialog).getByLabelText(/Unit price/), "100")
    await user.type(within(dialog).getByLabelText(/Discount/), "{Control>}a{/Control}10")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    lines = await linesRegion()
    expect(await lines.findByText("VAT 21 % on €90.00")).toBeInTheDocument()
    expect(lines.getByText("€18.90")).toBeInTheDocument()
    expect(lines.getAllByText("€7,340.00").length).toBeGreaterThan(0)
    expect(lines.getByText("€8,011.40")).toBeInTheDocument()
    expect(highlight("Net total")).toBe("€7,340.00")
    expect(store.opportunities.get(O.proposal)?.estimatedValue).toBe(20000)
    expect([...store.productLines.values()].filter((l) => l.opportunityId === O.proposal)).toHaveLength(3)

    await user.click(lines.getByRole("button", { name: "Remove Workshop day" }))
    await waitFor(() => expect(highlight("Net total")).toBe("€90.00"))
  })

  it("changes the Contact and Valid until", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.draft}`, { userId: alex.id })
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit Quote" })
    await user.click(within(form).getByRole("button", { name: /Remove Pieter Claes/ }))
    await user.type(within(form).getByRole("combobox", { name: "Contact" }), "lotte")
    await user.click(await within(form).findByRole("option", { name: /Lotte/ }))
    await user.clear(within(form).getByLabelText("Valid until"))
    await user.type(within(form).getByLabelText("Valid until"), "2027-01-15")
    await user.click(within(form).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(store.quotes.get(Q.draft)?.contactId).toBe("con-lotte"))
    expect(store.quotes.get(Q.draft)?.validUntil).toBe("2027-01-15")
    expect(await screen.findByText("Lotte de Groot")).toBeInTheDocument()
  })

  it("is sent: it becomes Sent and loses Edit", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.draft}`, { userId: alex.id })
    await user.click(await screen.findByRole("button", { name: "Send" }))
    const dialog = await screen.findByRole("dialog", { name: /Send quote/ })
    await user.click(within(dialog).getByRole("radio", { name: /Download the PDF/ }))
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Download and mark as sent" })).toBeEnabled())
    await user.click(within(dialog).getByRole("button", { name: "Download and mark as sent" }))
    await waitFor(() => expect(store.quotes.get(Q.draft)?.status).toBe("sent"))
    await waitFor(() => expect(highlight("Status")).toBe("Sent"))
    expect(action("Edit")).not.toBeInTheDocument()
    expect(action("Delete")).not.toBeInTheDocument()
    expect(action("Accept")).toBeInTheDocument()
    expect((await linesRegion()).queryByRole("button", { name: "Add line" })).not.toBeInTheDocument()
  })

  it("is deleted after a confirmation, returning to the Opportunity", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.draft}`, { userId: alex.id })
    await user.click(await screen.findByRole("button", { name: "Delete" }))
    const dialog = await screen.findByRole("dialog", { name: "Delete Quote" })
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(store.quotes.has(Q.draft)).toBe(false))
    expect(await screen.findByRole("heading", { level: 1, name: "Fabrikam NV - Security audit" })).toBeInTheDocument()
  })
})

describe("A Sent Quote", () => {
  it("shows Accept, Reject and Revise but no Edit", async () => {
    renderApp(`/quotes/${Q.sent}`, { userId: alex.id })
    expect(await screen.findByRole("button", { name: "Accept" })).toBeInTheDocument()
    expect(action("Reject")).toBeInTheDocument()
    expect(action("Revise")).toBeInTheDocument()
    for (const name of ["Edit", "Send", "Delete"]) expect(action(name)).not.toBeInTheDocument()
  })

  it("Accept rejects the other Sent Quote and opens Close as won at the net total", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.sent}`, { userId: alex.id })
    await user.click(await screen.findByRole("button", { name: "Accept" }))

    const dialog = await screen.findByRole("dialog", { name: "Close Opportunity" })
    expect(within(dialog).getByLabelText("Closed Won")).toBeChecked()
    expect(within(dialog).getByLabelText(/Actual value/)).toHaveValue(12750)
    expect(store.quotes.get(Q.sent)?.status).toBe("accepted")
    expect(store.quotes.get(Q.expired)?.status).toBe("rejected")

    await user.click(within(dialog).getByRole("button", { name: "Close as won" }))
    await waitFor(() => expect(store.opportunities.get(O.proposal)?.stage).toBe("closedWon"))
    expect(store.opportunities.get(O.proposal)?.actualValue).toBe(12750)
    expect(store.quotes.get(Q.sent)?.status).toBe("accepted")
  })

  it("keeps the Quote Accepted when the Close dialog is cancelled, and offers to close later", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.sent}`, { userId: alex.id })
    await user.click(await screen.findByRole("button", { name: "Accept" }))
    const dialog = await screen.findByRole("dialog", { name: "Close Opportunity" })
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    expect(store.quotes.get(Q.sent)?.status).toBe("accepted")
    expect(store.opportunities.get(O.proposal)?.stage).toBe("proposal")
    await waitFor(() => expect(highlight("Status")).toBe("Accepted"))
    expect(screen.getByText(/Close the Opportunity as won at €12,750.00/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Close Opportunity as won" }))
    expect(await screen.findByLabelText(/Actual value/)).toHaveValue(12750)
  })

  it("Revise keeps the number and opens the new Draft", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.sent}`, { userId: alex.id })
    await user.click(await screen.findByRole("button", { name: "Revise" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Q-00001 (rev 2)" })).toBeInTheDocument()
    expect(highlight("Status")).toBe("Draft")
    expect(store.quotes.get(Q.sent)?.status).toBe("revised")
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument()
    expect((await linesRegion()).getByText("Consulting")).toBeInTheDocument()
  })

  it("Reject records the refusal", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.sent}`, { userId: alex.id })
    await user.click(await screen.findByRole("button", { name: "Reject" }))
    await waitFor(() => expect(store.quotes.get(Q.sent)?.status).toBe("rejected"))
    await waitFor(() => expect(highlight("Status")).toBe("Rejected"))
    expect(action("Accept")).not.toBeInTheDocument()
  })

  it("shows a Sent Quote past its Valid until as expired while it stays Sent", async () => {
    renderApp(`/quotes/${Q.expired}`, { userId: alex.id })
    expect((await screen.findAllByText("Expired")).length).toBeGreaterThan(0)
    expect(highlight("Status")).toContain("Sent")
    expect(action("Accept")).toBeInTheDocument()
  })
})

describe("Quote actions are for the Opportunity's Owner and manager", () => {
  it.each([
    ["a peer", adele.id],
    ["a salesperson outside the team", diego.id],
  ])("%s reads a Quote but has none of its actions", async (_label, userId) => {
    renderApp(`/quotes/${Q.sent}`, { userId })
    expect(await screen.findByRole("heading", { level: 1, name: "Q-00001 (rev 1)" })).toBeInTheDocument()
    expect((await linesRegion()).getByText("Consulting")).toBeInTheDocument()
    for (const name of ["Edit", "Send", "Delete", "Accept", "Reject", "Revise"]) expect(action(name)).not.toBeInTheDocument()
  })

  it("a peer has no Edit on a Draft either", async () => {
    renderApp(`/quotes/${Q.draft}`, { userId: adele.id })
    expect(await screen.findByRole("heading", { level: 1, name: "Q-00003" })).toBeInTheDocument()
    expect(action("Edit")).not.toBeInTheDocument()
    expect((await linesRegion()).queryByRole("button", { name: "Add line" })).not.toBeInTheDocument()
  })

  it("the Owner's manager has them", async () => {
    renderApp(`/quotes/${Q.sent}`, { userId: megan.id })
    expect(await screen.findByRole("button", { name: "Accept" })).toBeInTheDocument()
  })
})

describe("Quotes on a closed Opportunity", () => {
  it("are read-only, with a note saying why", async () => {
    renderApp(`/quotes/${Q.accepted}`, { userId: alex.id })
    expect(await screen.findByText("This Opportunity is closed, so its Quotes are read-only.")).toBeInTheDocument()
    expect(highlight("Status")).toBe("Accepted")
    for (const name of ["Edit", "Send", "Accept", "Reject", "Revise", "Close Opportunity as won"]) expect(action(name)).not.toBeInTheDocument()
  })
})

describe("Close as lost on the Opportunity", () => {
  it("sets the Sent Quotes to Rejected", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${O.proposal}`, { userId: alex.id })
    await user.click(await screen.findByRole("button", { name: "Close" }))
    const dialog = await screen.findByRole("dialog", { name: "Close Opportunity" })
    await user.click(within(dialog).getByLabelText("Closed Lost"))
    await user.selectOptions(within(dialog).getByLabelText(/Lost reason/), "Price")
    await user.click(within(dialog).getByRole("button", { name: "Close as lost" }))
    await waitFor(() => expect(store.opportunities.get(O.proposal)?.stage).toBe("closedLost"))
    expect(store.quotes.get(Q.sent)?.status).toBe("rejected")
    expect(store.quotes.get(Q.expired)?.status).toBe("rejected")
    expect(store.quotes.get(Q.draft)?.status).toBe("draft")
  })
})
