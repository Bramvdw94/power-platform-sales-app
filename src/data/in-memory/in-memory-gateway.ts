import {
  SalesRuleError,
  accountErrors,
  canApplyLeadAction,
  canEdit,
  changeStage,
  closeOpportunity,
  contactErrors,
  defaultOpportunityName,
  directReportIds,
  disqualifyErrors,
  fullName,
  isInView,
  isLeadReadOnly,
  isOpenStage,
  isOpportunityReadOnly,
  leadErrors,
  leadStatusAfter,
  manualLeadAction,
  matchesPipelineFilter,
  newAccountFromLead,
  newContactFromLead,
  newOpportunityFromLead,
  noteErrors,
  opportunityErrors,
  phoneCallErrors,
  taskErrors,
  orderTimeline,
  reopenOpportunity,
  sortOpenTasks,
  STAGE_DEFAULT_PROBABILITY,
  suggestAccounts,
  suggestContacts,
  toDateOnly,
  type Account,
  type AccountInput,
  type Activity,
  type CloseInput,
  type Contact,
  type ContactInput,
  type FieldErrors,
  type Id,
  type Lead,
  type LeadInput,
  type Note,
  type OpenStage,
  type Opportunity,
  type OpportunityInput,
  type PhoneCall,
  type PipelineFilter,
  type RecordRef,
  type Task,
  type User,
} from "@/sales"
import {
  GatewayError,
  QualifyError,
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
  type NoteInput,
  type OpportunityDetails,
  type OpportunityListQuery,
  type OpportunityUpdate,
  type Page,
  type PhoneCallInput,
  type QualifyInput,
  type QualifyResult,
  type QualifyStep,
  type QualifySuggestions,
  type SalesGateway,
  type SearchResults,
  type TaskInput,
} from "../gateway"
import type { AccountRow, ActivityRow, ContactRow, InMemorySalesStore, LeadRow, OpportunityRow } from "./store"

export type InMemoryGatewayOptions = {
  /** The signed-in user. */
  userId: Id
  /** The clock; tests pass a fixed moment. */
  now?: () => Date
}

const DEFAULT_PAGE_SIZE = 50
const SEARCH_LIMIT = 10

function invalid(message: string, fieldErrors: FieldErrors): void {
  if (Object.keys(fieldErrors).length > 0) throw new GatewayError("invalid", message, fieldErrors)
}

/** Runs a sales rule, turning its refusal into a GatewayError like the Dataverse gateway does. */
function rule<T>(apply: () => T): T {
  try {
    return apply()
  } catch (error) {
    if (error instanceof SalesRuleError) throw new GatewayError("invalid", error.message, error.fieldErrors)
    throw error
  }
}

function contains(value: string | undefined, search: string): boolean {
  return (value ?? "").toLocaleLowerCase().includes(search)
}

/** Drops keys whose value is undefined, so a patch can't clear a field by omission. */
function defined<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** Removes optional fields an edit set to "", as Dataverse stores a blank column as null. */
function withoutBlanks<T extends object>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== "")) as T
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

/**
 * The sales data gateway over an in-memory store, for tests and local
 * development. It enforces the same rules as Dataverse: everyone reads,
 * only the Owner and the Owner's manager change a record.
 */
export class InMemorySalesGateway implements SalesGateway {
  private readonly store: InMemorySalesStore
  private readonly userId: Id
  private readonly now: () => Date

  constructor(store: InMemorySalesStore, options: InMemoryGatewayOptions) {
    if (!store.users.some((u) => u.id === options.userId)) {
      throw new Error(`Unknown user ${options.userId}`)
    }
    this.store = store
    this.userId = options.userId
    this.now = options.now ?? (() => new Date())
  }

  // ---- People -------------------------------------------------------------

  async getCurrentUser(): Promise<CurrentUser> {
    const reports = directReportIds(this.userId, this.store.users)
    return clone({
      user: this.user(this.userId),
      directReports: this.store.users.filter((u) => reports.includes(u.id)),
    })
  }

  async listSalespeople(): Promise<User[]> {
    return clone(
      this.store.users.filter((u) => u.isSalesperson).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    )
  }

  // ---- Lists, search and Home ----------------------------------------------

  async listLeads(query: LeadListQuery): Promise<Page<Lead>> {
    const rows = [...this.store.leads.values()].filter((l) => !query.status || l.status === query.status)
    return this.page(rows.map((r) => this.toLead(r)), query, (l) => [fullName(l), l.email])
  }

