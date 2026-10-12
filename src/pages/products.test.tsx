import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele } = SEED_USERS
const { products } = SEED_IDS

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = renderWithGateway(<RouterProvider router={router} />, options)
  return { ...result, router }
}

async function listedNames() {
  const table = await screen.findByRole("table", { name: "Products" })
  await within(table).findAllByRole("link")
  return within(table)
    .getAllByRole("link")
    .map((link) => link.textContent)
}

beforeEach(() => setViewport("desktop"))

describe("Products", () => {
  it("shows the active catalogue to a salesperson, without New", async () => {
    renderApp("/products", { userId: adele.id })
    expect(await listedNames()).toEqual(["Cloud licence", "Consulting", "Workshop day"])
    expect(screen.queryByRole("button", { name: "New Product" })).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "View" })).not.toBeInTheDocument()
    const table = screen.getByRole("table", { name: "Products" })
    expect(within(table).getByText("€125.00")).toBeInTheDocument()
  })

  it("lists Retired Products on request and finds a Product by its code", async () => {
    const user = userEvent.setup()
    renderApp("/products", { userId: adele.id })
    await listedNames()

    await user.click(screen.getByRole("combobox", { name: "Status" }))
    await user.click(await screen.findByRole("option", { name: "Retired" }))
    expect(await screen.findByRole("link", { name: "Legacy support" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Consulting" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("combobox", { name: "Status" }))
    await user.click(await screen.findByRole("option", { name: "All Products" }))
    await user.type(screen.getByRole("searchbox", { name: "Search Products" }), "ws-d{Enter}")
    expect(await screen.findByRole("link", { name: "Workshop day" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Consulting" })).not.toBeInTheDocument()
  })

  it("shows a Product read-only to a salesperson", async () => {
    renderApp(`/products/${products.consultingHour}`, { userId: adele.id })
    expect(await screen.findByRole("heading", { name: "Consulting" })).toBeInTheDocument()
    const details = screen.getByRole("region", { name: "Details" })
    expect(within(details).getByText("€125.00")).toBeInTheDocument()
    expect(within(details).getByText("21 %")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Retire" })).not.toBeInTheDocument()
  })

  it("lets Megan create a Product", async () => {
    const user = userEvent.setup()
    const { router, store } = renderApp("/products", { userId: megan.id })

    await user.click(await screen.findByRole("button", { name: "New Product" }))
    const dialog = await screen.findByRole("dialog", { name: "New Product" })
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(within(dialog).getByText("Name is required.")).toBeInTheDocument()
    expect(within(dialog).getByText("Product code is required.")).toBeInTheDocument()
    expect(within(dialog).getByText("Pick a Unit.")).toBeInTheDocument()
    expect(within(dialog).getByText("List price is required (0 or more).")).toBeInTheDocument()
    expect(within(dialog).getByText("Pick a VAT rate.")).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/^Name/), "Managed backup")
    await user.type(within(dialog).getByLabelText(/^Product code/), "BKP-M")
    await user.click(within(dialog).getByLabelText(/^Unit/))
    await user.click(await screen.findByRole("option", { name: "Month" }))
    await user.type(within(dialog).getByLabelText(/^List price/), "39.5")
    await user.click(within(dialog).getByLabelText(/^VAT rate/))
    await user.click(await screen.findByRole("option", { name: "9 %" }))
    await user.click(within(dialog).getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("heading", { name: "Managed backup" })).toBeInTheDocument()
    const id = router.state.location.pathname.split("/").pop()!
    expect(store.products.get(id)).toMatchObject({ code: "BKP-M", unit: "month", listPrice: 39.5, vatRate: 9, retired: false })
  })

  it("refuses a duplicate Product code", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/products?new=1", { userId: megan.id })
    const before = store.products.size

    const dialog = await screen.findByRole("dialog", { name: "New Product" })
    await user.type(within(dialog).getByLabelText(/^Name/), "Another consulting")
    await user.type(within(dialog).getByLabelText(/^Product code/), "cons-hr")
    await user.click(within(dialog).getByLabelText(/^Unit/))
    await user.click(await screen.findByRole("option", { name: "Hour" }))
    await user.type(within(dialog).getByLabelText(/^List price/), "100")
    await user.click(within(dialog).getByLabelText(/^VAT rate/))
    await user.click(await screen.findByRole("option", { name: "21 %" }))
    await user.click(within(dialog).getByRole("button", { name: "Save" }))

    expect(await within(dialog).findByText("This Product code is already used.")).toBeInTheDocument()
    expect(store.products.size).toBe(before)
  })

  it("lets Megan change a List price and retire a Product", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/products/${products.workshopDay}`, { userId: megan.id })

    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit Product" })
    const price = within(form).getByLabelText(/^List price/)
    await user.clear(price)
    await user.type(price, "1500")
    await user.click(within(form).getByRole("button", { name: "Save" }))
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Details" })).getByText("€1,500.00")).toBeInTheDocument()
    expect(store.products.get(products.workshopDay)?.listPrice).toBe(1500)

    await user.click(screen.getByRole("button", { name: "Retire" }))
    const dialog = await screen.findByRole("dialog", { name: "Retire Product" })
    await user.click(within(dialog).getByRole("button", { name: "Retire" }))

    expect(await screen.findAllByText("Retired")).not.toHaveLength(0)
    expect(store.products.get(products.workshopDay)?.retired).toBe(true)
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Retire" })).not.toBeInTheDocument()
  })
})
