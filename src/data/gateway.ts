// The sales data gateway: the one seam between the app and its data.
// Pages and hooks use this interface (through TanStack Query) and never talk
// to Dataverse directly. Two implementations: the Dataverse one, and the
// in-memory one used by tests and local development.

import type {
  Account,
  AccountInput,
  AccountType,
  AccountSuggestions,
  Activity,
  CloseInput,
  Contact,
  ContactInput,
  ContactSuggestions,
  DateOnly,
  DisqualifyReason,
  FieldErrors,
  ForecastCategory,
  Id,
  Industry,
  Lead,
  LeadInput,
  LeadSource,
  ListView,
  Note,
  Notification,
  OpenStage,
  Opportunity,
  OpportunityInput,
  PhoneCall,
  PhoneCallDirection,
  PipelineFilter,
  Product,
  ProductInput,
  ProductLine,
  ProductLineInput,
  ProductLineUpdate,
  QualifyOpportunityDetails,
  Quota,
  Quote,
  QuoteLine,
  QuoteLineInput,
  QuoteLineUpdate,
  QuoteSettings,
  QuoteSettingsUpdate,
  QuoteTemplate,
  QuoteTemplateInput,
  QuoteTemplateUpdate,
  QuoteUpdate,
  RecordRef,
  Stage,
  Task,
  User,
} from "@/sales"

import type { BusinessRuleRow, EngineTable, ProcessDefinition, ProcessRow, ProcessTable, ProcessVersionRow, PublishIssue } from "@/sales/engine"
import type { EngineErrorEntry, ProcessAdmin, PublishImpact } from "@/sales/process-admin"
import type { RuleAdmin, RuleInput } from "@/sales/rule-admin"

export type CurrentUser = {
  user: User
  /** Users whose Manager is the current user. "My team" = the user plus these. */
  directReports: User[]
}

export type SortDirection = "asc" | "desc"

export type ListQuery<TRecord> = {
  view: ListView
  /** "Contains" search on the record's name (and email for Leads and Contacts). */
  search?: string
  sort?: { field: keyof TRecord & string; direction: SortDirection }
  /** 1-based. */
  page?: number
  pageSize?: number
}

export type LeadListQuery = ListQuery<Lead> & { status?: Lead["status"] }
/** "open": any open Stage. */
export type OpportunityListQuery = ListQuery<Opportunity> & { stage?: Stage | "open" }

/** Products have no Owner, so no My | My team | All views. */
export type ProductListQuery = Omit<ListQuery<Product>, "view"> & { status?: "active" | "retired" }

export type Page<T> = { items: T[]; totalCount: number }

export type SearchResults = {
  leads: Lead[]
  opportunities: Opportunity[]
  accounts: Account[]
  contacts: Contact[]
}

/** Whether the current user may change the record: its Owner or the Owner's manager. */
type Editable = { canEdit: boolean }

export type LeadDetails = Editable & {
  lead: Lead
  /** The Opportunity a Qualified Lead became. */
  opportunity?: Opportunity
}

export type OpportunityDetails = Editable & {
  opportunity: Opportunity
  account: Account
  primaryContact?: Contact
  originatingLead?: Lead
  /** Oldest first. While there are any, the Estimated value is their total and can't be typed over. */
  productLines: ProductLine[]
  /** Newest first. */
  quotes: Quote[]
}

export type QuoteDetails = Editable & {
  quote: Quote
  /** Oldest first. */
  lines: QuoteLine[]
  opportunity: Opportunity
  account?: Account
  contact?: Contact
  /** The Opportunity's Owner, who is the Quote's: the PDF names them. */
  owner: User
  /** The Products on the lines, for the code and Unit columns of the PDF. */
  products: Product[]
}

export type AccountDetails = Editable & {
  account: Account
  contacts: Contact[]
  opportunities: Opportunity[]
}

export type ContactDetails = Editable & {
  contact: Contact
  account?: Account
  /** Opportunities where this Contact is the Primary Contact. */
  opportunities: Opportunity[]
}

