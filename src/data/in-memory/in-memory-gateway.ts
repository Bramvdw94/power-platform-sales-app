import {
  SalesRuleError,
  accountErrors,
  lineAmount,
  newProductLineDefaults,
  productLineErrors,
  productLinesTotal,
  productErrors,
  defaultValidUntil,
  quoteErrors,
  quoteTotals,
  requireQuoteMove,
  canApplyLeadAction,
  canEdit,
  changeStage,
  closeOpportunity,
  contactErrors,
  defaultForecastCategory,
  defaultOpportunityName,
  effectiveForecastCategory,
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
  overrideForecastCategory,
  quotaErrors,
  quotaMonths,
  requireCanSetQuota,
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
  type DateOnly,
  type Id,
  type Lead,
  type LeadInput,
  type Note,
  type OpenStage,
  type Opportunity,
  type OpportunityInput,
  type PhoneCall,
  type Product,
  type ProductInput,
  type ProductLine,
  type ProductLineInput,
  type ProductLineUpdate,
  type PipelineFilter,
  type Quote,
  type QuoteLine,
  type QuoteLineInput,
  type QuoteLineUpdate,
  type QuoteStatus,
  type QuoteUpdate,
  type Quota,
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
  type ProductListQuery,
  type ProductUpdate,
  type PhoneCallInput,
  type QuoteDetails,
  type QualifyInput,
  type QualifyResult,
  type QualifyStep,
  type QualifySuggestions,
  type QuotaQuery,
  type SalesGateway,
  type SearchResults,
  type TaskInput,
} from "../gateway"
import type { AccountRow, ActivityRow, ContactRow, InMemorySalesStore, LeadRow, OpportunityRow, QuoteRow } from "./store"

export type InMemoryGatewayOptions = {
  /** The signed-in user. */
  userId: Id
  /** The clock; tests pass a fixed moment. */
  now?: () => Date
}