  async listOpportunities(query: OpportunityListQuery): Promise<Page<Opportunity>> {
    const rows = [...this.store.opportunities.values()].filter(
      (o) => !query.stage || o.stage === query.stage || (query.stage === "open" && isOpenStage(o.stage)),
    )
    return this.page(rows.map((r) => this.toOpportunity(r)), query, (o) => [o.name])
  }

  async listAccounts(query: ListQuery<Account>): Promise<Page<Account>> {
    return this.page([...this.store.accounts.values()].map((r) => this.toAccount(r)), query, (a) => [a.name])
  }

  async listContacts(query: ListQuery<Contact>): Promise<Page<Contact>> {
    return this.page([...this.store.contacts.values()].map((r) => this.toContact(r)), query, (c) => [
      fullName(c),
      c.email,
    ])
  }

  async search(text: string): Promise<SearchResults> {
    const query = { view: "all" as const, search: text, pageSize: SEARCH_LIMIT }
    if (!text.trim()) return { leads: [], opportunities: [], accounts: [], contacts: [] }
    const [leads, opportunities, accounts, contacts] = await Promise.all([
      this.listLeads(query),
      this.listOpportunities(query),
      this.listAccounts(query),
      this.listContacts(query),
    ])
    return {
      leads: leads.items,
      opportunities: opportunities.items,
      accounts: accounts.items,
      contacts: contacts.items,
    }
  }

  async getHome(): Promise<HomeData> {
    const today = this.today()
    const month = today.slice(0, 7)
    const openTasks = [...this.store.activities.values()].filter(
      (a): a is Extract<ActivityRow, { kind: "task" }> =>
        a.kind === "task" && !a.completed && a.ownerId === this.userId,
    )
    return {
      openTasks: sortOpenTasks(openTasks.map((t) => this.toActivity(t) as Task)),
      opportunitiesClosingThisMonth: [...this.store.opportunities.values()]
        .filter((o) => o.ownerId === this.userId && isOpenStage(o.stage) && o.expectedCloseDate.startsWith(month))
        .sort((a, b) => a.expectedCloseDate.localeCompare(b.expectedCloseDate))
        .map((o) => this.toOpportunity(o)),
      leadsNotContacted: [...this.store.leads.values()]
        .filter((l) => l.ownerId === this.userId && l.status === "notContacted")
        .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
        .map((l) => this.toLead(l)),
    }
  }

  async getPipeline(filter: PipelineFilter): Promise<Opportunity[]> {
    const context = { userId: this.userId, users: this.store.users, today: this.today() }
    return [...this.store.opportunities.values()]
      .filter((o) => matchesPipelineFilter(o, filter, context))
      .sort((a, b) => a.expectedCloseDate.localeCompare(b.expectedCloseDate))
      .map((o) => this.toOpportunity(o))
  }

  // ---- Record pages ---------------------------------------------------------

  async getLead(id: Id): Promise<LeadDetails> {
    const lead = this.leadRow(id)
    const opportunity = [...this.store.opportunities.values()].find((o) => o.originatingLeadId === id)
    return {
      lead: this.toLead(lead),
      opportunity: opportunity && this.toOpportunity(opportunity),
      canEdit: this.mayEdit(lead.ownerId),
    }
  }

  async getOpportunity(id: Id): Promise<OpportunityDetails> {
    const opportunity = this.opportunityRow(id)
    const contact = opportunity.primaryContactId ? this.store.contacts.get(opportunity.primaryContactId) : undefined
    const lead = opportunity.originatingLeadId ? this.store.leads.get(opportunity.originatingLeadId) : undefined
    return {
      opportunity: this.toOpportunity(opportunity),
      account: this.toAccount(this.accountRow(opportunity.accountId)),
      primaryContact: contact && this.toContact(contact),
      originatingLead: lead && this.toLead(lead),
      canEdit: this.mayEdit(opportunity.ownerId),
    }
  }

  async getAccount(id: Id): Promise<AccountDetails> {
    const account = this.accountRow(id)
    return {
      account: this.toAccount(account),
      contacts: [...this.store.contacts.values()].filter((c) => c.accountId === id).map((c) => this.toContact(c)),
      opportunities: [...this.store.opportunities.values()]
        .filter((o) => o.accountId === id)
        .map((o) => this.toOpportunity(o)),
      canEdit: this.mayEdit(account.ownerId),
    }
  }

