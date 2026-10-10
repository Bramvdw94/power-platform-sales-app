import { describe, expect, it, vi } from "vitest"
import { GatewayError, QualifyError } from "@/data/gateway"
import type {
  AccountRow,
  ActivityRow,
  ContactRow,
  DataverseClient,
  Fields,
  LeadRow,
  ListOptions,
  NoteRow,
  OpportunityRow,
  PhoneCallRow,
  SystemUserRow,
  TableClient,
} from "./client"
import { DataverseSalesGateway, toMoment } from "./dataverse-gateway"

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

const SANNE = "ffffffff-0000-0000-0000-000000000001"
const JORIS = "ffffffff-0000-0000-0000-000000000002"

const leadRows: LeadRow[] = [
  {
    vibe_leadid: SANNE,
    vibe_firstname: "Sanne",
    vibe_lastname: "Bakker",
    vibe_company: "Tailspin Toys",
    vibe_email: "sanne@tailspin.example",
    vibe_leadsource: 841200000,
    vibe_leadstatus: 841200000,
    _ownerid_value: ADELE,
    [OWNER_NAME]: "Adele Vance",
    createdon: "2026-10-07T09:00:00Z",
  },
  {
    vibe_leadid: JORIS,
    vibe_firstname: "Joris",
    vibe_lastname: "Willems",
    vibe_company: "Proseware",
    vibe_leadstatus: 841200003,
    vibe_disqualifyreason: 841200000,
    vibe_disqualifiedon: "2026-10-04T09:00:00Z",
    _vibe_disqualifiedby_value: MEGAN,
    _ownerid_value: ADELE,
    createdon: "2026-09-09T09:00:00Z",
  },
]

const OPP = "eeeeeeee-0000-0000-0000-000000000001"
const OPEN_TASK = "99999999-0000-0000-0000-000000000001"
const DONE_TASK = "99999999-0000-0000-0000-000000000002"
const REGARDING_OPP = {
  _regardingobjectid_value: OPP,
  "_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "vibe_opportunity",
  "_regardingobjectid_value@OData.Community.Display.V1.FormattedValue": "Tailwind Traders - Managed workplace",
}

const noteRows: NoteRow[] = [
  { annotationid: "99999999-0000-0000-0000-000000000010", subject: "Kick-off", notetext: "Pilot first.", _objectid_value: OPP, _ownerid_value: ADELE, createdon: "2026-09-10T09:00:00Z" },
]

