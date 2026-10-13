import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_USERS } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import { myNumbers } from "@/sales"
import { MyNumbersTiles } from "./my-numbers-tiles"

const NOW = new Date(2026, 9, 13, 10, 0, 0)

function renderPath(path: string, userId: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return renderWithGateway(<RouterProvider router={router} />, { userId, now: NOW })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW })
  setViewport("desktop")
})
afterEach(() => vi.useRealTimers())

const tile = (label: string) => within(screen.getByRole("region", { name: "My numbers" })).getByRole("group", { name: label })

describe("My numbers on Home", () => {
  it("matches the Team tab's row for the same user", async () => {
    const user = userEvent.setup()
    const { unmount } = renderPath("/forecast", SEED_USERS.megan.id)
    await user.click(await screen.findByRole("tab", { name: "Team" }))
    const section = await screen.findByRole("region", { name: "Team numbers" })
    const row = within(within(section).getByRole("rowheader", { name: "Megan Bowen" }).closest("tr") as HTMLElement)
    const cells = row.getAllByRole("cell").map((c) => c.textContent as string)
    unmount()

    renderPath("/", SEED_USERS.megan.id)
    await screen.findByRole("region", { name: "My numbers" })
    expect(tile("Won this month")).toHaveTextContent(cells[0])
    expect(tile("Won this quarter")).toHaveTextContent(cells[1])
    expect(tile("Gap this quarter")).toHaveTextContent(cells[3])
    expect(tile("Coverage this quarter")).toHaveTextContent(cells[4])
    expect(tile("Commit")).toHaveTextContent(cells[5])
    expect(tile("Best case")).toHaveTextContent(cells[6])
    expect(tile("Weighted pipeline")).toHaveTextContent(cells[7])
    expect(tile("Closing this month")).toHaveTextContent(cells[8])
    expect(tile("Overdue close dates")).toHaveTextContent(cells[9])
  })

  it("lists all nine tiles, Won against Quota with a progress bar", async () => {
    renderPath("/", SEED_USERS.adele.id)
    await screen.findByRole("region", { name: "My numbers" })
    const names = within(screen.getByRole("region", { name: "My numbers" })).getAllByRole("group").map((g) => g.getAttribute("aria-label"))
    expect(names).toEqual([
      "Won this month",
      "Won this quarter",
      "Gap this quarter",
      "Coverage this quarter",
      "Commit",
      "Best case",
      "Weighted pipeline",
      "Closing this month",
      "Overdue close dates",
    ])
    expect(within(tile("Won this month")).getByRole("progressbar")).toBeInTheDocument()
    expect(tile("Won this month")).toHaveTextContent("Quota")
  })

  it("says No Quota set instead of 0%", () => {
    render(<MyNumbersTiles numbers={myNumbers([], [], "2026-10-13")} />)
    for (const label of ["Won this month", "Won this quarter", "Gap this quarter", "Coverage this quarter"]) {
      expect(tile(label)).toHaveTextContent("No Quota set")
    }
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument()
  })
})
