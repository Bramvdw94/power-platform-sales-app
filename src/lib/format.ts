import type { AccountType, DisqualifyReason, ForecastCategory, Industry, LeadSource, LeadStatus, LostReason, Opportunity, ProductUnit, RecordRef, RecordType, Stage, VatRate } from "@/sales"

// Display formatting shared by list and record pages. Terms follow GLOSSARY.md.

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  notContacted: "Not Contacted",
  working: "Working",
  qualified: "Qualified",
  disqualified: "Disqualified",
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  prospect: "Prospect",
  customer: "Customer",
  partner: "Partner",
  reseller: "Reseller",
  supplier: "Supplier",
  competitor: "Competitor",
  other: "Other",
}

export const INDUSTRY_LABELS: Record<Industry, string> = {
  accounting: "Accounting",
  agriculture: "Agriculture and Non-petrol Natural Resource Extraction",
  broadcastingPublishing: "Broadcasting Printing and Publishing",
  brokers: "Brokers",
  buildingSupplyRetail: "Building Supply Retail",
  businessServices: "Business Services",
  consulting: "Consulting",
  consumerServices: "Consumer Services",
  design: "Design, Direction and Creative Management",
  distributors: "Distributors, Dispatchers and Processors",
  medicalOffices: "Doctor's Offices and Clinics",
  durableManufacturing: "Durable Manufacturing",
  eatingDrinking: "Eating and Drinking Places",
  entertainmentRetail: "Entertainment Retail",
  equipmentRental: "Equipment Rental and Leasing",
  financial: "Financial",
  foodTobacco: "Food and Tobacco Processing",
  capitalIntensiveProcessing: "Inbound Capital Intensive Processing",
  repairServices: "Inbound Repair and Services",
  insurance: "Insurance",
  legalServices: "Legal Services",
  nonDurableRetail: "Non-Durable Merchandise Retail",
  outboundConsumerService: "Outbound Consumer Service",
  petrochemical: "Petrochemical Extraction and Distribution",
  serviceRetail: "Service Retail",
  sigAffiliations: "SIG Affiliations",
  socialServices: "Social Services",
  tradeContractors: "Special Outbound Trade Contractors",
  specialtyRealty: "Specialty Realty",
  transportation: "Transportation",
  utilities: "Utility Creation and Distribution",
  vehicleRetail: "Vehicle Retail",
  wholesale: "Wholesale",
}

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website: "Website",
  referral: "Referral",
  event: "Event",
  coldOutreach: "Cold outreach",
  partner: "Partner",
  other: "Other",
}

export const DISQUALIFY_REASON_LABELS: Record<DisqualifyReason, string> = {
  noBudget: "No budget",
  noNeed: "No need",
  cantReachThem: "Can't reach them",
  choseCompetitor: "Chose a competitor",
  duplicate: "Duplicate",
  other: "Other",
}

export const STAGE_LABELS: Record<Stage, string> = {
  qualification: "Qualification",
  needsAnalysis: "Needs Analysis",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closedWon: "Closed Won",
  closedLost: "Closed Lost",
}

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

export function formatEuro(value: number): string {
  return euro.format(value)
}

const euroCents = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A price to the cent, such as a List price: "€95.00". */
export function formatPrice(value: number): string {
  return euroCents.format(value)
}

export const PRODUCT_UNIT_LABELS: Record<ProductUnit, string> = {
  piece: "Piece",
  hour: "Hour",
  day: "Day",
  month: "Month",
  year: "Year",
}

export function formatVatRate(rate: VatRate): string {
  return `${rate} %`
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })

/** A "YYYY-MM-DD" date or an ISO timestamp, as "9 Oct 2026" in local time. */
export function formatDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date(value)
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date)
}

/** One line about an Opportunity in a related list or search result: Stage, value and close date. */
export function opportunitySummary(o: Pick<Opportunity, "stage" | "estimatedValue" | "expectedCloseDate">): string {
  return `${STAGE_LABELS[o.stage]} · ${formatEuro(o.estimatedValue)} · ${formatDate(o.expectedCloseDate)}`
}

export const FORECAST_CATEGORY_LABELS: Record<ForecastCategory, string> = {
  pipeline: "Pipeline",
  bestCase: "Best case",
  commit: "Commit",
  omitted: "Omitted",
}

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: "Price",
  choseCompetitor: "Chose a competitor",
  noBudget: "No budget",
  noDecision: "No decision",
  other: "Other",
}

const RECORD_PATHS: Record<RecordType, string> = {
  lead: "leads",
  opportunity: "opportunities",
  account: "accounts",
  contact: "contacts",
}

/** The page of a Lead, Opportunity, Account or Contact. */
export function recordHref(record: RecordRef): string {
  return `/${RECORD_PATHS[record.type]}/${record.id}`
}

/** "Megan Bowen" -> "MB": the Owner badge on cards and the signed-in user's avatar. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}
