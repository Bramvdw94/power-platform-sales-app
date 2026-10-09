import { describe, expect, it, vi } from "vitest"
import { GatewayError } from "@/data/gateway"
import type { AccountRow, ContactRow, DataverseClient, Fields, ListOptions, OpportunityRow, SystemUserRow, TableClient } from "./client"
import { DataverseSalesGateway, NotAvailableYetError } from "./dataverse-gateway"

const MEGAN = "aaaaaaaa-0000-0000-0000-000000000001"
const ADELE = "aaaaaaaa-0000-0000-0000-000000000002"
const ALEX = "aaaaaaaa-0000-0000-0000-000000000003"
const DIEGO = "aaaaaaaa-0000-0000-0000-000000000004"

const users: SystemUserRow[] = [
  { systemuserid: MEGAN, fullname: "Megan Bowen", internalemailaddress: "megan@contoso.example", _parentsystemuserid_value: null },
  { systemuserid: ADELE, fullname: "Adele Vance", internalemailaddress: "adele@contoso.example", _parentsystemuserid_value: MEGAN },
  { systemuserid: ALEX, fullname: "Alex Wilber", internalemailaddress: "alex@contoso.example", _parentsystemuserid_value: MEGAN },
  { systemuserid: DIEGO, fullname: "Diego Siciliani", internalemailaddress: "diego@contoso.example", _parentsystemuserid_value: null },
]

const TAILWIND = "bbbbbbbb-0000-0000-0000-000000000001"
const NORTHWIND = "bbbbbbbb-0000-0000-0000-000000000002"
const LOTTE = "cccccccc-0000-0000-0000-000000000001"
const OWNER_NAME = "_ownerid_value@OData.Community.Display.V1.FormattedValue"

/**
 * A fake table: it keeps rows by id and pages through them in order with
 * skip tokens. It doesn't evaluate filters; tests check the filter text.
 */
function fakeTable<T extends Record<string, unknown>>(key: string, rows: T[]) {
  const store = new Map(rows.map((r) => [r[key] as string, r]))
  let created = 0
  const table = {
    get: vi.fn(async (id: string) => {
      const row = store.get(id)
      if (!row) throw new Error(`${key} With Id = ${id} Does Not Exist (0x80040217)`)
      return row
    }),
    list: vi.fn(async (options: ListOptions) => {
      const all = [...store.values()]
      const start = options.skipToken ? Number(options.skipToken) : 0
      const end = start + options.pageSize
      return { rows: all.slice(start, end), skipToken: end < all.length ? String(end) : undefined, count: all.length }
    }),
    create: vi.fn(async (fields: Fields) => {
      created += 1
      const row = { ...fields, [key]: `dddddddd-0000-0000-0000-00000000000${created}`, _ownerid_value: ADELE } as unknown as T
      store.set(row[key] as string, row)
      return row
    }),
    update: vi.fn(async (id: string, fields: Fields) => {
      const row = { ...store.get(id)!, ...fields }
      store.set(id, row)
      return row
    }),
  } satisfies TableClient<T>
  return table
}

const accountRows: AccountRow[] = [
  { accountid: TAILWIND, name: "Tailwind Traders", address1_city: "Utrecht", _ownerid_value: ADELE, [OWNER_NAME]: "Adele Vance", createdon: "2026-06-01T09:00:00Z" },
  { accountid: NORTHWIND, name: "Northwind BV", telephone1: null, _ownerid_value: DIEGO, owneridname: "Diego Siciliani", createdon: "2026-07-01T09:00:00Z" },
]

const contactRows: ContactRow[] = [
  {
    contactid: LOTTE,
    firstname: "Lotte",
    lastname: "de Groot",
    _parentcustomerid_value: TAILWIND,
    "_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "account",
    "_parentcustomerid_value@OData.Community.Display.V1.FormattedValue": "Tailwind Traders",
    emailaddress1: "lotte@tailwind.example",
    _ownerid_value: ADELE,
    [OWNER_NAME]: "Adele Vance",
    createdon: "2026-06-02T09:00:00Z",
  },
]

const opportunityRows: OpportunityRow[] = [
  {
    vibe_opportunityid: "eeeeeeee-0000-0000-0000-000000000001",
    vibe_name: "Tailwind Traders - Managed workplace",
    _vibe_accountid_value: TAILWIND,
    "_vibe_accountid_value@OData.Community.Display.V1.FormattedValue": "Tailwind Traders",
    vibe_stage: 841200002,
    vibe_probability: 50,
    vibe_estimatedvalue: 48000,
    vibe_expectedclosedate: "2026-11-15",
    vibe_leadsource: 841200001,
    _ownerid_value: ADELE,
    createdon: "2026-06-03T09:00:00Z",
  },
]

