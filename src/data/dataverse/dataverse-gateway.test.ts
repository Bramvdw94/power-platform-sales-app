import { describe, expect, it, vi } from "vitest"
import type { DataverseClient, SystemUserRow } from "./client"
import { DataverseSalesGateway, NotAvailableYetError } from "./dataverse-gateway"

const MEGAN = "aaaaaaaa-0000-0000-0000-000000000001"
const ADELE = "aaaaaaaa-0000-0000-0000-000000000002"
const ALEX = "aaaaaaaa-0000-0000-0000-000000000003"

const users: SystemUserRow[] = [
  { systemuserid: MEGAN, fullname: "Megan Bowen", internalemailaddress: "megan@contoso.example", _parentsystemuserid_value: null },
  { systemuserid: ADELE, fullname: "Adele Vance", internalemailaddress: "adele@contoso.example", _parentsystemuserid_value: MEGAN },
  { systemuserid: ALEX, fullname: "Alex Wilber", internalemailaddress: "alex@contoso.example", _parentsystemuserid_value: MEGAN },
]

/** A fake Dataverse that understands the one filter the gateway sends for direct reports. */
function fakeClient(signedIn: string): DataverseClient {
  return {
    whoAmI: vi.fn(async () => signedIn),
    getSystemUser: vi.fn(async (id: string) => {
      const user = users.find((u) => u.systemuserid === id)
      if (!user) throw new Error("not found")
      return user
    }),
    listSystemUsers: vi.fn(async (filter: string) => {
      const managerId = /_parentsystemuserid_value eq ([0-9a-f-]+) and isdisabled eq false/.exec(filter)?.[1]
      return users.filter((u) => u._parentsystemuserid_value === managerId)
    }),
  }
}

describe("DataverseSalesGateway.getCurrentUser", () => {
  it("returns the signed-in user and their direct reports", async () => {
    const gateway = new DataverseSalesGateway(fakeClient(MEGAN))
    const { user, directReports } = await gateway.getCurrentUser()
    expect(user).toMatchObject({ id: MEGAN, fullName: "Megan Bowen", email: "megan@contoso.example", managerId: null })
    expect(directReports.map((u) => u.fullName)).toEqual(["Adele Vance", "Alex Wilber"])
    expect(directReports[0].managerId).toBe(MEGAN)
  })

  it("gives a salesperson without reports an empty team", async () => {
    const gateway = new DataverseSalesGateway(fakeClient(ADELE))
    const { user, directReports } = await gateway.getCurrentUser()
    expect(user.managerId).toBe(MEGAN)
    expect(directReports).toEqual([])
  })

  it("asks Dataverse once per session", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    await gateway.getCurrentUser()
    await gateway.getCurrentUser()
    expect(client.whoAmI).toHaveBeenCalledTimes(1)
  })

  it("tries again after a failure", async () => {
    const client = fakeClient(ADELE)
    vi.mocked(client.whoAmI).mockRejectedValueOnce(new Error("offline"))
    const gateway = new DataverseSalesGateway(client)
    await expect(gateway.getCurrentUser()).rejects.toThrow("offline")
    await expect(gateway.getCurrentUser()).resolves.toMatchObject({ user: { fullName: "Adele Vance" } })
  })
})

describe("DataverseSalesGateway, methods still to build", () => {
  it("fails loudly, naming the ticket", async () => {
    const gateway = new DataverseSalesGateway(fakeClient(ADELE))
    await expect(gateway.listLeads({ view: "my" })).rejects.toThrow(NotAvailableYetError)
    await expect(gateway.listLeads({ view: "my" })).rejects.toThrow("listLeads is not available yet (#29)")
  })
})
