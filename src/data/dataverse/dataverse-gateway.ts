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
  type DisqualifyInput,
  type LeadDetails,
  type LeadListQuery,
  type LeadUpdate,
  type ListQuery,
  type OpportunityDetails,
  type OpportunityListQuery,
  type OpportunityUpdate,
  type Page,
  type SalesGateway,
  type SearchResults,
} from "@/data/gateway"
import {
  DISQUALIFY_REASONS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LOST_REASONS,
  STAGES,
  OPEN_STAGES,
  SalesRuleError,
  STAGE_DEFAULT_PROBABILITY,
  accountErrors,
  canEdit,
  changeStage,
  closeOpportunity,
  contactErrors,
  disqualifyErrors,
  fullName,
  isLeadReadOnly,
  leadErrors,
  leadStatusAfter,
  manualLeadAction,
  isOpportunityReadOnly,
  opportunityErrors,
  reopenOpportunity,
  teamMemberIds,
  toDateOnly,
  type Account,
  type AccountInput,
  type CloseChange,
  type CloseInput,
  type Contact,
  type ContactInput,
  type FieldErrors,
  type Id,
  type Lead,
  type LeadAction,
  type LeadInput,
  type ListView,
  type OpenStage,
  type Opportunity,
  type OpportunityInput,
  type User,
} from "@/sales"
import {
  CONTACT_ACCOUNT_NAVIGATION,
  LEAD_DISQUALIFIED_BY_NAVIGATION,
  OPPORTUNITY_NAVIGATION,
  type AccountRow,
  type ContactRow,
  type LeadRow,
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

function toChoice<T extends string>(options: readonly T[], value: T): number {
  return CHOICE_BASE + options.indexOf(value)
}

/** statecode and statuscode of a record that is read-only (deactivated) or open again. */
const DEACTIVATED = { statecode: 1, statuscode: 2 }
const ACTIVATED = { statecode: 0, statuscode: 1 }

/** A choice column's write: blank or unknown clears it, undefined leaves it alone. */
function choiceColumn<T extends string>(options: readonly T[], value: T | "" | null | undefined): number | null | undefined {
  if (value === undefined) return undefined
  const index = value === null ? -1 : options.indexOf(value as T)
  return index < 0 ? null : CHOICE_BASE + index
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

/** Runs a sales rule, turning its refusal into a GatewayError like the in-memory gateway does. */
function rule<T>(apply: () => T): T {
  try {
    return apply()
  } catch (error) {
    if (error instanceof SalesRuleError) throw new GatewayError("invalid", error.message, error.fieldErrors)
    throw error
  }
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
    closedByName: lookupName(row, "vibe_closedby"),
    ownerId: row._ownerid_value ?? "",
    ownerName: lookupName(row, "ownerid") ?? "",
    createdOn: row.createdon ?? "",
  }
}

export function toLead(row: LeadRow): Lead {
  return {
    id: row.vibe_leadid,
    firstName: optional(row.vibe_firstname),
    lastName: row.vibe_lastname ?? "",
    company: row.vibe_company ?? "",
    jobTitle: optional(row.vibe_jobtitle),
    email: optional(row.vibe_email),
    phone: optional(row.vibe_phone),
    website: optional(row.vibe_website),
    leadSource: fromChoice(LEAD_SOURCES, row.vibe_leadsource),
    description: optional(row.vibe_description),
    status: fromChoice(LEAD_STATUSES, row.vibe_leadstatus) ?? "notContacted",
    disqualifyReason: fromChoice(DISQUALIFY_REASONS, row.vibe_disqualifyreason),
    disqualifyComment: optional(row.vibe_disqualifycomment),
    disqualifiedOn: optional(row.vibe_disqualifiedon),
    disqualifiedById: optional(row._vibe_disqualifiedby_value),
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

const LEAD_SORT: Partial<Record<keyof Lead, string>> = {
  firstName: "vibe_firstname",
  lastName: "vibe_lastname",
  company: "vibe_company",
  jobTitle: "vibe_jobtitle",
  email: "vibe_email",
  phone: "vibe_phone",
  leadSource: "vibe_leadsource",
  status: "vibe_leadstatus",
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

const OPPORTUNITY_SORT: Partial<Record<keyof Opportunity, string>> = {
  name: "vibe_name",
  accountName: "_vibe_accountid_value",
  stage: "vibe_stage",
  probability: "vibe_probability",
  estimatedValue: "vibe_estimatedvalue",
  expectedCloseDate: "vibe_expectedclosedate",
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

  /**
   * Every Lead status is listed: Qualified and Disqualified Leads are
   * deactivated in Dataverse but still Leads to look up, so this list doesn't
   * filter on statecode.
   */
  async listLeads(query: LeadListQuery): Promise<Page<Lead>> {
    const search = query.search?.trim()
    const conditions = [
      query.status && `vibe_leadstatus eq ${toChoice(LEAD_STATUSES, query.status)}`,
      search && `(contains(vibe_name,${text(search)}) or contains(vibe_email,${text(search)}))`,
    ].filter(Boolean)
    const filter = await this.listFilter(query.view, conditions.join(" and ") || undefined, { activeOnly: false })
    const orderBy = this.orderBy(query, LEAD_SORT, "vibe_lastname", "vibe_leadid")
    const page = await this.page("leads", this.client.leads, filter, orderBy, query)
    return { items: page.rows.map(toLead), totalCount: page.totalCount }
  }

  /** Leads, Opportunities, Accounts and Contacts by name (and email for Leads and Contacts). */
  async search(searchText: string): Promise<SearchResults> {
    if (!searchText.trim()) return { leads: [], opportunities: [], accounts: [], contacts: [] }
    const query = { view: "all" as const, search: searchText, pageSize: SEARCH_LIMIT }
    const [leads, opportunities, accounts, contacts] = await Promise.all([
      this.listLeads(query),
      this.listOpportunities(query),
      this.listAccounts(query),
      this.listContacts(query),
    ])
    return { leads: leads.items, opportunities: opportunities.items, accounts: accounts.items, contacts: contacts.items }
  }


  /** Closed Opportunities are deactivated but still listed: the Stage filter picks them. */
  async listOpportunities(query: OpportunityListQuery): Promise<Page<Opportunity>> {
    const parts: string[] = []
    if (query.stage === "open") parts.push(`(${OPEN_STAGES.map((s) => `vibe_stage eq ${toChoice(STAGES, s)}`).join(" or ")})`)
    else if (query.stage) parts.push(`vibe_stage eq ${toChoice(STAGES, query.stage)}`)
    if (query.search?.trim()) parts.push(`contains(vibe_name,${text(query.search.trim())})`)
    const filter = await this.listFilter(query.view, parts.join(" and ") || undefined, { activeOnly: false })
    const orderBy = this.orderBy(query, OPPORTUNITY_SORT, "vibe_expectedclosedate", "vibe_opportunityid")
    const page = await this.page("opportunities", this.client.opportunities, filter, orderBy, query)
    return { items: page.rows.map(toOpportunity), totalCount: page.totalCount }
  }

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

  async getLead(id: Id): Promise<LeadDetails> {
    const key = guid(id)
    const [row, opportunities] = await Promise.all([
      this.call(() => this.client.leads.get(key)),
      this.related(this.client.opportunities, `_vibe_originatingleadid_value eq ${key}`, ["createdon asc"]),
    ])
    const opportunity = opportunities[0]
    return {
      lead: toLead(row),
      opportunity: opportunity && toOpportunity(opportunity),
      canEdit: await this.mayEdit(row._ownerid_value),
    }
  }

  async getOpportunity(id: Id): Promise<OpportunityDetails> {
    const row = await this.call(() => this.client.opportunities.get(guid(id)))
    const opportunity = toOpportunity(row)
    const [account, contact, lead, canEdit] = await Promise.all([
      this.call(() => this.client.accounts.get(opportunity.accountId)),
      opportunity.primaryContactId ? this.call(() => this.client.contacts.get(opportunity.primaryContactId!)) : undefined,
      opportunity.originatingLeadId ? this.call(() => this.client.leads.get(opportunity.originatingLeadId!)) : undefined,
      this.mayEdit(row._ownerid_value),
    ])
    return {
      opportunity,
      account: toAccount(account),
      primaryContact: contact && toContact(contact),
      originatingLead: lead && toLead(lead),
      canEdit,
    }
  }

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

  // A Lead's primary name (vibe_name) is its full name, written by the app.

  async createLead(input: LeadInput): Promise<Lead> {
    invalid("The Lead cannot be saved.", leadErrors(input))
    const created = await this.call(() =>
      this.client.leads.create(
        fields({
          ...leadFields(input),
          vibe_name: fullName(input),
          vibe_leadstatus: toChoice(LEAD_STATUSES, "notContacted"),
        }),
      ),
    )
    return this.readLead(created.vibe_leadid)
  }

  async updateLead(id: Id, update: LeadUpdate): Promise<Lead> {
    const current = await this.readLead(id)
    if (isLeadReadOnly(current)) throw new GatewayError("invalid", `A ${current.status} Lead is read-only.`)
    // A blank Lead source clears it, like a blank text field.
    const next = { ...current, ...update, leadSource: (update.leadSource ?? current.leadSource) || undefined }
    invalid("The Lead cannot be saved.", leadErrors(next))
    const name = update.firstName !== undefined || update.lastName !== undefined ? fullName(next) : undefined
    await this.call(() => this.client.leads.update(current.id, fields({ ...leadFields(update), vibe_name: name })))
    return this.readLead(current.id)
  }

  async setLeadStatus(id: Id, status: "notContacted" | "working"): Promise<Lead> {
    const action = manualLeadAction(status)
    if (!action) throw new GatewayError("invalid", `A Lead cannot be set to ${status} by hand.`)
    const current = await this.readLead(id)
    const next = leadRule(current, action)
    await this.call(() => this.client.leads.update(current.id, { vibe_leadstatus: toChoice(LEAD_STATUSES, next) }))
    return this.readLead(current.id)
  }

  /** Records the reason, when and by whom, and deactivates the Lead: Disqualified Leads are read-only. */
  async disqualifyLead(id: Id, input: DisqualifyInput): Promise<Lead> {
    const current = await this.readLead(id)
    const next = leadRule(current, "disqualify")
    invalid("The Lead cannot be disqualified.", disqualifyErrors(input))
    const { user } = await this.getCurrentUser()
    await this.call(() =>
      this.client.leads.update(current.id, {
        vibe_leadstatus: toChoice(LEAD_STATUSES, next),
        vibe_disqualifyreason: toChoice(DISQUALIFY_REASONS, input.reason!),
        vibe_disqualifycomment: input.comment?.trim() || null,
        vibe_disqualifiedon: new Date().toISOString(),
        [`${LEAD_DISQUALIFIED_BY_NAVIGATION}@odata.bind`]: `/systemusers(${guid(user.id)})`,
        ...DEACTIVATED,
      }),
    )
    return this.readLead(current.id)
  }

  /** Disqualified -> Working: clears the disqualification and activates the Lead again. */
  async reopenLead(id: Id): Promise<Lead> {
    const current = await this.readLead(id)
    const next = leadRule(current, "reopen")
    await this.call(() =>
      this.client.leads.update(current.id, {
        vibe_leadstatus: toChoice(LEAD_STATUSES, next),
        vibe_disqualifyreason: null,
        vibe_disqualifycomment: null,
        vibe_disqualifiedon: null,
        [LEAD_DISQUALIFIED_BY_NAVIGATION]: null,
        ...ACTIVATED,
      }),
    )
    return this.readLead(current.id)
  }

  getQualifySuggestions = notYet("getQualifySuggestions", "#31")
  qualifyLead = notYet("qualifyLead", "#31")

  // ---- Opportunities --------------------------------------------------------


  async createOpportunity(input: OpportunityInput): Promise<Opportunity> {
    invalid("The Opportunity cannot be saved.", opportunityErrors(input))
    const created = await this.call(() =>
      this.client.opportunities.create(
        fields({
          ...opportunityFields(input),
          vibe_stage: toChoice(STAGES, input.stage),
          vibe_probability: input.probability ?? STAGE_DEFAULT_PROBABILITY[input.stage],
        }),
      ),
    )
    return this.readOpportunity(created.vibe_opportunityid)
  }

  async updateOpportunity(id: Id, update: OpportunityUpdate): Promise<Opportunity> {
    const current = toOpportunity(await this.call(() => this.client.opportunities.get(guid(id))))
    if (isOpportunityReadOnly(current)) throw new GatewayError("invalid", "A closed Opportunity is read-only.")
    const next = { ...current, ...Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined)) }
    invalid("The Opportunity cannot be saved.", opportunityErrors({ ...next, stage: current.stage } as OpportunityInput))
    await this.call(() => this.client.opportunities.update(guid(id), fields(opportunityFields(update))))
    return this.readOpportunity(id)
  }

  async changeStage(id: Id, stage: OpenStage): Promise<Opportunity> {
    const current = toOpportunity(await this.call(() => this.client.opportunities.get(guid(id))))
    const change = rule(() => changeStage(current, stage))
    await this.call(() =>
      this.client.opportunities.update(guid(id), {
        vibe_stage: toChoice(STAGES, change.stage),
        vibe_probability: change.probability,
      }),
    )
    return this.readOpportunity(id)
  }

  /** Closing records who closed it and deactivates the record, as server-side backing for read-only. */
  async closeOpportunity(id: Id, input: CloseInput): Promise<Opportunity> {
    const current = toOpportunity(await this.call(() => this.client.opportunities.get(guid(id))))
    const { user } = await this.getCurrentUser()
    const change = rule(() => closeOpportunity(current, input, { today: toDateOnly(new Date()), userId: user.id }))
    await this.call(() => this.client.opportunities.update(guid(id), { ...closeFields(change), ...DEACTIVATED }))
    return this.readOpportunity(id)
  }

  async reopenOpportunity(id: Id, stage: OpenStage): Promise<Opportunity> {
    const current = toOpportunity(await this.call(() => this.client.opportunities.get(guid(id))))
    const change = rule(() => reopenOpportunity(current, stage))
    await this.call(() => this.client.opportunities.update(guid(id), { ...closeFields(change), ...ACTIVATED }))
    return this.readOpportunity(id)
  }

  private async readOpportunity(id: Id): Promise<Opportunity> {
    return toOpportunity(await this.call(() => this.client.opportunities.get(guid(id))))
  }

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

  private async readLead(id: Id): Promise<Lead> {
    return toLead(await this.call(() => this.client.leads.get(guid(id))))
  }

  /** Owner, or the Owner's manager: the same rule the role and hierarchy security enforce. */
  private async mayEdit(ownerId: Id | null | undefined): Promise<boolean> {
    if (!ownerId) return false
    const { user, directReports } = await this.getCurrentUser()
    return canEdit(user.id, ownerId, [user, ...directReports])
  }

  /** Records in the view (active ones only, unless told otherwise), matching the search. */
  private async listFilter(view: ListView, search: string | undefined, { activeOnly = true } = {}): Promise<string | undefined> {
    const parts = activeOnly ? [ACTIVE] : []
    if (view !== "all") {
      const { user, directReports } = await this.getCurrentUser()
      const owners = view === "my" ? [user.id] : teamMemberIds(user.id, [user, ...directReports])
      parts.push(`(${owners.map((o) => `_ownerid_value eq ${guid(o)}`).join(" or ")})`)
    }
    if (search) parts.push(search)
    return parts.join(" and ") || undefined
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
    filter: string | undefined,
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

/** The Lead status after an action, or an "invalid" GatewayError when the sales rules refuse it. */
function leadRule(lead: Lead, action: LeadAction) {
  try {
    return leadStatusAfter(lead.status, action)
  } catch (error) {
    if (error instanceof SalesRuleError) throw new GatewayError("invalid", error.message)
    throw error
  }
}

function leadFields(input: Partial<LeadInput>) {
  return {
    vibe_firstname: column(input.firstName),
    vibe_lastname: column(input.lastName),
    vibe_company: column(input.company),
    vibe_jobtitle: column(input.jobTitle),
    vibe_email: column(input.email),
    vibe_phone: column(input.phone),
    vibe_website: column(input.website),
    vibe_description: column(input.description),
    vibe_leadsource:
      input.leadSource === undefined ? undefined : input.leadSource ? toChoice(LEAD_SOURCES, input.leadSource) : null,
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
    // The company lookup is polymorphic: bind it through the account navigation property,
    // and clear it by setting that navigation property to null.
    ...(accountId
      ? { [`${CONTACT_ACCOUNT_NAVIGATION}@odata.bind`]: `/accounts(${guid(accountId)})` }
      : accountId === null
        ? { [CONTACT_ACCOUNT_NAVIGATION]: null }
        : {}),
  }
}

/** A lookup's write: bind to a record, null to clear, or left out. */
function bind(navigation: string, set: string, id: Id | null | undefined): Record<string, string | null> {
  if (id === undefined) return {}
  return id === null ? { [navigation]: null } : { [`${navigation}@odata.bind`]: `/${set}(${guid(id)})` }
}

function opportunityFields(input: OpportunityUpdate) {
  return {
    vibe_name: column(input.name),
    vibe_probability: input.probability,
    vibe_estimatedvalue: input.estimatedValue,
    vibe_expectedclosedate: column(input.expectedCloseDate),
    vibe_nextstep: column(input.nextStep),
    vibe_description: column(input.description),
    vibe_leadsource: choiceColumn(LEAD_SOURCES, input.leadSource),
    ...bind(OPPORTUNITY_NAVIGATION.account, "accounts", column(input.accountId)),
    ...bind(OPPORTUNITY_NAVIGATION.primaryContact, "contacts", column(input.primaryContactId)),
  }
}

/** What Close and reopen write: undefined values in the change are cleared. */
function closeFields(change: CloseChange): Fields {
  return {
    vibe_stage: toChoice(STAGES, change.stage),
    vibe_probability: change.probability,
    vibe_actualvalue: change.actualValue ?? null,
    vibe_closedate: change.closeDate ?? null,
    vibe_lostreason: choiceColumn(LOST_REASONS, change.lostReason) ?? null,
    vibe_lostcomment: change.lostComment ?? null,
    ...bind(OPPORTUNITY_NAVIGATION.closedBy, "systemusers", change.closedById ?? null),
  }
}
