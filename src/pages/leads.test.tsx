import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele, alex } = SEED_USERS
const { leads } = SEED_IDS

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = renderWithGateway(<RouterProvider router={router} />, options)
  return { ...result, router }
}

async function listedNames() {
  const table = await screen.findByRole("table", { name: "Leads" })
  await within(table).findAllByRole("link")
  return within(table)
    .getAllByRole("link")
    .map((link) => link.textContent)
}

/** The record page's header, where its actions are. */
async function recordHeader(name: string) {
  return (await screen.findByRole("heading", { name })).closest("header")!
}

beforeEach(() => setViewport("desktop"))

describe("Leads flow", () => {
  it("creates a Lead, moves it to Working, refuses a Disqualify without a reason, and reopens it", async () => {
    const user = userEvent.setup()
    const { router, store } = renderApp("/leads")

    await user.click(await screen.findByRole("button", { name: "New Lead" }))
    const dialog = await screen.findByRole("dialog", { name: "New Lead" })
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(within(dialog).getByText("Last name is required.")).toBeInTheDocument()
    expect(within(dialog).getByText("Company is required.")).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText("First name"), "Noor")
    await user.type(within(dialog).getByLabelText(/Last name/), "Jansen")
    await user.type(within(dialog).getByLabelText(/Company/), "Contoso")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("heading", { name: "Noor Jansen" })).toBeInTheDocument()
    const leadId = router.state.location.pathname.split("/").pop()!
    expect(store.leads.get(leadId)).toMatchObject({ company: "Contoso", status: "notContacted", ownerId: adele.id })
    expect(screen.getAllByText("Not Contacted")[0]).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Mark as Working" }))
    expect(await screen.findByRole("button", { name: "Back to Not Contacted" })).toBeInTheDocument()
    expect(store.leads.get(leadId)?.status).toBe("working")

    await user.click(screen.getByRole("button", { name: "Disqualify" }))
    const disqualify = await screen.findByRole("dialog", { name: "Disqualify Lead" })
    await user.type(within(disqualify).getByLabelText("Comment"), "Went with a competitor's offer")
    await user.click(within(disqualify).getByRole("button", { name: "Disqualify" }))
    expect(within(disqualify).getByText("Pick a Disqualify reason.")).toBeInTheDocument()
    expect(store.leads.get(leadId)?.status).toBe("working")

    await user.click(within(disqualify).getByRole("combobox", { name: /Disqualify reason/ }))
    await user.click(await screen.findByRole("option", { name: "Chose a competitor" }))
    await user.click(within(disqualify).getByRole("button", { name: "Disqualify" }))

    expect(await screen.findByRole("button", { name: "Reopen" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Disqualify" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Back to Not Contacted" })).not.toBeInTheDocument()
    const notice = screen.getByRole("region", { name: "Disqualified" })
    expect(within(notice).getByText("Chose a competitor")).toBeInTheDocument()
    expect(within(notice).getByText("Went with a competitor's offer")).toBeInTheDocument()
    expect(store.leads.get(leadId)).toMatchObject({
      status: "disqualified",
      disqualifyReason: "choseCompetitor",
      disqualifyComment: "Went with a competitor's offer",
      disqualifiedById: adele.id,
    })
    expect(store.leads.get(leadId)?.disqualifiedOn).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Reopen" }))
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Disqualified" })).not.toBeInTheDocument()
    expect(store.leads.get(leadId)).toMatchObject({ status: "working", disqualifyReason: undefined })
  })

  it("shows a peer no actions on someone else's Lead", async () => {
    renderApp(`/leads/${leads.notContacted}`, { userId: alex.id })
    expect(within(await recordHeader("Sanne Bakker")).queryByRole("button")).not.toBeInTheDocument()
  })

  it("lets a manager work a report's Lead and reopen it", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/leads/${leads.disqualified}`, { userId: megan.id })
    await user.click(await screen.findByRole("button", { name: "Reopen" }))
    expect(await screen.findByRole("button", { name: "Disqualify" })).toBeInTheDocument()
    expect(store.leads.get(leads.disqualified)).toMatchObject({ status: "working", ownerId: adele.id })
  })

  it("keeps a Qualified Lead read-only and links to its Opportunity", async () => {
    renderApp(`/leads/${leads.qualified}`)
    expect(within(await recordHeader("Lotte de Groot")).queryByRole("button")).not.toBeInTheDocument()
    const opportunity = screen.getByRole("region", { name: "Opportunity" })
    expect(within(opportunity).getByRole("link", { name: "Tailwind Traders - Managed workplace" })).toBeInTheDocument()
  })

  it("edits a Lead, renames it and clears its Lead source", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/leads/${leads.notContacted}`)

    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit Lead" })
    await user.clear(within(form).getByLabelText(/Last name/))
    await user.type(within(form).getByLabelText(/Last name/), "de Vries")
    await user.type(within(form).getByLabelText("Job title"), "CIO")
    await user.click(within(form).getByRole("combobox", { name: "Lead source" }))
    await user.click(await screen.findByRole("option", { name: "—" }))
    await user.click(within(form).getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("heading", { name: "Sanne de Vries" })).toBeInTheDocument()
    const saved = store.leads.get(leads.notContacted)!
    expect(saved).toMatchObject({ lastName: "de Vries", jobTitle: "CIO" })
    expect(saved.leadSource).toBeUndefined()
  })

  it("refuses to save a Lead without a Company", async () => {
    const user = userEvent.setup()
    renderApp(`/leads/${leads.notContacted}`)
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit Lead" })
    await user.clear(within(form).getByLabelText(/Company/))
    await user.click(within(form).getByRole("button", { name: "Save" }))
    expect(within(form).getByText("Company is required.")).toBeInTheDocument()
  })
})

describe("Lead list and search", () => {
  it("filters by Lead status", async () => {
    const user = userEvent.setup()
    const { router } = renderApp("/leads?view=all")
    expect(await listedNames()).toHaveLength(5)

    await user.click(screen.getByRole("combobox", { name: "Lead status" }))
    await user.click(await screen.findByRole("option", { name: "Working" }))
    expect(router.state.location.search).toContain("filter=working")
    expect((await listedNames()).sort()).toEqual(["Lucas Maes", "Thomas Peeters"])
  })

  it("shows only my team's Leads under My team", async () => {
    renderApp("/leads?view=myTeam&sort=lastName:asc", { userId: megan.id })
    expect(await listedNames()).toEqual(["Sanne Bakker", "Lotte de Groot", "Thomas Peeters", "Joris Willems"])
  })

  it("finds Leads by email in the list and in global search", async () => {
    const user = userEvent.setup()
    renderApp("/leads?view=all")
    await user.type(await screen.findByRole("searchbox", { name: "Search Leads" }), "fabrikam.example{Enter}")
    expect(await listedNames()).toEqual(["Thomas Peeters"])
  })

  it("lists Leads in global search", async () => {
    renderApp("/search?q=sanne")
    const group = await screen.findByRole("region", { name: "Leads (1)" })
    expect(within(group).getByRole("link", { name: "Sanne Bakker" })).toHaveAttribute("href", `/leads/${leads.notContacted}`)
  })
})

