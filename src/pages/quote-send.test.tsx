import { beforeEach, describe, expect, it, vi } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { alex, adele } = SEED_USERS
const { quotes: Q, templates: TPL } = SEED_IDS

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return { ...renderWithGateway(<RouterProvider router={router} />, options), router }
}

const isPdf = (bytes: Uint8Array | undefined) => !!bytes && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"

async function openSend(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Send" }))
  const dialog = await screen.findByRole("dialog", { name: /Send quote/ })
  await waitFor(() => expect((within(dialog).getByLabelText("Subject") as HTMLInputElement).value).toContain("Q-00003"))
  return dialog
}

beforeEach(() => {
  setViewport("desktop")
  URL.createObjectURL = vi.fn(() => "blob:test")
  URL.revokeObjectURL = vi.fn()
})

describe("Preview PDF", () => {
  it("opens on a Draft and draws the PDF without storing or sending anything", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.draft}`, { userId: alex.id })
    await user.click(await screen.findByRole("button", { name: "Preview PDF" }))
    const dialog = await screen.findByRole("dialog", { name: /Preview Q-00003/ })
    expect(await within(dialog).findByLabelText("Quote PDF preview")).toBeInTheDocument()
    expect(within(dialog).getByText("CONCEPT")).toBeInTheDocument()
    expect(store.quotePdfs.size).toBe(0)
    expect(store.quotes.get(Q.draft)?.status).toBe("draft")
  })

  it("is not offered on a Sent Quote", async () => {
    renderApp(`/quotes/${Q.sent}`, { userId: alex.id })
    await screen.findByRole("button", { name: "Accept" })
    expect(screen.queryByRole("button", { name: "Preview PDF" })).not.toBeInTheDocument()
  })
})

describe("Send", () => {
  it("by email goes from the Outlook route to the Contact, prefilled from Quote settings, and stores the exact PDF", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.draft}`, { userId: alex.id })
    const dialog = await openSend(user)
    expect(within(dialog).getByRole("radio", { name: /Email it from my Outlook/ })).toBeChecked()
    expect(within(dialog).getByLabelText("To")).toHaveValue("pieter@fabrikam.example")
    expect(within(dialog).getByLabelText("Subject")).toHaveValue("Offerte Q-00003")
    expect((within(dialog).getByLabelText("Message") as HTMLTextAreaElement).value).toContain("Beste Pieter Claes")
    await user.type(within(dialog).getByLabelText("Cc"), "finance@fabrikam.example")
    await user.click(within(dialog).getByRole("button", { name: "Send quote" }))

    await waitFor(() => expect(store.quotes.get(Q.draft)?.status).toBe("sent"))
    expect(store.sentEmails).toHaveLength(1)
    expect(store.sentEmails[0]).toMatchObject({ from: alex.email, to: "pieter@fabrikam.example", cc: "finance@fabrikam.example", subject: "Offerte Q-00003" })
    expect(isPdf(store.sentEmails[0].attachment)).toBe(true)
    // The stored copy is the one that was emailed.
    expect(store.quotePdfs.get(Q.draft)).toEqual(store.sentEmails[0].attachment)
    expect(store.quotes.get(Q.draft)).toMatchObject({ sentVia: "email", sentTo: "pieter@fabrikam.example", sentById: alex.id })
    expect(await screen.findByText(/Sent on .* by Alex Wilber via Outlook to pieter@fabrikam.example/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument()
  })

  it("an edited subject and message are what is sent", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.draft}`, { userId: alex.id })
    const dialog = await openSend(user)
    await user.clear(within(dialog).getByLabelText("Subject"))
    await user.type(within(dialog).getByLabelText("Subject"), "Nieuwe offerte")
    await user.clear(within(dialog).getByLabelText("Message"))
    await user.type(within(dialog).getByLabelText("Message"), "Zie bijlage")
    await user.click(within(dialog).getByRole("button", { name: "Send quote" }))
    await waitFor(() => expect(store.sentEmails).toHaveLength(1))
    expect(store.sentEmails[0]).toMatchObject({ subject: "Nieuwe offerte", message: "Zie bijlage" })
  })

  it("by email is stopped with a message when the Contact has no email, and nothing is sent or stored", async () => {
    const user = userEvent.setup()
    const store = renderApp(`/quotes/${Q.draft}`, { userId: alex.id }).store
    store.contacts.set("con-pieter", { ...store.contacts.get("con-pieter")!, email: undefined })
    // The page was already loading; reload it with the Contact changed.
    const second = renderApp(`/quotes/${Q.draft}`, { userId: alex.id, store })
    await user.click(await within(second.container).findByRole("button", { name: "Send" }))
    const dialog = (await screen.findAllByRole("dialog", { name: /Send quote/ }))[0]
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Pieter Claes has no email address")
    expect(within(dialog).getByRole("button", { name: "Send quote" })).toBeDisabled()
    expect(store.sentEmails).toHaveLength(0)
    expect(store.quotePdfs.size).toBe(0)
    expect(store.quotes.get(Q.draft)?.status).toBe("draft")
  })

  it("by download sets Sent, records the route and stores the PDF; no email goes out", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.draft}`, { userId: alex.id })
    const dialog = await openSend(user)
    await user.click(within(dialog).getByRole("radio", { name: /Download the PDF/ }))
    expect(within(dialog).queryByLabelText("Subject")).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Download and mark as sent" }))
    await waitFor(() => expect(store.quotes.get(Q.draft)?.status).toBe("sent"))
    expect(store.sentEmails).toHaveLength(0)
    expect(isPdf(store.quotePdfs.get(Q.draft))).toBe(true)
    expect(store.quotes.get(Q.draft)).toMatchObject({ sentVia: "download", sentTo: undefined })
    expect(await screen.findByText(/Sent on .* by Alex Wilber via download\./)).toBeInTheDocument()
  })

  it("the copy stored on the Quote is the one the gateway returns", async () => {
    const user = userEvent.setup()
    const { gateway, store } = renderApp(`/quotes/${Q.draft}`, { userId: alex.id })
    const dialog = await openSend(user)
    await user.click(within(dialog).getByRole("radio", { name: /Download the PDF/ }))
    await user.click(within(dialog).getByRole("button", { name: "Download and mark as sent" }))
    await waitFor(() => expect(store.quotePdfs.has(Q.draft)).toBe(true))
    expect(await gateway.getQuotePdf(Q.draft)).toEqual(store.quotePdfs.get(Q.draft))
  })

  it("Download PDF on a Sent Quote returns the stored copy, and a Sent Quote without one says so", async () => {
    const store = renderApp(`/quotes/${Q.sent}`, { userId: alex.id }).store
    expect(await screen.findByText(/No PDF was stored for this Quote/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument()
    const stored = new Uint8Array([37, 80, 68, 70, 45, 49])
    store.quotePdfs.set(Q.expired, stored)
    const second = renderApp(`/quotes/${Q.expired}`, { userId: alex.id, store })
    const download = await within(second.container).findByRole("button", { name: "Download PDF" })
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
    await userEvent.setup().click(download)
    await waitFor(() => expect(clicked).toHaveBeenCalled())
    clicked.mockRestore()
  })

  it("only the Owner sees Send", async () => {
    renderApp(`/quotes/${Q.draft}`, { userId: adele.id })
    await screen.findByRole("heading", { level: 1 })
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument()
  })
})

describe("The Quote template of a Quote", () => {
  it("uses the Default template unless the Owner picks another while it is a Draft", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/quotes/${Q.draft}`, { userId: alex.id })
    expect(await screen.findByText("Default template")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Edit" }))
    const form = await screen.findByRole("form", { name: "Edit Quote" })
    await waitFor(() => expect(within(form).getByRole("option", { name: "Proposal" })).toBeInTheDocument())
    expect(within(form).getByRole("option", { name: "Default (Business letter)" })).toBeInTheDocument()
    await user.selectOptions(within(form).getByLabelText("Quote template"), "Proposal")
    await user.click(within(form).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(store.quotes.get(Q.draft)?.templateId).toBe(TPL.proposal))
    expect(await screen.findByText("Proposal")).toBeInTheDocument()
  })
})
