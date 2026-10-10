import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele, alex, diego, bram } = SEED_USERS
const { accounts, contacts, leads, opportunities, tasks, notes, phoneCalls } = SEED_IDS

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return renderWithGateway(<RouterProvider router={router} />, options)
}

function highlight(label: string) {
  const header = screen.getByRole("heading", { level: 1 }).closest("header")!
  return within(header).getByText(label, { selector: "dt" }).nextElementSibling?.textContent
}

async function reassignTo(name: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole("button", { name: "Reassign" }))
  const dialog = await screen.findByRole("dialog", { name: /Reassign/ })
  const picker = within(dialog).getByLabelText(/New Owner/)
  await within(picker).findByRole("option", { name })
  await user.selectOptions(picker, name)
  await user.click(within(dialog).getByRole("button", { name: "Reassign" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
}

beforeEach(() => setViewport("desktop"))

describe("Reassign flow", () => {
  it("lets the Owner hand an Opportunity over; open Tasks and Phone Calls move, the rest stays", async () => {
    const { store } = renderApp(`/opportunities/${opportunities.qualification}`)
    await reassignTo("Alex Wilber")

    await waitFor(() => expect(highlight("Owner")).toBe("Alex Wilber"))
    expect(store.opportunities.get(opportunities.qualification)?.ownerId).toBe(alex.id)
    expect(store.activities.get(tasks.dueLater)?.ownerId).toBe(alex.id)
    expect(store.activities.get(phoneCalls.open)?.ownerId).toBe(alex.id)
    expect(store.activities.get(tasks.done)?.ownerId).toBe(adele.id)
    expect(store.activities.get(phoneCalls.logged)?.ownerId).toBe(adele.id)
    expect(store.activities.get(notes.kickoff)?.ownerId).toBe(adele.id)
    // Adele is now a peer on it: the changing actions are gone.
    expect(screen.queryByRole("button", { name: "Reassign" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
  })

  it("offers only salespeople, leaving out the current Owner", async () => {
    const user = userEvent.setup()
    renderApp(`/leads/${leads.notContacted}`)
    await user.click(await screen.findByRole("button", { name: "Reassign" }))
    const picker = within(await screen.findByRole("dialog", { name: "Reassign Lead" })).getByLabelText(/New Owner/)
    await within(picker).findByRole("option", { name: "Alex Wilber" })
    const names = within(picker)
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(names).toEqual(["Pick a salesperson", alex.fullName, diego.fullName, megan.fullName])
    expect(names).not.toContain(bram.fullName)
  })

  it("asks for a salesperson before reassigning", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/leads/${leads.notContacted}`)
    await user.click(await screen.findByRole("button", { name: "Reassign" }))
    const dialog = await screen.findByRole("dialog", { name: "Reassign Lead" })
    await user.click(within(dialog).getByRole("button", { name: "Reassign" }))
    expect(within(dialog).getByText("Pick a salesperson.")).toBeInTheDocument()
    expect(store.leads.get(leads.notContacted)?.ownerId).toBe(adele.id)
  })

  it("lets a manager reassign a report's Qualified Lead and closed Opportunity", async () => {
    const first = renderApp(`/leads/${leads.qualified}`, { userId: megan.id })
    await reassignTo("Alex Wilber")
    expect(first.store.leads.get(leads.qualified)?.ownerId).toBe(alex.id)
    first.unmount()

    renderApp(`/opportunities/${opportunities.won}`, { userId: megan.id, store: first.store })
    await reassignTo("Adele Vance")
    expect(first.store.opportunities.get(opportunities.won)?.ownerId).toBe(adele.id)
  })

  it("hides Reassign from a peer and from someone outside the team", async () => {
    const first = renderApp(`/opportunities/${opportunities.qualification}`, { userId: alex.id })
    expect(await screen.findByRole("heading", { name: "Tailwind Traders - Managed workplace" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reassign" })).not.toBeInTheDocument()
    first.unmount()

    renderApp(`/accounts/${accounts.tailwind}`, { userId: diego.id })
    expect(await screen.findByRole("heading", { name: "Tailwind Traders" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reassign" })).not.toBeInTheDocument()
  })

  it("leaves an Account's Contacts and Opportunities with their own Owners", async () => {
    const { store } = renderApp(`/accounts/${accounts.tailwind}`)
    await reassignTo("Diego Siciliani")

    await waitFor(() => expect(highlight("Owner")).toBe("Diego Siciliani"))
    expect(store.accounts.get(accounts.tailwind)?.ownerId).toBe(diego.id)
    expect(store.contacts.get(contacts.lotte)?.ownerId).toBe(adele.id)
    expect(store.opportunities.get(opportunities.qualification)?.ownerId).toBe(adele.id)
    expect(store.opportunities.get(opportunities.lost)?.ownerId).toBe(adele.id)
  })

  it("reassigns a Contact", async () => {
    const { store } = renderApp(`/contacts/${contacts.lotte}`)
    await reassignTo("Megan Bowen")
    await waitFor(() => expect(highlight("Owner")).toBe("Megan Bowen"))
    expect(store.contacts.get(contacts.lotte)?.ownerId).toBe(megan.id)
  })
})
