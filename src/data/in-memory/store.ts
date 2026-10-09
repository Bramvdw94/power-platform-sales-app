import type { Account, Activity, Contact, Id, Lead, Opportunity, User } from "@/sales"

// What the in-memory store keeps: records without the display names that
// Dataverse returns as formatted values. The gateway adds those on read.

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type AccountRow = Omit<Account, "ownerName">
export type ContactRow = Omit<Contact, "ownerName" | "accountName">
export type LeadRow = Omit<Lead, "ownerName">
export type OpportunityRow = Omit<Opportunity, "ownerName" | "accountName" | "primaryContactName" | "closedByName">
export type ActivityRow = DistributiveOmit<Activity, "ownerName" | "regardingName">

export type InMemoryData = {
  users: User[]
  accounts: AccountRow[]
  contacts: ContactRow[]
  leads: LeadRow[]
  opportunities: OpportunityRow[]
  activities: ActivityRow[]
}

/** Shared state behind one or more in-memory gateways (one per signed-in user). */
export class InMemorySalesStore {
  readonly users: User[]
  readonly accounts = new Map<Id, AccountRow>()
  readonly contacts = new Map<Id, ContactRow>()
  readonly leads = new Map<Id, LeadRow>()
  readonly opportunities = new Map<Id, OpportunityRow>()
  readonly activities = new Map<Id, ActivityRow>()
  private sequence = 0

  constructor(data: InMemoryData) {
    const copy = structuredClone(data)
    this.users = copy.users
    for (const row of copy.accounts) this.accounts.set(row.id, row)
    for (const row of copy.contacts) this.contacts.set(row.id, row)
    for (const row of copy.leads) this.leads.set(row.id, row)
    for (const row of copy.opportunities) this.opportunities.set(row.id, row)
    for (const row of copy.activities) this.activities.set(row.id, row)
  }

  newId(prefix: string): Id {
    this.sequence += 1
    return `${prefix}-new-${this.sequence}`
  }
}
