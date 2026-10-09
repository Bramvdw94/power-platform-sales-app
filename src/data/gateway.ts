// The sales data gateway: the one seam between the app and its data.
// Pages and hooks use this interface (through TanStack Query) and never talk
// to Dataverse directly. Two implementations: the Dataverse one, and the
// in-memory one used by tests and local development.

import type {
  Account,
  AccountInput,
  AccountSuggestions,
  Activity,
  CloseInput,
  Contact,
  ContactInput,
  ContactSuggestions,
  DateOnly,
  DisqualifyReason,
  FieldErrors,
  Id,
  Lead,
  LeadInput,
  LeadSource,
  ListView,
  Note,
  OpenStage,
  Opportunity,
  OpportunityInput,
  PhoneCall,
  PhoneCallDirection,
  PipelineFilter,
  QualifyOpportunityDetails,
  RecordRef,
  Stage,
  Task,
  User,
} from "@/sales"

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
export type OpportunityUpdate = Partial<Omit<OpportunityInput, "stage" | "leadSource">> & { leadSource?: LeadSource | "" }
export type AccountUpdate = Partial<AccountInput>
export type ContactUpdate = Partial<ContactInput>

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
  closeOpportunity(id: Id, input: CloseInput): Promise<Opportunity>
  reopenOpportunity(id: Id, stage: OpenStage): Promise<Opportunity>

  // Ownership
  /** Makes another salesperson the Owner; open Tasks and Phone Calls on the record move along. */
  reassign(record: RecordRef, newOwnerId: Id): Promise<void>

  // Activities
  /** Open Tasks first, then the rest newest first. */
  listActivities(record: RecordRef): Promise<Activity[]>
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
