import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, createSeededStore, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele, alex, diego } = SEED_USERS
const { accounts, contacts } = SEED_IDS

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

beforeEach(() => setViewport("desktop"))

describe("Accounts and Contacts flow", () => {
  it("creates an Account, then a Contact under it", async () => {
    const user = userEvent.setup()
    const { router, store } = renderApp("/accounts")

    await user.click(await screen.findByRole("button", { name: "New Account" }))
    const dialog = await screen.findByRole("dialog", { name: "New Account" })
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(within(dialog).getByText("Account Name is required.")).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/Account Name/), "Contoso Pharmaceuticals")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("heading", { name: "Contoso Pharmaceuticals" })).toBeInTheDocument()
    const accountId = router.state.location.pathname.split("/").pop()!
    expect(store.accounts.get(accountId)).toMatchObject({ name: "Contoso Pharmaceuticals", ownerId: adele.id })

    await user.click(screen.getByRole("button", { name: "New Contact" }))
    const contactDialog = await screen.findByRole("dialog", { name: "New Contact" })
    expect(within(contactDialog).getByText("Contoso Pharmaceuticals")).toBeInTheDocument()
    await user.type(within(contactDialog).getByLabelText("First name"), "Noor")
    await user.type(within(contactDialog).getByLabelText(/Last name/), "Jansen")
    await user.click(within(contactDialog).getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("heading", { name: "Noor Jansen" })).toBeInTheDocument()
    const contactId = router.state.location.pathname.split("/").pop()!
    expect(store.contacts.get(contactId)).toMatchObject({ lastName: "Jansen", accountId, ownerId: adele.id })

    await user.click(screen.getAllByRole("link", { name: "Contoso Pharmaceuticals" })[0])
    const related = await screen.findByRole("region", { name: "Contacts (1)" })
    expect(within(related).getByRole("link", { name: "Noor Jansen" })).toBeInTheDocument()
  })

  it("links a new Contact to an Account someone else owns", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/contacts?new=1")

    const dialog = await screen.findByRole("dialog", { name: "New Contact" })
    await user.type(within(dialog).getByLabelText(/Last name/), "Smits")
    await user.type(within(dialog).getByRole("combobox"), "north")
    await user.click(await within(dialog).findByRole("option", { name: /Northwind BV/ }))
    await user.click(within(dialog).getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("heading", { name: "Smits" })).toBeInTheDocument()
    const created = [...store.contacts.values()].find((c) => c.lastName === "Smits")
    expect(created).toMatchObject({ accountId: accounts.northwind, ownerId: adele.id })
  })

  it("hides Edit from a peer", async () => {
    renderApp(`/contacts/${contacts.lotte}`, { userId: alex.id })
    expect(await screen.findByRole("heading", { name: "Lotte de Groot" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
  })

  it("hides Edit on an Account from someone outside the team", async () => {
    renderApp(`/accounts/${accounts.tailwind}`, { userId: diego.id })
    expect(await screen.findByRole("heading", { name: "Tailwind Traders" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
  })

  it("lets a manager edit a report's Contact", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/contacts/${contacts.lotte}`, { userId: megan.id })

    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit Contact" })
    const jobTitle = within(form).getByLabelText("Job title")
    await user.clear(jobTitle)
    await user.type(jobTitle, "Head of IT")
    await user.type(within(form).getByLabelText("Mobile"), "+31 6 1234 5678")
    await user.click(within(form).getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument()
    const details = screen.getByRole("region", { name: "Details" })
    expect(within(details).getByText("Head of IT")).toBeInTheDocument()
    expect(store.contacts.get(contacts.lotte)).toMatchObject({ jobTitle: "Head of IT", mobile: "+31 6 1234 5678", ownerId: adele.id })
  })

  it("clears a field and moves a Contact off its Account", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/contacts/${contacts.lotte}`)

    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit Contact" })
    await user.clear(within(form).getByLabelText("Job title"))
    await user.click(within(form).getByRole("button", { name: "Remove Tailwind Traders" }))
    await user.click(within(form).getByRole("button", { name: "Save" }))

    await screen.findByRole("button", { name: "Edit" })
    const saved = store.contacts.get(contacts.lotte)!
    expect(saved.jobTitle).toBeUndefined()
    expect(saved.accountId).toBeUndefined()
  })

  it("refuses to save a Contact without a Last name", async () => {
    const user = userEvent.setup()
    renderApp(`/contacts/${contacts.lotte}`)
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit Contact" })
    await user.clear(within(form).getByLabelText(/Last name/))
    await user.click(within(form).getByRole("button", { name: "Save" }))
    expect(within(form).getByText("Last name is required.")).toBeInTheDocument()
  })

  it("shows a friendly message when the change is refused", async () => {
    const user = userEvent.setup()
    const store = createSeededStore()
    renderApp(`/accounts/${accounts.tailwind}`, { store })
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    // Meanwhile the Account was reassigned to someone outside Adele's reach.
    store.accounts.get(accounts.tailwind)!.ownerId = diego.id
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Only the Owner or the Owner's manager can change this record.")
  })
})

describe("record lists", () => {
  it("shows a manager's team under My team, but only a peer's own records", async () => {
    renderApp("/accounts?view=myTeam", { userId: megan.id })
    expect(await listedNames("Accounts")).toEqual(["Fabrikam NV", "Tailwind Traders"])
  })

  it("gives a peer only their own records under My team", async () => {
    renderApp("/accounts?view=myTeam", { userId: adele.id })
    expect(await listedNames("Accounts")).toEqual(["Tailwind Traders"])
  })

  it("switches views", async () => {
    const user = userEvent.setup()
    const { router } = renderApp("/contacts")
    expect(await listedNames("Contacts")).toEqual(["Lotte de Groot"])

    await user.click(screen.getByRole("combobox", { name: "View" }))
    await user.click(await screen.findByRole("option", { name: "All" }))
    expect(router.state.location.search).toBe("?view=all")
    expect(await listedNames("Contacts")).toEqual(["Pieter Claes", "Lotte de Groot", "Femke Visser"])
  })

  it("searches within the view and sorts by a column", async () => {
    const user = userEvent.setup()
    renderApp("/accounts?view=all")
    expect(await listedNames("Accounts")).toEqual(["Fabrikam NV", "Northwind BV", "Tailwind Traders"])

    await user.click(screen.getByRole("button", { name: "Account Name" }))
    expect(screen.getByRole("columnheader", { name: "Account Name" })).toHaveAttribute("aria-sort", "descending")
    expect(await listedNames("Accounts")).toEqual(["Tailwind Traders", "Northwind BV", "Fabrikam NV"])

    await user.type(screen.getByRole("searchbox", { name: "Search Accounts" }), "wind{Enter}")
    expect(await listedNames("Accounts")).toEqual(["Tailwind Traders", "Northwind BV"])
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument()
  })

  it("finds Contacts by email and shows the Owner", async () => {
    const user = userEvent.setup()
    renderApp("/contacts?view=all")
    await user.type(await screen.findByRole("searchbox", { name: /Search Contacts/ }), "fabrikam.example{Enter}")
    expect(await listedNames("Contacts")).toEqual(["Pieter Claes"])
    const row = screen.getByRole("link", { name: "Pieter Claes" }).closest("tr")!
    expect(within(row).getByText("Alex Wilber")).toBeInTheDocument()
  })

  it("pages through long lists on the server", async () => {
    const user = userEvent.setup()
    const store = createSeededStore()
    for (let i = 1; i <= 60; i++) {
      const id = `acc-bulk-${i}`
      store.accounts.set(id, { id, name: `Bulk ${String(i).padStart(2, "0")}`, ownerId: adele.id, createdOn: "2026-01-01T00:00:00.000Z" })
    }
    renderApp("/accounts", { store })
    expect(await screen.findByText("1–50 of 61")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(await screen.findByText("51–61 of 61")).toBeInTheDocument()
    expect(await listedNames("Accounts")).toContain("Tailwind Traders")
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled()
  })
})

describe("Account and Contact pages", () => {
  it("lists an Account's Contacts and Opportunities", async () => {
    renderApp(`/accounts/${accounts.tailwind}`)
    const contactsList = await screen.findByRole("region", { name: "Contacts (1)" })
    expect(within(contactsList).getByRole("link", { name: "Lotte de Groot" })).toHaveAttribute("href", `/contacts/${contacts.lotte}`)
    const opportunities = screen.getByRole("region", { name: "Opportunities (2)" })
    expect(within(opportunities).getByRole("link", { name: "Tailwind Traders - Managed workplace" })).toBeInTheDocument()
    expect(within(opportunities).getByText(/Qualification · €48,000/)).toBeInTheDocument()
  })

  it("lists the Opportunities where a Contact is the Primary Contact", async () => {
    renderApp(`/contacts/${contacts.femke}`)
    const opportunities = await screen.findByRole("region", { name: "Opportunities (1)" })
    expect(within(opportunities).getByRole("link", { name: "Northwind BV - Cloud migration" })).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: "Northwind BV" })[0]).toHaveAttribute("href", `/accounts/${accounts.northwind}`)
  })

  it("splits Details and Activity into tabs on a phone", async () => {
    setViewport("phone")
    const user = userEvent.setup()
    renderApp(`/accounts/${accounts.fabrikam}`)
    expect(await screen.findByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("region", { name: "Contacts (1)" })).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Activity" }))
    expect(await screen.findByText("No activities yet.")).toBeInTheDocument()
  })

  it("says so when a record doesn't exist", async () => {
    renderApp("/accounts/acc-missing")
    expect(await screen.findByRole("alert")).toHaveTextContent("This record no longer exists.")
  })
})

describe("global search", () => {
  it("groups results by record type", async () => {
    renderApp("/search?q=fabrikam")
    expect(await screen.findByRole("region", { name: "Accounts (1)" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Contacts (1)" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Leads (1)" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Opportunities (2)" })).toBeInTheDocument()
  })

  it("says when nothing matches", async () => {
    renderApp("/search?q=zzz")
    expect(await screen.findByText("Nothing matches “zzz”.")).toBeInTheDocument()
  })
})