export type HomeData = {
  /** My open Tasks, overdue first. */
  openTasks: Task[]
  /** My open Opportunities with an Expected close date in the current month. */
  opportunitiesClosingThisMonth: Opportunity[]
  /** My Leads that are still Not Contacted. */
  leadsNotContacted: Lead[]
}

export type LeadUpdate = Partial<LeadInput>
/** Blank strings clear a field; so does a blank Lead source. */
export type OpportunityUpdate = Partial<Omit<OpportunityInput, "stage" | "leadSource" | "forecastCategory">> & {
  leadSource?: LeadSource | ""
  /** The Owner overriding the Stage default; resets when the Stage changes. */
  forecastCategory?: ForecastCategory
}
/** A blank Account type or Industry clears it. */
export type AccountUpdate = Partial<Omit<AccountInput, "accountType" | "industry">> & {
  accountType?: AccountType | ""
  industry?: Industry | ""
}
export type ContactUpdate = Partial<ContactInput>

/** A blank description clears it. */
export type ProductUpdate = Partial<ProductInput>

export type DisqualifyInput = { reason?: DisqualifyReason; comment?: string }

export type QualifySuggestions = {
  accounts: AccountSuggestions
  contacts: ContactSuggestions
  /** "Company - ", for the user to finish. */
  opportunityName: string
}

/** Link an existing record (never overwriting it) or create a new one from the Lead. */
export type QualifyChoice = { existingId: Id } | { createNew: true }

export type QualifyInput = {
  account: QualifyChoice
  contact: QualifyChoice
  opportunity: QualifyOpportunityDetails
}

export type QualifyResult = {
  leadId: Id
  accountId: Id
  contactId: Id
  opportunityId: Id
}

/**
 * How a Quote is sent. Both routes store the exact PDF on the Quote and set it to Sent.
 * By email the PDF goes from the sender's own Outlook mailbox to `to` (the Quote's Contact), with an optional Cc.
 */
export type SendQuoteInput =
  | { route: "download"; pdf: Uint8Array }
  | { route: "email"; pdf: Uint8Array; to: string; cc?: string; subject: string; message: string }

export type NoteInput = { title: string; text: string }
export type TaskInput = { subject: string; description?: string; dueDate?: DateOnly }
export type PhoneCallInput = {
  subject: string
  direction: PhoneCallDirection
  date: DateOnly
  notes?: string
  /** Defaults to true: logging a call records one that happened. */
  completed?: boolean
}

/** "me": my own Quota rows. "myTeam": mine and my direct reports'. */
export type QuotaQuery = { scope: "me" | "myTeam"; from: DateOnly; months: number }

/**
 * The published Processes of a table, for the process bar. Every version a
 * record might still sit on is included. When the kill switch is off
 * `engineEnabled` is false and records behave as in v1.
 */
export type ProcessDefinitions = {
  engineEnabled: boolean
  processes: ProcessRow[]
  versions: ProcessVersionRow[]
}

/** The published Business rules of a table, for rule effects on the record pages. */
export type BusinessRules = {
  engineEnabled: boolean
  rules: BusinessRuleRow[]
}

/** What a Process builder changes on a draft Process. Editing never affects users until Publish. */
export type ProcessDraftUpdate = {
  name?: string
  /** Making a Process the fallback clears the flag on the table's other Processes and drops its Entry criteria. */
  isFallback?: boolean
  definition?: ProcessDefinition
}

/** What Publish would refuse, warn about and do to open records, shown before the builder confirms. */
export type PublishPreview = {
  errors: PublishIssue[]
  warnings: PublishIssue[]
  impact: PublishImpact
}

export interface SalesGateway {
  // People
  getCurrentUser(): Promise<CurrentUser>
  /** Users holding the SalesApp Salesperson role: who a record can be Reassigned to. */
  listSalespeople(): Promise<User[]>

  // Lists, search and Home
  listLeads(query: LeadListQuery): Promise<Page<Lead>>
  listOpportunities(query: OpportunityListQuery): Promise<Page<Opportunity>>
  listAccounts(query: ListQuery<Account>): Promise<Page<Account>>
  listContacts(query: ListQuery<Contact>): Promise<Page<Contact>>
  search(text: string): Promise<SearchResults>
  getHome(): Promise<HomeData>
  getPipeline(filter: PipelineFilter): Promise<Opportunity[]>

