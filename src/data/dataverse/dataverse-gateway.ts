// The sales data gateway over Dataverse. It grows ticket by ticket (spec
// #23): methods not built yet throw a "not available yet" error naming the
// ticket that brings them, so a page that calls one fails loudly.

import {
  GatewayError,
  type AccountDetails,
  type AccountUpdate,
  type ContactDetails,
  type ContactUpdate,
  type CurrentUser,
  type ListQuery,
  type Page,
  type SalesGateway,
  type SearchResults,
} from "@/data/gateway"
import {
  LEAD_SOURCES,
  LOST_REASONS,
  STAGES,
  accountErrors,
  canEdit,
  contactErrors,
  teamMemberIds,
  type Account,
  type AccountInput,
  type Contact,
  type ContactInput,
  type FieldErrors,
  type Id,
  type ListView,
  type Opportunity,
  type User,
} from "@/sales"
import {
  CONTACT_ACCOUNT_BIND,
  type AccountRow,
  type ContactRow,
  type DataverseClient,
  type Fields,
  type ListOptions,
  type OpportunityRow,
  type RowPage,
  type SystemUserRow,
  type TableClient,
} from "./client"

/** Thrown by gateway methods that a later build ticket implements. */
export class NotAvailableYetError extends Error {
  constructor(method: string, ticket: string) {
    super(`${method} is not available yet (${ticket})`)
    this.name = "NotAvailableYetError"
  }
}

function notYet<K extends keyof SalesGateway>(method: K, ticket: string): SalesGateway[K] {
  const fail = (): Promise<never> => Promise.reject(new NotAvailableYetError(method, ticket))
  return fail as SalesGateway[K]
}

