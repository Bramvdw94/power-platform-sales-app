// Domain types for the sales app. Terms follow GLOSSARY.md.
// Date-only values (Expected close date, close date, due date) are ISO
// "YYYY-MM-DD" strings; moments in time are full ISO timestamps.

export type Id = string
export type DateOnly = string
export type Timestamp = string

export type User = {
  id: Id
  fullName: string
  email: string
  /** The user's manager; their manager may edit and Reassign their records. */
  managerId: Id | null
  /** Holds the SalesApp Salesperson role, so records can be Reassigned to them. */
  isSalesperson: boolean
}

export const LEAD_SOURCES = ["website", "referral", "event", "coldOutreach", "partner", "other"] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_STATUSES = ["notContacted", "working", "qualified", "disqualified"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const DISQUALIFY_REASONS = ["noBudget", "noNeed", "cantReachThem", "choseCompetitor", "duplicate", "other"] as const
export type DisqualifyReason = (typeof DISQUALIFY_REASONS)[number]

export const STAGES = ["qualification", "needsAnalysis", "proposal", "negotiation", "closedWon", "closedLost"] as const
export type Stage = (typeof STAGES)[number]

export const OPEN_STAGES = ["qualification", "needsAnalysis", "proposal", "negotiation"] as const
export type OpenStage = (typeof OPEN_STAGES)[number]
export type ClosedStage = Exclude<Stage, OpenStage>

export const LOST_REASONS = ["price", "choseCompetitor", "noBudget", "noDecision", "other"] as const
export type LostReason = (typeof LOST_REASONS)[number]

export type RecordType = "lead" | "opportunity" | "account" | "contact"
export type RecordRef = { type: RecordType; id: Id }

/** Fields every Lead, Opportunity, Account and Contact has. */
type Owned = {
  id: Id
  ownerId: Id
  /** Display name of the Owner, as Dataverse returns it in formatted values. */
  ownerName: string
  createdOn: Timestamp
}

export type Account = Owned & {
  name: string
  website?: string
  phone?: string
  street?: string
  city?: string
  postcode?: string
  country?: string
  description?: string
}

export type Contact = Owned & {
  firstName?: string
  lastName: string
  jobTitle?: string
  accountId?: Id
  accountName?: string
  email?: string
  phone?: string
  mobile?: string
}

export type Lead = Owned & {
  firstName?: string
  lastName: string
  company: string
  jobTitle?: string
  email?: string
  phone?: string
  website?: string
  leadSource?: LeadSource
  description?: string
  status: LeadStatus
  disqualifyReason?: DisqualifyReason
  disqualifyComment?: string
  disqualifiedOn?: Timestamp
  disqualifiedById?: Id
}

export type Opportunity = Owned & {
  name: string
  accountId: Id
  accountName: string
  primaryContactId?: Id
  primaryContactName?: string
  stage: Stage
  /** Percentage 0-100. Defaults from the Stage; the Owner may override it. */
  probability: number
  /** In euros. */
  estimatedValue: number
  expectedCloseDate: DateOnly
  nextStep?: string
  description?: string
  leadSource?: LeadSource
  originatingLeadId?: Id
  /** In euros; set when Closed Won. */
  actualValue?: number
  closeDate?: DateOnly
  lostReason?: LostReason
  lostComment?: string
  closedById?: Id
}

type ActivityBase = {
  id: Id
  regarding: RecordRef
  /** Display name of the record the activity is about. */
  regardingName: string
  ownerId: Id
  ownerName: string
  createdOn: Timestamp
}

export type Note = ActivityBase & {
  kind: "note"
  title: string
  text: string
}

export type Task = ActivityBase & {
  kind: "task"
  subject: string
  description?: string
  dueDate?: DateOnly
  completed: boolean
  completedOn?: Timestamp
}

export type PhoneCallDirection = "incoming" | "outgoing"

export type PhoneCall = ActivityBase & {
  kind: "phoneCall"
  subject: string
  direction: PhoneCallDirection
  date: DateOnly
  notes?: string
  /** A logged call is completed; an open one is a planned call. */
  completed: boolean
}

export type Activity = Note | Task | PhoneCall

// What a caller supplies to create a record. The Owner is always the current
// user on create, so it is not part of the input.

export type AccountInput = Omit<Account, keyof Owned>

export type ContactInput = Omit<Contact, keyof Owned | "accountName">

export type LeadInput = Omit<
  Lead,
  keyof Owned | "status" | "disqualifyReason" | "disqualifyComment" | "disqualifiedOn" | "disqualifiedById"
>

export type OpportunityInput = {
  name: string
  accountId: Id
  primaryContactId?: Id
  /** An open Stage; Closed Won and Closed Lost are reached only by Close. */
  stage: OpenStage
  /** Defaults to the Stage's default Probability. */
  probability?: number
  estimatedValue: number
  expectedCloseDate: DateOnly
  nextStep?: string
  description?: string
  leadSource?: LeadSource
}