  // Record pages
  getLead(id: Id): Promise<LeadDetails>
  getOpportunity(id: Id): Promise<OpportunityDetails>
  getAccount(id: Id): Promise<AccountDetails>
  getContact(id: Id): Promise<ContactDetails>

  // Accounts and Contacts
  createAccount(input: AccountInput): Promise<Account>
  updateAccount(id: Id, update: AccountUpdate): Promise<Account>
  createContact(input: ContactInput): Promise<Contact>
  updateContact(id: Id, update: ContactUpdate): Promise<Contact>

  // Leads
  createLead(input: LeadInput): Promise<Lead>
  updateLead(id: Id, update: LeadUpdate): Promise<Lead>
  /** Not Contacted <-> Working, by hand. */
  setLeadStatus(id: Id, status: "notContacted" | "working"): Promise<Lead>
  disqualifyLead(id: Id, input: DisqualifyInput): Promise<Lead>
  /** Disqualified -> Working. */
  reopenLead(id: Id): Promise<Lead>
  getQualifySuggestions(leadId: Id): Promise<QualifySuggestions>
  /**
   * Creates the Account and Contact if new, then the Opportunity, and marks
   * the Lead Qualified last. On failure throws a QualifyError naming the step
   * and the records already created, and leaves the Lead open for a retry.
   */
  qualifyLead(leadId: Id, input: QualifyInput): Promise<QualifyResult>

  // Opportunities
  createOpportunity(input: OpportunityInput): Promise<Opportunity>
  /** Field changes, including a Probability override. The Stage changes through changeStage, close and reopen. */
  updateOpportunity(id: Id, update: OpportunityUpdate): Promise<Opportunity>
  /** Between open Stages; resets Probability to the Stage default. */
  changeStage(id: Id, stage: OpenStage): Promise<Opportunity>
  /** Closing as lost sets the Opportunity's Sent Quotes to Rejected; reopening leaves Quotes as they are. */
  closeOpportunity(id: Id, input: CloseInput): Promise<Opportunity>
  reopenOpportunity(id: Id, stage: OpenStage): Promise<Opportunity>

  // Processes: a record that follows a Process moves Step by Step; the engine checks the Gate and sets the Stage or Lead status.
  getProcessDefinitions(table: ProcessTable): Promise<ProcessDefinitions>
  /**
   * Moves a Lead or Opportunity to a Step of its Process. Forward through the Gates of the Steps left behind
   * (refused with a GatewayError naming the open checks), back without checks. Stage or Lead status follow the Step.
   */
  moveStep(record: RecordRef, stepId: string): Promise<void>
  /** The Business rules of a table (Lead, Opportunity, Account or Contact), loaded once per session. With the kill switch off, none are evaluated. */
  getBusinessRules(table: EngineTable): Promise<BusinessRules>
  /** Switch Process: to another Process version, or none (null), landing on the Step that fits the current Stage or status. */
  switchProcess(record: RecordRef, processVersionId: Id | null): Promise<void>

  // Process administration: everyone reads the definitions; only a Process builder changes them.
  /** Every Process of a table, draft and retired ones too, in priority order. */
  listProcessAdmin(table: ProcessTable): Promise<ProcessAdmin[]>
  getProcessAdmin(id: Id): Promise<ProcessAdmin>
  /** A draft Process with no Steps, last in the table's priority order. */
  createProcess(table: ProcessTable, name: string): Promise<ProcessAdmin>
  saveProcessDraft(id: Id, update: ProcessDraftUpdate): Promise<ProcessAdmin>
  /** Moves a Process one place up or down the table's priority order. */
  moveProcessPriority(id: Id, direction: "up" | "down"): Promise<void>
  previewPublish(id: Id): Promise<PublishPreview>
  /** Writes the draft as a new Process version. Refused with a PublishRefused naming what is wrong. Open records stay on the version they started on. */
  publishProcess(id: Id): Promise<ProcessAdmin>
  /** No new record gets it; records on it finish on it. */
  retireProcess(id: Id): Promise<ProcessAdmin>
  /** Moves every open record on an older version onto the latest. Returns how many moved. */
  moveToLatestVersion(id: Id): Promise<number>
  /** Switch Process for every open record of a Process, to the latest version of another Process, or to none (null). Returns how many moved. */
  switchAllRecords(id: Id, targetProcessId: Id | null): Promise<number>
  /** Open Engine errors, newest first; for one Process when given. */
  listEngineErrors(processId?: Id): Promise<EngineErrorEntry[]>