const taskRows: ActivityRow[] = [
  { activityid: OPEN_TASK, subject: "Send proposal", scheduledend: "2026-10-14T10:00:00Z", statecode: 0, ...REGARDING_OPP, _ownerid_value: ADELE, [OWNER_NAME]: "Adele Vance", createdon: "2026-10-06T09:00:00Z" },
  { activityid: DONE_TASK, subject: "Intro meeting", scheduledend: "2026-09-01T10:00:00Z", actualend: "2026-09-01T15:00:00Z", statecode: 1, ...REGARDING_OPP, _ownerid_value: ADELE, createdon: "2026-08-30T09:00:00Z" },
  // About a record type the app doesn't show: left out of Home.
  { activityid: "99999999-0000-0000-0000-000000000003", subject: "Expense report", statecode: 0, _regardingobjectid_value: "12345678-0000-0000-0000-000000000000", "_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "incident", _ownerid_value: ADELE, createdon: "2026-10-01T09:00:00Z" },
]

const phoneCallRows: PhoneCallRow[] = [
  { activityid: "99999999-0000-0000-0000-000000000020", subject: "First call", directioncode: false, actualend: "2026-09-02T10:00:00Z", statecode: 1, ...REGARDING_OPP, _ownerid_value: ADELE, createdon: "2026-09-02T10:05:00Z" },
]

/** A fake Dataverse that understands the one filter the gateway sends for direct reports. */
function fakeClient(signedIn: string) {
  return {
    accounts: fakeTable("accountid", accountRows),
    contacts: fakeTable("contactid", contactRows),
    leads: fakeTable("vibe_leadid", leadRows),
    opportunities: fakeTable("vibe_opportunityid", opportunityRows),
    notes: fakeTable("annotationid", noteRows),
    tasks: fakeTable("activityid", taskRows),
    phoneCalls: fakeTable("activityid", phoneCallRows),
    whoAmI: vi.fn(async () => signedIn),
    getSystemUser: vi.fn(async (id: string) => {
      const user = users.find((u) => u.systemuserid === id)
      if (!user) throw new Error("not found")
      return user
    }),
    listSystemUsers: vi.fn(async (filter: string) => {
      // Everyone in the fixture holds the SalesApp Salesperson role.
      if (filter.includes("systemuserroles_association/any(")) return users
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

describe("DataverseSalesGateway, Reassign", () => {
  const lead = { type: "lead" as const, id: SANNE }

  it("lists the enabled users holding the SalesApp Salesperson role, by name", async () => {
    const client = fakeClient(ADELE)
    const salespeople = await new DataverseSalesGateway(client).listSalespeople()
    expect(client.listSystemUsers).toHaveBeenCalledWith(
      "isdisabled eq false and systemuserroles_association/any(r:r/name eq 'SalesApp Salesperson')",
    )
    expect(salespeople.map((u) => [u.fullName, u.isSalesperson])).toEqual([
      ["Adele Vance", true],
      ["Alex Wilber", true],
      ["Diego Siciliani", true],
      ["Megan Bowen", true],
    ])
  })

  it("binds the new Owner on the record, for its Owner", async () => {
    const client = fakeClient(ADELE)
    await new DataverseSalesGateway(client).reassign(lead, ALEX)
    expect(client.leads.update).toHaveBeenCalledWith(SANNE, { "ownerid@odata.bind": `/systemusers(${ALEX})` })
  })

  it("lets the Owner's manager reassign", async () => {
    const client = fakeClient(MEGAN)
    await new DataverseSalesGateway(client).reassign({ type: "opportunity", id: OPP }, DIEGO)
    expect(client.opportunities.update).toHaveBeenCalledWith(OPP, { "ownerid@odata.bind": `/systemusers(${DIEGO})` })
  })

  it("refuses a peer without writing", async () => {
    const client = fakeClient(ALEX)
    const error = await new DataverseSalesGateway(client).reassign(lead, ALEX).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: "forbidden" })
    expect(client.leads.update).not.toHaveBeenCalled()
  })

  it("refuses a new Owner without the SalesApp Salesperson role", async () => {
    const client = fakeClient(ADELE)
    const error = await new DataverseSalesGateway(client)
      .reassign(lead, "aaaaaaaa-0000-0000-0000-000000000099")
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GatewayError)
    expect(error).toMatchObject({ code: "invalid", fieldErrors: { ownerId: "Pick a salesperson." } })
    expect(client.leads.update).not.toHaveBeenCalled()
  })

  it("reports Dataverse refusing the Assign as forbidden", async () => {
    const client = fakeClient(ADELE)
    client.accounts.update.mockRejectedValueOnce(
      new Error("Principal user is missing prvAssignAccount privilege (0x80048306): does not have AssignAccess right(s)"),
    )
    const error = await new DataverseSalesGateway(client).reassign({ type: "account", id: TAILWIND }, ALEX).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: "forbidden" })
  })
})

