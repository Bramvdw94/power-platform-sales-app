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
  /** Holds the SalesApp Catalogue Manager role: creates, edits and retires Products. */
  isCatalogueManager: boolean
  /** Holds the SalesApp Process Builder role: builds Processes and Business rules, and may Switch Process. */
  isProcessBuilder: boolean
  /** Holds Dataverse's System Administrator role: may do everything, and counts as the manager of every salesperson. */
  isAdministrator?: boolean
  /** The business phone on the user's record, printed on a Quote PDF. */
  phone?: string
}

export const PRODUCT_UNITS = ["piece", "hour", "day", "month", "year"] as const
export type ProductUnit = (typeof PRODUCT_UNITS)[number]

/** VAT rates in percent, in the order of the Dataverse choice. */
export const VAT_RATES = [21, 9, 0] as const
export type VatRate = (typeof VAT_RATES)[number]

/** Something we sell, with one euro List price excluding VAT. Organisation-owned: no Owner. */
export type Product = {
  id: Id
  name: string
  /** Unique across Products, compared without regard to case. */
  code: string
  description?: string
  unit: ProductUnit
  listPrice: number
  vatRate: VatRate
  /** Retired Products can't be added to new lines; existing lines keep them. */
  retired: boolean
  createdOn: Timestamp
}

export type ProductInput = {
  name: string
  code: string
  description?: string
  unit: ProductUnit
  listPrice: number
  vatRate: VatRate
}

export const ACCOUNT_TYPES = ["prospect", "customer", "partner", "reseller", "supplier", "competitor", "other"] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** Dataverse's standard Industry list, in its own order (code = position + 1). */
export const INDUSTRIES = [
  "accounting", "agriculture", "broadcastingPublishing", "brokers", "buildingSupplyRetail", "businessServices",
  "consulting", "consumerServices", "design", "distributors", "medicalOffices", "durableManufacturing",
  "eatingDrinking", "entertainmentRetail", "equipmentRental", "financial", "foodTobacco", "capitalIntensiveProcessing",
  "repairServices", "insurance", "legalServices", "nonDurableRetail", "outboundConsumerService", "petrochemical",
  "serviceRetail", "sigAffiliations", "socialServices", "tradeContractors", "specialtyRealty", "transportation",
  "utilities", "vehicleRetail", "wholesale",
] as const
export type Industry = (typeof INDUSTRIES)[number]

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

export const FORECAST_CATEGORIES = ["pipeline", "bestCase", "commit", "omitted"] as const
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number]

export const LEAD_RATINGS = ["hot", "warm", "cold"] as const
export type LeadRating = (typeof LEAD_RATINGS)[number]

/** Whether a Lead's Rating came from a rule or was set by hand. */
export const RATING_SOURCES = ["rule", "hand"] as const
export type RatingSource = (typeof RATING_SOURCES)[number]

export const APPROVAL_STATUSES = ["none", "pending", "approved", "rejected"] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

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
  /** When the latest Activity on the record happened; kept by a plug-in, blank until there is one. */
  lastActivityOn?: Timestamp
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
  accountType?: AccountType
  industry?: Industry
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

/** Where a Lead or Opportunity stands in its Process; all blank when it follows none. */
export type ProcessState = {
  /** The Process version the record started on. */
  processVersionId?: Id
  currentStepId?: string
  stepEnteredOn?: Timestamp
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
  rating?: LeadRating
  ratingSource?: RatingSource
  /** Points a scoring rule gave the Lead. */
  score?: number
  /** Another Lead or Contact looks like the same person. */
  possibleDuplicate?: boolean
  /** When the Owner first got in touch. */
  firstTouchOn?: Timestamp
} & ProcessState

export type Opportunity = Owned & {
  name: string
  accountId: Id
  accountName: string
  primaryContactId?: Id
  primaryContactName?: string
  stage: Stage
  /** Percentage 0-100. Defaults from the Stage; the Owner may override it. */
  probability: number
  /** How firmly the Owner counts on it. Open Opportunities only: defaults from the Stage, the Owner may override it. */
  forecastCategory?: ForecastCategory
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
  /** Display name of who closed it, as Dataverse returns it in formatted values. */
  closedByName?: string
} & ProcessState

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
  /** The Process Action that created this Task, if one did. */
  actionId?: string
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
  /** Defaults to the Stage's default Forecast category. */
  forecastCategory?: ForecastCategory
  estimatedValue: number
  expectedCloseDate: DateOnly
  nextStep?: string
  description?: string
  leadSource?: LeadSource
}

