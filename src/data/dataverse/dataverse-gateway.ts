// The sales data gateway over Dataverse (spec #23).

import {
  GatewayError,
  type AccountDetails,
  type AccountUpdate,
  type ContactDetails,
  type ContactUpdate,
  type CurrentUser,
  type DisqualifyInput,
  type HomeData,
  type LeadDetails,
  type LeadListQuery,
  type LeadUpdate,
  type ListQuery,
  type OpportunityDetails,
  type OpportunityListQuery,
  type OpportunityUpdate,
  type NoteInput,
  type Page,
  type PhoneCallInput,
  type ProductListQuery,
  type ProductUpdate,
  QualifyError,
  type QualifyInput,
  type QualifyResult,
  type QualifyStep,
  type QualifySuggestions,
  type QuotaQuery,
  type SalesGateway,
  type SearchResults,
  type TaskInput,
} from "@/data/gateway"
import {
  DISQUALIFY_REASONS,
  FORECAST_CATEGORIES,
  ACCOUNT_TYPES,
  INDUSTRIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LOST_REASONS,
  STAGES,
  OPEN_STAGES,
  PRODUCT_UNITS,
  VAT_RATES,
  productErrors,
  SalesRuleError,
  STAGE_DEFAULT_PROBABILITY,
  accountErrors,
  canEdit,
  changeStage,
  closeDateRange,
  isOpenStage,
  matchesPipelineFilter,
  closeOpportunity,
  contactErrors,
  defaultForecastCategory,
  defaultOpportunityName,
  effectiveForecastCategory,
  overrideForecastCategory,
  quotaErrors,
  quotaMonths,
  requireCanSetQuota,
  disqualifyErrors,
  fullName,
  isLeadReadOnly,
  leadErrors,
  leadStatusAfter,
  manualLeadAction,
  noteErrors,
  orderTimeline,
  phoneCallErrors,
  sortOpenTasks,
  taskErrors,
  isOpportunityReadOnly,
  newAccountFromLead,
  newContactFromLead,
  newOpportunityFromLead,
  opportunityErrors,
  reopenOpportunity,
  suggestAccounts,
  suggestContacts,
  teamMemberIds,
  toDateOnly,
  type Account,
  type AccountType,
  type AccountInput,
  type Industry,
  type Activity,
  type CloseChange,
  type CloseInput,
  type Contact,
  type DateOnly,
  type ContactInput,
  type FieldErrors,
  type ForecastCategory,
  type Quota,
  type Id,
  type Lead,
  type LeadAction,
  type LeadInput,
  type ListView,
  type Note,
  type OpenStage,
  type Opportunity,
  type OpportunityInput,
  type PhoneCall,
  type Product,
  type ProductInput,
  type RecordRef,
  type RecordType,
  type Task,
  type Timestamp,
  type PipelineFilter,
  type PipelineOwnerFilter,
  type Stage,
  type User,
} from "@/sales"
import {
  CONTACT_ACCOUNT_NAVIGATION,
  QUOTA_SALESPERSON_NAVIGATION,
  LEAD_DISQUALIFIED_BY_NAVIGATION,
  OPPORTUNITY_NAVIGATION,
  RECORD_TABLES,
  regardingNavigation,
  type AccountRow,
  type ActivityRow,
  type ContactRow,
  type LeadRow,
  type DataverseClient,
  type Fields,
  type ListOptions,
  type NoteRow,
  type OpportunityRow,
  type PhoneCallRow,
  type ProductRow,
  type QuotaRow,
  type RowPage,
  type SystemUserRow,
  type TableClient,
} from "./client"

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
/** Qualify suggestions per query: enough to spot a duplicate, not a list to browse. */
const SUGGESTION_LIMIT = 25
/** Related lists stop here; more than this on one record is not a v1 case. */
const RELATED_LIMIT = 500
/** The Pipeline page loads at most this many Opportunities; a v1 team stays well below it. */
const PIPELINE_LIMIT = 2000
const ACTIVE = "statecode eq 0"

/** The security role whose holders a record can be Reassigned to. */
export const SALESPERSON_ROLE = "SalesApp Salesperson"
/** The security role that creates, edits and retires Products. */
export const CATALOGUE_MANAGER_ROLE = "SalesApp Catalogue Manager"

const PIPELINE_VIEW: Record<PipelineOwnerFilter, ListView> = { mine: "my", myTeam: "myTeam", everyone: "all" }

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