/** OData string literal for a GUID; rejects anything that isn't one. */
function guid(id: Id): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Not a Dataverse id: ${id}`)
  }
  return id.toLowerCase()
}

/** OData string literal: single quotes doubled. */
function text(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

const DEFAULT_PAGE_SIZE = 50
const SEARCH_LIMIT = 10
/** Related lists stop here; more than this on one record is not a v1 case. */
const RELATED_LIMIT = 500
const ACTIVE = "statecode eq 0"

/** A global choice column's value: the publisher's option prefix plus the option's position. */
const CHOICE_BASE = 841200000

function fromChoice<T extends string>(options: readonly T[], value: number | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : options[value - CHOICE_BASE]
}

/** The display name of a lookup, from the formatted value Dataverse returns with it. */
export function lookupName(row: Record<string, unknown>, lookup: string): string | undefined {
  const name =
    row[`${lookup}name`] ?? row[`_${lookup}_value@OData.Community.Display.V1.FormattedValue`]
  return typeof name === "string" ? name : undefined
}

/** The table a polymorphic lookup points at, when Dataverse says. */
function lookupTable(row: Record<string, unknown>, lookup: string): string | undefined {
  const table = row[`_${lookup}_value@Microsoft.Dynamics.CRM.lookuplogicalname`] ?? row[`${lookup}type`]
  return typeof table === "string" ? table : undefined
}

function optional<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined || value === "" ? undefined : value
}

/** An edit's value for a column: blank clears it. */
function column(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined
  return value.trim() === "" ? null : value.trim()
}

/** Leaves out columns the patch doesn't touch. */
function fields(values: Record<string, string | number | boolean | null | undefined>): Fields {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Fields
}

function invalid(message: string, fieldErrors: FieldErrors): void {
  if (Object.keys(fieldErrors).length > 0) throw new GatewayError("invalid", message, fieldErrors)
}

/**
 * Dataverse's refusals as GatewayErrors: a missing privilege is "forbidden"
 * (the record's Owner changed, or the user is neither Owner nor manager), a
 * missing record "notFound". Anything else passes through.
 */
export function toGatewayError(error: unknown): unknown {
  if (error instanceof GatewayError || !(error instanceof Error)) return error
  const message = error.message
  if (/0x80040220|SecLib::|privilege|does not have permission|not have.*access/i.test(message)) {
    return new GatewayError("forbidden", message)
  }
  if (/0x80040217|does not exist|not found/i.test(message)) {
    return new GatewayError("notFound", message)
  }
  return error
}

export function toAccount(row: AccountRow): Account {
  return {
    id: row.accountid,
    name: row.name ?? "",
    website: optional(row.websiteurl),
    phone: optional(row.telephone1),
    street: optional(row.address1_line1),
    city: optional(row.address1_city),
    postcode: optional(row.address1_postalcode),
    country: optional(row.address1_country),
    description: optional(row.description),
    ownerId: row._ownerid_value ?? "",
    ownerName: lookupName(row, "ownerid") ?? "",
    createdOn: row.createdon ?? "",
  }
}

export function toContact(row: ContactRow): Contact {
  // The company lookup can point at a contact too; only an account is an Account here.
  const company = row._parentcustomerid_value
  const isAccount = company && (lookupTable(row, "parentcustomerid") ?? "account") === "account"
  return {
    id: row.contactid,
    firstName: optional(row.firstname),
    lastName: row.lastname ?? "",
    jobTitle: optional(row.jobtitle),
    accountId: isAccount ? company : undefined,
    accountName: isAccount ? lookupName(row, "parentcustomerid") : undefined,
    email: optional(row.emailaddress1),
    phone: optional(row.telephone1),
    mobile: optional(row.mobilephone),
    ownerId: row._ownerid_value ?? "",
    ownerName: lookupName(row, "ownerid") ?? "",
    createdOn: row.createdon ?? "",
  }
}

export function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.vibe_opportunityid,
    name: row.vibe_name ?? "",
    accountId: row._vibe_accountid_value ?? "",
    accountName: lookupName(row, "vibe_accountid") ?? "",
    primaryContactId: optional(row._vibe_primarycontactid_value),
    primaryContactName: lookupName(row, "vibe_primarycontactid"),
    stage: fromChoice(STAGES, row.vibe_stage) ?? "qualification",
    probability: row.vibe_probability ?? 0,
    estimatedValue: row.vibe_estimatedvalue ?? 0,
    expectedCloseDate: (row.vibe_expectedclosedate ?? "").slice(0, 10),
    nextStep: optional(row.vibe_nextstep),
    description: optional(row.vibe_description),
    leadSource: fromChoice(LEAD_SOURCES, row.vibe_leadsource),
    originatingLeadId: optional(row._vibe_originatingleadid_value),
    actualValue: optional(row.vibe_actualvalue),
    closeDate: optional(row.vibe_closedate)?.slice(0, 10),
    lostReason: fromChoice(LOST_REASONS, row.vibe_lostreason),
    lostComment: optional(row.vibe_lostcomment),
    closedById: optional(row._vibe_closedby_value),
    ownerId: row._ownerid_value ?? "",
    ownerName: lookupName(row, "ownerid") ?? "",
    createdOn: row.createdon ?? "",
  }
}

/** How a list's sortable fields map to columns. */
const ACCOUNT_SORT: Partial<Record<keyof Account, string>> = {
  name: "name",
  website: "websiteurl",
  phone: "telephone1",
  street: "address1_line1",
  city: "address1_city",
  postcode: "address1_postalcode",
  country: "address1_country",
  ownerName: "_ownerid_value",
  createdOn: "createdon",
}

const CONTACT_SORT: Partial<Record<keyof Contact, string>> = {
  firstName: "firstname",
  lastName: "lastname",
  jobTitle: "jobtitle",
  accountName: "_parentcustomerid_value",
  email: "emailaddress1",
  phone: "telephone1",
  mobile: "mobilephone",
  ownerName: "_ownerid_value",
  createdOn: "createdon",
}

export function toUser(row: SystemUserRow): User {
  return {
    id: row.systemuserid,
    fullName: row.fullname ?? "",
    email: row.internalemailaddress ?? "",
    managerId: row._parentsystemuserid_value ?? null,
    // Role membership is read by listSalespeople (#34); users read elsewhere are not checked.
    isSalesperson: false,
  }
}

export class DataverseSalesGateway implements SalesGateway {
  private readonly client: DataverseClient
  private currentUser?: Promise<CurrentUser>
  /** Per list query, the skip token that fetches page n + 2 at index n: Dataverse pages forward only. */
  private readonly skipTokens = new Map<string, string[]>()

  constructor(client: DataverseClient) {
    this.client = client
  }

  // ---- People -------------------------------------------------------------

  /** Resolved once per session: the user doesn't change, and nor does their team in practice. */
  getCurrentUser(): Promise<CurrentUser> {
    this.currentUser ??= this.loadCurrentUser().catch((error: unknown) => {
      this.currentUser = undefined
      throw error
    })
    return this.currentUser
  }

  private async loadCurrentUser(): Promise<CurrentUser> {
    const userId = await this.client.whoAmI()
    const [user, reports] = await Promise.all([
      this.client.getSystemUser(userId),
      this.client.listSystemUsers(`_parentsystemuserid_value eq ${guid(userId)} and isdisabled eq false`),
    ])
    return {
      user: toUser(user),
      directReports: reports.map(toUser).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    }
  }

  listSalespeople = notYet("listSalespeople", "#34")

  // ---- Lists, search and Home ----------------------------------------------

  async listAccounts(query: ListQuery<Account>): Promise<Page<Account>> {
    const filter = await this.listFilter(query.view, query.search && `contains(name,${text(query.search.trim())})`)
    const orderBy = this.orderBy(query, ACCOUNT_SORT, "name", "accountid")
    const page = await this.page("accounts", this.client.accounts, filter, orderBy, query)
    return { items: page.rows.map(toAccount), totalCount: page.totalCount }
  }

  async listContacts(query: ListQuery<Contact>): Promise<Page<Contact>> {
    const search = query.search?.trim()
    const filter = await this.listFilter(
      query.view,
      search && `(contains(fullname,${text(search)}) or contains(emailaddress1,${text(search)}))`,
    )
    const orderBy = this.orderBy(query, CONTACT_SORT, "lastname", "contactid")
    const page = await this.page("contacts", this.client.contacts, filter, orderBy, query)
    return { items: page.rows.map(toContact), totalCount: page.totalCount }
  }

  /** Accounts and Contacts for now; Leads (#29) and Opportunities (#30) join in their tickets. */
  async search(searchText: string): Promise<SearchResults> {
    if (!searchText.trim()) return { leads: [], opportunities: [], accounts: [], contacts: [] }
    const query = { view: "all" as const, search: searchText, pageSize: SEARCH_LIMIT }
    const [accounts, contacts] = await Promise.all([this.listAccounts(query), this.listContacts(query)])
    return { leads: [], opportunities: [], accounts: accounts.items, contacts: contacts.items }
  }

  listLeads = notYet("listLeads", "#29")
  listOpportunities = notYet("listOpportunities", "#30")
  getHome = notYet("getHome", "#33")
  getPipeline = notYet("getPipeline", "#32")

  // ---- Record pages ---------------------------------------------------------

  async getAccount(id: Id): Promise<AccountDetails> {
    const key = guid(id)
    const [account, contacts, opportunities] = await Promise.all([
      this.call(() => this.client.accounts.get(key)),
      this.related(this.client.contacts, `_parentcustomerid_value eq ${key} and ${ACTIVE}`, ["lastname asc", "firstname asc"]),
      this.related(this.client.opportunities, `_vibe_accountid_value eq ${key}`, ["vibe_expectedclosedate desc"]),
    ])
    return {
      account: toAccount(account),
      contacts: contacts.map(toContact),
      opportunities: opportunities.map(toOpportunity),
      canEdit: await this.mayEdit(account._ownerid_value),
    }
  }

  async getContact(id: Id): Promise<ContactDetails> {
    const key = guid(id)
    const [row, opportunities] = await Promise.all([
      this.call(() => this.client.contacts.get(key)),
      this.related(this.client.opportunities, `_vibe_primarycontactid_value eq ${key}`, ["vibe_expectedclosedate desc"]),
    ])
    const contact = toContact(row)
    const account = contact.accountId ? await this.call(() => this.client.accounts.get(contact.accountId!)) : undefined
    return {
      contact,
      account: account && toAccount(account),
      opportunities: opportunities.map(toOpportunity),
      canEdit: await this.mayEdit(row._ownerid_value),
    }
  }

  getLead = notYet("getLead", "#29")
  getOpportunity = notYet("getOpportunity", "#30")

  // ---- Accounts and Contacts ------------------------------------------------
  // New records are owned by the caller: Dataverse sets the Owner to whoever creates them.

  async createAccount(input: AccountInput): Promise<Account> {
    invalid("The Account cannot be saved.", accountErrors(input))
    const created = await this.call(() => this.client.accounts.create(fields(accountFields(input))))
    return toAccount(await this.call(() => this.client.accounts.get(created.accountid)))
  }

  async updateAccount(id: Id, update: AccountUpdate): Promise<Account> {
    if (update.name !== undefined) invalid("The Account cannot be saved.", accountErrors({ name: update.name }))
    const key = guid(id)
    await this.call(() => this.client.accounts.update(key, fields(accountFields(update))))
    return toAccount(await this.call(() => this.client.accounts.get(key)))
  }

  async createContact(input: ContactInput): Promise<Contact> {
    invalid("The Contact cannot be saved.", contactErrors(input))
    const created = await this.call(() => this.client.contacts.create(fields(contactFields(input))))
    return toContact(await this.call(() => this.client.contacts.get(created.contactid)))
  }

  async updateContact(id: Id, update: ContactUpdate): Promise<Contact> {
    if (update.lastName !== undefined) {
      invalid("The Contact cannot be saved.", contactErrors({ lastName: update.lastName }))
    }
    const key = guid(id)
    await this.call(() => this.client.contacts.update(key, fields(contactFields(update))))
    return toContact(await this.call(() => this.client.contacts.get(key)))
  }


  // ---- Leads ----------------------------------------------------------------

  createLead = notYet("createLead", "#29")
  updateLead = notYet("updateLead", "#29")
  setLeadStatus = notYet("setLeadStatus", "#29")
  disqualifyLead = notYet("disqualifyLead", "#29")
  reopenLead = notYet("reopenLead", "#29")
  getQualifySuggestions = notYet("getQualifySuggestions", "#31")
  qualifyLead = notYet("qualifyLead", "#31")

  // ---- Opportunities --------------------------------------------------------

  createOpportunity = notYet("createOpportunity", "#30")
  updateOpportunity = notYet("updateOpportunity", "#30")
  changeStage = notYet("changeStage", "#30")
  closeOpportunity = notYet("closeOpportunity", "#30")
  reopenOpportunity = notYet("reopenOpportunity", "#30")

  // ---- Ownership and activities ---------------------------------------------

  reassign = notYet("reassign", "#34")
  listActivities = notYet("listActivities", "#33")
  addNote = notYet("addNote", "#33")
  addTask = notYet("addTask", "#33")
  addPhoneCall = notYet("addPhoneCall", "#33")
  completeTask = notYet("completeTask", "#33")

  // ---- Helpers ---------------------------------------------------------------

  /** Runs a Dataverse call, turning its refusals into GatewayErrors. */
  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  /** Owner, or the Owner's manager: the same rule the role and hierarchy security enforce. */
  private async mayEdit(ownerId: Id | null | undefined): Promise<boolean> {
    if (!ownerId) return false
    const { user, directReports } = await this.getCurrentUser()
    return canEdit(user.id, ownerId, [user, ...directReports])
  }

  /** Active records in the view, matching the search. */
  private async listFilter(view: ListView, search: string | undefined): Promise<string> {
    const parts = [ACTIVE]
    if (view !== "all") {
      const { user, directReports } = await this.getCurrentUser()
      const owners = view === "my" ? [user.id] : teamMemberIds(user.id, [user, ...directReports])
      parts.push(`(${owners.map((o) => `_ownerid_value eq ${guid(o)}`).join(" or ")})`)
    }
    if (search) parts.push(search)
    return parts.join(" and ")
  }

  /** The sort column, then a unique one so paging is stable. */
  private orderBy<T>(query: ListQuery<T>, columns: Partial<Record<keyof T, string>>, fallback: string, key: string) {
    const sort = query.sort
    const column = (sort && columns[sort.field as keyof T]) || fallback
    const direction = sort && columns[sort.field as keyof T] ? sort.direction : "asc"
    return [`${column} ${direction}`, `${key} asc`]
  }

  /**
   * One page of a list. Dataverse pages forward with skip tokens, so the
   * tokens are kept per query; jumping ahead walks the pages in between.
   */
  private async page<T>(
    table: string,
    client: TableClient<T>,
    filter: string,
    orderBy: string[],
    query: { page?: number; pageSize?: number },
  ): Promise<{ rows: T[]; totalCount: number }> {
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE
    const wanted = Math.max(1, query.page ?? 1)
    const cacheKey = JSON.stringify([table, filter, orderBy, pageSize])
    const tokens = this.skipTokens.get(cacheKey) ?? []
    this.skipTokens.set(cacheKey, tokens)

    let current = Math.min(wanted, tokens.length + 1)
    const options = (skipToken?: string): ListOptions => ({ filter, orderBy, pageSize, skipToken })
    let result: RowPage<T> = await this.call(() => client.list(options(current > 1 ? tokens[current - 2] : undefined)))
    if (result.skipToken) tokens[current - 1] = result.skipToken
    const count = result.count
    while (current < wanted && result.skipToken) {
      const token: string = result.skipToken
      result = await this.call(() => client.list(options(token)))
      current += 1
      if (result.skipToken) tokens[current - 1] = result.skipToken
    }
    const seen = (current - 1) * pageSize + result.rows.length + (result.skipToken ? 1 : 0)
    if (current < wanted) return { rows: [], totalCount: count ?? seen }
    return { rows: result.rows, totalCount: count ?? seen }
  }

  /** Every row of a related list, up to RELATED_LIMIT. */
  private async related<T>(client: TableClient<T>, filter: string, orderBy: string[]): Promise<T[]> {
    const rows: T[] = []
    let skipToken: string | undefined
    do {
      const result = await this.call(() => client.list({ filter, orderBy, pageSize: 100, skipToken }))
      rows.push(...result.rows)
      skipToken = result.skipToken
    } while (skipToken && rows.length < RELATED_LIMIT)
    return rows
  }
}

function accountFields(input: Partial<AccountInput>) {
  return {
    name: column(input.name),
    websiteurl: column(input.website),
    telephone1: column(input.phone),
    address1_line1: column(input.street),
    address1_city: column(input.city),
    address1_postalcode: column(input.postcode),
    address1_country: column(input.country),
    description: column(input.description),
  }
}

function contactFields(input: Partial<ContactInput>) {
  const accountId = column(input.accountId)
  return {
    firstname: column(input.firstName),
    lastname: column(input.lastName),
    jobtitle: column(input.jobTitle),
    emailaddress1: column(input.email),
    telephone1: column(input.phone),
    mobilephone: column(input.mobile),
    // The company lookup is polymorphic: bind it to the account navigation property. Null clears it.
    [CONTACT_ACCOUNT_BIND]: accountId === undefined ? undefined : accountId && `/accounts(${guid(accountId)})`,
  }
}
