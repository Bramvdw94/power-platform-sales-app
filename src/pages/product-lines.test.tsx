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
const { opportunities: O, products: PR, productLines: PL } = SEED_IDS

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return { ...renderWithGateway(<RouterProvider router={router} />, options), router }
}

function highlight(label: string) {
  const header = screen.getByRole("heading", { level: 1 }).closest("header")!
  return within(header).getByText(label, { selector: "dt" }).nextElementSibling?.textContent
}

async function linesRegion() {
  return within(await screen.findByRole("region", { name: "Product lines" }))
}

async function addLine(user: ReturnType<typeof userEvent.setup>, search: string, option: RegExp, quantity: string) {
  await user.click((await linesRegion()).getByRole("button", { name: "Add line" }))
  const dialog = await screen.findByRole("dialog", { name: "Add Product line" })
  await user.type(within(dialog).getByRole("combobox", { name: /Product/ }), search)
  await user.click(await within(dialog).findByRole("option", { name: option }))
  await waitFor(() => expect(within(dialog).getByLabelText(/Unit price/)).not.toHaveValue(null))
  await user.clear(within(dialog).getByLabelText(/Quantity/))
  await user.type(within(dialog).getByLabelText(/Quantity/), quantity)
  await user.click(within(dialog).getByRole("button", { name: "Save" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
}

beforeEach(() => setViewport("desktop"))

describe("Product lines on an Opportunity", () => {
  it("makes the Estimated value read-only and equal to the line total when a line is added", async () => {
    const user = userEvent.setup()
    renderApp(`/opportunities/${O.qualification}`, { userId: adele.id })
    expect(await screen.findByText("No Product lines", { exact: false })).toBeInTheDocument()
    expect(highlight("Estimated value")).toBe("€48,000")

    await addLine(user, "consult", /Consulting/, "2")
    const lines = await linesRegion()
    expect(await lines.findAllByText("€250.00", { selector: "td" })).toHaveLength(2) // the line and the total
    expect(within(screen.getByRole("heading", { level: 1 }).closest("header")!).getByText("€250")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit Opportunity" })
    const estimated = within(form).getByLabelText(/Estimated value/)
    expect(estimated).toHaveAttribute("readonly")
    expect(estimated).toHaveValue(250)
    await user.click(within(form).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("form", { name: "Edit Opportunity" })).not.toBeInTheDocument())
  })

  it("copies the Product's description and List price into the line and lets the Owner change them", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${O.qualification}`, { userId: adele.id })
    await user.click((await linesRegion()).getByRole("button", { name: "Add line" }))
    const dialog = await screen.findByRole("dialog", { name: "Add Product line" })
    await user.type(within(dialog).getByRole("combobox", { name: /Product/ }), "workshop")
    await user.click(await within(dialog).findByRole("option", { name: /Workshop day/ }))
    await waitFor(() => expect(within(dialog).getByLabelText(/Unit price/)).toHaveValue(1450))
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue("On-site workshop of one day, up to 12 people.")

    await user.clear(within(dialog).getByLabelText(/Unit price/))
    await user.type(within(dialog).getByLabelText(/Unit price/), "1300")
    await user.type(within(dialog).getByLabelText(/Discount/), "{Control>}a{/Control}10")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))

    await waitFor(() => expect([...store.productLines.values()]).toHaveLength(6))
    const added = [...store.productLines.values()].find((l) => l.opportunityId === O.qualification)!
    expect(added).toMatchObject({ unitPrice: 1300, listPriceAtAdd: 1450, discountPercent: 10, lineAmount: 1170 })
    expect(store.opportunities.get(O.qualification)?.estimatedValue).toBe(1170)
    expect(await (await linesRegion()).findByText("List €1,450.00")).toBeInTheDocument()
  })

  it("lets the Owner type the Estimated value again after the last line is removed", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${O.proposal}`, { userId: alex.id })
    const lines = await linesRegion()
    await lines.findByText("Consulting")
    for (const name of ["Consulting", "Workshop day", "Cloud licence"]) {
      await user.click(screen.getByRole("button", { name: `Remove ${name}` }))
      await waitFor(() => expect(screen.queryByRole("button", { name: `Remove ${name}` })).not.toBeInTheDocument())
    }
    expect(await screen.findByText("No Product lines", { exact: false })).toBeInTheDocument()
    expect(store.opportunities.get(O.proposal)?.estimatedValue).toBe(250)

    await user.click(screen.getByRole("button", { name: "Edit" }))
    const field = within(screen.getByRole("form", { name: "Edit Opportunity" })).getByLabelText(/Estimated value/)
    expect(field).not.toHaveAttribute("readonly")
    await user.clear(field)
    await user.type(field, "21000")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(store.opportunities.get(O.proposal)?.estimatedValue).toBe(21000))
  })

  it("edits a line and the total follows", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${O.proposal}`, { userId: alex.id })
    await user.click(await (await linesRegion()).findByRole("button", { name: "Edit Consulting" }))
    const dialog = await screen.findByRole("dialog", { name: "Edit Product line" })
    expect(within(dialog).getByLabelText(/Product/)).toHaveValue("Consulting")
    await user.clear(within(dialog).getByLabelText(/Quantity/))
    await user.type(within(dialog).getByLabelText(/Quantity/), "80")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(store.productLines.get(PL.proposalConsulting)?.lineAmount).toBe(10000))
    expect(store.opportunities.get(O.proposal)?.estimatedValue).toBe(17500)
  })

  it("does not offer a retired Product", async () => {
    const user = userEvent.setup()
    renderApp(`/opportunities/${O.qualification}`, { userId: adele.id })
    await user.click((await linesRegion()).getByRole("button", { name: "Add line" }))
    const dialog = await screen.findByRole("dialog", { name: "Add Product line" })
    await user.type(within(dialog).getByRole("combobox", { name: /Product/ }), "legacy")
    await waitFor(() => expect(within(dialog).queryByRole("option")).not.toBeInTheDocument())
    await user.clear(within(dialog).getByRole("combobox", { name: /Product/ }))
    await user.type(within(dialog).getByRole("combobox", { name: /Product/ }), "cloud")
    expect(await within(dialog).findByRole("option", { name: /Cloud licence/ })).toBeInTheDocument()
  })

  it("asks for a Product and sensible values", async () => {
    const user = userEvent.setup()
    renderApp(`/opportunities/${O.qualification}`, { userId: adele.id })
    await user.click((await linesRegion()).getByRole("button", { name: "Add line" }))
    const dialog = await screen.findByRole("dialog", { name: "Add Product line" })
    await user.clear(within(dialog).getByLabelText(/Quantity/))
    await user.type(within(dialog).getByLabelText(/Quantity/), "0")
    await user.type(within(dialog).getByLabelText(/Unit price/), "10")
    await user.type(within(dialog).getByLabelText(/Discount/), "{Control>}a{/Control}101")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(within(dialog).getByText("Pick a Product.")).toBeInTheDocument()
    expect(within(dialog).getByText("Quantity must be above 0.")).toBeInTheDocument()
    expect(within(dialog).getByText("Discount is a percentage from 0 to 100.")).toBeInTheDocument()
  })

  it("shows the lines read-only on a closed Opportunity", async () => {
    renderApp(`/opportunities/${O.won}`, { userId: alex.id })
    const lines = await linesRegion()
    expect(await lines.findByText("Workshop day")).toBeInTheDocument()
    expect(lines.getByText("€30,000.00", { selector: "td" })).toBeInTheDocument()
    expect(lines.queryByRole("button", { name: "Add line" })).not.toBeInTheDocument()
    expect(lines.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument()
    expect(lines.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument()
  })

  it.each([
    ["a peer", alex.id, O.qualification],
    ["a salesperson outside the team", diego.id, O.qualification],
  ])("shows %s the lines but no way to change them", async (_label, userId, opportunity) => {
    renderApp(`/opportunities/${opportunity}`, { userId })
    const lines = await linesRegion()
    expect(await lines.findByText("No Product lines.")).toBeInTheDocument()
    expect(lines.queryByRole("button", { name: "Add line" })).not.toBeInTheDocument()
  })

  it("lets the Owner's manager change the lines", async () => {
    renderApp(`/opportunities/${O.proposal}`, { userId: megan.id })
    expect(await (await linesRegion()).findByRole("button", { name: "Add line" })).toBeInTheDocument()
  })

  it("keeps lines on screen that name a Product the user can no longer pick", async () => {
    const { store } = renderApp(`/opportunities/${O.proposal}`, { userId: alex.id })
    store.products.set(PR.consultingHour, { ...store.products.get(PR.consultingHour)!, retired: true })
    expect(await (await linesRegion()).findByText("Consulting")).toBeInTheDocument()
  })
})