/** What a salesperson is expected to win in one month, in euros. */
export type Quota = {
  id: Id
  salespersonId: Id
  salespersonName: string
  /** Always the first day of the month. */
  month: DateOnly
  amount: number
}

/** One Product on an Opportunity. Amounts are in euros excluding VAT. */
export type ProductLine = {
  id: Id
  opportunityId: Id
  productId: Id
  productName: string
  /** Copied from the Product when added; the Owner may change it. */
  description?: string
  /** Positive, up to 2 decimals. */
  quantity: number
  /** Starts at the Product's List price; the Owner may change it. */
  unitPrice: number
  /** The Product's List price when the line was added. Never changes. */
  listPriceAtAdd: number
  /** Percentage 0-100. */
  discountPercent: number
  /** Quantity x unit price x (1 - discount %), rounded to cents. */
  lineAmount: number
  createdOn: Timestamp
}

/** The unit price and description default to the Product's; the discount to 0. */
export type ProductLineInput = {
  productId: Id
  description?: string
  quantity: number
  unitPrice?: number
  discountPercent?: number
}

/** A blank description clears it. The Product never changes: remove the line and add another. */
export type ProductLineUpdate = Partial<Pick<ProductLine, "description" | "quantity" | "unitPrice" | "discountPercent">>

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "revised"] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

/**
 * A priced offer to a customer, made from an Opportunity. Amounts are in euros.
 * The Owner is always the Opportunity's Owner. Only a Draft can change.
 */
export type Quote = {
  id: Id
  opportunityId: Id
  /** Q-00001: kept by every Revision of the Quote. */
  number: string
  /** 0 for a new Quote; Revise keeps the number and adds 1. */
  revision: number
  status: QuoteStatus
  accountId: Id
  accountName: string
  contactId?: Id
  contactName?: string
  validUntil?: DateOnly
  /** The lines' amounts added up, excluding VAT. */
  netTotal: number
  /** VAT at 21 % and 9 % on the net total of the lines at that rate, rounded to cents. 0 % adds none. */
  vat21: number
  vat9: number
  grossTotal: number
  sentOn?: Timestamp
  sentById?: Id
  sentByName?: string
  /** How the Quote was sent: from the sender's Outlook, or downloaded to send by hand. */
  sentVia?: QuoteSendRoute
  /** The address an emailed Quote went to. */
  sentTo?: string
  /** The Quote template the PDF is drawn with; blank means the Default template. */
  templateId?: Id
  templateName?: string
  /** The exact PDF the customer received is stored on the Quote. */
  hasStoredPdf: boolean
  /** Where the Quote stands in discount approval. */
  approvalStatus?: ApprovalStatus
  ownerId: Id
  ownerName: string
  createdOn: Timestamp
}

export type QuoteSendRoute = "email" | "download"

/** One Product on a Quote. Amounts are in euros excluding VAT. */
export type QuoteLine = {
  id: Id
  quoteId: Id
  productId: Id
  productName: string
  description?: string
  quantity: number
  unitPrice: number
  /** Percentage 0-100. */
  discountPercent: number
  /** The Product's list price when the line was added. */
  listPriceAtAdd?: number
  /** The Product's VAT rate when the line was added. */
  vatRate: VatRate
  /** Quantity x unit price x (1 - discount %), rounded to cents. */
  lineAmount: number
  createdOn: Timestamp
}

/** The unit price and description default to the Product's; the discount to 0. */
export type QuoteLineInput = ProductLineInput
export type QuoteLineUpdate = ProductLineUpdate

/** A Contact change and a new Valid until, while the Quote is a Draft. A blank Contact clears it. */
export type QuoteUpdate = { contactId?: Id | ""; validUntil?: DateOnly; templateId?: Id }