describe("DataverseSalesGateway, activities", () => {
  const opportunity = { type: "opportunity" as const, id: OPP }

  it("lists a record's Notes, Tasks and Phone Calls with open Tasks on top", async () => {
    const client = fakeClient(DIEGO)
    const timeline = await new DataverseSalesGateway(client).listActivities(opportunity)

    expect(client.notes.list.mock.calls[0][0].filter).toBe(`_objectid_value eq ${OPP}`)
    expect(client.tasks.list.mock.calls[0][0].filter).toBe(`_regardingobjectid_value eq ${OPP}`)
    expect(client.phoneCalls.list.mock.calls[0][0].filter).toBe(`_regardingobjectid_value eq ${OPP}`)
    // The fake doesn't filter, so the Task about another record shows up here too; it still gets this record's ref.
    expect(timeline.map((a) => a.kind === "note" ? a.title : a.subject)).toEqual([
      "Send proposal",
      "Expense report",
      "Kick-off",
      "First call",
      "Intro meeting",
    ])
    expect(timeline[0]).toMatchObject({
      kind: "task",
      regarding: opportunity,
      regardingName: "Tailwind Traders - Managed workplace",
      ownerName: "Adele Vance",
      dueDate: "2026-10-14",
      completed: false,
    })
    expect(timeline.find((a) => a.kind === "phoneCall")).toMatchObject({ direction: "incoming", date: "2026-09-02", completed: true })
    expect(timeline.find((a) => a.kind === "task" && a.completed)).toMatchObject({ completedOn: "2026-09-01T15:00:00Z" })
  })

  it("adds a Note to a Lead and a Task to an Opportunity through the per-target lookup", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)

    const note = await gateway.addNote({ type: "lead", id: SANNE }, { title: " Budget ", text: "Approved for Q1" })
    expect(client.notes.create).toHaveBeenCalledWith({
      subject: "Budget",
      notetext: "Approved for Q1",
      "objectid_vibe_lead@odata.bind": `/vibe_leads(${SANNE})`,
    })
    expect(note).toMatchObject({ kind: "note", title: "Budget", regarding: { type: "lead", id: SANNE } })

    const task = await gateway.addTask(opportunity, { subject: "Book demo", dueDate: "2026-10-12" })
    expect(client.tasks.create).toHaveBeenCalledWith({
      subject: "Book demo",
      description: null,
      scheduledend: toMoment("2026-10-12"),
      "regardingobjectid_vibe_opportunity_task@odata.bind": `/vibe_opportunities(${OPP})`,
    })
    expect(task).toMatchObject({ kind: "task", dueDate: "2026-10-12", completed: false, regarding: opportunity })
  })

  it("logs a Phone Call on an Account as completed, Made or Received by direction", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    const account = { type: "account" as const, id: TAILWIND }

    const call = await gateway.addPhoneCall(account, { subject: "Check-in", direction: "incoming", date: "2026-10-09", notes: "All good" })
    expect(client.phoneCalls.create).toHaveBeenCalledWith({
      subject: "Check-in",
      description: "All good",
      directioncode: false,
      actualend: toMoment("2026-10-09"),
      "regardingobjectid_account_phonecall@odata.bind": `/accounts(${TAILWIND})`,
    })
    expect(client.phoneCalls.update).toHaveBeenCalledWith(call.id, { statecode: 1, statuscode: 4 })
    expect(call).toMatchObject({ direction: "incoming", date: "2026-10-09", completed: true })

    const planned = await gateway.addPhoneCall(account, { subject: "Follow-up", direction: "outgoing", date: "2026-10-20", completed: false })
    expect(client.phoneCalls.create.mock.lastCall?.[0]).toMatchObject({ directioncode: true, scheduledend: toMoment("2026-10-20") })
    expect(client.phoneCalls.update).toHaveBeenCalledTimes(1)
    expect(planned).toMatchObject({ date: "2026-10-20", completed: false })
  })

  it("lets only the Owner or the Owner's manager add activities, and checks the fields", async () => {
    const peer = fakeClient(ALEX)
    await expect(new DataverseSalesGateway(peer).addTask({ type: "account", id: TAILWIND }, { subject: "Sneaky" })).rejects.toMatchObject({ code: "forbidden" })
    expect(peer.tasks.create).not.toHaveBeenCalled()

    const manager = fakeClient(MEGAN)
    await new DataverseSalesGateway(manager).addTask({ type: "account", id: TAILWIND }, { subject: "Coach Adele" })
    expect(manager.tasks.create).toHaveBeenCalled()

    const owner = new DataverseSalesGateway(fakeClient(ADELE))
    await expect(owner.addTask(opportunity, { subject: " " })).rejects.toMatchObject({ code: "invalid", fieldErrors: { subject: "Subject is required." } })
    await expect(owner.addNote(opportunity, { title: "", text: "" })).rejects.toMatchObject({ code: "invalid" })
    await expect(owner.addPhoneCall(opportunity, { subject: "Call", direction: "outgoing", date: "" })).rejects.toMatchObject({
      fieldErrors: { date: "Date is required." },
    })
  })

  it("completes an open Task once", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    const done = await gateway.completeTask(OPEN_TASK)
    expect(client.tasks.update).toHaveBeenCalledWith(OPEN_TASK, { statecode: 1, statuscode: 5 })
    expect(done.completed).toBe(true)
    await expect(gateway.completeTask(DONE_TASK)).rejects.toMatchObject({ code: "invalid" })
    await expect(new DataverseSalesGateway(fakeClient(ALEX)).completeTask(OPEN_TASK)).rejects.toMatchObject({ code: "forbidden" })
  })
})

describe("DataverseSalesGateway.getHome", () => {
  it("asks for my open Tasks, my open Opportunities closing this month and my Not Contacted Leads", async () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 9, 10), toFake: ["Date"] })
    try {
      const client = fakeClient(ADELE)
      const home = await new DataverseSalesGateway(client).getHome()
      const mine = `_ownerid_value eq ${ADELE}`
      expect(client.tasks.list.mock.calls[0][0].filter).toBe(`${mine} and statecode eq 0`)
      expect(client.opportunities.list.mock.calls[0][0].filter).toBe(
        `${mine} and (vibe_stage eq 841200000 or vibe_stage eq 841200001 or vibe_stage eq 841200002 or vibe_stage eq 841200003)` +
          " and vibe_expectedclosedate ge 2026-10-01 and vibe_expectedclosedate le 2026-10-31",
      )
      expect(client.leads.list.mock.calls[0][0].filter).toBe(`${mine} and vibe_leadstatus eq 841200000`)
      // The fake ignores filters, so the completed Task comes back too; the one about another kind of record is left out.
      expect(home.openTasks.map((t) => t.subject)).toEqual(["Intro meeting", "Send proposal"])
      expect(home.openTasks[1].regarding).toEqual({ type: "opportunity", id: OPP })
    } finally {
      vi.useRealTimers()
    }
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
      parentcustomerid_account: null,
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

  it("searches Leads, Opportunities, Accounts and Contacts", async () => {
    const client = fakeClient(ADELE)
    const results = await new DataverseSalesGateway(client).search("tail")
    expect(results.opportunities).toHaveLength(1)
    expect(results.accounts).toHaveLength(2)
    expect(results.contacts).toHaveLength(1)
    expect(results.leads).toHaveLength(2)
    expect(client.leads.list.mock.calls[0][0]).toMatchObject({
      filter: "(contains(vibe_name,'tail') or contains(vibe_email,'tail'))",
      pageSize: 10,
    })
    expect(client.opportunities.list.mock.calls[0][0]).toMatchObject({ filter: "contains(vibe_name,'tail')", pageSize: 10 })
    expect(client.accounts.list.mock.calls[0][0]).toMatchObject({ filter: "statecode eq 0 and contains(name,'tail')", pageSize: 10 })
  })
})