  async getContact(id: Id): Promise<ContactDetails> {
    const contact = this.contactRow(id)
    const account = contact.accountId ? this.store.accounts.get(contact.accountId) : undefined
    return {
      contact: this.toContact(contact),
      account: account && this.toAccount(account),
      opportunities: [...this.store.opportunities.values()]
        .filter((o) => o.primaryContactId === id)
        .map((o) => this.toOpportunity(o)),
      canEdit: this.mayEdit(contact.ownerId),
    }
  }

  // ---- Accounts and Contacts -------------------------------------------------

  async createAccount(input: AccountInput): Promise<Account> {
    invalid("The Account cannot be saved.", accountErrors(input))
    const row: AccountRow = { ...clone(input), name: input.name.trim(), ...this.newOwned("acc") }
    this.store.accounts.set(row.id, row)
    return this.toAccount(row)
  }

  async updateAccount(id: Id, update: AccountUpdate): Promise<Account> {
    const row = this.accountRow(id)
    this.requireEdit(row.ownerId)
    const next = withoutBlanks({ ...row, ...defined(clone(update)) })
    invalid("The Account cannot be saved.", accountErrors(next))
    this.store.accounts.set(id, next)
    return this.toAccount(next)
  }

  async createContact(input: ContactInput): Promise<Contact> {
    invalid("The Contact cannot be saved.", contactErrors(input))
    if (input.accountId) this.accountRow(input.accountId)
    const row: ContactRow = { ...clone(input), ...this.newOwned("con") }
    this.store.contacts.set(row.id, row)
    return this.toContact(row)
  }

  async updateContact(id: Id, update: ContactUpdate): Promise<Contact> {
    const row = this.contactRow(id)
    this.requireEdit(row.ownerId)
    if (update.accountId) this.accountRow(update.accountId)
    const next = withoutBlanks({ ...row, ...defined(clone(update)) })
    invalid("The Contact cannot be saved.", contactErrors(next))
    this.store.contacts.set(id, next)
    return this.toContact(next)
  }

  // ---- Leads ----------------------------------------------------------------

  async createLead(input: LeadInput): Promise<Lead> {
    invalid("The Lead cannot be saved.", leadErrors(input))
    const row: LeadRow = { ...clone(input), status: "notContacted", ...this.newOwned("lead") }
    this.store.leads.set(row.id, row)
    return this.toLead(row)
  }

  async updateLead(id: Id, update: LeadUpdate): Promise<Lead> {
    const row = this.leadRow(id)
    this.requireEdit(row.ownerId)
    if (isLeadReadOnly(row)) throw new GatewayError("invalid", `A ${row.status} Lead is read-only.`)
    const next = withoutBlanks({ ...row, ...defined(clone(update)) })
    invalid("The Lead cannot be saved.", leadErrors(next))
    this.store.leads.set(id, next)
    return this.toLead(next)
  }

  async setLeadStatus(id: Id, status: "notContacted" | "working"): Promise<Lead> {
    const row = this.leadRow(id)
    this.requireEdit(row.ownerId)
    const action = manualLeadAction(status)
    if (!action) throw new GatewayError("invalid", `A Lead cannot be set to ${status} by hand.`)
    return this.saveLead({ ...row, status: rule(() => leadStatusAfter(row.status, action)) })
  }

  async disqualifyLead(id: Id, input: DisqualifyInput): Promise<Lead> {
    const row = this.leadRow(id)
    this.requireEdit(row.ownerId)
    const status = rule(() => leadStatusAfter(row.status, "disqualify"))
    invalid("The Lead cannot be disqualified.", disqualifyErrors(input))
    return this.saveLead({
      ...row,
      status,
      disqualifyReason: input.reason,
      disqualifyComment: input.comment?.trim() || undefined,
      disqualifiedOn: this.now().toISOString(),
      disqualifiedById: this.userId,
    })
  }

  async reopenLead(id: Id): Promise<Lead> {
    const row = this.leadRow(id)
    this.requireEdit(row.ownerId)
    const status = rule(() => leadStatusAfter(row.status, "reopen"))
    return this.saveLead({
      ...row,
      status,
      disqualifyReason: undefined,
      disqualifyComment: undefined,
      disqualifiedOn: undefined,
      disqualifiedById: undefined,
    })
  }

