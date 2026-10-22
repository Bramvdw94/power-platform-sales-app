import { describe, expect, it, vi } from "vitest"
import { GatewayError, QualifyError } from "@/data/gateway"
import { PublishRefused } from "@/sales"
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
  ProductLineRow,
  ProductRow,
  QuotaRow,
  QuoteLineRow,
  QuoteRow,
  QuoteSettingsRow,
  QuoteTemplateRow,
  SystemUserRow,
  TableClient,
  ProcessRow,
  ProcessVersionRow,
  EnvironmentVariableDefinitionRow,
  EnvironmentVariableValueRow,
  BusinessRuleRow,
  EngineErrorRow,
} from "./client"
import { DataverseSalesGateway, toAccount, toLead, toMoment, toQuote, toQuoteLine } from "./dataverse-gateway"

const MEGAN = "aaaaaaaa-0000-0000-0000-000000000001"
const ADELE = "aaaaaaaa-0000-0000-0000-000000000002"
const ALEX = "aaaaaaaa-0000-0000-0000-000000000003"
const DIEGO = "aaaaaaaa-0000-0000-0000-000000000004"
const BRAM = "aaaaaaaa-0000-0000-0000-000000000009"

const users: SystemUserRow[] = [
  { systemuserid: MEGAN, fullname: "Megan Bowen", internalemailaddress: "megan@contoso.example", _parentsystemuserid_value: null },
  { systemuserid: ADELE, fullname: "Adele Vance", internalemailaddress: "adele@contoso.example", _parentsystemuserid_value: MEGAN },
  { systemuserid: ALEX, fullname: "Alex Wilber", internalemailaddress: "alex@contoso.example", _parentsystemuserid_value: MEGAN },
  { systemuserid: DIEGO, fullname: "Diego Siciliani", internalemailaddress: "diego@contoso.example", _parentsystemuserid_value: null },
]