describe("DataverseSalesGateway, Leads", () => {
  it("lists Leads of every status, filtered by Lead status and searched by name and email", async () => {
    const client = fakeClient(MEGAN)
    const gateway = new DataverseSalesGateway(client)
    const page = await gateway.listLeads({
      view: "myTeam",
      status: "disqualified",
      search: "o'b",
      sort: { field: "company", direction: "asc" },
    })
    expect(client.leads.list).toHaveBeenCalledWith({
      filter:
        `(_ownerid_value eq ${MEGAN} or _ownerid_value eq ${ADELE} or _ownerid_value eq ${ALEX}) and ` +
        "vibe_leadstatus eq 841200003 and (contains(vibe_name,'o''b') or contains(vibe_email,'o''b'))",
      orderBy: ["vibe_company asc", "vibe_leadid asc"],
      pageSize: 50,
      skipToken: undefined,
    })
    expect(page.items[0]).toMatchObject({
      firstName: "Sanne",
      company: "Tailspin Toys",
      leadSource: "website",
      status: "notContacted",
      ownerName: "Adele Vance",
    })
    expect(page.items[1]).toMatchObject({ status: "disqualified", disqualifyReason: "noBudget", disqualifiedById: MEGAN })
  })

  it("sends no filter for All without conditions", async () => {
    const client = fakeClient(ADELE)
    await new DataverseSalesGateway(client).listLeads({ view: "all" })
    expect(client.leads.list.mock.calls[0][0].filter).toBeUndefined()
  })

  it("creates a Not Contacted Lead named after the person", async () => {
    const client = fakeClient(ADELE)
    const lead = await new DataverseSalesGateway(client).createLead({
      firstName: "Noor",
      lastName: "Jansen",
      company: "Contoso",
      leadSource: "event",
    })
    expect(client.leads.create).toHaveBeenCalledWith({
      vibe_firstname: "Noor",
      vibe_lastname: "Jansen",
      vibe_company: "Contoso",
      vibe_leadsource: 841200002,
      vibe_name: "Noor Jansen",
      vibe_leadstatus: 841200000,
    })
    expect(lead).toMatchObject({ lastName: "Jansen", status: "notContacted", ownerId: ADELE })
  })

  it("refuses a Lead without Last name or Company without calling Dataverse", async () => {
    const client = fakeClient(ADELE)
    await expect(new DataverseSalesGateway(client).createLead({ lastName: " ", company: "" })).rejects.toMatchObject({
      code: "invalid",
      fieldErrors: { lastName: "Last name is required.", company: "Company is required." },
    })
    expect(client.leads.create).not.toHaveBeenCalled()
  })

  it("renames the Lead when the name changes, and clears blanked fields", async () => {
    const client = fakeClient(ADELE)
    await new DataverseSalesGateway(client).updateLead(SANNE, { lastName: "de Vries", email: "", leadSource: undefined })
    expect(client.leads.update).toHaveBeenCalledWith(SANNE, {
      vibe_lastname: "de Vries",
      vibe_email: null,
      vibe_name: "Sanne de Vries",
    })
  })

  it("moves a Lead to Working and back", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    expect(await gateway.setLeadStatus(SANNE, "working")).toMatchObject({ status: "working" })
    expect(client.leads.update).toHaveBeenLastCalledWith(SANNE, { vibe_leadstatus: 841200001 })
    expect(await gateway.setLeadStatus(SANNE, "notContacted")).toMatchObject({ status: "notContacted" })
  })

  it("disqualifies with reason, comment, when and by whom, and deactivates the Lead", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    await expect(gateway.disqualifyLead(SANNE, {})).rejects.toMatchObject({ code: "invalid", fieldErrors: { reason: expect.any(String) } })
    const lead = await gateway.disqualifyLead(SANNE, { reason: "duplicate", comment: "  Same as Lucas " })
    const sent = client.leads.update.mock.lastCall![1]
    expect(sent).toMatchObject({
      vibe_leadstatus: 841200003,
      vibe_disqualifyreason: 841200004,
      vibe_disqualifycomment: "Same as Lucas",
      "vibe_DisqualifiedBy@odata.bind": `/systemusers(${ADELE})`,
      statecode: 1,
      statuscode: 2,
    })
    expect(Date.parse(sent.vibe_disqualifiedon as string)).not.toBeNaN()
    expect(lead).toMatchObject({ status: "disqualified", disqualifyReason: "duplicate" })
  })

  it("refuses to edit or move a Disqualified Lead, and reopens it to Working", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    await expect(gateway.updateLead(JORIS, { company: "X" })).rejects.toMatchObject({ code: "invalid" })
    await expect(gateway.setLeadStatus(JORIS, "working")).rejects.toMatchObject({ code: "invalid" })
    expect(client.leads.update).not.toHaveBeenCalled()

    const lead = await gateway.reopenLead(JORIS)
    expect(client.leads.update).toHaveBeenCalledWith(JORIS, {
      vibe_leadstatus: 841200001,
      vibe_disqualifyreason: null,
      vibe_disqualifycomment: null,
      vibe_disqualifiedon: null,
      vibe_DisqualifiedBy: null,
      statecode: 0,
      statuscode: 1,
    })
    expect(lead.status).toBe("working")
  })

  it("loads a Lead with the Opportunity it became, and Edit for the manager only", async () => {
    const client = fakeClient(MEGAN)
    const details = await new DataverseSalesGateway(client).getLead(SANNE)
    expect(client.opportunities.list.mock.calls[0][0].filter).toBe(`_vibe_originatingleadid_value eq ${SANNE}`)
    expect(details).toMatchObject({ lead: { lastName: "Bakker" }, canEdit: true })
    expect((await new DataverseSalesGateway(fakeClient(ALEX)).getLead(SANNE)).canEdit).toBe(false)
  })
})

