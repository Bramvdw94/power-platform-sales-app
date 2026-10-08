// PROTOTYPE: throwaway in-memory data for the pipeline board prototype (issue #7).
// Nothing here talks to Dataverse.

export const OPEN_STAGES = ["Qualification", "Needs Analysis", "Proposal", "Negotiation"] as const
export const CLOSED_STAGES = ["Closed Won", "Closed Lost"] as const
export const ALL_STAGES = [...OPEN_STAGES, ...CLOSED_STAGES] as const
export type Stage = (typeof ALL_STAGES)[number]

export const DEFAULT_PROBABILITY: Record<Stage, number> = {
  Qualification: 10,
  "Needs Analysis": 25,
  Proposal: 50,
  Negotiation: 75,
  "Closed Won": 100,
  "Closed Lost": 0,
}

export const LOST_REASONS = ["Price", "Chose a competitor", "No budget", "No decision", "Other"] as const

// Bram manages Sanne and Joris; Lotte sits in another team.
export const ME = "Bram de Vries"
export const MY_TEAM = ["Bram de Vries", "Sanne Jansen", "Joris Peeters"]
export const OWNERS = [...MY_TEAM, "Lotte Willems"]

export type Opportunity = {
  id: string
  name: string
  account: string
  primaryContact: string
  owner: string
  stage: Stage
  probability: number
  estimatedValue: number
  expectedCloseDate: string // yyyy-mm-dd
  nextStep: string
  actualValue?: number
  closeDate?: string
  lostReason?: string
}

const o = (
  id: string, name: string, account: string, primaryContact: string, owner: string, stage: Stage,
  estimatedValue: number, expectedCloseDate: string, nextStep: string, probability?: number,
): Opportunity => ({
  id, name, account, primaryContact, owner, stage, estimatedValue, expectedCloseDate, nextStep,
  probability: probability ?? DEFAULT_PROBABILITY[stage],
})

export const SAMPLE: Opportunity[] = [
  o("1", "Fleet tracking rollout", "Van Dijk Logistiek", "Marieke van Dijk", ME, "Negotiation", 84000, "2026-10-30", "Send revised SLA"),
  o("2", "Service desk licences", "Gemeente Breda", "Tom Hendriks", ME, "Proposal", 36000, "2026-11-20", "Present proposal to IT board"),
  o("3", "Warehouse scanners", "Brouwer Foods", "Ilse Brouwer", "Sanne Jansen", "Needs Analysis", 22500, "2026-12-12", "Site visit Tilburg"),
  o("4", "CRM migration support", "Kroon Advocaten", "Pieter Kroon", "Joris Peeters", "Qualification", 12000, "2027-01-31", "Find budget owner"),
  o("5", "Field service app", "Hoogland Installatie", "Femke de Boer", ME, "Needs Analysis", 48000, "2026-12-05", "Workshop with planners"),
  o("6", "Annual support renewal", "Rotterdam Port Services", "Ahmed el Amrani", "Sanne Jansen", "Negotiation", 61000, "2026-10-15", "Waiting on procurement", 90),
  o("7", "Data platform pilot", "Zorggroep Oost", "Linda Smit", "Lotte Willems", "Proposal", 95000, "2026-11-28", "Security questionnaire"),
  o("8", "Dashboards for finance", "Bakker & Zn", "Erik Bakker", "Joris Peeters", "Proposal", 18500, "2026-10-02", "Chase signature"),
  o("9", "Mobile sales kit", "Fietsfabriek Noord", "Noor Visser", "Sanne Jansen", "Qualification", 9000, "2027-02-14", "Intro call"),
  o("10", "Expansion to Antwerp office", "Van Dijk Logistiek", "Marieke van Dijk", ME, "Qualification", 30000, "2027-03-31", "Wait for Q1 budget"),
  o("11", "Customer portal", "Groenewoud Energie", "Sophie Mulder", "Lotte Willems", "Needs Analysis", 54000, "2027-01-15", "Demo portal templates"),
  o("12", "Training programme", "Gemeente Breda", "Tom Hendriks", "Joris Peeters", "Negotiation", 14000, "2026-11-06", "Agree on dates"),
  o("13", "Planning module", "Brouwer Foods", "Ilse Brouwer", ME, "Proposal", 27000, "2026-12-18", "Price check with Ilse", 40),
  o("14", "Inspection forms", "Hoogland Installatie", "Femke de Boer", "Lotte Willems", "Qualification", 7500, "2026-12-20", "Qualify need"),
  { ...o("15", "Reporting add-on", "Kroon Advocaten", "Pieter Kroon", ME, "Closed Won", 16000, "2026-09-30", ""), actualValue: 15200, closeDate: "2026-09-26" },
  { ...o("16", "Integration project", "Zorggroep Oost", "Linda Smit", "Sanne Jansen", "Closed Lost", 40000, "2026-09-15", ""), closeDate: "2026-09-18", lostReason: "Chose a competitor" },
  { ...o("17", "Hardware refresh", "Rotterdam Port Services", "Ahmed el Amrani", "Joris Peeters", "Closed Won", 52000, "2026-10-01", ""), actualValue: 52000, closeDate: "2026-10-03" },
]

export const TODAY = "2026-10-08"

export type OwnerFilter = "me" | "team" | "everyone"
export type DateFilter = "this-quarter" | "next-quarter" | "this-year" | "all"
export type Filters = { owner: OwnerFilter; date: DateFilter; showClosed: boolean }

export const DEFAULT_FILTERS: Filters = { owner: "team", date: "all", showClosed: false }

const DATE_RANGES: Record<Exclude<DateFilter, "all">, [string, string]> = {
  "this-quarter": ["2026-10-01", "2026-12-31"],
  "next-quarter": ["2027-01-01", "2027-03-31"],
  "this-year": ["2026-01-01", "2026-12-31"],
}

export function isClosed(s: Stage) {
  return s === "Closed Won" || s === "Closed Lost"
}

export function applyFilters(all: Opportunity[], f: Filters) {
  return all.filter((x) => {
    if (f.owner === "me" && x.owner !== ME) return false
    if (f.owner === "team" && !MY_TEAM.includes(x.owner)) return false
    if (!f.showClosed && isClosed(x.stage)) return false
    if (f.date !== "all") {
      const d = isClosed(x.stage) ? x.closeDate ?? x.expectedCloseDate : x.expectedCloseDate
      const [from, to] = DATE_RANGES[f.date]
      if (d < from || d > to) return false
    }
    return true
  })
}

export function value(x: Opportunity) {
  return x.stage === "Closed Won" ? x.actualValue ?? x.estimatedValue : x.estimatedValue
}

export function totals(list: Opportunity[]) {
  const total = list.reduce((s, x) => s + value(x), 0)
  const weighted = list.reduce((s, x) => s + (value(x) * x.probability) / 100, 0)
  return { count: list.length, total, weighted }
}

export function isOverdue(x: Opportunity) {
  return !isClosed(x.stage) && x.expectedCloseDate < TODAY
}

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
export const money = (n: number) => eur.format(n)
export const moneyShort = (n: number) =>
  n >= 1000 ? `€ ${(n / 1000).toLocaleString("nl-NL", { maximumFractionDigits: n >= 100000 ? 0 : 1 })}k` : eur.format(n)
export const dateLabel = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
export const initials = (name: string) => name.split(" ").map((p) => p[0]).filter((c) => c === c.toUpperCase()).slice(0, 2).join("")
