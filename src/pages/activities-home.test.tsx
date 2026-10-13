import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele, alex } = SEED_USERS
const { accounts, leads, opportunities, tasks } = SEED_IDS

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = renderWithGateway(<RouterProvider router={router} />, options)
  return { ...result, router }
}

async function timeline() {
  const section = await screen.findByRole("region", { name: "Activity" })
  return within(section)
}

/** The first line (title or subject) of each timeline entry, top to bottom. */
async function timelineTitles() {
  const list = await (await timeline()).findByRole("list", { name: "Activity timeline" })
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".font-medium")?.textContent)
}

beforeEach(() => {
  // A fixed mid-month day, so "this month" and "overdue" don't depend on when the tests run.
  vi.useFakeTimers({ now: new Date(2026, 9, 15, 10), toFake: ["Date"] })
  setViewport("desktop")
})

afterEach(() => vi.useRealTimers())

describe("activity timeline", () => {
  it("shows open Tasks on top, then Notes, Tasks and Phone Calls newest first", async () => {
    renderApp(`/opportunities/${opportunities.qualification}`)
    expect(await timelineTitles()).toEqual(["Send proposal", "Follow-up call", "Kick-off", "Intro meeting", "First call"])
    const t = await timeline()
    expect(t.getByText("Planned")).toBeInTheDocument()
    expect(t.getByText("Lotte wants a pilot for 20 users first.")).toBeInTheDocument()
    expect(t.getByText(/Incoming call · Adele Vance/)).toBeInTheDocument()
  })

  it("adds a Note, a Task and a Phone Call to a Lead", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/leads/${leads.notContacted}`)
    const lead = { type: "lead", id: leads.notContacted }

    await user.click((await timeline()).getByRole("button", { name: "Note" }))
    let dialog = await screen.findByRole("dialog", { name: "New Note" })
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(within(dialog).getByText("Write a title or some text.")).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText("Title"), "Budget")
    await user.type(within(dialog).getByLabelText("Text"), "Approved for Q1")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await user.click((await timeline()).getByRole("button", { name: "Task" }))
    dialog = await screen.findByRole("dialog", { name: "New Task" })
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(within(dialog).getByText("Subject is required.")).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/Subject/), "Book demo")
    fireEvent.change(within(dialog).getByLabelText("Due date"), { target: { value: "2026-10-20" } })
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await user.click((await timeline()).getByRole("button", { name: "Call" }))
    dialog = await screen.findByRole("dialog", { name: "Log Phone Call" })
    await user.type(within(dialog).getByLabelText(/Subject/), "Intro call")
    await user.selectOptions(within(dialog).getByLabelText(/Direction/), "Incoming")
    expect(within(dialog).getByLabelText(/Date/)).toHaveValue("2026-10-15")
    await user.type(within(dialog).getByLabelText("Notes"), "Interested in a pilot")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    const added = [...store.activities.values()].filter((a) => a.regarding.id === lead.id)
    expect(added).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "note", title: "Budget", text: "Approved for Q1", ownerId: adele.id, regarding: lead }),
        expect.objectContaining({ kind: "task", subject: "Book demo", dueDate: "2026-10-20", completed: false }),
        expect.objectContaining({ kind: "phoneCall", subject: "Intro call", direction: "incoming", date: "2026-10-15", notes: "Interested in a pilot", completed: true }),
      ]),
    )
    expect((await timelineTitles())[0]).toBe("Book demo")
  })

  it("completes a Task", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${opportunities.qualification}`)
    await user.click(await (await timeline()).findByRole("button", { name: "Complete Send proposal" }))
    await waitFor(() => expect(store.activities.get(tasks.dueLater)).toMatchObject({ completed: true }))
    await waitFor(async () => expect((await timelineTitles())[0]).toBe("Follow-up call"))
  })

  it("offers quick-add to the Owner's manager but not to a peer", async () => {
    const path = `/opportunities/${opportunities.qualification}`
    const { unmount, store } = renderApp(path, { userId: alex.id })
    await timelineTitles()
    expect((await timeline()).queryByRole("button", { name: "Note" })).not.toBeInTheDocument()
    expect((await timeline()).queryByRole("button", { name: /^Complete/ })).not.toBeInTheDocument()
    unmount()

    renderApp(path, { userId: megan.id, store })
    expect(await (await timeline()).findByRole("button", { name: "Task" })).toBeInTheDocument()
  })

  describe("on an Account", () => {
    const account = `/accounts/${accounts.tailwind}`

    function addLeadCall(store: InMemorySalesStore) {
      store.activities.set("call-on-lead", {
        id: "call-on-lead",
        kind: "phoneCall",
        subject: "Intro call",
        direction: "outgoing",
        date: "2026-10-01",
        completed: true,
        regarding: { type: "lead", id: leads.qualified },
        ownerId: adele.id,
        createdOn: "2026-09-01T10:00:00Z",
      })
    }

    it("gathers the activities of its Opportunities and qualified Leads, labelled by source", async () => {
      const { store } = renderApp(account, { userId: adele.id })
      addLeadCall(store)
      const t = await timeline()
      expect((await t.findAllByText("Opportunity · Tailwind Traders - Managed workplace")).length).toBeGreaterThan(0)
      expect(await t.findByText("Lead · Lotte de Groot")).toBeInTheDocument()
      expect(await t.findByText("Intro call")).toBeInTheDocument()
    })

    it("pins an open Task from an Opportunity on top", async () => {
      renderApp(account, { userId: adele.id })
      expect((await timelineTitles())[0]).toBe("Send proposal")
    })

    it("filters by source and by type", async () => {
      const user = userEvent.setup()
      const { store } = renderApp(account, { userId: adele.id })
      addLeadCall(store)
      const t = await timeline()
      await t.findByText("Intro call")
      await user.click(t.getByRole("button", { name: "Leads" }))
      expect(await timelineTitles()).toEqual(["Intro call"])
      await user.click(t.getByRole("button", { name: "Leads" }))
      await user.click(t.getByRole("button", { name: "Contacts" }))
      expect(await t.findByText("No activities match these filters.")).toBeInTheDocument()
      await user.click(t.getByRole("button", { name: "Contacts" }))
      await user.click(t.getByRole("button", { name: "Notes" }))
      expect(await timelineTitles()).toEqual(["Kick-off"])
    })

    it("lets a peer see an open Task but not complete it", async () => {
      renderApp(account, { userId: alex.id })
      await timelineTitles()
      expect((await timeline()).queryByRole("button", { name: /^Complete/ })).not.toBeInTheDocument()
    })

    it("shows an empty Account as having no activities", async () => {
      renderApp(`/accounts/${accounts.northwind}`, { userId: adele.id })
      expect(await (await timeline()).findByText("No activities yet.")).toBeInTheDocument()
    })
  })

  it("puts the timeline in an Activity tab on a phone", async () => {
    setViewport("phone")
    const user = userEvent.setup()
    renderApp(`/contacts/${SEED_IDS.contacts.lotte}`)
    await user.click(await screen.findByRole("tab", { name: "Activity" }))
    expect(await (await timeline()).findByText("No activities yet.")).toBeInTheDocument()
  })
})