describe("DataverseSalesGateway, Opportunities", () => {

  it("filters by Stage, closed (deactivated) ones included", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    const page = await gateway.listOpportunities({ view: "my", stage: "open", sort: { field: "estimatedValue", direction: "desc" } })
    expect(page.items[0]).toMatchObject({ name: "Tailwind Traders - Managed workplace", stage: "proposal", leadSource: "referral", accountName: "Tailwind Traders" })
    expect(client.opportunities.list.mock.calls[0][0]).toMatchObject({
      filter: `(_ownerid_value eq ${ADELE}) and (vibe_stage eq 841200000 or vibe_stage eq 841200001 or vibe_stage eq 841200002 or vibe_stage eq 841200003)`,
      orderBy: ["vibe_estimatedvalue desc", "vibe_opportunityid asc"],
    })

    await gateway.listOpportunities({ view: "all", stage: "closedLost" })
    expect(client.opportunities.list.mock.calls[1][0].filter).toBe("vibe_stage eq 841200005")
    await gateway.listOpportunities({ view: "all" })
    expect(client.opportunities.list.mock.calls[2][0].filter).toBeUndefined()
  })

  it("loads the Pipeline for the filter, Dataverse narrowing by Owner, Stage and close date", async () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 9, 12), toFake: ["Date"] })
    try {
      const client = fakeClient(MEGAN)
      const gateway = new DataverseSalesGateway(client)
      const open = "(vibe_stage eq 841200000 or vibe_stage eq 841200001 or vibe_stage eq 841200002 or vibe_stage eq 841200003)"
      const team = `(_ownerid_value eq ${MEGAN} or _ownerid_value eq ${ADELE} or _ownerid_value eq ${ALEX})`

      const pipeline = await gateway.getPipeline({ owner: "myTeam", closeDate: "any", showClosed: false })
      expect(pipeline.map((o) => o.name)).toEqual(["Tailwind Traders - Managed workplace"])
      expect(client.opportunities.list.mock.calls[0][0]).toMatchObject({
        filter: `${team} and ${open}`,
        orderBy: ["vibe_expectedclosedate asc", "vibe_opportunityid asc"],
      })

      await gateway.getPipeline({ owner: "mine", closeDate: "thisQuarter", showClosed: true })
      expect(client.opportunities.list.mock.calls[1][0].filter).toBe(
        `(_ownerid_value eq ${MEGAN}) and ((${open} and vibe_expectedclosedate ge 2026-10-01 and vibe_expectedclosedate le 2026-12-31)` +
          ` or ((vibe_stage eq 841200004 or vibe_stage eq 841200005) and vibe_closedate ge 2026-10-01 and vibe_closedate le 2026-12-31))`,
      )
      // Megan owns none of the rows, so the sales rules drop what the fake doesn't filter.
      expect(await gateway.getPipeline({ owner: "mine", closeDate: "any", showClosed: true })).toEqual([])
      expect(client.opportunities.list.mock.calls[2][0].filter).toBe(`(_ownerid_value eq ${MEGAN})`)
    } finally {
      vi.useRealTimers()
    }
  })

  it("loads an Opportunity with its Account and Primary Contact", async () => {
    const client = fakeClient(MEGAN)
    await client.opportunities.update(OPP, { _vibe_primarycontactid_value: LOTTE })
    const details = await new DataverseSalesGateway(client).getOpportunity(OPP)
    expect(details.account.name).toBe("Tailwind Traders")
    expect(details.primaryContact?.lastName).toBe("de Groot")
    expect(details.canEdit).toBe(true)
  })

  it("creates an Opportunity with the Stage's Probability, binding its lookups", async () => {
    const client = fakeClient(ADELE)
    await new DataverseSalesGateway(client).createOpportunity({
      name: "Northwind BV - Teams",
      accountId: NORTHWIND,
      primaryContactId: LOTTE,
      stage: "needsAnalysis",
      estimatedValue: 36000,
      expectedCloseDate: "2026-12-15",
    })
    expect(client.opportunities.create).toHaveBeenCalledWith({
      vibe_name: "Northwind BV - Teams",
      vibe_estimatedvalue: 36000,
      vibe_expectedclosedate: "2026-12-15",
      "vibe_AccountId@odata.bind": `/accounts(${NORTHWIND})`,
      "vibe_PrimaryContactId@odata.bind": `/contacts(${LOTTE})`,
      vibe_stage: 841200001,
      vibe_probability: 25,
    })
  })

  it("updates fields and clears a blank Primary Contact and Lead source", async () => {
    const client = fakeClient(ADELE)
    await new DataverseSalesGateway(client).updateOpportunity(OPP, { probability: 35, nextStep: "", primaryContactId: "", leadSource: "" })
    expect(client.opportunities.update).toHaveBeenLastCalledWith(OPP, {
      vibe_probability: 35,
      vibe_nextstep: null,
      vibe_leadsource: null,
      vibe_PrimaryContactId: null,
    })
  })

  it("resets the Probability on a Stage change", async () => {
    const client = fakeClient(ADELE)
    const updated = await new DataverseSalesGateway(client).changeStage(OPP, "negotiation")
    expect(client.opportunities.update).toHaveBeenLastCalledWith(OPP, { vibe_stage: 841200003, vibe_probability: 75 })
    expect(updated).toMatchObject({ stage: "negotiation", probability: 75 })
  })

  it("closes as lost, recording who closed it, and deactivates the record", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    await expect(gateway.closeOpportunity(OPP, { outcome: "lost" })).rejects.toMatchObject({
      code: "invalid",
      fieldErrors: { lostReason: "Pick a Lost reason." },
    })
    await gateway.closeOpportunity(OPP, { outcome: "lost", lostReason: "price", closeDate: "2026-10-01" })
    expect(client.opportunities.update).toHaveBeenLastCalledWith(OPP, {
      vibe_stage: 841200005,
      vibe_probability: 0,
      vibe_actualvalue: null,
      vibe_closedate: "2026-10-01",
      vibe_lostreason: 841200000,
      vibe_lostcomment: null,
      "vibe_ClosedBy@odata.bind": `/systemusers(${ADELE})`,
      statecode: 1,
      statuscode: 2,
    })
  })

  it("closes as won with the Estimated value, refuses edits, and reopens clearing the close", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    await gateway.closeOpportunity(OPP, { outcome: "won", closeDate: "2026-10-09" })
    expect(client.opportunities.update.mock.lastCall?.[1]).toMatchObject({ vibe_stage: 841200004, vibe_actualvalue: 48000, statecode: 1 })

    await expect(gateway.updateOpportunity(OPP, { name: "Changed" })).rejects.toMatchObject({ code: "invalid" })
    await expect(gateway.changeStage(OPP, "proposal")).rejects.toMatchObject({ code: "invalid" })

    await gateway.reopenOpportunity(OPP, "proposal")
    expect(client.opportunities.update).toHaveBeenLastCalledWith(OPP, {
      vibe_stage: 841200002,
      vibe_probability: 50,
      vibe_actualvalue: null,
      vibe_closedate: null,
      vibe_lostreason: null,
      vibe_lostcomment: null,
      vibe_ClosedBy: null,
      statecode: 0,
      statuscode: 1,
    })
  })
})