/** A fake Dataverse that understands the one filter the gateway sends for direct reports. */
function fakeClient(signedIn: string) {
  return {
    accounts: fakeTable("accountid", accountRows),
    contacts: fakeTable("contactid", contactRows),
    opportunities: fakeTable("vibe_opportunityid", opportunityRows),
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
  } satisfies DataverseClient
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

describe("DataverseSalesGateway, Accounts and Contacts", () => {
  it("lists my active Accounts, sorted with a stable tiebreaker", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    const page = await gateway.listAccounts({ view: "my", sort: { field: "city", direction: "desc" } })
    expect(client.accounts.list).toHaveBeenCalledWith({
      filter: `statecode eq 0 and (_ownerid_value eq ${ADELE})`,
      orderBy: ["address1_city desc", "accountid asc"],
      pageSize: 50,
      skipToken: undefined,
    })
    expect(page.totalCount).toBe(2)
    expect(page.items[0]).toEqual({
      id: TAILWIND,
      name: "Tailwind Traders",
      city: "Utrecht",
      ownerId: ADELE,
      ownerName: "Adele Vance",
      createdOn: "2026-06-01T09:00:00Z",
      website: undefined,
      phone: undefined,
      street: undefined,
      postcode: undefined,
      country: undefined,
      description: undefined,
    })
    expect(page.items[1].ownerName).toBe("Diego Siciliani")
  })

  it("puts a manager's reports in My team, and searches with quotes escaped", async () => {
    const client = fakeClient(MEGAN)
    const gateway = new DataverseSalesGateway(client)
    await gateway.listContacts({ view: "myTeam", search: " O'Brien " })
    expect(client.contacts.list.mock.calls[0][0].filter).toBe(
      `statecode eq 0 and (_ownerid_value eq ${MEGAN} or _ownerid_value eq ${ADELE} or _ownerid_value eq ${ALEX})` +
        ` and (contains(fullname,'O''Brien') or contains(emailaddress1,'O''Brien'))`,
    )
    expect(client.contacts.list.mock.calls[0][0].orderBy).toEqual(["lastname asc", "contactid asc"])
  })

  it("lists everything under All", async () => {
    const client = fakeClient(ADELE)
    await new DataverseSalesGateway(client).listAccounts({ view: "all" })
    expect(client.accounts.list.mock.calls[0][0].filter).toBe("statecode eq 0")
  })

  it("pages forward with skip tokens, remembering them for the way back", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    const query = { view: "all" as const, pageSize: 1 }

    const second = await gateway.listAccounts({ ...query, page: 2 })
    expect(second.items.map((a) => a.name)).toEqual(["Northwind BV"])
    expect(client.accounts.list.mock.calls.map((c) => c[0].skipToken)).toEqual([undefined, "1"])

    client.accounts.list.mockClear()
    await gateway.listAccounts({ ...query, page: 2 })
    expect(client.accounts.list.mock.calls.map((c) => c[0].skipToken)).toEqual(["1"])

    const beyond = await gateway.listAccounts({ ...query, page: 5 })
    expect(beyond).toEqual({ items: [], totalCount: 2 })
  })

  it("reads a Contact's Account from the polymorphic company lookup", async () => {
    const client = fakeClient(ADELE)
    const { contact, account, canEdit } = await new DataverseSalesGateway(client).getContact(LOTTE)
    expect(contact).toMatchObject({ accountId: TAILWIND, accountName: "Tailwind Traders", ownerName: "Adele Vance" })
    expect(account?.name).toBe("Tailwind Traders")
    expect(canEdit).toBe(true)
    expect(client.opportunities.list.mock.calls[0][0].filter).toBe(`_vibe_primarycontactid_value eq ${LOTTE}`)
  })

  it("ignores a company lookup that points at another contact", async () => {
    const client = fakeClient(ADELE)
    await client.contacts.update(LOTTE, {
      "_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "contact",
    })
    const { contact, account } = await new DataverseSalesGateway(client).getContact(LOTTE)
    expect(contact.accountId).toBeUndefined()
    expect(account).toBeUndefined()
  })

  it("loads an Account with its active Contacts and its Opportunities", async () => {
    const client = fakeClient(MEGAN)
    const details = await new DataverseSalesGateway(client).getAccount(TAILWIND)
    expect(client.contacts.list.mock.calls[0][0].filter).toBe(`_parentcustomerid_value eq ${TAILWIND} and statecode eq 0`)
    expect(client.opportunities.list.mock.calls[0][0].filter).toBe(`_vibe_accountid_value eq ${TAILWIND}`)
    expect(details.contacts.map((c) => c.lastName)).toEqual(["de Groot"])
    expect(details.opportunities[0]).toMatchObject({
      name: "Tailwind Traders - Managed workplace",
      accountName: "Tailwind Traders",
      stage: "proposal",
      leadSource: "referral",
      estimatedValue: 48000,
      expectedCloseDate: "2026-11-15",
    })
    // Megan manages Adele, the Owner.
    expect(details.canEdit).toBe(true)
  })

  it("offers Edit only to the Owner and the Owner's manager", async () => {
    expect((await new DataverseSalesGateway(fakeClient(ALEX)).getAccount(TAILWIND)).canEdit).toBe(false)
    expect((await new DataverseSalesGateway(fakeClient(MEGAN)).getAccount(NORTHWIND)).canEdit).toBe(false)
    expect((await new DataverseSalesGateway(fakeClient(DIEGO)).getAccount(NORTHWIND)).canEdit).toBe(true)
  })

  it("creates a Contact under an Account by binding the company lookup", async () => {
    const client = fakeClient(ADELE)
    const contact = await new DataverseSalesGateway(client).createContact({ firstName: " Noor ", lastName: "Jansen", accountId: TAILWIND })
    expect(client.contacts.create).toHaveBeenCalledWith({
      firstname: "Noor",
      lastname: "Jansen",
      "parentcustomerid_account@odata.bind": `/accounts(${TAILWIND})`,
    })
    expect(contact.lastName).toBe("Jansen")
  })

  it("clears blanked fields and the Account on update, and leaves the rest alone", async () => {
    const client = fakeClient(ADELE)
    await new DataverseSalesGateway(client).updateContact(LOTTE, { jobTitle: "", accountId: "", email: "lotte@example.com" })
    expect(client.contacts.update).toHaveBeenCalledWith(LOTTE, {
      jobtitle: null,
      emailaddress1: "lotte@example.com",
      "parentcustomerid_account@odata.bind": null,
    })
  })

  it("refuses a blank required field without calling Dataverse", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    await expect(gateway.createAccount({ name: "  " })).rejects.toMatchObject({ code: "invalid", fieldErrors: { name: expect.any(String) } })
    await expect(gateway.updateContact(LOTTE, { lastName: "" })).rejects.toMatchObject({ code: "invalid" })
    expect(client.accounts.create).not.toHaveBeenCalled()
    expect(client.contacts.update).not.toHaveBeenCalled()
  })

  it("creates an Account with only the filled-in columns", async () => {
    const client = fakeClient(ADELE)
    const account = await new DataverseSalesGateway(client).createAccount({ name: "Contoso", city: "Gent" })
    expect(client.accounts.create).toHaveBeenCalledWith({ name: "Contoso", address1_city: "Gent" })
    expect(account).toMatchObject({ name: "Contoso", city: "Gent", ownerId: ADELE })
  })

  it("turns Dataverse's refusals into gateway errors", async () => {
    const client = fakeClient(ALEX)
    client.accounts.update.mockRejectedValueOnce(
      new Error("Principal user is missing prvWriteAccount privilege (0x80040220)"),
    )
    const gateway = new DataverseSalesGateway(client)
    const refused = gateway.updateAccount(TAILWIND, { name: "Tailwind" })
    await expect(refused).rejects.toBeInstanceOf(GatewayError)
    await expect(refused).rejects.toMatchObject({ code: "forbidden" })
    await expect(gateway.getAccount("bbbbbbbb-0000-0000-0000-00000000ffff")).rejects.toMatchObject({ code: "notFound" })
  })

  it("searches Accounts and Contacts", async () => {
    const client = fakeClient(ADELE)
    const results = await new DataverseSalesGateway(client).search("tail")
    expect(results.accounts).toHaveLength(2)
    expect(results.contacts).toHaveLength(1)
    expect(results.leads).toEqual([])
    expect(client.accounts.list.mock.calls[0][0]).toMatchObject({ filter: "statecode eq 0 and contains(name,'tail')", pageSize: 10 })
  })
})