  async getQualifySuggestions(leadId: Id): Promise<QualifySuggestions> {
    const lead = this.leadRow(leadId)
    const accounts = [...this.store.accounts.values()].map((a) => this.toAccount(a))
    const contacts = [...this.store.contacts.values()].map((c) => this.toContact(c))
    return {
      accounts: suggestAccounts(lead, accounts),
      contacts: suggestContacts(lead, contacts),
      opportunityName: defaultOpportunityName(lead),
    }
  }

  async qualifyLead(leadId: Id, input: QualifyInput): Promise<QualifyResult> {
    const lead = this.leadRow(leadId)
    this.requireEdit(lead.ownerId)
    if (!canApplyLeadAction(lead.status, "qualify")) {
      throw new GatewayError("invalid", `A ${lead.status} Lead cannot be qualified.`)
    }
    invalid(
      "The Opportunity details are incomplete.",
      opportunityErrors({ ...input.opportunity, accountId: "chosen in the dialog", stage: "qualification" }),
    )

    // Separate writes, ordered so the Lead is marked Qualified last. A failure
    // in between reports the step and what was already created.
    const created: QualifyError["created"] = {}
    const step = async <T>(name: QualifyStep, run: () => Promise<T>): Promise<T> => {
      try {
        return await run()
      } catch (error) {
        if (error instanceof GatewayError) throw new QualifyError(name, error, { ...created })
        throw error
      }
    }

    const accountId = await step("account", async () => {
      if ("existingId" in input.account) return this.accountRow(input.account.existingId).id
      const account = await this.createAccount(newAccountFromLead(lead))
      created.accountId = account.id
      return account.id
    })

    const contactId = await step("contact", async () => {
      if ("existingId" in input.contact) return this.contactRow(input.contact.existingId).id
      const contact = await this.createContact(newContactFromLead(lead, accountId))
      created.contactId = contact.id
      return contact.id
    })

    const opportunityId = await step("opportunity", async () => {
      // A retry after a failed Lead step reuses the Opportunity already created.
      const existing = [...this.store.opportunities.values()].find((o) => o.originatingLeadId === leadId)
      if (existing) return existing.id
      const draft = newOpportunityFromLead(lead, { accountId, primaryContactId: contactId }, input.opportunity)
      const row: OpportunityRow = { ...draft, id: this.store.newId("opp"), createdOn: this.now().toISOString() }
      this.store.opportunities.set(row.id, row)
      created.opportunityId = row.id
      return row.id
    })

    await step("lead", async () => {
      this.saveLead({ ...this.leadRow(leadId), status: "qualified" })
    })

    return { leadId, accountId, contactId, opportunityId }
  }

  // ---- Opportunities ----------------------------------------------------------

  async createOpportunity(input: OpportunityInput): Promise<Opportunity> {
    invalid("The Opportunity cannot be saved.", opportunityErrors(input))
    this.accountRow(input.accountId)
    if (input.primaryContactId) this.contactRow(input.primaryContactId)
    const row: OpportunityRow = {
      ...clone(input),
      probability: input.probability ?? STAGE_DEFAULT_PROBABILITY[input.stage],
      ...this.newOwned("opp"),
    }
    this.store.opportunities.set(row.id, row)
    return this.toOpportunity(row)
  }

  async updateOpportunity(id: Id, update: OpportunityUpdate): Promise<Opportunity> {
    const row = this.opportunityRow(id)
    this.requireEdit(row.ownerId)
    if (isOpportunityReadOnly(row)) throw new GatewayError("invalid", "A closed Opportunity is read-only.")
    if (update.accountId) this.accountRow(update.accountId)
    if (update.primaryContactId) this.contactRow(update.primaryContactId)
    // A blank Lead source clears it: withoutBlanks drops "" values below.
    const patch = defined(clone(update)) as Partial<OpportunityRow>
    delete patch.stage // the Stage only changes through changeStage, close and reopen
    const next: OpportunityRow = withoutBlanks({ ...row, ...patch })
    invalid("The Opportunity cannot be saved.", opportunityErrors(next as OpportunityInput))
    return this.saveOpportunity(next)
  }

  async changeStage(id: Id, stage: OpenStage): Promise<Opportunity> {
    const row = this.opportunityRow(id)
    this.requireEdit(row.ownerId)
    return this.saveOpportunity({ ...row, ...rule(() => changeStage(row, stage)) })
  }

  async closeOpportunity(id: Id, input: CloseInput): Promise<Opportunity> {
    const row = this.opportunityRow(id)
    this.requireEdit(row.ownerId)
    const change = rule(() => closeOpportunity(row, input, { today: this.today(), userId: this.userId }))
    return this.saveOpportunity({ ...row, ...change })
  }