function uniqueBy<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => !seen.has(key(row)) && seen.add(key(row)))
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

/** Account type is Dataverse's standard Relationship type column, so its codes are the standard ones. */
const ACCOUNT_TYPE_CODES: Record<AccountType, number> = {
  prospect: 8,
  customer: 3,
  partner: 5,
  reseller: 9,
  supplier: 10,
  competitor: 1,
  other: 12,
}

function accountTypeOf(code: number | null | undefined): AccountType | undefined {
  return ACCOUNT_TYPES.find((t) => ACCOUNT_TYPE_CODES[t] === code)
}

function accountTypeColumn(value: AccountType | "" | undefined): number | null | undefined {
  if (value === undefined) return undefined
  return value === "" ? null : (ACCOUNT_TYPE_CODES[value] ?? null)
}

/** Industry is Dataverse's standard Industry column; its code is the position in the standard list + 1. */
function industryOf(code: number | null | undefined): Industry | undefined {
  return code === null || code === undefined ? undefined : INDUSTRIES[code - 1]
}

function industryColumn(value: Industry | "" | undefined): number | null | undefined {
  if (value === undefined) return undefined
  const index = value === "" ? -1 : INDUSTRIES.indexOf(value)
  return index < 0 ? null : index + 1
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
    accountType: accountTypeOf(row.customertypecode),
    industry: industryOf(row.industrycode),
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

/** Open Opportunities always have a Forecast category: the stored one, else the Stage's default. */
function forecastCategoryOf(row: OpportunityRow): ForecastCategory | undefined {
  const stage = fromChoice(STAGES, row.vibe_stage) ?? "qualification"
  return effectiveForecastCategory({ stage, forecastCategory: fromChoice(FORECAST_CATEGORIES, row.vibe_forecastcategory) })
}

export function toQuota(row: QuotaRow): Quota {
  return {
    id: row.vibe_quotaid,
    salespersonId: row._vibe_salespersonid_value ?? "",
    salespersonName: lookupName(row, "vibe_salespersonid") ?? "",
    month: (row.vibe_month ?? "").slice(0, 10),
    amount: row.vibe_amount ?? 0,
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
    forecastCategory: forecastCategoryOf(row),
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
  accountType: "customertypecode",
  industry: "industrycode",
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

const PRODUCT_SORT: Partial<Record<keyof Product, string>> = {
  name: "vibe_name",
  code: "vibe_productcode",
  unit: "vibe_unit",
  listPrice: "vibe_listprice",
  vatRate: "vibe_vatrate",
  createdOn: "createdon",
}

/** The Unit and VAT rate choices hold the publisher's option prefix plus the option's position. */
export function toProduct(row: ProductRow): Product {
  const vat = row.vibe_vatrate === null || row.vibe_vatrate === undefined ? undefined : VAT_RATES[row.vibe_vatrate - CHOICE_BASE]
  return {
    id: row.vibe_productid,
    name: row.vibe_name ?? "",
    code: row.vibe_productcode ?? "",
    description: optional(row.vibe_description),
    unit: fromChoice(PRODUCT_UNITS, row.vibe_unit) ?? "piece",
    listPrice: row.vibe_listprice ?? 0,
    vatRate: vat ?? 21,
    retired: row.statecode === 1,
    createdOn: row.createdon ?? "",
  }
}

function productFields(input: Partial<ProductInput>) {
  return {
    vibe_name: input.name?.trim(),
    vibe_productcode: input.code?.trim(),
    vibe_description: column(input.description),
    vibe_unit: input.unit === undefined ? undefined : toChoice(PRODUCT_UNITS, input.unit),
    vibe_listprice: input.listPrice,
    vibe_vatrate: input.vatRate === undefined ? undefined : CHOICE_BASE + VAT_RATES.indexOf(input.vatRate),
  }
}

/** Dataverse refuses a second Product with the same code through the alternate key. */
function duplicateCode(error: unknown): unknown {
  if (error instanceof Error && /0x80060892|already exists|duplicate/i.test(error.message)) {
    return new GatewayError("invalid", "The Product cannot be saved.", { code: "This Product code is already used." })
  }
  return error
}

export function toUser(row: SystemUserRow): User {
  return {
    id: row.systemuserid,
    fullName: row.fullname ?? "",
    email: row.internalemailaddress ?? "",
    managerId: row._parentsystemuserid_value ?? null,
    // Role membership is read only by listSalespeople and for the current user; users read elsewhere are not checked.
    isSalesperson: false,
    isCatalogueManager: false,
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
    const [user, reports, catalogueManager] = await Promise.all([
      this.client.getSystemUser(userId),
      this.client.listSystemUsers(`_parentsystemuserid_value eq ${guid(userId)} and isdisabled eq false`),
      this.client.listSystemUsers(
        `systemuserid eq ${guid(userId)} and systemuserroles_association/any(r:r/name eq ${text(CATALOGUE_MANAGER_ROLE)})`,
      ),
    ])
    return {
      user: { ...toUser(user), isCatalogueManager: catalogueManager.length > 0 },
      directReports: reports.map(toUser).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    }
  }

  /**
   * Enabled users holding the SalesApp Salesperson role directly (the app
   * doesn't assign roles through teams), through the user-role relationship.
   */
  async listSalespeople(): Promise<User[]> {
    const rows = await this.call(() =>
      this.client.listSystemUsers(
        `isdisabled eq false and systemuserroles_association/any(r:r/name eq ${text(SALESPERSON_ROLE)})`,
      ),
    )
    return uniqueBy(rows, (r) => r.systemuserid)
      .map((r) => ({ ...toUser(r), isSalesperson: true }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  }

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

  /** My open Tasks (overdue first), my open Opportunities closing this month, my Leads still Not Contacted. */
  async getHome(): Promise<HomeData> {
    const { user } = await this.getCurrentUser()
    const mine = `_ownerid_value eq ${guid(user.id)}`
    const today = new Date()
    const monthStart = toDateOnly(new Date(today.getFullYear(), today.getMonth(), 1))
    const monthEnd = toDateOnly(new Date(today.getFullYear(), today.getMonth() + 1, 0))
    const openStages = OPEN_STAGES.map((s) => `vibe_stage eq ${toChoice(STAGES, s)}`).join(" or ")
    const [tasks, opportunities, leads] = await Promise.all([
      this.related(this.client.tasks, `${mine} and ${ACTIVE}`, ["scheduledend asc"]),
      this.related(
        this.client.opportunities,
        `${mine} and (${openStages}) and vibe_expectedclosedate ge ${monthStart} and vibe_expectedclosedate le ${monthEnd}`,
        ["vibe_expectedclosedate asc"],
      ),
      this.related(
        this.client.leads,
        `${mine} and vibe_leadstatus eq ${toChoice(LEAD_STATUSES, "notContacted")}`,
        ["createdon desc"],
      ),
    ])
    return {
      openTasks: sortOpenTasks(tasks.map((row) => toTask(row)).filter((t): t is Task => t !== undefined)),
      opportunitiesClosingThisMonth: opportunities.map(toOpportunity),
      leadsNotContacted: leads.map(toLead),
    }
  }

  /**
   * The Opportunities on the Pipeline page. Dataverse narrows by Owner, Stage
   * and close date; the sales rules then decide, so both gateways agree.
   */
  async getPipeline(filter: PipelineFilter): Promise<Opportunity[]> {
    const today = toDateOnly(new Date())
    const stageIn = (stages: readonly Stage[]) => `(${stages.map((s) => `vibe_stage eq ${toChoice(STAGES, s)}`).join(" or ")})`
    const closedStages = STAGES.filter((s) => !isOpenStage(s))
    const parts: string[] = []
    if (!filter.showClosed) parts.push(stageIn(OPEN_STAGES))
    const range = closeDateRange(filter.closeDate, today)
    if (range) {
      const within = (column: string) => `${column} ge ${range.from} and ${column} le ${range.to}`
      const open = `${stageIn(OPEN_STAGES)} and ${within("vibe_expectedclosedate")}`
      parts.push(filter.showClosed ? `((${open}) or (${stageIn(closedStages)} and ${within("vibe_closedate")}))` : within("vibe_expectedclosedate"))
    }
    const view = PIPELINE_VIEW[filter.owner]
    const where = await this.listFilter(view, parts.join(" and ") || undefined, { activeOnly: false })
    const rows = await this.all(this.client.opportunities, where, ["vibe_expectedclosedate asc", "vibe_opportunityid asc"])
    const { user, directReports } = await this.getCurrentUser()
    const context = { userId: user.id, users: [user, ...directReports], today }
    return rows.map(toOpportunity).filter((o) => matchesPipelineFilter(o, filter, context))
  }

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

  // ---- Products -----------------------------------------------------------------
  // Organisation-owned: Dataverse lets everyone read and only the Catalogue Manager role write.

  async listProducts(query: ProductListQuery): Promise<Page<Product>> {
    const search = query.search?.trim()
    const filter = [
      query.status && `statecode eq ${query.status === "retired" ? 1 : 0}`,
      search && `(contains(vibe_name,${text(search)}) or contains(vibe_productcode,${text(search)}))`,
    ]
      .filter(Boolean)
      .join(" and ")
    const orderBy = this.orderBy({ ...query, view: "all" }, PRODUCT_SORT, "vibe_name", "vibe_productid")
    const page = await this.page("products", this.client.products, filter || undefined, orderBy, query)
    return { items: page.rows.map(toProduct), totalCount: page.totalCount }
  }

  async getProduct(id: Id): Promise<Product> {
    return toProduct(await this.call(() => this.client.products.get(guid(id))))
  }

  async createProduct(input: ProductInput): Promise<Product> {
    invalid("The Product cannot be saved.", productErrors(input))
    const created = await this.call(() =>
      this.client.products.create(fields(productFields(input))).catch((e: unknown) => {
        throw duplicateCode(e)
      }),
    )
    return this.getProduct(created.vibe_productid)
  }

  async updateProduct(id: Id, update: ProductUpdate): Promise<Product> {
    const current = await this.getProduct(id)
    const merged: ProductInput = { ...current, ...update }
    invalid("The Product cannot be saved.", productErrors(merged))
    const key = guid(id)
    await this.call(() =>
      this.client.products.update(key, fields(productFields(update))).catch((e: unknown) => {
        throw duplicateCode(e)
      }),
    )
    return this.getProduct(key)
  }

  async retireProduct(id: Id): Promise<Product> {
    const key = guid(id)
    await this.call(() => this.client.products.update(key, { ...DEACTIVATED }))
    return this.getProduct(key)
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

  /**
   * Active Accounts whose name contains the Company (plus any named exactly
   * like it, so the strong match is never cut off by the limit), and active
   * Contacts with the Lead's email or with its first and last name.
   */
  async getQualifySuggestions(leadId: Id): Promise<QualifySuggestions> {
    const lead = await this.readLead(leadId)
    const company = lead.company.trim()
    const email = lead.email?.trim()
    const lastName = lead.lastName.trim()
    const suggestions = <T>(client: TableClient<T>, filter: string | false, orderBy: string): Promise<T[]> =>
      filter
        ? this.call(() => client.list({ filter: `${ACTIVE} and ${filter}`, orderBy: [orderBy], pageSize: SUGGESTION_LIMIT })).then((p) => p.rows)
        : Promise.resolve([])
    const [exact, containing, byEmail, byName] = await Promise.all([
      suggestions(this.client.accounts, !!company && `name eq ${text(company)}`, "name asc"),
      suggestions(this.client.accounts, !!company && `contains(name,${text(company)})`, "name asc"),
      suggestions(this.client.contacts, !!email && `emailaddress1 eq ${text(email!)}`, "fullname asc"),
      suggestions(this.client.contacts, !!lastName && `lastname eq ${text(lastName)}`, "fullname asc"),
    ])
    const accounts = uniqueBy([...exact, ...containing], (r) => r.accountid).map(toAccount)
    const contacts = uniqueBy([...byEmail, ...byName], (r) => r.contactid).map(toContact)
    return {
      accounts: suggestAccounts(lead, accounts),
      contacts: suggestContacts(lead, contacts),
      opportunityName: defaultOpportunityName(lead),
    }
  }

  /**
   * Separate writes, ordered so the Lead is marked Qualified last: the Account
   * (if new), the Contact (if new, under the chosen Account), the Opportunity
   * (owned by the Lead's Owner, linked to the Lead), then the Lead. A failure
   * in between throws a QualifyError naming the step and what was created,
   * and leaves the Lead open. A retry reuses an Opportunity already created
   * for this Lead, so it never makes a second one.
   */
  async qualifyLead(leadId: Id, input: QualifyInput): Promise<QualifyResult> {
    const lead = await this.readLead(leadId)
    if (!(await this.mayEdit(lead.ownerId))) {
      throw new GatewayError("forbidden", "Only the Lead's Owner or the Owner's manager can qualify it.")
    }
    const next = leadRule(lead, "qualify")
    invalid(
      "The Opportunity details are incomplete.",
      opportunityErrors({ ...input.opportunity, accountId: "chosen in the dialog", stage: "qualification" }),
    )
    const { user } = await this.getCurrentUser()

    const created: QualifyError["created"] = {}
    const step = async <T>(name: QualifyStep, run: () => Promise<T>): Promise<T> => {
      try {
        return await run()
      } catch (error) {
        const cause = toGatewayError(error)
        const failure =
          cause instanceof GatewayError ? cause : new GatewayError("invalid", cause instanceof Error ? cause.message : String(cause))
        throw new QualifyError(name, failure, { ...created })
      }
    }

    const { account: accountChoice, contact: contactChoice } = input
    const accountId = await step("account", async () => {
      if ("existingId" in accountChoice) return (await this.call(() => this.client.accounts.get(guid(accountChoice.existingId)))).accountid
      const account = await this.createAccount(newAccountFromLead(lead))
      created.accountId = account.id
      return account.id
    })

    const contactId = await step("contact", async () => {
      if ("existingId" in contactChoice) return (await this.call(() => this.client.contacts.get(guid(contactChoice.existingId)))).contactid
      const contact = await this.createContact(newContactFromLead(lead, accountId))
      created.contactId = contact.id
      return contact.id
    })

    const opportunityId = await step("opportunity", async () => {
      const [existing] = await this.related(
        this.client.opportunities,
        `_vibe_originatingleadid_value eq ${guid(lead.id)}`,
        ["createdon asc"],
      )
      let id = existing?.vibe_opportunityid
      if (!id) {
        const draft = newOpportunityFromLead(lead, { accountId, primaryContactId: contactId }, input.opportunity)
        const row = await this.call(() =>
          this.client.opportunities.create(
            fields({
              ...opportunityFields(draft),
              vibe_stage: toChoice(STAGES, draft.stage),
              vibe_probability: draft.probability,
              vibe_forecastcategory: toChoice(FORECAST_CATEGORIES, draft.forecastCategory ?? defaultForecastCategory("qualification")),
              ...bind(OPPORTUNITY_NAVIGATION.originatingLead, "vibe_leads", lead.id),
            }),
          ),
        )
        id = row.vibe_opportunityid
        created.opportunityId = id
      }
      // New records belong to whoever creates them. A manager qualifying hands the
      // Opportunity to the Lead's Owner afterwards: creating it for someone else
      // needs Create beyond User level, assigning only the manager's Assign.
      const ownerId = existing ? existing._ownerid_value : user.id
      if (ownerId !== lead.ownerId) {
        await this.call(() => this.client.opportunities.update(id, bind("ownerid", "systemusers", lead.ownerId)))
      }
      return id
    })

    await step("lead", () =>
      this.call(() => this.client.leads.update(lead.id, { vibe_leadstatus: toChoice(LEAD_STATUSES, next), ...DEACTIVATED })),
    )

    return { leadId: lead.id, accountId, contactId, opportunityId }
  }

  // ---- Opportunities --------------------------------------------------------


  async createOpportunity(input: OpportunityInput): Promise<Opportunity> {
    invalid("The Opportunity cannot be saved.", opportunityErrors(input))
    const created = await this.call(() =>
      this.client.opportunities.create(
        fields({
          ...opportunityFields(input),
          vibe_stage: toChoice(STAGES, input.stage),
          vibe_probability: input.probability ?? STAGE_DEFAULT_PROBABILITY[input.stage],
          vibe_forecastcategory: toChoice(FORECAST_CATEGORIES, input.forecastCategory ?? defaultForecastCategory(input.stage)),
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
    if (update.forecastCategory) rule(() => overrideForecastCategory(current, update.forecastCategory!))
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
        vibe_forecastcategory: toChoice(FORECAST_CATEGORIES, change.forecastCategory),
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

  // ---- Quotas ------------------------------------------------------------------

  /** Dataverse returns only the rows the user may read: their own and their direct reports'. */
  async listQuotas(query: QuotaQuery): Promise<Quota[]> {
    const { user, directReports } = await this.getCurrentUser()
    const people = query.scope === "me" ? [user.id] : teamMemberIds(user.id, [user, ...directReports])
    const last = quotaMonths(query.from, query.months).at(-1) ?? query.from
    const filter = [
      `(${people.map((p) => `_vibe_salespersonid_value eq ${guid(p)}`).join(" or ")})`,
      `vibe_month ge ${query.from}`,
      `vibe_month le ${last}`,
    ].join(" and ")
    const page = await this.call(() =>
      this.client.quotas.list({ filter, orderBy: ["vibe_month asc", "vibe_quotaid asc"], pageSize: RELATED_LIMIT }),
    )
    return page.rows.map(toQuota)
  }

  async setQuota(salespersonId: Id, month: DateOnly, amount: number): Promise<Quota> {
    const { user, directReports } = await this.getCurrentUser()
    const person = [user, ...directReports].find((u) => u.id.toLowerCase() === salespersonId.toLowerCase())
    try {
      requireCanSetQuota(user, person ?? { id: salespersonId, managerId: null, fullName: "that salesperson" })
    } catch (error) {
      if (error instanceof SalesRuleError) throw new GatewayError("forbidden", error.message)
      throw error
    }
    invalid("The Quota cannot be saved.", quotaErrors({ month, amount }))
    const [existing] = (
      await this.call(() =>
        this.client.quotas.list({
          filter: `_vibe_salespersonid_value eq ${guid(salespersonId)} and vibe_month eq ${month}`,
          pageSize: 1,
        }),
      )
    ).rows
    const row = existing
      ? await this.call(() => this.client.quotas.update(existing.vibe_quotaid, { vibe_amount: amount }))
      : await this.call(() =>
          this.client.quotas.create({
            ...bind(QUOTA_SALESPERSON_NAVIGATION, "systemusers", salespersonId),
            vibe_month: month,
            vibe_amount: amount,
          }),
        )
    return { ...toQuota(row), salespersonId, salespersonName: person?.fullName ?? "", month, amount }
  }

  // ---- Ownership ---------------------------------------------------------------

  /**
   * One Owner change, also on read-only (deactivated) records. Dataverse moves
   * the record's open Tasks and Phone Calls along (assign cascade "Cascade
   * Active" on those relationships) and leaves an Account's Contacts and
   * Opportunities alone (no cascade); see solutions/SalesApp.
   */
  async reassign(record: RecordRef, newOwnerId: Id): Promise<void> {
    const table = this.ownedTable(record.type)
    const row = await this.call(() => table.get(guid(record.id)))
    if (!(await this.mayEdit(row._ownerid_value))) throw forbidden()
    const salespeople = await this.listSalespeople()
    if (!salespeople.some((u) => u.id.toLowerCase() === newOwnerId.toLowerCase())) {
      throw new GatewayError("invalid", "Records can only be reassigned to a salesperson.", {
        ownerId: "Pick a salesperson.",
      })
    }
    await this.call(() => table.update(guid(record.id), bind("ownerid", "systemusers", newOwnerId)))
  }

  // ---- Activities -----------------------------------------------------------
  // Notes, Tasks and Phone Calls link to their record through a polymorphic
  // lookup, written through the per-target navigation property (#12).

  /** The record's own Notes, Tasks and Phone Calls: open Tasks first, then the rest newest first. */
  async listActivities(record: RecordRef): Promise<Activity[]> {
    const key = guid(record.id)
    const [notes, tasks, calls] = await Promise.all([
      this.related(this.client.notes, `_objectid_value eq ${key}`, ["createdon desc"]),
      this.related(this.client.tasks, `_regardingobjectid_value eq ${key}`, ["createdon desc"]),
      this.related(this.client.phoneCalls, `_regardingobjectid_value eq ${key}`, ["createdon desc"]),
    ])
    const activities: (Activity | undefined)[] = [
      ...notes.map((row) => toNote(row, record)),
      ...tasks.map((row) => toTask(row, record)),
      ...calls.map((row) => toPhoneCall(row, record)),
    ]
    return orderTimeline(activities.filter((a): a is Activity => a !== undefined))
  }

  async addNote(record: RecordRef, input: NoteInput): Promise<Note> {
    await this.requireEditRecord(record)
    invalid("The Note cannot be saved.", noteErrors(input))
    const created = await this.call(() =>
      this.client.notes.create({
        subject: input.title.trim() || null,
        notetext: input.text.trim() || null,
        ...regarding("annotation", record),
      }),
    )
    return toNote(await this.call(() => this.client.notes.get(created.annotationid)), record)!
  }

  async addTask(record: RecordRef, input: TaskInput): Promise<Task> {
    await this.requireEditRecord(record)
    invalid("The Task cannot be saved.", taskErrors(input))
    const created = await this.call(() =>
      this.client.tasks.create({
        subject: input.subject.trim(),
        description: input.description?.trim() || null,
        scheduledend: input.dueDate ? toMoment(input.dueDate) : null,
        ...regarding("task", record),
      }),
    )
    return toTask(await this.call(() => this.client.tasks.get(created.activityid)), record)!
  }

  /**
   * A logged call (the default) is created and then completed, as Made or
   * Received; a planned call stays open. The platform sets the caller as From.
   */
  async addPhoneCall(record: RecordRef, input: PhoneCallInput): Promise<PhoneCall> {
    await this.requireEditRecord(record)
    invalid("The Phone Call cannot be saved.", phoneCallErrors(input))
    const completed = input.completed ?? true
    const created = await this.call(() =>
      this.client.phoneCalls.create({
        subject: input.subject.trim(),
        description: input.notes?.trim() || null,
        directioncode: input.direction === "outgoing",
        [completed ? "actualend" : "scheduledend"]: toMoment(input.date),
        ...regarding("phonecall", record),
      }),
    )
    if (completed) {
      await this.call(() =>
        this.client.phoneCalls.update(created.activityid, {
          statecode: 1,
          statuscode: input.direction === "outgoing" ? PHONE_CALL_MADE : PHONE_CALL_RECEIVED,
        }),
      )
    }
    return toPhoneCall(await this.call(() => this.client.phoneCalls.get(created.activityid)), record)!
  }

  /** The Task's Owner or their manager completes it. */
  async completeTask(taskId: Id): Promise<Task> {
    const key = guid(taskId)
    const row = await this.call(() => this.client.tasks.get(key))
    if (!(await this.mayEdit(row._ownerid_value))) throw forbidden()
    if (row.statecode !== OPEN_ACTIVITY) throw new GatewayError("invalid", "This Task is already complete.")
    await this.call(() => this.client.tasks.update(key, { statecode: 1, statuscode: TASK_COMPLETED }))
    const task = toTask(await this.call(() => this.client.tasks.get(key)))
    if (!task) throw new GatewayError("notFound", `Task ${taskId} is not about a Lead, Opportunity, Account or Contact.`)
    return task
  }

  /**
   * Only the record's Owner or the Owner's manager adds activities to it.
   * Dataverse backs this for Leads and Opportunities (Append To at User level),
   * not for Accounts and Contacts, so the gateway checks it for all four.
   */
  private async requireEditRecord(record: RecordRef): Promise<void> {
    const row = await this.call(() => this.ownedTable(record.type).get(guid(record.id)))
    if (!(await this.mayEdit(row._ownerid_value))) throw forbidden()
  }

  /** The table behind a record type, as far as ownership goes. */
  private ownedTable(type: RecordType): TableClient<{ _ownerid_value?: Id | null }> {
    const tables: Record<RecordType, TableClient<{ _ownerid_value?: Id | null }>> = {
      lead: this.client.leads,
      opportunity: this.client.opportunities,
      account: this.client.accounts,
      contact: this.client.contacts,
    }
    return tables[type]
  }

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
    return this.all(client, filter, orderBy, RELATED_LIMIT)
  }

  /** Every matching row, page by page, stopping once `limit` rows are in. */
  private async all<T>(client: TableClient<T>, filter: string | undefined, orderBy: string[], limit = PIPELINE_LIMIT): Promise<T[]> {
    const rows: T[] = []
    let skipToken: string | undefined
    do {
      const result = await this.call(() => client.list({ filter, orderBy, pageSize: 100, skipToken }))
      rows.push(...result.rows)
      skipToken = result.skipToken
    } while (skipToken && rows.length < limit)
    return rows
  }
}

// ---- Activities ------------------------------------------------------------------

/** An activity's statecode while open; Tasks and Phone Calls complete to 1. */
const OPEN_ACTIVITY = 0
const TASK_COMPLETED = 5
const PHONE_CALL_MADE = 2
const PHONE_CALL_RECEIVED = 4

const RECORD_TYPES = Object.fromEntries(
  Object.entries(RECORD_TABLES).map(([type, table]) => [table.logicalName, type as RecordType]),
) as Record<string, RecordType>

function forbidden() {
  return new GatewayError("forbidden", "Only the Owner or the Owner's manager can change this record.")
}

/** The lookup that links a new Note, Task or Phone Call to its record. */
function regarding(table: "annotation" | "task" | "phonecall", record: RecordRef): Fields {
  const target = RECORD_TABLES[record.type]
  return { [`${regardingNavigation(table, target.logicalName)}@odata.bind`]: `/${target.entitySet}(${guid(record.id)})` }
}

/**
 * A date-only value as a moment for a date-and-time column (due date, call
 * date): noon local time, so the calendar date survives any time zone shift.
 */
export function toMoment(date: DateOnly): Timestamp {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d, 12).toISOString()
}

/** The local calendar date of a date-and-time column. */
function fromMoment(value: string | null | undefined): DateOnly | undefined {
  if (!value) return undefined
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? undefined : toDateOnly(moment)
}

/**
 * The record an activity is about. When the caller asked for one record's
 * activities it is that record; otherwise it comes from the lookup, and
 * activities about other kinds of records are left out (undefined).
 */
function regardingOf(row: Record<string, unknown>, lookup: string, record?: RecordRef): Pick<Activity, "regarding" | "regardingName"> | undefined {
  const regardingName = lookupName(row, lookup) ?? ""
  if (record) return { regarding: { ...record }, regardingName }
  const id = row[`_${lookup}_value`]
  const type = RECORD_TYPES[lookupTable(row, lookup) ?? ""]
  return typeof id === "string" && type ? { regarding: { type, id }, regardingName } : undefined
}

function activityBase(row: Record<string, unknown>, id: Id) {
  return {
    id,
    ownerId: (row._ownerid_value as Id | null | undefined) ?? "",
    ownerName: lookupName(row, "ownerid") ?? "",
    createdOn: (row.createdon as string | null | undefined) ?? "",
  }
}

export function toNote(row: NoteRow, record?: RecordRef): Note | undefined {
  const about = regardingOf(row, "objectid", record)
  if (!about) return undefined
  return { kind: "note", ...activityBase(row, row.annotationid), ...about, title: row.subject ?? "", text: row.notetext ?? "" }
}

export function toTask(row: ActivityRow, record?: RecordRef): Task | undefined {
  const about = regardingOf(row, "regardingobjectid", record)
  if (!about) return undefined
  const completed = row.statecode !== undefined && row.statecode !== null && row.statecode !== OPEN_ACTIVITY
  return {
    kind: "task",
    ...activityBase(row, row.activityid),
    ...about,
    subject: row.subject ?? "",
    description: optional(row.description),
    dueDate: fromMoment(row.scheduledend),
    completed,
    completedOn: completed ? optional(row.actualend) : undefined,
  }
}

export function toPhoneCall(row: PhoneCallRow, record?: RecordRef): PhoneCall | undefined {
  const about = regardingOf(row, "regardingobjectid", record)
  if (!about) return undefined
  const completed = row.statecode !== undefined && row.statecode !== null && row.statecode !== OPEN_ACTIVITY
  return {
    kind: "phoneCall",
    ...activityBase(row, row.activityid),
    ...about,
    subject: row.subject ?? "",
    direction: row.directioncode === false ? "incoming" : "outgoing",
    date: fromMoment(completed ? (row.actualend ?? row.scheduledend) : (row.scheduledend ?? row.actualend)) ?? "",
    notes: optional(row.description),
    completed,
  }
}

function accountFields(input: Partial<AccountInput> | AccountUpdate) {
  return {
    name: column(input.name),
    websiteurl: column(input.website),
    telephone1: column(input.phone),
    address1_line1: column(input.street),
    address1_city: column(input.city),
    address1_postalcode: column(input.postcode),
    address1_country: column(input.country),
    description: column(input.description),
    customertypecode: accountTypeColumn(input.accountType),
    industrycode: industryColumn(input.industry),
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
    vibe_forecastcategory: choiceColumn(FORECAST_CATEGORIES, input.forecastCategory),
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
    vibe_forecastcategory: choiceColumn(FORECAST_CATEGORIES, change.forecastCategory) ?? null,
    vibe_actualvalue: change.actualValue ?? null,
    vibe_closedate: change.closeDate ?? null,
    vibe_lostreason: choiceColumn(LOST_REASONS, change.lostReason) ?? null,
    vibe_lostcomment: change.lostComment ?? null,
    ...bind(OPPORTUNITY_NAVIGATION.closedBy, "systemusers", change.closedById ?? null),
  }
}
