import { beforeEach, describe, expect, it, vi } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele } = SEED_USERS
const { templates: TPL } = SEED_IDS

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return { ...renderWithGateway(<RouterProvider router={router} />, options), router }
}

const blockNames = async () => within(await screen.findByRole("list", { name: "Blocks on the page" })).getAllByRole("listitem").map((li) => within(li).getAllByRole("button")[0].textContent)
const sheet = () => within(screen.getByLabelText("Quote PDF preview"))

beforeEach(() => {
  setViewport("desktop")
  URL.createObjectURL = vi.fn(() => "blob:test")
  URL.revokeObjectURL = vi.fn()
})

describe("The Products page sections", () => {
  it("has Products, Quote templates and Quote settings as tabs", async () => {
    const user = userEvent.setup()
    renderApp("/products", { userId: adele.id })
    const nav = await screen.findByRole("navigation", { name: "Products sections" })
    await user.click(within(nav).getByRole("link", { name: "Quote templates" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Quote templates" })).toBeInTheDocument()
    await user.click(within(screen.getByRole("navigation", { name: "Products sections" })).getByRole("link", { name: "Quote settings" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Quote settings" })).toBeInTheDocument()
  })
})

describe("The Quote template builder", () => {
  it("shows the three starters with the Business letter as Default, and an A4 preview", async () => {
    renderApp("/products/quote-templates", { userId: megan.id })
    const pick = await screen.findByLabelText("Template")
    expect(within(pick).getAllByRole("option").map((o) => o.textContent)).toEqual(["Business letter (Default)", "Order form", "Proposal"])
    expect(await blockNames()).toEqual(["Header", "Customer address", "Reference strip", "Title and intro", "Product lines", "Totals and VAT per rate", "Terms", "Your contact person", "Footer"])
    expect(sheet().getByText("Offerte: CRM rollout Fabrikam")).toBeInTheDocument()
    expect(sheet().getByText("€ 10.491,13", { exact: false })).toBeInTheDocument()
  })

  it("is read-only for a salesperson: they can look at templates but not change them", async () => {
    renderApp("/products/quote-templates", { userId: adele.id })
    await blockNames()
    expect(screen.getByText("Only a Catalogue manager changes Quote templates.")).toBeInTheDocument()
    for (const name of ["Save template", "New template"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Move up/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toBeDisabled()
  })

  it("moves Blocks with the keyboard buttons and saves the order", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/products/quote-templates", { userId: megan.id })
    await blockNames()
    await user.click(screen.getByRole("button", { name: "Move up Your contact person" }))
    await user.click(screen.getByRole("button", { name: "Move down Customer address" }))
    expect(await blockNames()).toEqual(["Header", "Reference strip", "Customer address", "Title and intro", "Product lines", "Totals and VAT per rate", "Your contact person", "Terms", "Footer"])
    await user.click(screen.getByRole("button", { name: "Save template" }))
    await waitFor(() => expect(store.quoteTemplates.get(TPL.businessLetter)?.definition.blocks.map((b) => b.type)).toEqual(["header", "reference", "address", "title", "lines", "totals", "contact", "terms", "footer"]))
  })

  it("keeps Product lines, Totals and the Footer on the page", async () => {
    renderApp("/products/quote-templates", { userId: megan.id })
    await blockNames()
    for (const name of ["Product lines", "Totals and VAT per rate", "Footer"]) expect(screen.getByRole("button", { name: `Remove ${name}` })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move up Footer" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move down Footer" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move down Your contact person" })).toBeDisabled()
  })

  it("removes and re-adds a Block from the tray", async () => {
    const user = userEvent.setup()
    renderApp("/products/quote-templates", { userId: megan.id })
    await blockNames()
    await user.click(screen.getByRole("button", { name: "Remove Your contact person" }))
    expect(await blockNames()).not.toContain("Your contact person")
    expect(sheet().queryByText("Uw contactpersoon")).not.toBeInTheDocument()
    const tray = screen.getByRole("group", { name: "Blocks you can add" })
    await user.click(within(tray).getByRole("button", { name: "Add Your contact person" }))
    expect((await blockNames()).at(-2)).toBe("Your contact person")
    expect((await blockNames()).at(-1)).toBe("Footer")
  })

  it("adds a Block by dragging it from the tray onto the page, and removes one by dragging it back", async () => {
    renderApp("/products/quote-templates", { userId: megan.id })
    await blockNames()
    const tray = screen.getByRole("group", { name: "Blocks you can add" })
    fireEvent.dragStart(within(tray).getByText("Acceptance and signature").closest("span")!)
    const reference = screen.getByLabelText("Quote PDF preview").querySelector('[data-block="reference"]')!
    fireEvent.dragOver(reference)
    fireEvent.drop(reference)
    // jsdom reports no pointer position, which counts as the lower half: the Block lands after the one it was dropped on.
    expect((await blockNames()).indexOf("Acceptance and signature")).toBe(3)

    fireEvent.dragStart(screen.getByLabelText("Quote PDF preview").querySelector('[data-block="contact"]')!)
    fireEvent.dragOver(tray)
    fireEvent.drop(tray)
    expect(await blockNames()).not.toContain("Your contact person")
  })

  it("reorders Blocks by dragging them on the page, and never moves the Footer off the bottom", async () => {
    renderApp("/products/quote-templates", { userId: megan.id })
    await blockNames()
    const page = screen.getByLabelText("Quote PDF preview")
    fireEvent.dragStart(page.querySelector('[data-block="terms"]')!)
    const header = page.querySelector('[data-block="header"]')!
    fireEvent.dragOver(header)
    fireEvent.drop(header)
    expect((await blockNames()).slice(0, 3)).toEqual(["Header", "Terms", "Customer address"])
    expect((await blockNames()).at(-1)).toBe("Footer")
  })

  it("edits a Block's options and shows them on the page", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/products/quote-templates", { userId: megan.id })
    await blockNames()
    expect(sheet().getByText("KORTING", { exact: false })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Product lines" }))
    const options = screen.getByRole("region", { name: "Product lines options" })
    await user.click(within(options).getByRole("checkbox", { name: "Discount" }))
    await waitFor(() => expect(sheet().queryByText("KORTING", { exact: false })).not.toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Save template" }))
    await waitFor(() => expect(store.quoteTemplates.get(TPL.businessLetter)?.definition.blocks.find((b) => b.type === "lines")?.options).toMatchObject({ discount: false, code: true }))
  })

  it("changes the page style: accent colour, typeface, logo position and language", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/products/quote-templates", { userId: megan.id })
    await blockNames()
    await user.click(screen.getByRole("button", { name: "Accent #7a1f3d" }))
    await user.selectOptions(screen.getByLabelText("Typeface"), "serif")
    await user.selectOptions(screen.getByLabelText("Logo position"), "left")
    await user.selectOptions(screen.getByLabelText("Language"), "en")
    expect(await sheet().findByText("Quote: CRM rollout Fabrikam")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Save template" }))
    await waitFor(() => expect(store.quoteTemplates.get(TPL.businessLetter)?.definition.style).toEqual({ accent: "#7a1f3d", font: "serif", logoPosition: "left", language: "en" }))
  })

  it("makes another template the Default, and there is only ever one", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/products/quote-templates", { userId: megan.id })
    await blockNames()
    await user.selectOptions(screen.getByLabelText("Template"), "Proposal")
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Proposal"))
    await user.click(screen.getByRole("checkbox", { name: "Default template" }))
    await user.click(screen.getByRole("button", { name: "Save template" }))
    await waitFor(() => expect(store.quoteTemplates.get(TPL.proposal)?.isDefault).toBe(true))
    expect([...store.quoteTemplates.values()].filter((t) => t.isDefault)).toHaveLength(1)
    expect(store.quoteTemplates.get(TPL.businessLetter)?.isDefault).toBe(false)
  })

  it("creates a new template as a copy of the one on screen", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/products/quote-templates", { userId: megan.id })
    await blockNames()
    await user.click(screen.getByRole("button", { name: "New template" }))
    const dialog = await screen.findByRole("dialog", { name: "New template" })
    await user.type(within(dialog).getByLabelText(/Name/), "Offerte kort")
    await user.click(within(dialog).getByRole("button", { name: "Create template" }))
    await waitFor(() => expect([...store.quoteTemplates.values()].map((t) => t.name)).toContain("Offerte kort"))
    const created = [...store.quoteTemplates.values()].find((t) => t.name === "Offerte kort")!
    expect(created.isDefault).toBe(false)
    expect(created.definition).toEqual(store.quoteTemplates.get(TPL.businessLetter)?.definition)
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Offerte kort"))
  })

  it("opens a PDF preview with example data", async () => {
    const user = userEvent.setup()
    renderApp("/products/quote-templates", { userId: megan.id })
    await blockNames()
    await user.click(screen.getByRole("button", { name: "Preview PDF" }))
    const dialog = await screen.findByRole("dialog", { name: /Preview Business letter/ })
    expect(await within(dialog).findByLabelText("Quote PDF preview")).toBeInTheDocument()
  })
})

describe("Quote settings", () => {
  it("shows the settings to a salesperson, who cannot change them", async () => {
    renderApp("/products/quote-settings", { userId: adele.id })
    const form = await screen.findByRole("form", { name: "Quote settings" })
    expect(within(form).getByLabelText("Company name")).toHaveValue("Northwind Solutions B.V.")
    expect(within(form).getByLabelText("Company name")).toHaveAttribute("readonly")
    expect(within(form).queryByRole("button", { name: "Save settings" })).not.toBeInTheDocument()
  })

  it("lets a Catalogue manager change them, and the next Quote and PDF use them", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/products/quote-settings", { userId: megan.id })
    const form = await screen.findByRole("form", { name: "Quote settings" })
    await user.clear(within(form).getByLabelText("Company name"))
    await user.type(within(form).getByLabelText("Company name"), "Contoso B.V.")
    await user.clear(within(form).getByLabelText("IBAN"))
    await user.type(within(form).getByLabelText("IBAN"), "NL00 TEST 0000 0000 00")
    await user.clear(within(form).getByLabelText("Default validity (days)"))
    await user.type(within(form).getByLabelText("Default validity (days)"), "14")
    await user.click(within(form).getByRole("button", { name: "Save settings" }))
    await waitFor(() => expect(store.quoteSettings).toMatchObject({ companyName: "Contoso B.V.", iban: "NL00 TEST 0000 0000 00", defaultValidityDays: 14 }))
    expect(await screen.findByText("Quote settings saved.")).toBeInTheDocument()
  })

  it("refuses a validity that is not a whole number of days", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/products/quote-settings", { userId: megan.id })
    const form = await screen.findByRole("form", { name: "Quote settings" })
    await user.clear(within(form).getByLabelText("Default validity (days)"))
    await user.type(within(form).getByLabelText("Default validity (days)"), "0")
    await user.click(within(form).getByRole("button", { name: "Save settings" }))
    expect(await within(form).findByText("Enter a whole number of days, 1 or more.")).toBeInTheDocument()
    expect(store.quoteSettings.defaultValidityDays).toBe(30)
  })

  it("a new Quote is valid for the default number of days from Quote settings", async () => {
    const { gateway, store } = renderApp("/products/quote-settings", { userId: megan.id })
    await screen.findByRole("form", { name: "Quote settings" })
    await gateway.updateQuoteSettings({ defaultValidityDays: 10 })
    const quote = await gateway.createQuote(SEED_IDS.opportunities.negotiation)
    const days = (new Date(quote.validUntil + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000
    expect(Math.round(days)).toBe(10)
    expect(store.quotes.has(quote.id)).toBe(true)
  })
})