  async reopenOpportunity(id: Id, stage: OpenStage): Promise<Opportunity> {
    const row = this.opportunityRow(id)
    this.requireEdit(row.ownerId)
    return this.saveOpportunity({ ...row, ...rule(() => reopenOpportunity(row, stage)) })
  }

  // ---- Ownership ---------------------------------------------------------------

  async reassign(record: RecordRef, newOwnerId: Id): Promise<void> {
    const row = this.ownedRow(record)
    this.requireEdit(row.ownerId)
    const newOwner = this.store.users.find((u) => u.id === newOwnerId)
    if (!newOwner?.isSalesperson) {
      throw new GatewayError("invalid", "Records can only be reassigned to a salesperson.", {
        ownerId: "Pick a salesperson.",
      })
    }
    // Read-only records (Qualified Leads, closed Opportunities) can still be reassigned.
    row.ownerId = newOwnerId
    // Open Tasks and Phone Calls move along; completed ones and Notes keep their Owner.
    // Reassigning an Account leaves its Contacts and Opportunities alone.
    for (const activity of this.store.activities.values()) {
      if (sameRecord(activity.regarding, record) && activity.kind !== "note" && !activity.completed) {
        activity.ownerId = newOwnerId
      }
    }
  }

  // ---- Activities ----------------------------------------------------------------

  async listActivities(record: RecordRef): Promise<Activity[]> {
    this.ownedRow(record)
    const activities = [...this.store.activities.values()]
      .filter((a) => sameRecord(a.regarding, record))
      .map((a) => this.toActivity(a))
    return orderTimeline(activities)
  }

  async addNote(record: RecordRef, input: NoteInput): Promise<Note> {
    this.requireEdit(this.ownedRow(record).ownerId)
    invalid("The Note cannot be saved.", noteErrors(input))
    return this.addActivity({ kind: "note", title: input.title.trim(), text: input.text, ...this.newActivity(record) })
  }

  async addTask(record: RecordRef, input: TaskInput): Promise<Task> {
    this.requireEdit(this.ownedRow(record).ownerId)
    invalid("The Task cannot be saved.", taskErrors(input))
    return this.addActivity({
      kind: "task",
      subject: input.subject.trim(),
      description: input.description,
      dueDate: input.dueDate,
      completed: false,
      ...this.newActivity(record),
    })
  }

  async addPhoneCall(record: RecordRef, input: PhoneCallInput): Promise<PhoneCall> {
    this.requireEdit(this.ownedRow(record).ownerId)
    invalid("The Phone Call cannot be saved.", phoneCallErrors(input))
    return this.addActivity({
      kind: "phoneCall",
      subject: input.subject.trim(),
      direction: input.direction,
      date: input.date,
      notes: input.notes,
      completed: input.completed ?? true,
      ...this.newActivity(record),
    })
  }

  async completeTask(taskId: Id): Promise<Task> {
    const row = this.store.activities.get(taskId)
    if (!row || row.kind !== "task") throw new GatewayError("notFound", `Task ${taskId} not found.`)
    this.requireEdit(row.ownerId)
    if (row.completed) throw new GatewayError("invalid", "This Task is already complete.")
    row.completed = true
    row.completedOn = this.now().toISOString()
    return this.toActivity(row) as Task
  }

  // ---- Helpers --------------------------------------------------------------------

  private today() {
    return toDateOnly(this.now())
  }

  private mayEdit(ownerId: Id): boolean {
    return canEdit(this.userId, ownerId, this.store.users)
  }

  private requireEdit(ownerId: Id): void {
    if (!this.mayEdit(ownerId)) {
      throw new GatewayError("forbidden", "Only the Owner or the Owner's manager can change this record.")
    }
  }

  private newOwned(prefix: string) {
    return { id: this.store.newId(prefix), ownerId: this.userId, createdOn: this.now().toISOString() }
  }

  private newActivity(record: RecordRef) {
    return {
      id: this.store.newId("act"),
      regarding: { ...record },
      ownerId: this.userId,
      createdOn: this.now().toISOString(),
    }
  }

  private addActivity<T extends ActivityRow>(row: T): Activity & { kind: T["kind"] } {
    this.store.activities.set(row.id, row)
    return this.toActivity(row) as Activity & { kind: T["kind"] }
  }