const DEFAULT_PAGE_SIZE = 50
const ESTIMATED_VALUE_FROM_LINES = "The Estimated value is the total of the Product lines. Change the lines instead."
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
      productLines: this.linesOf(id),
      quotes: this.quotesOf(id),
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

  // ---- Products -----------------------------------------------------------------

  async listProducts(query: ProductListQuery): Promise<Page<Product>> {
    const search = query.search?.trim().toLocaleLowerCase()
    const sort = query.sort ?? { field: "name", direction: "asc" }
    const direction = sort.direction === "asc" ? 1 : -1
    const matching = [...this.store.products.values()]
      .filter((p) => !query.status || p.retired === (query.status === "retired"))
      .filter((p) => !search || contains(p.name, search) || contains(p.code, search))
      .sort((a, b) => direction * compare(a[sort.field], b[sort.field]))
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE
    const start = ((query.page ?? 1) - 1) * pageSize
    return clone({ items: matching.slice(start, start + pageSize), totalCount: matching.length })
  }

  async getProduct(id: Id): Promise<Product> {
    return clone(this.productRow(id))
  }

  async createProduct(input: ProductInput): Promise<Product> {
    this.requireCatalogueManager()
    invalid("The Product cannot be saved.", { ...productErrors(input), ...this.duplicateCode(input.code) })
    const row: Product = {
      ...clone(input),
      name: input.name.trim(),
      code: input.code.trim(),
      description: input.description?.trim() || undefined,
      retired: false,
      id: this.store.newId("prod"),
      createdOn: this.now().toISOString(),
    }
    this.store.products.set(row.id, withoutBlanks(row))
    return clone(row)
  }

  async updateProduct(id: Id, update: ProductUpdate): Promise<Product> {
    this.requireCatalogueManager()
    const row = this.productRow(id)
    const next = withoutBlanks({ ...row, ...defined(clone(update)) })
    next.name = next.name?.trim()
    next.code = next.code?.trim()
    invalid("The Product cannot be saved.", { ...productErrors(next), ...this.duplicateCode(next.code, id) })
    this.store.products.set(id, next)
    return clone(next)
  }

  async retireProduct(id: Id): Promise<Product> {
    this.requireCatalogueManager()
    const row = { ...this.productRow(id), retired: true }
    this.store.products.set(id, row)
    return clone(row)
  }

  // ---- Product lines ------------------------------------------------------------

  async listProductLines(opportunityId: Id): Promise<ProductLine[]> {
    this.opportunityRow(opportunityId)
    return this.linesOf(opportunityId)
  }

  async addProductLine(opportunityId: Id, input: ProductLineInput): Promise<ProductLine> {
    const opportunity = this.editableOpportunityForLines(opportunityId)
    const product = this.productRow(input.productId)
    if (product.retired) throw new GatewayError("invalid", "The Product line cannot be saved.", { productId: "A retired Product can't be added." })
    const defaults = newProductLineDefaults(product)
    const values = {
      quantity: input.quantity,
      unitPrice: input.unitPrice ?? defaults.unitPrice,
      discountPercent: input.discountPercent ?? defaults.discountPercent,
    }
    invalid("The Product line cannot be saved.", productLineErrors(values))
    const row: ProductLine = {
      id: this.store.newId("line"),
      opportunityId,
      productId: product.id,
      productName: product.name,
      description: input.description?.trim() || (input.description === undefined ? defaults.description : undefined),
      ...values,
      listPriceAtAdd: product.listPrice,
      lineAmount: lineAmount(values.quantity, values.unitPrice, values.discountPercent),
      createdOn: this.now().toISOString(),
    }
    this.store.productLines.set(row.id, withoutBlanks(row))
    this.syncEstimatedValue(opportunity)
    return clone(row)
  }

  async updateProductLine(id: Id, update: ProductLineUpdate): Promise<ProductLine> {
    const line = this.lineRow(id)
    const opportunity = this.editableOpportunityForLines(line.opportunityId)
    const next: ProductLine = withoutBlanks({ ...line, ...defined(clone(update)) })
    invalid("The Product line cannot be saved.", productLineErrors(next))
    next.lineAmount = lineAmount(next.quantity, next.unitPrice, next.discountPercent)
    this.store.productLines.set(id, next)
    this.syncEstimatedValue(opportunity)
    return clone(next)
  }

  async removeProductLine(id: Id): Promise<void> {
    const line = this.lineRow(id)
    const opportunity = this.editableOpportunityForLines(line.opportunityId)
    this.store.productLines.delete(id)
    this.syncEstimatedValue(opportunity)
  }

  // ---- Quotes ---------------------------------------------------------------------

  async listQuotes(opportunityId: Id): Promise<Quote[]> {
    this.opportunityRow(opportunityId)
    return this.quotesOf(opportunityId)
  }

  async getQuote(id: Id): Promise<QuoteDetails> {
    const row = this.quoteRow(id)
    const opportunity = this.opportunityRow(row.opportunityId)
    const contact = row.contactId ? this.store.contacts.get(row.contactId) : undefined
    return {
      quote: this.toQuote(row),
      lines: this.quoteLinesOf(id),
      opportunity: this.toOpportunity(opportunity),
      contact: contact && this.toContact(contact),
      canEdit: this.mayEdit(row.ownerId),
    }
  }

  async createQuote(opportunityId: Id): Promise<Quote> {
    const opportunity = this.opportunityRow(opportunityId)
    this.requireEdit(opportunity.ownerId)
    if (isOpportunityReadOnly(opportunity)) throw new GatewayError("invalid", "A closed Opportunity can't get new Quotes.")
    const row: QuoteRow = {
      id: this.store.newId("quote"),
      opportunityId,
      number: this.store.nextQuoteNumber(),
      revision: 0,
      status: "draft",
      accountId: opportunity.accountId,
      contactId: opportunity.primaryContactId,
      validUntil: defaultValidUntil(this.today()),
      netTotal: 0,
      vat21: 0,
      vat9: 0,
      grossTotal: 0,
      ownerId: opportunity.ownerId,
      createdOn: this.now().toISOString(),
    }
    this.store.quotes.set(row.id, withoutBlanks(row))
    for (const line of this.linesOf(opportunityId)) {
      const product = this.productRow(line.productId)
      this.addCopiedLine(row.id, { ...line, vatRate: product.vatRate })
    }
    return this.toQuote(this.syncQuoteTotals(row.id))
  }

  async updateQuote(id: Id, update: QuoteUpdate): Promise<Quote> {
    const row = this.draftQuote(id)
    if (update.contactId) this.contactRow(update.contactId)
    invalid("The Quote cannot be saved.", quoteErrors(update))
    const next = withoutBlanks({
      ...row,
      ...defined(clone({ contactId: update.contactId, validUntil: update.validUntil })),
    }) as QuoteRow
    this.store.quotes.set(id, next)
    return this.toQuote(next)
  }

  async deleteQuote(id: Id): Promise<void> {
    this.draftQuote(id)
    for (const line of this.quoteLinesOf(id)) this.store.quoteLines.delete(line.id)
    this.store.quotes.delete(id)
  }

  async addQuoteLine(quoteId: Id, input: QuoteLineInput): Promise<QuoteLine> {
    this.draftQuote(quoteId)
    const product = this.productRow(input.productId)
    if (product.retired) throw new GatewayError("invalid", "The Quote line cannot be saved.", { productId: "A retired Product can't be added." })
    const defaults = newProductLineDefaults(product)
    const values = {
      quantity: input.quantity,
      unitPrice: input.unitPrice ?? defaults.unitPrice,
      discountPercent: input.discountPercent ?? defaults.discountPercent,
    }
    invalid("The Quote line cannot be saved.", productLineErrors(values))
    const line = this.addCopiedLine(quoteId, {
      productId: product.id,
      productName: product.name,
      description: input.description?.trim() || (input.description === undefined ? defaults.description : undefined),
      ...values,
      vatRate: product.vatRate,
    })
    this.syncQuoteTotals(quoteId)
    return clone(line)
  }

  async updateQuoteLine(id: Id, update: QuoteLineUpdate): Promise<QuoteLine> {
    const line = this.quoteLineRow(id)
    this.draftQuote(line.quoteId)
    const next: QuoteLine = withoutBlanks({ ...line, ...defined(clone(update)) })
    invalid("The Quote line cannot be saved.", productLineErrors(next))
    next.lineAmount = lineAmount(next.quantity, next.unitPrice, next.discountPercent)
    this.store.quoteLines.set(id, next)
    this.syncQuoteTotals(line.quoteId)
    return clone(next)
  }

  async removeQuoteLine(id: Id): Promise<void> {
    const line = this.quoteLineRow(id)
    this.draftQuote(line.quoteId)
    this.store.quoteLines.delete(id)
    this.syncQuoteTotals(line.quoteId)
  }

  async sendQuote(id: Id): Promise<Quote> {
    const row = this.movableQuote(id, "sent")
    const sent: QuoteRow = { ...row, status: "sent", sentOn: this.now().toISOString(), sentById: this.userId }
    this.store.quotes.set(id, sent)
    return this.toQuote(sent)
  }

  async reviseQuote(id: Id): Promise<Quote> {
    const row = this.movableQuote(id, "revised")
    const draft: QuoteRow = {
      ...row,
      id: this.store.newId("quote"),
      revision: row.revision + 1,
      status: "draft",
      validUntil: defaultValidUntil(this.today()),
      sentOn: undefined,
      sentById: undefined,
      createdOn: this.now().toISOString(),
    }
    this.store.quotes.set(draft.id, withoutBlanks(draft))
    for (const line of this.quoteLinesOf(id)) this.addCopiedLine(draft.id, line)
    this.store.quotes.set(id, { ...row, status: "revised" })
    return this.toQuote(this.syncQuoteTotals(draft.id))
  }

  async acceptQuote(id: Id): Promise<Quote> {
    const row = this.movableQuote(id, "accepted")
    const accepted: QuoteRow = { ...row, status: "accepted" }
    this.store.quotes.set(id, accepted)
    for (const other of this.store.quotes.values()) {
      if (other.opportunityId === row.opportunityId && other.id !== id && other.status === "sent") {
        this.store.quotes.set(other.id, { ...other, status: "rejected" })
      }
    }
    return this.toQuote(accepted)
  }

  async rejectQuote(id: Id): Promise<Quote> {
    const row = this.movableQuote(id, "rejected")
    const rejected: QuoteRow = { ...row, status: "rejected" }
    this.store.quotes.set(id, rejected)
    return this.toQuote(rejected)
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
    const next = withoutBlanks({ ...row, ...defined(clone(update)) }) as AccountRow
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
      forecastCategory: input.forecastCategory ?? defaultForecastCategory(input.stage),
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
    if (patch.forecastCategory) patch.forecastCategory = rule(() => overrideForecastCategory(row, patch.forecastCategory!))
    if (patch.estimatedValue !== undefined && patch.estimatedValue !== row.estimatedValue && this.linesOf(id).length > 0) {
      invalid("The Opportunity cannot be saved.", { estimatedValue: ESTIMATED_VALUE_FROM_LINES })
    }
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
    const closed = this.saveOpportunity({ ...row, ...change })
    if (input.outcome === "lost") {
      for (const quote of this.store.quotes.values()) {
        if (quote.opportunityId === id && quote.status === "sent") this.store.quotes.set(quote.id, { ...quote, status: "rejected" })
      }
    }
    return closed
  }

  async reopenOpportunity(id: Id, stage: OpenStage): Promise<Opportunity> {
    const row = this.opportunityRow(id)
    this.requireEdit(row.ownerId)
    return this.saveOpportunity({ ...row, ...rule(() => reopenOpportunity(row, stage)) })
  }

  // ---- Quotas ------------------------------------------------------------------

  async listQuotas(query: QuotaQuery): Promise<Quota[]> {
    const reports = directReportIds(this.userId, this.store.users)
    const people = query.scope === "me" ? [this.userId] : [this.userId, ...reports]
    const last = quotaMonths(query.from, query.months).at(-1) ?? query.from
    return [...this.store.quotas.values()]
      .filter((q) => people.includes(q.salespersonId) && q.month >= query.from && q.month <= last)
      .sort((a, b) => a.month.localeCompare(b.month) || this.ownerName(a.salespersonId).localeCompare(this.ownerName(b.salespersonId)))
      .map((q) => clone({ ...q, salespersonName: this.ownerName(q.salespersonId) }))
  }

  async setQuota(salespersonId: Id, month: DateOnly, amount: number): Promise<Quota> {
    const person = this.store.users.find((u) => u.id === salespersonId)
    if (!person) throw new GatewayError("notFound", "That salesperson does not exist.")
    try {
      requireCanSetQuota(this.user(this.userId), person)
    } catch (error) {
      if (error instanceof SalesRuleError) throw new GatewayError("forbidden", error.message)
      throw error
    }
    const errors = quotaErrors({ month, amount })
    invalid("The Quota cannot be saved.", errors)
    const existing = [...this.store.quotas.values()].find((q) => q.salespersonId === salespersonId && q.month === month)
    const row = existing ?? { id: this.store.newId("quota"), salespersonId, month, amount }
    row.amount = amount
    this.store.quotas.set(row.id, row)
    return clone({ ...row, salespersonName: person.fullName })
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
    // A Quote follows its Opportunity's Owner, also once sent.
    if (record.type === "opportunity") {
      for (const quote of this.store.quotes.values()) {
        if (quote.opportunityId === record.id) quote.ownerId = newOwnerId
      }
    }
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

  async listAccountTimeline(accountId: Id): Promise<Activity[]> {
    this.accountRow(accountId)
    const opportunities = [...this.store.opportunities.values()].filter((o) => o.accountId === accountId)
    const sources: RecordRef[] = [
      { type: "account", id: accountId },
      ...[...this.store.contacts.values()].filter((c) => c.accountId === accountId).map((c): RecordRef => ({ type: "contact", id: c.id })),
      ...opportunities.map((o): RecordRef => ({ type: "opportunity", id: o.id })),
      ...opportunities.flatMap((o): RecordRef[] => (o.originatingLeadId ? [{ type: "lead", id: o.originatingLeadId }] : [])),
    ]
    const activities = [...this.store.activities.values()]
      .filter((a) => sources.some((s) => sameRecord(a.regarding, s)))
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

  private linesOf(opportunityId: Id): ProductLine[] {
    return clone(
      [...this.store.productLines.values()]
        .filter((l) => l.opportunityId === opportunityId)
        .sort((a, b) => a.createdOn.localeCompare(b.createdOn) || a.id.localeCompare(b.id)),
    )
  }

  private lineRow(id: Id): ProductLine {
    const row = this.store.productLines.get(id)
    if (!row) throw new GatewayError("notFound", `Product line ${id} not found.`)
    return row
  }

  /** Lines follow the Opportunity: its Owner or the Owner's manager changes them, and not once it is closed. */
  private editableOpportunityForLines(opportunityId: Id): OpportunityRow {
    const opportunity = this.opportunityRow(opportunityId)
    this.requireEdit(opportunity.ownerId)
    if (isOpportunityReadOnly(opportunity)) {
      throw new GatewayError("invalid", "A closed Opportunity's Product lines are read-only.")
    }
    return opportunity
  }

  /** What the plug-in does in Dataverse: the Estimated value is the lines' total; with no lines it stays as it was. */
  private syncEstimatedValue(opportunity: OpportunityRow): void {
    const lines = this.linesOf(opportunity.id)
    if (lines.length === 0) return
    this.store.opportunities.set(opportunity.id, { ...opportunity, estimatedValue: productLinesTotal(lines) })
  }

  private quotesOf(opportunityId: Id): Quote[] {
    return [...this.store.quotes.values()]
      .filter((q) => q.opportunityId === opportunityId)
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn) || b.id.localeCompare(a.id))
      .map((q) => this.toQuote(q))
  }

  private quoteRow(id: Id): QuoteRow {
    const row = this.store.quotes.get(id)
    if (!row) throw new GatewayError("notFound", `Quote ${id} not found.`)
    return row
  }

  private quoteLinesOf(quoteId: Id): QuoteLine[] {
    return clone(
      [...this.store.quoteLines.values()]
        .filter((l) => l.quoteId === quoteId)
        .sort((a, b) => a.createdOn.localeCompare(b.createdOn) || a.id.localeCompare(b.id)),
    )
  }

  private quoteLineRow(id: Id): QuoteLine {
    const row = this.store.quoteLines.get(id)
    if (!row) throw new GatewayError("notFound", `Quote line ${id} not found.`)
    return row
  }

  /** A Quote its Owner or manager may change, while it is a Draft on an open Opportunity. */
  private draftQuote(id: Id): QuoteRow {
    const row = this.quoteRow(id)
    this.requireEdit(row.ownerId)
    if (row.status !== "draft") throw new GatewayError("invalid", "Only a Draft Quote can be changed.")
    this.requireOpenOpportunityOfQuote(row)
    return row
  }

  /** A Quote moving to another status: allowed by the rules, by this user, on an open Opportunity. */
  private movableQuote(id: Id, to: QuoteStatus): QuoteRow {
    const row = this.quoteRow(id)
    this.requireEdit(row.ownerId)
    rule(() => requireQuoteMove(row.status, to))
    this.requireOpenOpportunityOfQuote(row)
    return row
  }

  private requireOpenOpportunityOfQuote(row: QuoteRow): void {
    if (isOpportunityReadOnly(this.opportunityRow(row.opportunityId))) {
      throw new GatewayError("invalid", "A closed Opportunity's Quotes are read-only.")
    }
  }

  private addCopiedLine(quoteId: Id, line: Pick<QuoteLine, "productId" | "productName" | "description" | "quantity" | "unitPrice" | "discountPercent" | "vatRate">): QuoteLine {
    const row: QuoteLine = withoutBlanks({
      id: this.store.newId("qline"),
      quoteId,
      productId: line.productId,
      productName: line.productName,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      vatRate: line.vatRate,
      lineAmount: lineAmount(line.quantity, line.unitPrice, line.discountPercent),
      createdOn: this.now().toISOString(),
    })
    this.store.quoteLines.set(row.id, row)
    return row
  }

  /** What the plug-in does in Dataverse: the totals are the lines' net, VAT per rate and gross. */
  private syncQuoteTotals(quoteId: Id): QuoteRow {
    const totals = quoteTotals(this.quoteLinesOf(quoteId))
    const vat = (rate: number) => totals.byRate.find((l) => l.rate === rate)?.vat ?? 0
    const next: QuoteRow = { ...this.quoteRow(quoteId), netTotal: totals.net, vat21: vat(21), vat9: vat(9), grossTotal: totals.gross }
    this.store.quotes.set(quoteId, next)
    return next
  }

  private requireCatalogueManager(): void {
    if (!this.user(this.userId).isCatalogueManager) {
      throw new GatewayError("forbidden", "Only a Catalogue manager can change Products.")
    }
  }

  private productRow(id: Id): Product {
    const row = this.store.products.get(id)
    if (!row) throw new GatewayError("notFound", `Product ${id} not found.`)
    return row
  }

  /** The Product code is unique, compared without regard to case or surrounding spaces. */
  private duplicateCode(code: string | undefined, exceptId?: Id): FieldErrors {
    const wanted = code?.trim().toLocaleLowerCase()
    if (!wanted) return {}
    const clash = [...this.store.products.values()].some((p) => p.id !== exceptId && p.code.toLocaleLowerCase() === wanted)
    return clash ? { code: "This Product code is already used." } : {}
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
      forecastCategory: effectiveForecastCategory(row),
      ownerName: this.ownerName(row.ownerId),
      accountName: this.store.accounts.get(row.accountId)?.name ?? "",
      primaryContactName: contact && fullName(contact),
      closedByName: row.closedById && this.ownerName(row.closedById),
    })
  }

  private toQuote(row: QuoteRow): Quote {
    const contact = row.contactId ? this.store.contacts.get(row.contactId) : undefined
    return clone({
      ...row,
      ownerName: this.ownerName(row.ownerId),
      accountName: this.store.accounts.get(row.accountId)?.name ?? "",
      contactName: contact && fullName(contact),
      sentByName: row.sentById && this.ownerName(row.sentById),
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