/** A System Administrator who is no salesperson and has no reports. */
const bram: SystemUserRow = { systemuserid: BRAM, fullname: "Bram (admin)", internalemailaddress: "bram@contoso.example", _parentsystemuserid_value: null }

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
    delete: vi.fn(async (id: string) => {
      store.delete(id)
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

const PRODUCT = "ffffffff-0000-0000-0000-000000000001"
const RETIRED_PRODUCT = "ffffffff-0000-0000-0000-000000000002"

const productRows: ProductRow[] = [
  { vibe_productid: PRODUCT, vibe_name: "Consulting", vibe_productcode: "CONS-HR", vibe_description: "Per hour", vibe_unit: 841200001, vibe_listprice: 125, vibe_vatrate: 841200000, statecode: 0, createdon: "2026-05-01T09:00:00Z" },
  { vibe_productid: RETIRED_PRODUCT, vibe_name: "Legacy support", vibe_productcode: "SUP-OLD", vibe_unit: 841200004, vibe_listprice: 4800, vibe_vatrate: 841200001, statecode: 1, createdon: "2025-05-01T09:00:00Z" },
]

/** A fake Dataverse that understands the one filter the gateway sends for direct reports. */
describe("DataverseSalesGateway, Process administration", () => {
  const P1 = "11111111-0000-0000-0000-000000000001"
  const P2 = "11111111-0000-0000-0000-000000000002"
  const V1 = "22222222-0000-0000-0000-000000000001"
  const definition = {
    schemaVersion: 1,
    table: "opportunity",
    steps: [
      { id: "s1", name: "Qualify", mapsTo: "qualification" },
      { id: "s2", name: "Propose", mapsTo: "proposal" },
    ],
  }
  const rows = (): ProcessRow[] => [
    { vibe_processid: P1, vibe_name: "Starter", vibe_tablechoice: 841200001, vibe_priority: 1, vibe_isfallback: true, vibe_retired: false, _vibe_latestversionid_value: V1, vibe_draftdefinition: JSON.stringify(definition) },
    { vibe_processid: P2, vibe_name: "Draft", vibe_tablechoice: 841200001, vibe_priority: 2, vibe_isfallback: false, vibe_retired: false, _vibe_latestversionid_value: null, vibe_draftdefinition: JSON.stringify({ ...definition, steps: [] }) },
  ]
  const versions = (): ProcessVersionRow[] => [
    { vibe_processversionid: V1, _vibe_processid_value: P1, vibe_definition: JSON.stringify(definition), vibe_versionnumber: 1, vibe_publishedon: "2026-10-01T09:00:00Z" },
  ]

  it("lists a table's Processes with their draft, version number and unpublished changes", async () => {
    const client = fakeClient(MEGAN, [], [], [], [], rows(), versions())
    const list = await new DataverseSalesGateway(client).listProcessAdmin("opportunity")
    expect(list.map((p) => [p.name, p.latestVersionNumber, p.hasUnpublishedChanges])).toEqual([["Starter", 1, false], ["Draft", null, false]])
    expect(list[0].versions).toEqual([{ id: V1, number: 1, openRecords: 0, publishedOn: "2026-10-01T09:00:00Z" }])
  })

  it("flags a draft that differs from the latest version", async () => {
    const changed = rows()
    changed[0].vibe_draftdefinition = JSON.stringify({ ...definition, steps: [...definition.steps, { id: "s3", name: "Close", mapsTo: "negotiation" }] })
    const [first] = await new DataverseSalesGateway(fakeClient(MEGAN, [], [], [], [], changed, versions())).listProcessAdmin("opportunity")
    expect(first.hasUnpublishedChanges).toBe(true)
  })

  it("creates a draft Process last in the priority order", async () => {
    const client = fakeClient(MEGAN, [], [], [], [], rows(), versions())
    await new DataverseSalesGateway(client).createProcess("opportunity", "  Partner deals ")
    expect(client.processes.create).toHaveBeenCalledWith({
      vibe_name: "Partner deals",
      vibe_tablechoice: 841200001,
      vibe_priority: 3,
      vibe_isfallback: false,
      vibe_retired: false,
      vibe_draftdefinition: JSON.stringify({ schemaVersion: 1, table: "opportunity", steps: [] }),
    })
  })

  it("publishes the draft as the next Process version and points the Process at it", async () => {
    const client = fakeClient(MEGAN, [], [], [], [], rows(), versions())
    const edited = { ...definition, steps: [...definition.steps, { id: "s3", name: "Close", mapsTo: "negotiation" }] }
    client.processes.get.mockResolvedValueOnce({ ...rows()[0], vibe_draftdefinition: JSON.stringify(edited) })
    await new DataverseSalesGateway(client).publishProcess(P1)
    expect(client.processVersions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        vibe_name: "Starter v2",
        vibe_versionnumber: 2,
        vibe_definition: JSON.stringify(edited),
        "vibe_ProcessId@odata.bind": `/vibe_processes(${P1})`,
        "vibe_PublishedById@odata.bind": `/systemusers(${MEGAN})`,
      }),
    )
    expect(client.processes.update).toHaveBeenCalledWith(P1, { "vibe_LatestVersionId@odata.bind": expect.stringMatching(/^\/vibe_processversions\(/) })
  })

  it("refuses to publish Steps out of Stage order and writes nothing", async () => {
    const client = fakeClient(MEGAN, [], [], [], [], rows(), versions())
    const backwards = { ...definition, steps: [definition.steps[1], definition.steps[0]] }
    client.processes.get.mockResolvedValueOnce({ ...rows()[0], vibe_draftdefinition: JSON.stringify(backwards) })
    await expect(new DataverseSalesGateway(client).publishProcess(P1)).rejects.toBeInstanceOf(PublishRefused)
    expect(client.processVersions.create).not.toHaveBeenCalled()
  })

  it("makes a Process the only fallback and drops its Entry criteria from the draft", async () => {
    const client = fakeClient(MEGAN, [], [], [], [], rows(), versions())
    const withCriteria = { ...definition, steps: [], entryCriteria: { match: "all", conditions: [{ field: "account.accountType", op: "equals", value: "partner" }] } }
    client.processes.get.mockResolvedValueOnce({ ...rows()[1], vibe_draftdefinition: JSON.stringify(withCriteria) })
    await new DataverseSalesGateway(client).saveProcessDraft(P2, { isFallback: true })
    expect(client.processes.update).toHaveBeenCalledWith(P1, { vibe_isfallback: false })
    expect(client.processes.update).toHaveBeenCalledWith(P2, { vibe_isfallback: true, vibe_draftdefinition: JSON.stringify({ ...definition, steps: [] }) })
  })

  it("swaps the priority of two Processes", async () => {
    const client = fakeClient(MEGAN, [], [], [], [], rows(), versions())
    await new DataverseSalesGateway(client).moveProcessPriority(P2, "up")
    expect(client.processes.update).toHaveBeenCalledWith(P2, { vibe_priority: 1 })
    expect(client.processes.update).toHaveBeenCalledWith(P1, { vibe_priority: 2 })
  })

  it("retires a Process and clears its fallback flag", async () => {
    const client = fakeClient(MEGAN, [], [], [], [], rows(), versions())
    await new DataverseSalesGateway(client).retireProcess(P1)
    expect(client.processes.update).toHaveBeenCalledWith(P1, { vibe_retired: true, vibe_isfallback: false })
  })

  it("moves open records on an older version onto the latest and counts them", async () => {
    const V2 = "22222222-0000-0000-0000-000000000002"
    const latest: ProcessRow[] = [{ ...rows()[0], _vibe_latestversionid_value: V2 }]
    const twoVersions: ProcessVersionRow[] = [...versions(), { vibe_processversionid: V2, _vibe_processid_value: P1, vibe_definition: JSON.stringify(definition), vibe_versionnumber: 2 }]
    const client = fakeClient(MEGAN, [], [], [], [], latest, twoVersions)
    client.opportunities.list.mockResolvedValue({
      rows: [
        { ...opportunityRows[0], vibe_stage: 841200000, _vibe_processversionid_value: V1, vibe_currentstep: "s1" },
        { ...opportunityRows[1], vibe_stage: 841200000, _vibe_processversionid_value: V2, vibe_currentstep: "s1" },
        { ...opportunityRows[1], vibe_opportunityid: "99999999-0000-0000-0000-000000000009", vibe_stage: 841200004, _vibe_processversionid_value: V1, vibe_currentstep: "s2" },
      ],
      skipToken: undefined,
      count: 3,
    })
    const moved = await new DataverseSalesGateway(client).moveToLatestVersion(P1)
    expect(moved).toBe(1)
    expect(client.opportunities.update).toHaveBeenCalledTimes(1)
    expect(client.opportunities.update).toHaveBeenCalledWith(opportunityRows[0].vibe_opportunityid, { "vibe_ProcessVersionId@odata.bind": `/vibe_processversions(${V2})` })
  })

  it("lists Processes for someone who may not read Engine errors, without an error count", async () => {
    const client = fakeClient(ADELE, [], [], [], [], rows(), versions())
    client.engineErrors.list.mockRejectedValue(new Error("principal user is missing prvReadvibe_EngineError privilege (0x80040220)"))
    const list = await new DataverseSalesGateway(client).listProcessAdmin("opportunity")
    expect(list.map((p) => p.engineErrorCount)).toEqual([0, 0])
  })

  it("reads Engine errors", async () => {
    const client = fakeClient(MEGAN)
    client.engineErrors.list.mockResolvedValueOnce({
      rows: [{ vibe_engineerrorid: "e1", _vibe_processid_value: P1, vibe_actionid: "a1", vibe_code: "noManager", vibe_message: "The Owner has no manager.", vibe_occurredon: "2026-10-12T10:00:00Z" }],
      skipToken: undefined,
      count: 1,
    })
    expect(await new DataverseSalesGateway(client).listEngineErrors(P1)).toEqual([
      { id: "e1", processId: P1, actionId: "a1", code: "noManager", message: "The Owner has no manager.", occurredOn: "2026-10-12T10:00:00Z" },
    ])
  })

  describe("Business rule administration", () => {
    const RULE = "44444444-0000-0000-0000-0000000000a1"
    const definition = { schemaVersion: 1 as const, table: "contact" as const, when: { match: "all" as const, conditions: [{ field: "email", op: "isEmpty" as const }] }, effects: [{ type: "blockSave" as const, message: "Add an email." }] }
    const ruleRows = (): BusinessRuleRow[] => [
      { vibe_businessruleid: RULE, vibe_name: "Reachable", vibe_tablechoice: 841200003, vibe_enabled: true, vibe_definition: JSON.stringify(definition), modifiedon: "2026-10-12T10:00:00Z", _modifiedby_value: MEGAN, "_modifiedby_value@OData.Community.Display.V1.FormattedValue": "Megan Bowen" },
    ]

    it("lists a table's rules with who changed them last and how many Engine errors they have", async () => {
      const client = fakeClient(MEGAN, [], [], [], [], [], [], [], [], ruleRows())
      client.engineErrors.list.mockResolvedValueOnce({ rows: [{ vibe_engineerrorid: "e1", _vibe_ruleid_value: RULE, vibe_code: "fieldMissing", vibe_message: "x" }], skipToken: undefined, count: 1 })
      const [rule] = await new DataverseSalesGateway(client).listRulesAdmin("contact")
      expect(rule).toMatchObject({ id: RULE, name: "Reachable", enabled: true, lastChangedBy: "Megan Bowen", lastChangedOn: "2026-10-12T10:00:00Z", engineErrorCount: 1 })
      expect(client.businessRules.list.mock.calls[0][0].filter).toContain("vibe_tablechoice eq 841200003")
    })

    it("creates a rule with its table, switch and definition as JSON", async () => {
      const client = fakeClient(MEGAN)
      const saved = await new DataverseSalesGateway(client).saveBusinessRule({ name: "  Reachable ", enabled: true, definition })
      expect(client.businessRules.create).toHaveBeenCalledWith({ vibe_name: "Reachable", vibe_enabled: true, vibe_definition: JSON.stringify(definition), vibe_tablechoice: 841200003 })
      expect(saved.name).toBe("Reachable")
    })

    it("updates a rule in place and can switch it off", async () => {
      const client = fakeClient(MEGAN, [], [], [], [], [], [], [], [], ruleRows())
      await new DataverseSalesGateway(client).saveBusinessRule({ id: RULE, name: "Reachable", enabled: false, definition })
      expect(client.businessRules.update).toHaveBeenCalledWith(RULE, { vibe_name: "Reachable", vibe_enabled: false, vibe_definition: JSON.stringify(definition) })
      expect(client.businessRules.create).not.toHaveBeenCalled()
    })

    it("refuses a rule that closes a set value cycle, writing nothing", async () => {
      const a = { schemaVersion: 1, table: "contact", when: { match: "all", conditions: [{ field: "jobTitle", op: "isNotEmpty" }] }, effects: [{ type: "setValue", field: "phone", value: "1" }] }
      const rows: BusinessRuleRow[] = [{ vibe_businessruleid: RULE, vibe_name: "A", vibe_tablechoice: 841200003, vibe_enabled: true, vibe_definition: JSON.stringify(a) }]
      const client = fakeClient(MEGAN, [], [], [], [], [], [], [], [], rows)
      const b = { schemaVersion: 1 as const, table: "contact" as const, when: { match: "all" as const, conditions: [{ field: "phone", op: "isNotEmpty" as const }] }, effects: [{ type: "setValue" as const, field: "jobTitle", value: "x" }] }
      await expect(new DataverseSalesGateway(client).saveBusinessRule({ name: "B", enabled: true, definition: b })).rejects.toThrow(/keep setting each other's fields/)
      expect(client.businessRules.create).not.toHaveBeenCalled()
    })

    it("deletes a rule", async () => {
      const client = fakeClient(MEGAN, [], [], [], [], [], [], [], [], ruleRows())
      await new DataverseSalesGateway(client).deleteBusinessRule(RULE)
      expect(client.businessRules.delete).toHaveBeenCalledWith(RULE)
    })

    it("reads the Engine errors of one rule", async () => {
      const client = fakeClient(MEGAN)
      client.engineErrors.list.mockResolvedValueOnce({ rows: [{ vibe_engineerrorid: "e9", _vibe_ruleid_value: RULE, vibe_code: "fieldMissing", vibe_message: "Gone." }], skipToken: undefined, count: 1 })
      const errors = await new DataverseSalesGateway(client).listRuleEngineErrors(RULE)
      expect(errors).toMatchObject([{ id: "e9", ruleId: RULE, code: "fieldMissing", message: "Gone." }])
      expect(client.engineErrors.list.mock.calls[0][0].filter).toContain(RULE)
    })
  })
})

function fakeClient(signedIn: string, quotaRows: QuotaRow[] = [], productLineRows: ProductLineRow[] = [], quoteRows: QuoteRow[] = [], quoteLineRows: QuoteLineRow[] = [], processRows: ProcessRow[] = [], processVersionRows: ProcessVersionRow[] = [], envDefinitionRows: EnvironmentVariableDefinitionRow[] = [], envValueRows: EnvironmentVariableValueRow[] = [], businessRuleRows: BusinessRuleRow[] = []) {
  return {
    accounts: fakeTable("accountid", accountRows),
    contacts: fakeTable("contactid", contactRows),
    leads: fakeTable("vibe_leadid", leadRows),
    opportunities: fakeTable("vibe_opportunityid", opportunityRows),
    products: fakeTable("vibe_productid", productRows),
    productLines: fakeTable("vibe_productlineid", productLineRows),
    quotas: fakeTable("vibe_quotaid", quotaRows),
    quotes: fakeTable("vibe_quoteid", quoteRows),
    quoteLines: fakeTable("vibe_quotelineid", quoteLineRows),
    quoteTemplates: fakeTable("vibe_quotetemplateid", [] as QuoteTemplateRow[]),
    quoteSettings: fakeTable("vibe_quotesettingsid", [] as QuoteSettingsRow[]),
    processes: fakeTable("vibe_processid", processRows),
    processVersions: fakeTable("vibe_processversionid", processVersionRows),
    businessRules: fakeTable("vibe_businessruleid", businessRuleRows),
    engineErrors: fakeTable("vibe_engineerrorid", [] as EngineErrorRow[]),
    environmentVariableDefinitions: fakeTable("environmentvariabledefinitionid", envDefinitionRows),
    environmentVariableValues: fakeTable("environmentvariablevalueid", envValueRows),
    uploadQuotePdf: vi.fn(async () => undefined),
    downloadQuotePdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
    sendEmail: vi.fn(async () => undefined),
    notes: fakeTable("annotationid", noteRows),
    tasks: fakeTable("activityid", taskRows),
    phoneCalls: fakeTable("activityid", phoneCallRows),
    whoAmI: vi.fn(async () => signedIn),
    getSystemUser: vi.fn(async (id: string) => {
      const user = [...users, bram].find((u) => u.systemuserid === id)
      if (!user) throw new Error("not found")
      return user
    }),
    listSystemUsers: vi.fn(async (filter: string) => {
      if (filter.includes("System Administrator")) return filter.includes(BRAM) ? [bram] : []
      // Megan alone holds the SalesApp Catalogue Manager role.
      if (filter.includes("SalesApp Process Builder")) return filter.includes(MEGAN) ? users.filter((u) => u.systemuserid === MEGAN) : []
      if (filter.includes("SalesApp Catalogue Manager")) return filter.includes(MEGAN) ? users.filter((u) => u.systemuserid === MEGAN) : []
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

  it("knows who is a Catalogue manager", async () => {
    expect((await new DataverseSalesGateway(fakeClient(MEGAN)).getCurrentUser()).user.isCatalogueManager).toBe(true)
    expect((await new DataverseSalesGateway(fakeClient(ADELE)).getCurrentUser()).user.isCatalogueManager).toBe(false)
  })

  it("lets a System Administrator do everything: Catalogue and Process builder, and every salesperson counts as a report", async () => {
    const { user, directReports } = await new DataverseSalesGateway(fakeClient(BRAM)).getCurrentUser()
    expect(user).toMatchObject({ isAdministrator: true, isCatalogueManager: true, isProcessBuilder: true })
    expect(directReports.map((u) => u.fullName)).toEqual(["Adele Vance", "Alex Wilber", "Diego Siciliani", "Megan Bowen"])
    expect(directReports.every((u) => u.managerId === BRAM)).toBe(true)
    expect((await new DataverseSalesGateway(fakeClient(ADELE)).getCurrentUser()).user.isAdministrator).toBe(false)
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

  it("queries an Account's timeline across its Account, Contacts, Opportunities and their Leads", async () => {
    const client = fakeClient(DIEGO)
    await new DataverseSalesGateway(client).listAccountTimeline(TAILWIND)

    const contactIds = (await client.contacts.list.mock.results[0].value).rows.map((r: { contactid: string }) => r.contactid)
    const filter = client.tasks.list.mock.calls[0][0].filter as string
    expect(filter).toContain(`_regardingobjectid_value eq ${TAILWIND}`)
    expect(filter).toContain(`_regardingobjectid_value eq ${OPP}`)
    for (const id of contactIds) expect(filter).toContain(`_regardingobjectid_value eq ${id}`)
    expect(client.notes.list.mock.calls[0][0].filter).toContain(`_objectid_value eq ${TAILWIND}`)
    expect(client.phoneCalls.list.mock.calls[0][0].filter).toContain(`_regardingobjectid_value eq ${OPP}`)
  })

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

  it("reads and writes Account type and Industry as Dataverse's standard codes", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    const account = await gateway.updateAccount(TAILWIND, { accountType: "reseller", industry: "consulting" })
    expect(client.accounts.update).toHaveBeenCalledWith(TAILWIND, { customertypecode: 9, industrycode: 7 })
    expect(toAccount({ ...accountRows[0], customertypecode: 8, industrycode: 33 })).toMatchObject({ accountType: "prospect", industry: "wholesale" })
    expect(account.id).toBe(TAILWIND)

    await gateway.updateAccount(TAILWIND, { accountType: "", industry: "" })
    expect(client.accounts.update).toHaveBeenLastCalledWith(TAILWIND, { customertypecode: null, industrycode: null })
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
      vibe_forecastcategory: 841200000,
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
    expect(client.opportunities.update).toHaveBeenLastCalledWith(OPP, { vibe_stage: 841200003, vibe_probability: 75, vibe_forecastcategory: 841200002 })
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
      vibe_forecastcategory: null,
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
      vibe_forecastcategory: 841200001,
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
      vibe_forecastcategory: 841200000,
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

describe("DataverseSalesGateway Products", () => {
  it("lists Products, filtering on state and searching name and code", async () => {
    const client = fakeClient(ADELE)
    const page = await new DataverseSalesGateway(client).listProducts({
      status: "active",
      search: "cons",
      sort: { field: "listPrice", direction: "desc" },
    })
    expect(client.products.list).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "statecode eq 0 and (contains(vibe_name,'cons') or contains(vibe_productcode,'cons'))",
        orderBy: ["vibe_listprice desc", "vibe_productid asc"],
      }),
    )
    expect(page.items[0]).toEqual({
      id: PRODUCT,
      name: "Consulting",
      code: "CONS-HR",
      description: "Per hour",
      unit: "hour",
      listPrice: 125,
      vatRate: 21,
      retired: false,
      createdOn: "2026-05-01T09:00:00Z",
    })
    expect(page.items[1]).toMatchObject({ code: "SUP-OLD", unit: "year", vatRate: 9, retired: true })
  })

  it("creates a Product with the choice codes for Unit and VAT rate", async () => {
    const client = fakeClient(MEGAN)
    const product = await new DataverseSalesGateway(client).createProduct({
      name: " Workshop day ",
      code: "WS-DAY",
      unit: "day",
      listPrice: 1450,
      vatRate: 0,
    })
    expect(client.products.create).toHaveBeenCalledWith({
      vibe_name: "Workshop day",
      vibe_productcode: "WS-DAY",
      vibe_unit: 841200002,
      vibe_listprice: 1450,
      vibe_vatrate: 841200002,
    })
    expect(product).toMatchObject({ name: "Workshop day", unit: "day", vatRate: 0, retired: false })
  })

  it("refuses a Product with a missing name, code or price before calling Dataverse", async () => {
    const client = fakeClient(MEGAN)
    await expect(
      new DataverseSalesGateway(client).createProduct({ name: "", code: " ", unit: "day", listPrice: -1, vatRate: 21 }),
    ).rejects.toMatchObject({ code: "invalid", fieldErrors: { name: expect.any(String), code: expect.any(String), listPrice: expect.any(String) } })
    expect(client.products.create).not.toHaveBeenCalled()
  })

  it("turns the alternate key's refusal into a field error on the code", async () => {
    const client = fakeClient(MEGAN)
    client.products.create.mockRejectedValueOnce(new Error("A record that has the attribute values Product code already exists. (0x80060892)"))
    await expect(
      new DataverseSalesGateway(client).createProduct({ name: "Copy", code: "CONS-HR", unit: "hour", listPrice: 1, vatRate: 21 }),
    ).rejects.toMatchObject({ code: "invalid", fieldErrors: { code: "This Product code is already used." } })
  })

  it("explains a missing privilege as forbidden", async () => {
    const client = fakeClient(ADELE)
    client.products.update.mockRejectedValueOnce(new Error("Principal user is missing prvWritevibe_Product privilege. (0x80040220)"))
    await expect(new DataverseSalesGateway(client).updateProduct(PRODUCT, { listPrice: 1 })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("changes only the fields given, and clears a blank description", async () => {
    const client = fakeClient(MEGAN)
    await new DataverseSalesGateway(client).updateProduct(PRODUCT, { listPrice: 130, description: "" })
    expect(client.products.update).toHaveBeenCalledWith(PRODUCT, { vibe_listprice: 130, vibe_description: null })
  })

  it("retires a Product by deactivating it", async () => {
    const client = fakeClient(MEGAN)
    const product = await new DataverseSalesGateway(client).retireProduct(PRODUCT)
    expect(client.products.update).toHaveBeenCalledWith(PRODUCT, { statecode: 1, statuscode: 2 })
    expect(product.retired).toBe(true)
  })
})

describe("DataverseSalesGateway, Forecast category", () => {
  it("reads the stored category, falls back to the Stage default, and has none when closed", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    expect((await gateway.getOpportunity(OPP)).opportunity.forecastCategory).toBe("bestCase")
    await client.opportunities.update(OPP, { vibe_forecastcategory: 841200003 })
    expect((await gateway.getOpportunity(OPP)).opportunity.forecastCategory).toBe("omitted")
    await client.opportunities.update(OPP, { vibe_stage: 841200004 })
    expect((await gateway.getOpportunity(OPP)).opportunity.forecastCategory).toBeUndefined()
  })

  it("writes an override, and refuses one on a closed Opportunity", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    await gateway.updateOpportunity(OPP, { forecastCategory: "commit" })
    expect(client.opportunities.update).toHaveBeenLastCalledWith(OPP, { vibe_forecastcategory: 841200002 })
    await client.opportunities.update(OPP, { vibe_stage: 841200005 })
    await expect(gateway.updateOpportunity(OPP, { forecastCategory: "commit" })).rejects.toMatchObject({ code: "invalid" })
  })
})

describe("DataverseSalesGateway, Quotas", () => {
  const ADELE_Q = "99999999-1111-0000-0000-000000000001"
  const quotaRows: QuotaRow[] = [
    { vibe_quotaid: ADELE_Q, _vibe_salespersonid_value: ADELE, "_vibe_salespersonid_value@OData.Community.Display.V1.FormattedValue": "Adele Vance", vibe_month: "2026-10-01", vibe_amount: 40000 },
  ]

  it("reads Quotas for me, or for me and my team, from a month on", async () => {
    const client = fakeClient(MEGAN, quotaRows)
    const gateway = new DataverseSalesGateway(client)
    const team = await gateway.listQuotas({ scope: "myTeam", from: "2026-10-01", months: 6 })
    expect(team).toEqual([{ id: ADELE_Q, salespersonId: ADELE, salespersonName: "Adele Vance", month: "2026-10-01", amount: 40000 }])
    const filter = client.quotas.list.mock.calls[0][0].filter
    expect(filter).toContain(`_vibe_salespersonid_value eq ${MEGAN}`)
    expect(filter).toContain(`_vibe_salespersonid_value eq ${ADELE}`)
    expect(filter).toContain("vibe_month ge 2026-10-01 and vibe_month le 2027-03-01")
    await gateway.listQuotas({ scope: "me", from: "2026-10-01", months: 6 })
    expect(client.quotas.list.mock.calls[1][0].filter).not.toContain(ADELE)
  })

  it("creates a direct report's Quota, binding the Salesperson", async () => {
    const client = fakeClient(MEGAN)
    const saved = await new DataverseSalesGateway(client).setQuota(ADELE, "2026-11-01", 45000)
    expect(client.quotas.create).toHaveBeenCalledWith({
      "vibe_SalespersonId@odata.bind": `/systemusers(${ADELE})`,
      vibe_month: "2026-11-01",
      vibe_amount: 45000,
    })
    expect(saved).toMatchObject({ salespersonId: ADELE, month: "2026-11-01", amount: 45000 })
  })

  it("changes the amount of an existing row instead of adding another", async () => {
    const client = fakeClient(MEGAN, quotaRows)
    await new DataverseSalesGateway(client).setQuota(ADELE, "2026-10-01", 41000)
    expect(client.quotas.create).not.toHaveBeenCalled()
    expect(client.quotas.update).toHaveBeenCalledWith(ADELE_Q, { vibe_amount: 41000 })
  })

  it("refuses your own Quota and someone outside your team before calling Dataverse", async () => {
    const client = fakeClient(MEGAN)
    const gateway = new DataverseSalesGateway(client)
    await expect(gateway.setQuota(MEGAN, "2026-10-01", 1)).rejects.toMatchObject({ code: "forbidden" })
    await expect(gateway.setQuota(DIEGO, "2026-10-01", 1)).rejects.toMatchObject({ code: "forbidden" })
    await expect(new DataverseSalesGateway(fakeClient(ADELE)).setQuota(ADELE, "2026-10-01", 1)).rejects.toMatchObject({ code: "forbidden" })
    expect(client.quotas.create).not.toHaveBeenCalled()
  })
})

describe("DataverseSalesGateway, Product lines", () => {
  const LINE = "99999999-2222-0000-0000-000000000001"
  const lineRows: ProductLineRow[] = [
    {
      vibe_productlineid: LINE,
      _vibe_opportunityid_value: OPP,
      _vibe_productid_value: PRODUCT,
      vibe_name: "Consulting",
      vibe_description: "Per hour",
      vibe_quantity: 2,
      vibe_unitprice: 120,
      vibe_listpriceatadd: 125,
      vibe_discountpercent: 10,
      vibe_lineamount: 216,
      createdon: "2026-10-01T09:00:00Z",
    },
  ]

  it("reads the lines of an Opportunity with its details, oldest first", async () => {
    const client = fakeClient(ADELE, [], lineRows)
    const details = await new DataverseSalesGateway(client).getOpportunity(OPP)
    expect(details.productLines).toEqual([
      {
        id: LINE,
        opportunityId: OPP,
        productId: PRODUCT,
        productName: "Consulting",
        description: "Per hour",
        quantity: 2,
        unitPrice: 120,
        listPriceAtAdd: 125,
        discountPercent: 10,
        lineAmount: 216,
        createdOn: "2026-10-01T09:00:00Z",
      },
    ])
    const options = client.productLines.list.mock.calls[0][0]
    expect(options.filter).toBe(`_vibe_opportunityid_value eq ${OPP}`)
    expect(options.orderBy).toEqual(["createdon asc", "vibe_productlineid asc"])
  })

  it("adds a line with the Product's description and List price, binding both lookups", async () => {
    const client = fakeClient(ADELE)
    await new DataverseSalesGateway(client).addProductLine(OPP, { productId: PRODUCT, quantity: 1.5 })
    expect(client.productLines.create).toHaveBeenCalledWith({
      vibe_name: "Consulting",
      vibe_description: "Per hour",
      vibe_quantity: 1.5,
      vibe_unitprice: 125,
      vibe_discountpercent: 0,
      "vibe_OpportunityId@odata.bind": `/vibe_opportunities(${OPP})`,
      "vibe_ProductId@odata.bind": `/vibe_products(${PRODUCT})`,
    })
  })

  it("refuses a retired Product, bad values and a closed Opportunity before calling Dataverse", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    await expect(gateway.addProductLine(OPP, { productId: RETIRED_PRODUCT, quantity: 1 })).rejects.toMatchObject({
      code: "invalid",
      fieldErrors: { productId: expect.any(String) },
    })
    await expect(gateway.addProductLine(OPP, { productId: PRODUCT, quantity: 0, discountPercent: 101 })).rejects.toMatchObject({
      fieldErrors: { quantity: expect.any(String), discountPercent: expect.any(String) },
    })
    await client.opportunities.update(OPP, { vibe_stage: 841200004 })
    await expect(gateway.addProductLine(OPP, { productId: PRODUCT, quantity: 1 })).rejects.toMatchObject({ code: "invalid" })
    expect(client.productLines.create).not.toHaveBeenCalled()
  })

  it("changes only what is edited, and removes a line", async () => {
    const client = fakeClient(ADELE, [], lineRows)
    const gateway = new DataverseSalesGateway(client)
    await gateway.updateProductLine(LINE, { quantity: 3, description: "" })
    expect(client.productLines.update).toHaveBeenCalledWith(LINE, { vibe_quantity: 3, vibe_description: null })
    await gateway.removeProductLine(LINE)
    expect(client.productLines.delete).toHaveBeenCalledWith(LINE)
  })

  it("does not send an unchanged Estimated value, and refuses a changed one while lines exist", async () => {
    const client = fakeClient(ADELE, [], lineRows)
    const gateway = new DataverseSalesGateway(client)
    await gateway.updateOpportunity(OPP, { estimatedValue: 48000, nextStep: "Call" })
    expect(client.opportunities.update).toHaveBeenLastCalledWith(OPP, { vibe_nextstep: "Call" })
    await expect(gateway.updateOpportunity(OPP, { estimatedValue: 1 })).rejects.toMatchObject({
      code: "invalid",
      fieldErrors: { estimatedValue: expect.any(String) },
    })
  })

  it("lets the Estimated value be typed when there are no lines", async () => {
    const client = fakeClient(ADELE)
    await new DataverseSalesGateway(client).updateOpportunity(OPP, { estimatedValue: 50000 })
    expect(client.opportunities.update).toHaveBeenLastCalledWith(OPP, { vibe_estimatedvalue: 50000 })
  })
})

describe("DataverseSalesGateway, Quotes", () => {
  const SENT = "99999999-3333-0000-0000-000000000001"
  const OTHER_SENT = "99999999-3333-0000-0000-000000000002"
  const DRAFT = "99999999-3333-0000-0000-000000000003"
  const QLINE = "99999999-4444-0000-0000-000000000001"
  const quote = (id: string, status: number, extra: Partial<QuoteRow> = {}): QuoteRow => ({
    vibe_quoteid: id,
    vibe_name: "Q-00001",
    vibe_revision: 0,
    statuscode: status,
    _vibe_opportunityid_value: OPP,
    _vibe_accountid_value: TAILWIND,
    "_vibe_accountid_value@OData.Community.Display.V1.FormattedValue": "Tailwind Traders",
    _vibe_contactid_value: LOTTE,
    "_vibe_contactid_value@OData.Community.Display.V1.FormattedValue": "Lotte de Groot",
    vibe_validuntil: "2026-11-12",
    vibe_nettotal: 216,
    vibe_vat21: 45.36,
    vibe_vat9: 0,
    vibe_grosstotal: 261.36,
    _ownerid_value: ADELE,
    [OWNER_NAME]: "Adele Vance",
    createdon: "2026-10-13T09:00:00Z",
    ...extra,
  })
  const quoteRows = () => [quote(SENT, 2), quote(OTHER_SENT, 2, { vibe_name: "Q-00002" }), quote(DRAFT, 1, { vibe_name: "Q-00003" })]
  const quoteLine: QuoteLineRow = {
    vibe_quotelineid: QLINE,
    _vibe_quoteid_value: SENT,
    _vibe_productid_value: PRODUCT,
    vibe_name: "Consulting",
    vibe_description: "Per hour",
    vibe_quantity: 2,
    vibe_unitprice: 120,
    vibe_discountpercent: 10,
    vibe_vatrate: 841200000,
    vibe_lineamount: 216,
    createdon: "2026-10-13T09:00:00Z",
  }
  const productLine: ProductLineRow = {
    vibe_productlineid: "99999999-2222-0000-0000-000000000009",
    _vibe_opportunityid_value: OPP,
    _vibe_productid_value: PRODUCT,
    vibe_name: "Consulting",
    vibe_description: "Per hour",
    vibe_quantity: 2,
    vibe_unitprice: 120,
    vibe_listpriceatadd: 125,
    vibe_discountpercent: 10,
    vibe_lineamount: 216,
    createdon: "2026-10-01T09:00:00Z",
  }

  it("reads the Quotes of an Opportunity with its details, newest first, and a Quote with its lines", async () => {
    const client = fakeClient(ADELE, [], [], quoteRows(), [quoteLine])
    const gateway = new DataverseSalesGateway(client)
    const details = await gateway.getOpportunity(OPP)
    expect(details.quotes.map((q) => [q.number, q.status])).toEqual([["Q-00001", "sent"], ["Q-00002", "sent"], ["Q-00003", "draft"]])
    expect(client.quotes.list.mock.calls[0][0]).toMatchObject({
      filter: `_vibe_opportunityid_value eq ${OPP}`,
      orderBy: ["createdon desc", "vibe_quoteid desc"],
    })
    const read = await gateway.getQuote(SENT)
    expect(read.quote).toMatchObject({ id: SENT, number: "Q-00001", accountName: "Tailwind Traders", contactName: "Lotte de Groot", validUntil: "2026-11-12", netTotal: 216, grossTotal: 261.36, ownerName: "Adele Vance" })
    expect(read.lines).toEqual([expect.objectContaining({ id: QLINE, productName: "Consulting", vatRate: 21, lineAmount: 216 })])
    expect(read.canEdit).toBe(true)
  })

  it("makes a Draft from an open Opportunity, copying its Contact, Account and lines with the Product's VAT rate", async () => {
    const client = fakeClient(ADELE, [], [productLine])
    await new DataverseSalesGateway(client).createQuote(OPP)
    const created = client.quotes.create.mock.calls[0][0]
    expect(created).toMatchObject({
      vibe_revision: 0,
      "vibe_OpportunityId@odata.bind": `/vibe_opportunities(${OPP})`,
      "vibe_AccountId@odata.bind": `/accounts(${TAILWIND})`,
    })
    expect(created.vibe_validuntil).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(client.quoteLines.create).toHaveBeenCalledWith({
      vibe_name: "Consulting",
      vibe_description: "Per hour",
      vibe_quantity: 2,
      vibe_unitprice: 120,
      vibe_listpriceatadd: 125,
      vibe_discountpercent: 10,
      vibe_vatrate: 841200000,
      "vibe_QuoteId@odata.bind": "/vibe_quotes(dddddddd-0000-0000-0000-000000000001)",
      "vibe_ProductId@odata.bind": `/vibe_products(${PRODUCT})`,
    })
  })

  it("refuses a Quote on a closed Opportunity and for someone who may not edit it", async () => {
    const client = fakeClient(DIEGO)
    await expect(new DataverseSalesGateway(client).createQuote(OPP)).rejects.toMatchObject({ code: "forbidden" })
    const adele = fakeClient(ADELE)
    await adele.opportunities.update(OPP, { vibe_stage: 841200004 })
    await expect(new DataverseSalesGateway(adele).createQuote(OPP)).rejects.toMatchObject({ code: "invalid" })
    expect(client.quotes.create).not.toHaveBeenCalled()
    expect(adele.quotes.create).not.toHaveBeenCalled()
  })

  it("lets a manager make the Quote on a report's Opportunity", async () => {
    const client = fakeClient(MEGAN)
    await new DataverseSalesGateway(client).createQuote(OPP)
    expect(client.quotes.create).toHaveBeenCalled()
  })

  it("changes only a Draft: Contact, Valid until, lines, delete", async () => {
    const client = fakeClient(ADELE, [], [], quoteRows(), [{ ...quoteLine, _vibe_quoteid_value: DRAFT }])
    const gateway = new DataverseSalesGateway(client)
    await gateway.updateQuote(DRAFT, { validUntil: "2026-12-01", contactId: "" })
    expect(client.quotes.update).toHaveBeenLastCalledWith(DRAFT, { vibe_validuntil: "2026-12-01", vibe_ContactId: null })
    await gateway.updateQuoteLine(QLINE, { quantity: 3 })
    expect(client.quoteLines.update).toHaveBeenCalledWith(QLINE, { vibe_quantity: 3 })
    await gateway.removeQuoteLine(QLINE)
    expect(client.quoteLines.delete).toHaveBeenCalledWith(QLINE)
    await gateway.deleteQuote(DRAFT)
    expect(client.quotes.delete).toHaveBeenCalledWith(DRAFT)

    await expect(gateway.updateQuote(SENT, { validUntil: "2026-12-01" })).rejects.toMatchObject({ code: "invalid" })
    await expect(gateway.addQuoteLine(SENT, { productId: PRODUCT, quantity: 1 })).rejects.toMatchObject({ code: "invalid" })
    await expect(gateway.deleteQuote(SENT)).rejects.toMatchObject({ code: "invalid" })
    expect(client.quotes.delete).toHaveBeenCalledTimes(1)
  })

  it("adds a line with the Product's price, description and VAT rate, and refuses a retired Product", async () => {
    const client = fakeClient(ADELE, [], [], quoteRows())
    const gateway = new DataverseSalesGateway(client)
    await gateway.addQuoteLine(DRAFT, { productId: PRODUCT, quantity: 1 })
    expect(client.quoteLines.create).toHaveBeenCalledWith(expect.objectContaining({ vibe_unitprice: 125, vibe_description: "Per hour", vibe_vatrate: 841200000 }))
    await expect(gateway.addQuoteLine(DRAFT, { productId: RETIRED_PRODUCT, quantity: 1 })).rejects.toMatchObject({ fieldErrors: { productId: expect.any(String) } })
  })

  const PDF = new Uint8Array([37, 80, 68, 70])

  it("Send by download stores the PDF, then sets Sent (inactive) with the sent date, who sent it and how; only a Draft can be sent", async () => {
    const client = fakeClient(ADELE, [], [], quoteRows())
    const gateway = new DataverseSalesGateway(client)
    await gateway.sendQuote(DRAFT, { route: "download", pdf: PDF })
    expect(client.uploadQuotePdf).toHaveBeenCalledWith(DRAFT, "Q-00003.pdf", PDF)
    expect(client.sendEmail).not.toHaveBeenCalled()
    expect(client.quotes.update).toHaveBeenCalledWith(
      DRAFT,
      expect.objectContaining({ statecode: 1, statuscode: 2, vibe_sentvia: "Download", vibe_sentto: null, "vibe_SentBy@odata.bind": `/systemusers(${ADELE})` }),
    )
    expect(client.uploadQuotePdf.mock.invocationCallOrder[0]).toBeLessThan(client.quotes.update.mock.invocationCallOrder[0])
    await expect(gateway.sendQuote(SENT, { route: "download", pdf: PDF })).rejects.toMatchObject({ code: "invalid" })
  })

  it("Send by email stores the PDF, emails it from Outlook, and only then sets Sent", async () => {
    const client = fakeClient(ADELE, [], [], quoteRows())
    await new DataverseSalesGateway(client).sendQuote(DRAFT, { route: "email", pdf: PDF, to: "pieter@fabrikam.example", cc: "boss@fabrikam.example", subject: "Offerte", message: "Hi <you>\nBye" })
    expect(client.sendEmail).toHaveBeenCalledWith({
      to: "pieter@fabrikam.example",
      cc: "boss@fabrikam.example",
      subject: "Offerte",
      body: expect.stringContaining("Hi &lt;you&gt;<br>Bye"),
      attachment: { name: "Q-00003.pdf", bytes: PDF },
    })
    expect(client.quotes.update).toHaveBeenCalledWith(DRAFT, expect.objectContaining({ statuscode: 2, vibe_sentvia: "Outlook", vibe_sentto: "pieter@fabrikam.example" }))
    expect(client.uploadQuotePdf.mock.invocationCallOrder[0]).toBeLessThan(client.sendEmail.mock.invocationCallOrder[0])
    expect(client.sendEmail.mock.invocationCallOrder[0]).toBeLessThan(client.quotes.update.mock.invocationCallOrder[0])
  })

  it("Send by email without an address sends and stores nothing", async () => {
    const client = fakeClient(ADELE, [], [], quoteRows())
    await expect(new DataverseSalesGateway(client).sendQuote(DRAFT, { route: "email", pdf: PDF, to: " ", subject: "s", message: "m" })).rejects.toMatchObject({ code: "invalid", fieldErrors: { to: expect.any(String) } })
    expect(client.uploadQuotePdf).not.toHaveBeenCalled()
    expect(client.sendEmail).not.toHaveBeenCalled()
    expect(client.quotes.update).not.toHaveBeenCalled()
  })

  it("a failed email leaves the Quote a Draft", async () => {
    const client = fakeClient(ADELE, [], [], quoteRows())
    client.sendEmail.mockRejectedValueOnce(new Error("Outlook is down"))
    await expect(new DataverseSalesGateway(client).sendQuote(DRAFT, { route: "email", pdf: PDF, to: "pieter@fabrikam.example", subject: "s", message: "m" })).rejects.toThrow("Outlook is down")
    expect(client.quotes.update).not.toHaveBeenCalled()
  })

  it("Revise keeps the number, adds 1 to the Revision, copies the lines and marks the old Quote Revised last", async () => {
    const client = fakeClient(ADELE, [], [], quoteRows(), [quoteLine])
    const revised = await new DataverseSalesGateway(client).reviseQuote(SENT)
    expect(client.quotes.create).toHaveBeenCalledWith(expect.objectContaining({ vibe_name: "Q-00001", vibe_revision: 1 }))
    expect(client.quoteLines.create).toHaveBeenCalledWith(expect.objectContaining({ vibe_quantity: 2, vibe_vatrate: 841200000 }))
    expect(client.quotes.update).toHaveBeenCalledWith(SENT, { statecode: 1, statuscode: 5 })
    expect(revised.status).toBe("draft")
    expect(client.quotes.create.mock.invocationCallOrder[0]).toBeLessThan(client.quotes.update.mock.invocationCallOrder[0])
  })

  it("Accept sets Accepted and Rejects the Opportunity's other Sent Quotes", async () => {
    const client = fakeClient(ADELE, [], [], quoteRows())
    await new DataverseSalesGateway(client).acceptQuote(SENT)
    expect(client.quotes.update).toHaveBeenCalledWith(SENT, { statecode: 1, statuscode: 3 })
    expect(client.quotes.update).toHaveBeenCalledWith(OTHER_SENT, { statecode: 1, statuscode: 4 })
    expect(client.quotes.update).not.toHaveBeenCalledWith(DRAFT, expect.anything())
    expect(client.quotes.list.mock.calls.at(-1)?.[0].filter).toBe(`_vibe_opportunityid_value eq ${OPP} and statuscode eq 2`)
  })

  it("Reject sets Rejected; a Draft or a final Quote cannot be accepted or rejected", async () => {
    const client = fakeClient(ADELE, [], [], [...quoteRows(), quote("99999999-3333-0000-0000-000000000004", 3)])
    const gateway = new DataverseSalesGateway(client)
    await gateway.rejectQuote(SENT)
    expect(client.quotes.update).toHaveBeenCalledWith(SENT, { statecode: 1, statuscode: 4 })
    await expect(gateway.acceptQuote(DRAFT)).rejects.toMatchObject({ code: "invalid" })
    await expect(gateway.rejectQuote("99999999-3333-0000-0000-000000000004")).rejects.toMatchObject({ code: "invalid" })
  })

  it("a peer cannot send, revise, accept or reject", async () => {
    const client = fakeClient(DIEGO, [], [], quoteRows())
    const gateway = new DataverseSalesGateway(client)
    for (const act of [() => gateway.sendQuote(DRAFT, { route: "download", pdf: new Uint8Array([1]) }), () => gateway.reviseQuote(SENT), () => gateway.acceptQuote(SENT), () => gateway.rejectQuote(SENT)]) {
      await expect(act()).rejects.toMatchObject({ code: "forbidden" })
    }
    expect(client.quotes.update).not.toHaveBeenCalled()
  })

  it("Close as lost rejects the Sent Quotes; Close as won leaves them", async () => {
    const lost = fakeClient(ADELE, [], [], quoteRows())
    await new DataverseSalesGateway(lost).closeOpportunity(OPP, { outcome: "lost", lostReason: "price" })
    expect(lost.quotes.update).toHaveBeenCalledWith(SENT, { statecode: 1, statuscode: 4 })
    expect(lost.quotes.update).toHaveBeenCalledWith(OTHER_SENT, { statecode: 1, statuscode: 4 })
    expect(lost.quotes.update).not.toHaveBeenCalledWith(DRAFT, expect.anything())

    const won = fakeClient(ADELE, [], [], quoteRows())
    await new DataverseSalesGateway(won).closeOpportunity(OPP, { outcome: "won" })
    expect(won.quotes.update).not.toHaveBeenCalled()
  })
})

describe("DataverseSalesGateway, Processes", () => {
  const PROCESS = "11111111-0000-0000-0000-000000000001"
  const VERSION = "22222222-0000-0000-0000-000000000001"
  const definition = {
    schemaVersion: 1,
    table: "opportunity",
    steps: [
      { id: "s1", name: "Qualify", mapsTo: "qualification" },
      { id: "s2", name: "Propose", mapsTo: "proposal", gate: { checks: [{ field: "nextStep", op: "isNotEmpty" }] } },
    ],
  }
  const processRows: ProcessRow[] = [
    { vibe_processid: PROCESS, vibe_name: "Starter", vibe_tablechoice: 841200001, vibe_priority: 1, vibe_isfallback: true, vibe_retired: false, _vibe_latestversionid_value: VERSION },
    { vibe_processid: "11111111-0000-0000-0000-000000000002", vibe_name: "Draft", vibe_tablechoice: 841200001, vibe_priority: 2, _vibe_latestversionid_value: null },
  ]
  const versionRows: ProcessVersionRow[] = [
    { vibe_processversionid: VERSION, _vibe_processid_value: PROCESS, vibe_definition: JSON.stringify(definition) },
    { vibe_processversionid: "22222222-0000-0000-0000-000000000002", _vibe_processid_value: PROCESS, vibe_definition: "not json" },
  ]

  it("reads the published Processes and their versions of a table", async () => {
    const client = fakeClient(ADELE, [], [], [], [], processRows, versionRows)
    const result = await new DataverseSalesGateway(client).getProcessDefinitions("opportunity")
    expect(result.engineEnabled).toBe(true)
    expect(result.processes).toEqual([{ id: PROCESS, name: "Starter", table: "opportunity", priority: 1, isFallback: true, retired: false, latestVersionId: VERSION }])
    expect(result.versions).toEqual([{ id: VERSION, processId: PROCESS, definition }])
    expect(client.processes.list.mock.calls[0][0].filter).toContain("vibe_tablechoice eq 841200001")
  })

  it("reads the Business rules of a table and skips one whose definition can't be read", async () => {
    const good = { schemaVersion: 1, table: "contact", when: { match: "all", conditions: [{ field: "email", op: "isEmpty" }] }, effects: [{ type: "blockSave", message: "Add an email." }] }
    const rows: BusinessRuleRow[] = [
      { vibe_businessruleid: "44444444-0000-0000-0000-000000000001", vibe_name: "Reachable", vibe_tablechoice: 841200003, vibe_enabled: true, vibe_definition: JSON.stringify(good) },
      { vibe_businessruleid: "44444444-0000-0000-0000-000000000002", vibe_name: "Off", vibe_tablechoice: 841200003, vibe_enabled: false, vibe_definition: JSON.stringify(good) },
      { vibe_businessruleid: "44444444-0000-0000-0000-000000000003", vibe_name: "Broken", vibe_tablechoice: 841200003, vibe_enabled: true, vibe_definition: "not json" },
    ]
    const client = fakeClient(ADELE, [], [], [], [], [], [], [], [], rows)
    const result = await new DataverseSalesGateway(client).getBusinessRules("contact")
    expect(result.engineEnabled).toBe(true)
    expect(result.rules.map((r) => [r.name, r.enabled])).toEqual([["Reachable", true], ["Off", false]])
    expect(client.businessRules.list.mock.calls[0][0].filter).toContain("vibe_tablechoice eq 841200003")
  })

  it("is off when the kill switch environment variable says off", async () => {
    const def = "33333333-0000-0000-0000-000000000001"
    const client = fakeClient(ADELE, [], [], [], [], processRows, versionRows, [{ environmentvariabledefinitionid: def, schemaname: "vibe_ProcessEngineEnabled", defaultvalue: "on" }], [{ environmentvariablevalueid: "x", _environmentvariabledefinitionid_value: def, value: "off" }])
    expect((await new DataverseSalesGateway(client).getProcessDefinitions("opportunity")).engineEnabled).toBe(false)
  })

  it("reads a Lead's and an Opportunity's Process state", async () => {
    const state = { _vibe_processversionid_value: VERSION, vibe_currentstep: "s2", vibe_stepenteredon: "2026-10-10T09:00:00Z" }
    const client = fakeClient(ADELE)
    client.opportunities.get.mockResolvedValueOnce({ ...opportunityRows[0], ...state })
    const details = await new DataverseSalesGateway(client).getOpportunity(OPP)
    expect(details.opportunity).toMatchObject({ processVersionId: VERSION, currentStepId: "s2", stepEnteredOn: "2026-10-10T09:00:00Z" })
  })

  it("moves a Step by writing the new Step and leaving the Stage to the plug-in", async () => {
    const client = fakeClient(ADELE, [], [], [], [], processRows, versionRows)
    client.opportunities.get.mockResolvedValueOnce({ ...opportunityRows[0], vibe_stage: 841200000, vibe_probability: 10, _vibe_processversionid_value: VERSION })
    const gateway = new DataverseSalesGateway(client)
    await gateway.moveStep({ type: "opportunity", id: OPP }, "s2")
    expect(client.opportunities.update).toHaveBeenCalledWith(OPP, { vibe_currentstep: "s2", vibe_stage: 841200002, vibe_probability: 50, vibe_forecastcategory: expect.any(Number) })
    await gateway.moveStep({ type: "lead", id: SANNE }, "s9")
    expect(client.leads.update).toHaveBeenCalledWith(SANNE, { vibe_currentstep: "s9" })
  })

  it("switches Process by binding a Process version, or clears it", async () => {
    const client = fakeClient(ADELE)
    const gateway = new DataverseSalesGateway(client)
    await gateway.switchProcess({ type: "opportunity", id: OPP }, VERSION)
    expect(client.opportunities.update).toHaveBeenCalledWith(OPP, { "vibe_ProcessVersionId@odata.bind": `/vibe_processversions(${VERSION})` })
    await gateway.switchProcess({ type: "lead", id: SANNE }, null)
    expect(client.leads.update).toHaveBeenCalledWith(SANNE, { vibe_ProcessVersionId: null })
  })

  it("turns the plug-in's refusal into a message a salesperson can read", async () => {
    const client = fakeClient(ADELE)
    client.opportunities.update.mockRejectedValueOnce(new Error("Plug-in failed: 2 open checks on “Find the need”. (0x80040265)"))
    const refusal = await new DataverseSalesGateway(client).moveStep({ type: "opportunity", id: OPP }, "s2").catch((e: unknown) => e)
    expect(refusal).toBeInstanceOf(GatewayError)
    expect(refusal).toMatchObject({ code: "invalid", message: "2 open checks on “Find the need”." })
  })

  it("sees a Process builder", async () => {
    const megan = await new DataverseSalesGateway(fakeClient(MEGAN)).getCurrentUser()
    expect(megan.user.isProcessBuilder).toBe(true)
    const adele = await new DataverseSalesGateway(fakeClient(ADELE)).getCurrentUser()
    expect(adele.user.isProcessBuilder).toBe(false)
  })
})


describe("v3 foundation columns", () => {
  const LAST = "2026-10-20T09:30:00Z"

  it("reads Last activity on Accounts and Leads, blank when there is none", () => {
    expect(toAccount({ ...accountRows[0], vibe_lastactivityon: LAST }).lastActivityOn).toBe(LAST)
    expect(toAccount(accountRows[0]).lastActivityOn).toBeUndefined()
  })

  it("reads a Lead's Rating, Rating source, Score, Possible duplicate and First touch", () => {
    const lead = toLead({
      vibe_leadid: "lead-1", vibe_rating: 841200000, vibe_ratingsource: 841200001, vibe_score: 42,
      vibe_possibleduplicate: true, vibe_firsttouchon: LAST, vibe_lastactivityon: LAST,
    })
    expect(lead).toMatchObject({ rating: "hot", ratingSource: "hand", score: 42, possibleDuplicate: true, firstTouchOn: LAST, lastActivityOn: LAST })
    expect(toLead({ vibe_leadid: "lead-2" })).toMatchObject({ rating: undefined, ratingSource: undefined, score: undefined, possibleDuplicate: false })
  })

  it("reads a Quote's Approval status, None when blank", () => {
    expect(toQuote({ vibe_quoteid: "q-1", vibe_approvalstatus: 841200001 }).approvalStatus).toBe("pending")
    expect(toQuote({ vibe_quoteid: "q-2" }).approvalStatus).toBe("none")
  })

  it("reads a Quote line's List price at add, falling back to its unit price", () => {
    expect(toQuoteLine({ vibe_quotelineid: "l-1", vibe_unitprice: 100, vibe_listpriceatadd: 125 }).listPriceAtAdd).toBe(125)
    expect(toQuoteLine({ vibe_quotelineid: "l-2", vibe_unitprice: 100 }).listPriceAtAdd).toBe(100)
  })
})
