import { describe, expect, it, vi } from "vitest"
import { useQuery } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { useGateway } from "@/hooks/use-gateway"
import { SEED_IDS, SEED_USERS } from "@/data/in-memory"
import { renderWithGateway } from "@/test/render"

// A stand-in for a record page header: shows the Lead and an Edit button for editors only.
function LeadHeader({ id }: { id: string }) {
  const gateway = useGateway()
  const { data } = useQuery({ queryKey: ["lead", id], queryFn: () => gateway.getLead(id) })
  if (!data) return <p>Loading…</p>
  return (
    <header>
      <h1>{data.lead.company}</h1>
      <p>Owner: {data.lead.ownerName}</p>
      {data.canEdit && <button>Edit</button>}
    </header>
  )
}

describe("SalesGatewayProvider", () => {
  it.each([
    ["the Owner", SEED_USERS.adele.id, true],
    ["the Owner's manager", SEED_USERS.megan.id, true],
    ["a peer", SEED_USERS.alex.id, false],
  ])("gives pages the gateway; Edit shows for %s: %s", async (_label, userId, showsEdit) => {
    renderWithGateway(<LeadHeader id={SEED_IDS.leads.notContacted} />, { userId })
    expect(await screen.findByRole("heading", { name: "Tailspin Toys" })).toBeInTheDocument()
    expect(screen.getByText("Owner: Adele Vance")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit" }) !== null).toBe(showsEdit)
  })

  it("fails loudly without a provider", () => {
    function Orphan() {
      useGateway()
      return null
    }
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Orphan />)).toThrow(/SalesGatewayProvider/)
    consoleError.mockRestore()
  })
})
