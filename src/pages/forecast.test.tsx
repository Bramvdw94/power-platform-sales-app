import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_USERS } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { Id } from "@/sales"

const { megan, adele } = SEED_USERS
const NOW = new Date(2026, 9, 13, 10, 0, 0)

function renderForecast(userId: Id) {
  const router = createMemoryRouter(routes, { initialEntries: ["/forecast"] })
  return renderWithGateway(<RouterProvider router={router} />, { userId, now: NOW })
}

/** The figure in a row of the Forecast grid, for the n-th period (0 = the first column). */
function figure(row: string, period = 0) {
  const grid = screen.getByRole("table", { name: "Forecast figures" })
  const cells = within(within(grid).getByRole("rowheader", { name: row }).closest("tr") as HTMLElement).getAllByRole("cell")
  return cells[period].textContent
}

async function pick(user: ReturnType<typeof userEvent.setup>, name: string, option: string) {
  await user.click(screen.getByRole("combobox", { name }))
  await user.click(await screen.findByRole("option", { name: option }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW })
  setViewport("desktop")
})
afterEach(() => vi.useRealTimers())

describe("Forecast page tabs", () => {
  it("shows a manager the Forecast, Team and Quotas tabs", async () => {
    renderForecast(megan.id)
    expect(await screen.findByRole("tab", { name: "Forecast", selected: true })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Team" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Quotas" })).toBeInTheDocument()
  })

  it("shows a salesperson without direct reports just their forecast, with no tabs", async () => {
    renderForecast(adele.id)
    expect(await screen.findByRole("table", { name: "Forecast figures" })).toBeInTheDocument()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Whose numbers" })).not.toBeInTheDocument()
  })
})

describe("Forecast tab", () => {
  it("shows this month plus the next 5 with the counting note", async () => {
    renderForecast(adele.id)
    await screen.findByRole("table", { name: "Forecast figures" })
    const headers = within(screen.getByRole("table", { name: "Forecast figures" })).getAllByRole("columnheader").map((h) => h.textContent)
    expect(headers.slice(1)).toEqual(["Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027", "Feb 2027", "Mar 2027"])
    expect(screen.getByText(/Open deals count in their Expected close month/)).toBeInTheDocument()
  })

  it("sets a salesperson's open deals against their Quota", async () => {
    renderForecast(adele.id)
    await screen.findByRole("table", { name: "Forecast figures" })
    // October: no deal, a €40,000 Quota. November: the €48,000 Qualification deal against €45,000.
    expect(figure("Quota", 0)).toBe("€40,000")
    expect(figure("Gap", 0)).toBe("€40,000")
    expect(figure("Pipeline", 0)).toBe("€0")
    expect(figure("Quota", 1)).toBe("€45,000")
    expect(figure("Pipeline", 1)).toBe("€48,000")
    expect(figure("Weighted", 1)).toBe("€4,800")
    expect(figure("Coverage", 1)).toBe("1.1×")
    expect(figure("Quota", 2)).toBe("—")
  })

  it("lets a manager pick Me, My team or a report", async () => {
    const user = userEvent.setup()
    renderForecast(megan.id)
    await screen.findByRole("table", { name: "Forecast figures" })

    // Me: the €120,000 Negotiation deal closing on 23 October, Commit.
    expect(figure("Commit", 0)).toBe("€120,000")
    expect(figure("Quota", 0)).toBe("€20,000")

    await pick(user, "Whose numbers", "My team")
    expect(figure("Quota", 0)).toBe("€90,000")
    expect(figure("Commit", 0)).toBe("€120,000")
    expect(figure("Best case", 0)).toBe("€140,000")

    await pick(user, "Whose numbers", "Alex Wilber")
    expect(figure("Quota", 0)).toBe("€30,000")
    expect(figure("Commit", 0)).toBe("€0")
    expect(figure("Best case", 0)).toBe("€20,000")
  })

  it("switches to quarters, from the start of this quarter", async () => {
    const user = userEvent.setup()
    renderForecast(adele.id)
    await screen.findByRole("table", { name: "Forecast figures" })
    await user.click(screen.getByRole("button", { name: "Quarter" }))
    const headers = within(screen.getByRole("table", { name: "Forecast figures" })).getAllByRole("columnheader").map((h) => h.textContent)
    expect(headers.slice(1)).toEqual(["Q4 2026", "Q1 2027", "Q2 2027"])
    expect(figure("Quota", 0)).toBe("€85,000")
    expect(figure("Pipeline", 0)).toBe("€48,000")
  })

  it("shows one period at a time on a phone, with nothing to scroll sideways", async () => {
    setViewport("phone")
    const user = userEvent.setup()
    renderForecast(adele.id)
    const period = await screen.findByRole("region", { name: "Forecast period" })
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(within(period).getByRole("heading", { name: "Oct 2026" })).toBeInTheDocument()
    expect(within(period).getByRole("button", { name: "Previous period" })).toBeDisabled()

    await user.click(within(period).getByRole("button", { name: "Next period" }))
    expect(within(period).getByRole("heading", { name: "Nov 2026" })).toBeInTheDocument()
    expect(within(period).getByText("Pipeline").nextElementSibling).toHaveTextContent("€48,000")

    await user.click(within(period).getByRole("button", { name: "Mar 2027" }))
    expect(within(period).getByRole("heading", { name: "Mar 2027" })).toBeInTheDocument()
    expect(within(period).getByRole("button", { name: "Next period" })).toBeDisabled()
  })
})