  // Business rule administration: everyone reads the rules; only a Process builder changes them. Saving applies at once.
  /** Every Business rule of a table, switched off ones too, oldest first. */
  listRulesAdmin(table: EngineTable): Promise<RuleAdmin[]>
  /**
   * Creates the rule, or saves the changes to it. Refused with a PublishRefused naming what is wrong (a set value cycle,
   * a field that no longer exists, the size limits). Takes effect on every record at once.
   */
  saveBusinessRule(rule: RuleInput): Promise<RuleAdmin>
  deleteBusinessRule(id: Id): Promise<void>
  /** Open Engine errors of one rule, newest first. */
  listRuleEngineErrors(ruleId: Id): Promise<EngineErrorEntry[]>

  // Products: everyone reads; only a Catalogue Manager creates, edits and retires. No delete.
  listProducts(query: ProductListQuery): Promise<Page<Product>>
  getProduct(id: Id): Promise<Product>
  /** A duplicate Product code is refused with a fieldError on `code`. */
  createProduct(input: ProductInput): Promise<Product>
  /** Changes the Product only: existing Product lines keep the price they started from. */
  updateProduct(id: Id, update: ProductUpdate): Promise<Product>
  /** The Product can't be added to new lines; existing lines keep it. */
  retireProduct(id: Id): Promise<Product>

  // Product lines: editable by whoever may edit the Opportunity, read-only once it is closed.
  /** Oldest first. */
  listProductLines(opportunityId: Id): Promise<ProductLine[]>
  /**
   * Adds a line for an active Product; its description and unit price default to the Product's.
   * The Opportunity's Estimated value becomes the total of its lines.
   */
  addProductLine(opportunityId: Id, input: ProductLineInput): Promise<ProductLine>
  updateProductLine(id: Id, update: ProductLineUpdate): Promise<ProductLine>
  /** Removing the last line leaves the Estimated value as it was, and typeable again. */
  removeProductLine(id: Id): Promise<void>

  // Quotes follow their Opportunity: its Owner (and manager) create, change, send, revise, accept and reject
  // them; everyone reads. Only a Draft is edited or deleted. A closed Opportunity takes no new Quotes.
  /** Newest first. */
  listQuotes(opportunityId: Id): Promise<Quote[]>
  getQuote(id: Id): Promise<QuoteDetails>
  /**
   * A Draft Quote from an open Opportunity: its Account, Primary Contact and Product lines are copied,
   * Valid until is 30 days from today, the number is automatic (Q-00001) and the Revision 0.
   */
  createQuote(opportunityId: Id): Promise<Quote>
  updateQuote(id: Id, update: QuoteUpdate): Promise<Quote>
  deleteQuote(id: Id): Promise<void>
  /** Lines are edited on the Quote alone; the Opportunity's lines and Estimated value never change. */
  addQuoteLine(quoteId: Id, input: QuoteLineInput): Promise<QuoteLine>
  updateQuoteLine(id: Id, update: QuoteLineUpdate): Promise<QuoteLine>
  removeQuoteLine(id: Id): Promise<void>
  /**
   * Draft to Sent. Stores the PDF on the Quote, emails it when the route is email (stopping with a field error on
   * `to` when there is no address, and sending nothing), then sets Sent with the sent date, who sent it, how and to whom.
   */
  sendQuote(id: Id, input: SendQuoteInput): Promise<Quote>
  /** The PDF stored when the Quote was sent, or undefined for a Quote that has none. */
  getQuotePdf(id: Id): Promise<Uint8Array | undefined>