describe("Home, My work", () => {
  function block(name: string) {
    return within(screen.getByRole("region", { name }))
  }

  it("shows the signed-in salesperson's own open Tasks, deals closing this month and Leads to contact", async () => {
    renderApp("/", { userId: alex.id })
    await screen.findByRole("region", { name: "My open Tasks" })

    expect(block("My open Tasks").getByText("Call Thomas back")).toBeInTheDocument()
    expect(block("My open Tasks").getByText("Overdue")).toBeInTheDocument()
    expect(block("My open Tasks").getByRole("link", { name: "Thomas Peeters" })).toHaveAttribute("href", `/leads/${leads.working}`)
    expect(block("Closing this month").getByRole("link", { name: "Fabrikam NV - Security audit" })).toBeInTheDocument()
    expect(block("Leads to contact").getByText("All your Leads have been contacted.")).toBeInTheDocument()
  })

  it("lists my Not Contacted Leads and lets me complete a Task from Home", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/")
    await screen.findByRole("region", { name: "My open Tasks" })

    expect(block("Leads to contact").getByRole("link", { name: "Sanne Bakker" })).toBeInTheDocument()
    expect(block("Closing this month").getByText("None of your open Opportunities close this month.")).toBeInTheDocument()
    expect(block("My open Tasks").queryByText("Call Thomas back")).not.toBeInTheDocument()

    await user.click(block("My open Tasks").getByRole("button", { name: "Complete Send proposal" }))
    await waitFor(() => expect(block("My open Tasks").getByText("No open Tasks. Nice work.")).toBeInTheDocument())
    expect(store.activities.get(tasks.dueLater)).toMatchObject({ completed: true })
  })
})