describe("DataverseSalesGateway, Qualify", () => {
  const details = { name: "Tailspin Toys - Laptops", estimatedValue: 24000, expectedCloseDate: "2026-12-15" }

  /** The fake client, with the Opportunity list answering the "already qualified?" filter. */
  function qualifyClient(signedIn: string) {
    const client = fakeClient(signedIn)
    const list = client.opportunities.list.getMockImplementation()!
    client.opportunities.list.mockImplementation(async (options) => {
      const page = await list({ ...options, pageSize: 1000, skipToken: undefined })
      const leadId = /_vibe_originatingleadid_value eq ([0-9a-f-]+)/.exec(options.filter ?? "")?.[1]
      const rows = page.rows.filter(
        (r) => !leadId || r._vibe_originatingleadid_value === leadId || r["vibe_OriginatingLeadId@odata.bind"] === `/vibe_leads(${leadId})`,
      )
      return { rows, skipToken: undefined, count: rows.length }
    })
    return client
  }

  it("suggests active Accounts and Contacts and preselects one strong match", async () => {
    const client = qualifyClient(ADELE)
    await client.leads.update(SANNE, { vibe_company: "tailwind traders", vibe_email: "LOTTE@tailwind.example" })
    const suggestions = await new DataverseSalesGateway(client).getQualifySuggestions(SANNE)

    expect(client.accounts.list.mock.calls.map((c) => c[0].filter)).toEqual([
      "statecode eq 0 and name eq 'tailwind traders'",
      "statecode eq 0 and contains(name,'tailwind traders')",
    ])
    expect(client.contacts.list.mock.calls.map((c) => c[0].filter)).toEqual([
      "statecode eq 0 and emailaddress1 eq 'LOTTE@tailwind.example'",
      "statecode eq 0 and lastname eq 'Bakker'",
    ])
    expect(suggestions.accounts.preselectedId).toBe(TAILWIND)
    expect(suggestions.contacts).toMatchObject({ matchedBy: "email", preselectedId: LOTTE })
    expect(suggestions.opportunityName).toBe("tailwind traders - ")
  })

  it("links an existing Account, creates the Contact under it, then the Opportunity, and qualifies the Lead last", async () => {
    const client = qualifyClient(ADELE)
    const result = await new DataverseSalesGateway(client).qualifyLead(SANNE, {
      account: { existingId: TAILWIND },
      contact: { createNew: true },
      opportunity: details,
    })

    expect(client.accounts.create).not.toHaveBeenCalled()
    expect(client.accounts.update).not.toHaveBeenCalled()
    expect(client.contacts.create).toHaveBeenCalledWith({
      firstname: "Sanne",
      lastname: "Bakker",
      emailaddress1: "sanne@tailspin.example",
      "parentcustomerid_account@odata.bind": `/accounts(${TAILWIND})`,
    })
    expect(client.opportunities.create).toHaveBeenCalledWith({
      vibe_name: "Tailspin Toys - Laptops",
      vibe_estimatedvalue: 24000,
      vibe_expectedclosedate: "2026-12-15",
      vibe_leadsource: 841200000,
      "vibe_AccountId@odata.bind": `/accounts(${TAILWIND})`,
      "vibe_PrimaryContactId@odata.bind": `/contacts(${result.contactId})`,
      vibe_stage: 841200000,
      vibe_probability: 10,
      "vibe_OriginatingLeadId@odata.bind": `/vibe_leads(${SANNE})`,
    })
    expect(client.leads.update).toHaveBeenCalledWith(SANNE, { vibe_leadstatus: 841200002, statecode: 1, statuscode: 2 })
    expect(client.leads.update.mock.invocationCallOrder[0]).toBeGreaterThan(client.opportunities.create.mock.invocationCallOrder[0])
    expect(result).toMatchObject({ leadId: SANNE, accountId: TAILWIND })
  })

  it("creates a new Account from the Lead and gives the Opportunity the Lead's Owner when a manager qualifies", async () => {
    const client = qualifyClient(MEGAN)
    const result = await new DataverseSalesGateway(client).qualifyLead(SANNE, {
      account: { createNew: true },
      contact: { createNew: true },
      opportunity: details,
    })
    expect(client.accounts.create).toHaveBeenCalledWith({ name: "Tailspin Toys" })
    expect(client.contacts.create.mock.calls[0][0]["parentcustomerid_account@odata.bind"]).toBe(`/accounts(${result.accountId})`)
    // Created as the manager, then assigned: creating a record for someone else needs more than User-level Create.
    expect(client.opportunities.create.mock.calls[0][0]["ownerid@odata.bind"]).toBeUndefined()
    expect(client.opportunities.update).toHaveBeenCalledWith(result.opportunityId, { "ownerid@odata.bind": `/systemusers(${ADELE})` })
  })

  it("assigns an Opportunity left with the manager when only the assign failed, on retry", async () => {
    const client = qualifyClient(MEGAN)
    const gateway = new DataverseSalesGateway(client)
    client.opportunities.update.mockRejectedValueOnce(new Error("SecLib::AccessCheckEx failed"))
    const input = { account: { existingId: TAILWIND }, contact: { existingId: LOTTE }, opportunity: details }

    const error = (await gateway.qualifyLead(SANNE, input).catch((e: unknown) => e)) as QualifyError
    expect(error).toMatchObject({ step: "opportunity", code: "forbidden" })
    expect(client.leads.update).not.toHaveBeenCalled()

    // The fake owns created rows by Adele; make this one the manager's, as Dataverse would.
    await client.opportunities.update.getMockImplementation()!(error.created.opportunityId!, { _ownerid_value: MEGAN })
    await gateway.qualifyLead(SANNE, input)
    expect(client.opportunities.create).toHaveBeenCalledTimes(1)
    expect(client.opportunities.update).toHaveBeenLastCalledWith(error.created.opportunityId, {
      "ownerid@odata.bind": `/systemusers(${ADELE})`,
    })
    expect(client.leads.update).toHaveBeenCalledTimes(1)
  })

  it("only links an existing Contact at another Account", async () => {
    const client = qualifyClient(ADELE)
    const result = await new DataverseSalesGateway(client).qualifyLead(SANNE, {
      account: { existingId: NORTHWIND },
      contact: { existingId: LOTTE },
      opportunity: details,
    })
    expect(client.contacts.create).not.toHaveBeenCalled()
    expect(client.contacts.update).not.toHaveBeenCalled()
    expect(result.contactId).toBe(LOTTE)
    expect(client.opportunities.create.mock.calls[0][0]).toMatchObject({
      "vibe_AccountId@odata.bind": `/accounts(${NORTHWIND})`,
      "vibe_PrimaryContactId@odata.bind": `/contacts(${LOTTE})`,
    })
  })

  it("reports the failed step, leaves the Lead open, and a retry creates no duplicates", async () => {
    const client = qualifyClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    client.opportunities.create.mockRejectedValueOnce(new Error("Generic SQL error"))

    const error = await gateway
      .qualifyLead(SANNE, { account: { createNew: true }, contact: { createNew: true }, opportunity: details })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(QualifyError)
    const { step, created, message } = error as QualifyError
    expect(step).toBe("opportunity")
    expect(message).toContain("Generic SQL error")
    expect(created.accountId).toBeDefined()
    expect(created.contactId).toBeDefined()
    expect(client.leads.update).not.toHaveBeenCalled()

    await gateway.qualifyLead(SANNE, {
      account: { existingId: created.accountId! },
      contact: { existingId: created.contactId! },
      opportunity: details,
    })
    expect(client.accounts.create).toHaveBeenCalledTimes(1)
    expect(client.contacts.create).toHaveBeenCalledTimes(1)
    expect(client.opportunities.create).toHaveBeenCalledTimes(2)
    expect(client.leads.update).toHaveBeenCalledTimes(1)
  })

  it("reuses the Opportunity already created when only the Lead step failed", async () => {
    const client = qualifyClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    client.leads.update.mockRejectedValueOnce(new Error("SecLib::AccessCheckEx failed"))
    const input = { account: { existingId: TAILWIND }, contact: { existingId: LOTTE }, opportunity: details }

    const error = (await gateway.qualifyLead(SANNE, input).catch((e: unknown) => e)) as QualifyError
    expect(error).toMatchObject({ step: "lead", code: "forbidden" })
    expect(error.created.opportunityId).toBeDefined()

    const retry = await gateway.qualifyLead(SANNE, input)
    expect(retry.opportunityId).toBe(error.created.opportunityId)
    expect(client.opportunities.create).toHaveBeenCalledTimes(1)
  })

  it("refuses a peer, a closed Lead and missing Opportunity details without writing anything", async () => {
    const input = { account: { createNew: true as const }, contact: { createNew: true as const }, opportunity: details }
    const peer = qualifyClient(ALEX)
    await expect(new DataverseSalesGateway(peer).qualifyLead(SANNE, input)).rejects.toMatchObject({ code: "forbidden" })

    const owner = qualifyClient(ADELE)
    const gateway = new DataverseSalesGateway(owner)
    await expect(gateway.qualifyLead(JORIS, input)).rejects.toMatchObject({ code: "invalid" })
    await expect(
      gateway.qualifyLead(SANNE, { ...input, opportunity: { name: " ", estimatedValue: Number.NaN, expectedCloseDate: "" } }),
    ).rejects.toMatchObject({ code: "invalid" })

    for (const client of [peer, owner]) {
      expect(client.accounts.create).not.toHaveBeenCalled()
      expect(client.opportunities.create).not.toHaveBeenCalled()
      expect(client.leads.update).not.toHaveBeenCalled()
    }
  })
})