  // Quote templates and Quote settings: everyone reads; only a Catalogue Manager creates and changes them.
  /** The Default template first, then by name. */
  listQuoteTemplates(): Promise<QuoteTemplate[]>
  /** The first template is the Default; making another the Default clears the old one. Nothing is deleted. */
  createQuoteTemplate(input: QuoteTemplateInput): Promise<QuoteTemplate>
  updateQuoteTemplate(id: Id, update: QuoteTemplateUpdate): Promise<QuoteTemplate>
  /** The Default template can't be deleted. Quotes that used a deleted template are drawn with the Default. */
  deleteQuoteTemplate(id: Id): Promise<void>
  /** The latest Quotes the user may see, newest first, for previewing a template with real data. */
  listRecentQuotes(limit?: number): Promise<Quote[]>
  getQuoteSettings(): Promise<QuoteSettings>
  updateQuoteSettings(update: QuoteSettingsUpdate): Promise<QuoteSettings>
  /** Sent to Revised, and a new Draft with the same number, Revision + 1 and a copy of the lines. Returns the new Draft. */
  reviseQuote(id: Id): Promise<Quote>
  /** Sent to Accepted; the Opportunity's other Sent Quotes become Rejected. Closing the Opportunity as won is a separate step. */
  acceptQuote(id: Id): Promise<Quote>
  /** Sent to Rejected. */
  rejectQuote(id: Id): Promise<Quote>

  // Ownership
  /** Makes another salesperson the Owner; open Tasks and Phone Calls on the record move along. */
  reassign(record: RecordRef, newOwnerId: Id): Promise<void>

  // Notifications: mine only. The system creates them (plug-ins and the server-side paths); the user reads and marks them read.
  /** My latest Notifications, newest first. */
  listNotifications(): Promise<Notification[]>
  /** How many of my Notifications are unread: the number on the bell. */
  countUnreadNotifications(): Promise<number>
  markNotificationRead(id: Id): Promise<void>
  markAllNotificationsRead(): Promise<void>

  // Quotas
  /** Quota rows from a month on, for me or my team. A salesperson only ever sees their own and their direct reports'. */
  listQuotas(query: QuotaQuery): Promise<Quota[]>
  /**
   * Sets a direct report's Quota for a month (the first day of it), creating the
   * row or changing its amount. Nobody sets their own: that is refused.
   */
  setQuota(salespersonId: Id, month: DateOnly, amount: number): Promise<Quota>

  // Activities
  /** Open Tasks first, then the rest newest first. */
  listActivities(record: RecordRef): Promise<Activity[]>
  /**
   * An Account's timeline: the Notes, Tasks and Phone Calls of the Account, its
   * current Contacts, its Opportunities (open and closed) and the Leads those
   * were qualified from. Each carries its source in `regarding` and
   * `regardingName`. Open Tasks first, then the rest newest first.
   */
  listAccountTimeline(accountId: Id): Promise<Activity[]>
  addNote(record: RecordRef, input: NoteInput): Promise<Note>
  addTask(record: RecordRef, input: TaskInput): Promise<Task>
  addPhoneCall(record: RecordRef, input: PhoneCallInput): Promise<PhoneCall>
  completeTask(taskId: Id): Promise<Task>
}

export type GatewayErrorCode =
  /** The record does not exist (or no longer exists). */
  | "notFound"
  /** The current user may not make this change: not the Owner or the Owner's manager. */
  | "forbidden"
  /** A sales rule or required field refused the change; see fieldErrors. */
  | "invalid"

export class GatewayError extends Error {
  readonly code: GatewayErrorCode
  readonly fieldErrors: FieldErrors

  constructor(code: GatewayErrorCode, message: string, fieldErrors: FieldErrors = {}) {
    super(message)
    this.name = "GatewayError"
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export type QualifyStep = "account" | "contact" | "opportunity" | "lead"

/** Qualify stopped at a step. Pass the records already created back as existing to retry. */
export class QualifyError extends GatewayError {
  readonly step: QualifyStep
  readonly created: { accountId?: Id; contactId?: Id; opportunityId?: Id }

  constructor(step: QualifyStep, cause: GatewayError, created: QualifyError["created"]) {
    super(cause.code, `Qualify failed at the ${step} step: ${cause.message}`, cause.fieldErrors)
    this.name = "QualifyError"
    this.step = step
    this.created = created
  }
}
