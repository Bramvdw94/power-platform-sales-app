import type { Account, Activity, Contact, Id, Lead, Opportunity, Product, ProductLine, Quota, Quote, QuoteLine, User } from "@/sales"

// What the in-memory store keeps: records without the display names that
// Dataverse returns as formatted values. The gateway adds those on read.

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type AccountRow = Omit<Account, "ownerName">
export type ContactRow = Omit<Contact, "ownerName" | "accountName">
export type LeadRow = Omit<Lead, "ownerName">
export type OpportunityRow = Omit<Opportunity, "ownerName" | "accountName" | "primaryContactName" | "closedByName">
export type QuotaRow = Omit<Quota, "salespersonName">
export type QuoteRow = Omit<Quote, "ownerName" | "accountName" | "contactName" | "sentByName">
export type ActivityRow = DistributiveOmit<Activity, "ownerName" | "regardingName">

export type InMemoryData = {
  users: User[]
  accounts: AccountRow[]
  contacts: ContactRow[]
  leads: LeadRow[]
  opportunities: OpportunityRow[]
  activities: ActivityRow[]
  products: Product[]
  quotas?: QuotaRow[]
  productLines?: ProductLine[]
  quotes?: QuoteRow[]
  quoteLines?: QuoteLine[]
}

/** Shared state behind one or more in-memory gateways (one per signed-in user). */
export class InMemorySalesStore {
  readonly users: User[]
  readonly accounts = new Map<Id, AccountRow>()
  readonly contacts = new Map<Id, ContactRow>()
  readonly leads = new Map<Id, LeadRow>()
  readonly opportunities = new Map<Id, OpportunityRow>()
  readonly activities = new Map<Id, ActivityRow>()
  readonly products = new Map<Id, Product>()
  readonly quotas = new Map<Id, QuotaRow>()
  readonly productLines = new Map<Id, ProductLine>()
  readonly quotes = new Map<Id, QuoteRow>()
  readonly quoteLines = new Map<Id, QuoteLine>()
  private sequence = 0

  constructor(data: InMemoryData) {
    const copy = structuredClone(data)
    this.users = copy.users
    for (const row of copy.accounts) this.accounts.set(row.id, row)
    for (const row of copy.contacts) this.contacts.set(row.id, row)
    for (const row of copy.leads) this.leads.set(row.id, row)
    for (const row of copy.opportunities) this.opportunities.set(row.id, row)
    for (const row of copy.activities) this.activities.set(row.id, row)
    for (const row of copy.products) this.products.set(row.id, row)
    for (const row of copy.quotas ?? []) this.quotas.set(row.id, row)
    for (const row of copy.productLines ?? []) this.productLines.set(row.id, row)
    for (const row of copy.quotes ?? []) this.quotes.set(row.id, row)
    for (const row of copy.quoteLines ?? []) this.quoteLines.set(row.id, row)
  }

  /** The next Quote number: Q-00001, then one more than the highest in use. */
  nextQuoteNumber(): string {
    const highest = Math.max(0, ...[...this.quotes.values()].map((q) => Number(q.number.replace(/\D/g, "")) || 0))
    return `Q-${String(highest + 1).padStart(5, "0")}`
  }

  newId(prefix: string): Id {
    this.sequence += 1
    return `${prefix}-new-${this.sequence}`
  }
}