describe("Team tab", () => {
  it("compares My numbers per person with a Team total, plus the 90-day tiles", async () => {
    const user = userEvent.setup()
    renderForecast(megan.id)
    await user.click(await screen.findByRole("tab", { name: "Team" }))

    const section = await screen.findByRole("region", { name: "Team numbers" })
    const rows = within(section).getAllByRole("rowheader").map((h) => h.textContent)
    expect(rows).toEqual(["Megan Bowen", "Adele Vance", "Alex Wilber", "Team total"])

    const total = within(section).getByRole("rowheader", { name: "Team total" }).closest("tr") as HTMLElement
    expect(total).toHaveTextContent("Team total€0€0€135,000€135,0001.4×€120,000€140,000€110,800")

    const tiles = screen.getByRole("region", { name: "Last 90 days" })
    // Alex won €27,500; Adele lost one deal: 1 of 2 closed.
    expect(within(tiles).getByText("Win rate").nextElementSibling).toHaveTextContent("50%")
    expect(within(tiles).getByText("Average deal size").nextElementSibling).toHaveTextContent("€27,500")
    expect(within(tiles).getByText("Sales cycle").nextElementSibling).toHaveTextContent("65 days")
    expect(screen.getByRole("img", { name: "Funnel: open value per Stage" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Won versus lost value per Owner" })).toBeInTheDocument()
  })

  it("shows one card per person on a phone", async () => {
    setViewport("phone")
    const user = userEvent.setup()
    renderForecast(megan.id)
    await user.click(await screen.findByRole("tab", { name: "Team" }))
    expect(await screen.findByRole("article", { name: "Team total" })).toBeInTheDocument()
    expect(screen.getByRole("article", { name: "Adele Vance" })).toHaveTextContent("Quota this quarter")
  })
})

describe("Quotas tab", () => {
  it("shows people x months with this month plus the next 5, quarter totals and a Team row", async () => {
    const user = userEvent.setup()
    renderForecast(megan.id)
    await user.click(await screen.findByRole("tab", { name: "Quotas" }))
    const grid = await screen.findByRole("table", { name: "Quotas" })
    const headers = within(grid).getAllByRole("columnheader").map((h) => h.textContent)
    expect(headers).toEqual(["Salesperson", "Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027", "Feb 2027", "Mar 2027", "Q4 2026", "Q1 2027"])
    expect(within(grid).getByRole("spinbutton", { name: "Adele Vance Oct 2026" })).toHaveValue(40000)
    expect(within(grid).getByRole("spinbutton", { name: "Alex Wilber Oct 2026" })).toHaveValue(30000)
    const team = within(grid).getByRole("rowheader", { name: "Team" }).closest("tr") as HTMLElement
    expect(team).toHaveTextContent("€90,000")
  })

  it("keeps the manager's own row read-only, saying who sets it", async () => {
    const user = userEvent.setup()
    renderForecast(megan.id)
    await user.click(await screen.findByRole("tab", { name: "Quotas" }))
    const grid = await screen.findByRole("table", { name: "Quotas" })
    expect(within(grid).queryByRole("spinbutton", { name: /Megan Bowen/ })).not.toBeInTheDocument()
    expect(within(grid).getByText("Set by a system administrator")).toBeInTheDocument()
  })

  it("saves a Quota when leaving the cell, and it shows as Quota and Gap on the Forecast tab", async () => {
    const user = userEvent.setup()
    const { gateway } = renderForecast(megan.id)
    await user.click(await screen.findByRole("tab", { name: "Quotas" }))
    const cell = await screen.findByRole("spinbutton", { name: "Adele Vance Oct 2026" })
    await user.clear(cell)
    await user.type(cell, "55000")
    await user.tab()

    await waitFor(async () => {
      const quotas = await gateway.listQuotas({ scope: "myTeam", from: "2026-10-01", months: 1 })
      expect(quotas.find((q) => q.salespersonName === "Adele Vance")?.amount).toBe(55000)
    })

    await user.click(screen.getByRole("tab", { name: "Forecast" }))
    await pick(user, "Whose numbers", "Adele Vance")
    await waitFor(() => expect(figure("Quota", 0)).toBe("€55,000"))
    expect(figure("Gap", 0)).toBe("€55,000")
  })

  it("shows a phone a card per person", async () => {
    setViewport("phone")
    const user = userEvent.setup()
    renderForecast(megan.id)
    await user.click(await screen.findByRole("tab", { name: "Quotas" }))
    expect(await screen.findByRole("spinbutton", { name: "Adele Vance Oct 2026" })).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })
})
