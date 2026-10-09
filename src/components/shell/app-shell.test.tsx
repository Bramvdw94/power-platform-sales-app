import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { InMemorySalesGateway, SEED_USERS } from "@/data/in-memory"
import { GatewayError } from "@/data/gateway"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

function renderApp(path = "/", userId?: Id) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = renderWithGateway(<RouterProvider router={router} />, { userId })
  return { ...result, router }
}

const mainNav = () => screen.getByRole("navigation", { name: "Main" })

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("app shell on a desktop", () => {
  beforeEach(() => setViewport("desktop"))

  it("shows the signed-in user in the top bar", async () => {
    renderApp()
    expect(await screen.findByRole("img", { name: "Adele Vance" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "My work" })).toBeInTheDocument()
    expect(screen.getByText("Welcome, Adele.")).toBeInTheDocument()
  })

  it("has a sidebar with every area, one click away", async () => {
    const user = userEvent.setup()
    const { router } = renderApp()
    const links = within(mainNav()).getAllByRole("link").map((l) => l.textContent)
    expect(links).toEqual(["Home", "Pipeline", "Leads", "Opportunities", "Accounts", "Contacts"])

    await user.click(within(mainNav()).getByRole("link", { name: "Opportunities" }))
    expect(router.state.location.pathname).toBe("/opportunities")
    expect(screen.getByRole("heading", { name: "Opportunities" })).toBeInTheDocument()
    expect(within(mainNav()).getByRole("link", { name: "Opportunities" })).toHaveAttribute("aria-current", "page")
  })

  it("collapses the sidebar to icons and remembers it", async () => {
    const user = userEvent.setup()
    const { unmount } = renderApp()
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }))
    expect(within(mainNav()).getByRole("link", { name: "Leads" })).not.toHaveTextContent("Leads")
    unmount()

    renderApp()
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument()
  })

  it("searches from the top bar", async () => {
    const user = userEvent.setup()
    const { router } = renderApp()
    await user.type(screen.getByRole("searchbox", { name: /Search Leads/ }), "Fabrikam{Enter}")
    expect(router.state.location.pathname).toBe("/search")
    expect(await screen.findByRole("link", { name: "Fabrikam NV" })).toBeInTheDocument()
  })

  it("creates any record type from + New", async () => {
    const user = userEvent.setup()
    const { router } = renderApp()
    await user.click(screen.getByRole("button", { name: "New" }))
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Lead", "Opportunity", "Account", "Contact"])
    await user.click(screen.getByRole("menuitem", { name: "Account" }))
    expect(router.state.location.pathname).toBe("/accounts")
    expect(await screen.findByRole("dialog", { name: "New Account" })).toBeInTheDocument()
  })

  it("shows a not-found page inside the shell for unknown links", async () => {
    renderApp("/nowhere")
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument()
    expect(mainNav()).toBeInTheDocument()
  })

  it.each([
    ["/pipeline", "Pipeline"],
    ["/leads/lead-sanne", "Lead"],
    ["/opportunities/opp-tailwind-workplace", "Opportunity"],
    ["/accounts/acc-tailwind", "Tailwind Traders"],
    ["/contacts/con-lotte", "Lotte de Groot"],
  ])("has a page at %s", async (path, heading) => {
    renderApp(path)
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument()
  })

  it("says so when the signed-in user can't be loaded", async () => {
    vi.spyOn(InMemorySalesGateway.prototype, "getCurrentUser").mockRejectedValue(
      new GatewayError("notFound", "No such user"),
    )
    renderApp()
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("We couldn't load your user.")
    expect(alert).toHaveTextContent("No such user")
    expect(mainNav()).toBeInTheDocument()
  })
})

describe("app shell on a phone", () => {
  beforeEach(() => setViewport("phone"))

  it("has bottom tabs Home, Pipeline, Search and Menu", async () => {
    renderApp()
    expect(await screen.findByRole("img", { name: "Adele Vance" })).toBeInTheDocument()
    const tabs = within(mainNav()).getAllByRole("link").map((l) => l.textContent)
    expect(tabs).toEqual(["Home", "Pipeline", "Search", "Menu"])
    expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument()
  })

  it("reaches the record lists through Menu", async () => {
    const user = userEvent.setup()
    const { router } = renderApp()
    await user.click(within(mainNav()).getByRole("link", { name: "Menu" }))
    const lists = screen.getByRole("navigation", { name: "Records" })
    expect(within(lists).getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Leads",
      "Opportunities",
      "Accounts",
      "Contacts",
    ])
    expect(await screen.findByText("Adele Vance")).toBeInTheDocument()

    await user.click(within(lists).getByRole("link", { name: "Contacts" }))
    expect(router.state.location.pathname).toBe("/contacts")
    expect(within(mainNav()).getByRole("link", { name: "Menu" })).toHaveClass("text-primary")
  })

  it("searches from the Search tab", async () => {
    const user = userEvent.setup()
    const { router } = renderApp()
    await user.click(within(mainNav()).getByRole("link", { name: "Search" }))
    await user.type(screen.getByRole("searchbox", { name: /Search Leads/ }), "Lotte{Enter}")
    expect(router.state.location.search).toBe("?q=Lotte")
    const contacts = await screen.findByRole("region", { name: "Contacts (1)" })
    expect(within(contacts).getByRole("link", { name: "Lotte de Groot" })).toBeInTheDocument()
  })

  it("shows whoever is signed in", async () => {
    renderApp("/menu", SEED_USERS.megan.id)
    expect(await screen.findByText("Megan Bowen")).toBeInTheDocument()
    expect(screen.getByText("megan@contoso.example")).toBeInTheDocument()
  })
})
