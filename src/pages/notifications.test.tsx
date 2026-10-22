import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele, alex } = SEED_USERS
const { leads } = SEED_IDS

function renderApp(path = "/", userId?: Id) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return { ...renderWithGateway(<RouterProvider router={router} />, { userId }), router }
}

const bell = () => screen.findByRole("button", { name: /^Notifications/ })

async function openBell() {
  const user = userEvent.setup()
  await user.click(await bell())
  return { user, list: await screen.findByRole("dialog") }
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

describe("the Notifications bell", () => {
  it("shows how many of my Notifications are unread", async () => {
    renderApp()
    expect(await screen.findByRole("button", { name: "Notifications, 2 unread" })).toBeInTheDocument()
  })

  it("has no count when everything is read", async () => {
    const { store } = renderApp()
    await screen.findByRole("button", { name: "Notifications, 2 unread" })
    for (const n of store.notifications.values()) n.read = true
    const user = userEvent.setup()
    await user.click(await screen.findByRole("link", { name: "Leads" }))
    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument()
  })

  it("raises the count when a new Notification arrives and I move to another page", async () => {
    const { store } = renderApp()
    await screen.findByRole("button", { name: "Notifications, 2 unread" })
    act(() => {
      store.addNotification({ recipientId: adele.id, kind: "reassign", text: "Alex Wilber assigned you the Lead Priya Nair.", regarding: { type: "lead", id: leads.working } })
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole("link", { name: "Leads" }))
    expect(await screen.findByRole("button", { name: "Notifications, 3 unread" })).toBeInTheDocument()
  })

  it("lists my Notifications newest first, each with its text, when it happened and the record kind", async () => {
    renderApp()
    const { list } = await openBell()
    const rows = within(list).getAllByRole("button").filter((b) => b.textContent?.includes("assigned you"))
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Megan Bowen assigned you the Lead Sanne Bakker."),
      expect.stringContaining("Alex Wilber assigned you the Account Tailwind Traders."),
      expect.stringContaining("Megan Bowen assigned you the Opportunity Tailwind workplace."),
    ])
    expect(rows[0]).toHaveTextContent("25 min ago")
    expect(rows[0]).toHaveTextContent("Lead")
  })

  it("opens a Notification on its record and marks it read", async () => {
    const { store, router } = renderApp()
    const { user, list } = await openBell()
    await user.click(within(list).getByRole("button", { name: /assigned you the Lead Sanne Bakker/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/leads/${leads.notContacted}`))
    expect(store.notifications.get("note-adele-1")?.read).toBe(true)
    expect(await screen.findByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument()
  })

  it("marks all as read and clears the count", async () => {
    const { store } = renderApp()
    const { user, list } = await openBell()
    await user.click(within(list).getByRole("button", { name: "Mark all as read" }))
    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument()
    expect([...store.notifications.values()].filter((n) => n.recipientId === adele.id).every((n) => n.read)).toBe(true)
    expect(within(list).getByRole("button", { name: "Mark all as read" })).toBeDisabled()
  })

  it("shows only my own Notifications", async () => {
    const { store } = renderApp()
    const { list } = await openBell()
    expect(within(list).queryByText(/assigned you the Lead Thomas Peeters/)).not.toBeInTheDocument()
    expect(store.notifications.get("note-alex-1")?.recipientId).toBe(alex.id)
  })

  it("says so when there is nothing", async () => {
    const { store } = renderApp()
    await screen.findByRole("button", { name: /^Notifications/ })
    for (const [id, n] of [...store.notifications]) if (n.recipientId === adele.id) store.notifications.delete(id)
    const { list } = await openBell()
    expect(within(list).getByText("You're all caught up")).toBeInTheDocument()
  })
})

describe("Reassign posts a Notification", () => {
  it("to the new Owner, naming who assigned what", async () => {
    const { store } = renderApp(`/leads/${leads.notContacted}`)
    await reassignTo("Alex Wilber")
    const posted = [...store.notifications.values()].filter((n) => n.recipientId === alex.id && n.text.includes("Sanne Bakker"))
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({
      kind: "reassign",
      text: "Adele Vance assigned you the Lead Sanne Bakker.",
      regarding: { type: "lead", id: leads.notContacted },
      read: false,
    })
  })

  it("but not when a manager hands the record to themselves", async () => {
    const { store } = renderApp(`/leads/${leads.notContacted}`, megan.id)
    await reassignTo("Megan Bowen")
    expect(store.leads.get(leads.notContacted)?.ownerId).toBe(megan.id)
    expect([...store.notifications.values()].filter((n) => n.text.includes("Sanne Bakker") && n.recipientId === megan.id)).toEqual([])
  })
})