  private saveLead(row: LeadRow): Lead {
    this.store.leads.set(row.id, row)
    return this.toLead(row)
  }

  private saveOpportunity(row: OpportunityRow): Opportunity {
    this.store.opportunities.set(row.id, row)
    return this.toOpportunity(row)
  }

  private page<T extends { ownerId: Id; createdOn: string }>(
    records: T[],
    query: ListQuery<T>,
    searchable: (record: T) => Array<string | undefined>,
  ): Page<T> {
    const search = query.search?.trim().toLocaleLowerCase()
    const sort = query.sort ?? { field: "createdOn", direction: "desc" }
    const direction = sort.direction === "asc" ? 1 : -1
    const matching = records
      .filter((r) => isInView(query.view, r.ownerId, this.userId, this.store.users))
      .filter((r) => !search || searchable(r).some((v) => contains(v, search)))
      .sort((a, b) => direction * compare(a[sort.field as keyof T], b[sort.field as keyof T]))
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE
    const start = ((query.page ?? 1) - 1) * pageSize
    return { items: matching.slice(start, start + pageSize), totalCount: matching.length }
  }

  private user(id: Id): User {
    const user = this.store.users.find((u) => u.id === id)
    if (!user) throw new GatewayError("notFound", `User ${id} not found.`)
    return user
  }

  private ownerName(id: Id): string {
    return this.store.users.find((u) => u.id === id)?.fullName ?? ""
  }

  private accountRow(id: Id): AccountRow {
    const row = this.store.accounts.get(id)
    if (!row) throw new GatewayError("notFound", `Account ${id} not found.`)
    return row
  }

  private contactRow(id: Id): ContactRow {
    const row = this.store.contacts.get(id)
    if (!row) throw new GatewayError("notFound", `Contact ${id} not found.`)
    return row
  }

  private leadRow(id: Id): LeadRow {
    const row = this.store.leads.get(id)
    if (!row) throw new GatewayError("notFound", `Lead ${id} not found.`)
    return row
  }

  private opportunityRow(id: Id): OpportunityRow {
    const row = this.store.opportunities.get(id)
    if (!row) throw new GatewayError("notFound", `Opportunity ${id} not found.`)
    return row
  }

  private ownedRow(record: RecordRef): AccountRow | ContactRow | LeadRow | OpportunityRow {
    switch (record.type) {
      case "account":
        return this.accountRow(record.id)
      case "contact":
        return this.contactRow(record.id)
      case "lead":
        return this.leadRow(record.id)
      case "opportunity":
        return this.opportunityRow(record.id)
    }
  }

  private recordName(record: RecordRef): string {
    switch (record.type) {
      case "account":
        return this.store.accounts.get(record.id)?.name ?? ""
      case "opportunity":
        return this.store.opportunities.get(record.id)?.name ?? ""
      case "contact": {
        const contact = this.store.contacts.get(record.id)
        return contact ? fullName(contact) : ""
      }
      case "lead": {
        const lead = this.store.leads.get(record.id)
        return lead ? fullName(lead) : ""
      }
    }
  }

  // Readers get copies with display names filled in, as Dataverse formatted values would.

  private toAccount(row: AccountRow): Account {
    return clone({ ...row, ownerName: this.ownerName(row.ownerId) })
  }

  private toContact(row: ContactRow): Contact {
    const accountName = row.accountId ? this.store.accounts.get(row.accountId)?.name : undefined
    return clone({ ...row, ownerName: this.ownerName(row.ownerId), accountName })
  }

  private toLead(row: LeadRow): Lead {
    return clone({ ...row, ownerName: this.ownerName(row.ownerId) })
  }

  private toOpportunity(row: OpportunityRow): Opportunity {
    const contact = row.primaryContactId ? this.store.contacts.get(row.primaryContactId) : undefined
    return clone({
      ...row,
      ownerName: this.ownerName(row.ownerId),
      accountName: this.store.accounts.get(row.accountId)?.name ?? "",
      primaryContactName: contact && fullName(contact),
      closedByName: row.closedById && this.ownerName(row.closedById),
    })
  }

  private toActivity(row: ActivityRow): Activity {
    return clone({ ...row, ownerName: this.ownerName(row.ownerId), regardingName: this.recordName(row.regarding) })
  }
}

function sameRecord(a: RecordRef, b: RecordRef): boolean {
  return a.type === b.type && a.id === b.id
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === undefined || a === null) return 1
  if (b === undefined || b === null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b))
}
