// PROTOTYPE (throwaway, never merge): made-up data for #161 (forecast Trend,
// Adjustments, Stale deals, Last activity, Lead KPIs). Nothing here is stored;
// adjustments live in memory until the page reloads.

import { create } from "zustand"
import { formatDate } from "@/lib/format"
import { toDateOnly, type DateOnly, type Id } from "@/sales"

export const TODAY = toDateOnly(new Date())

export function addDays(date: DateOnly, days: number): DateOnly {
  const [y, m, d] = date.split("-").map(Number)
  return toDateOnly(new Date(y, m - 1, d + days))
}

export function daysBetween(from: DateOnly, to: DateOnly): number {
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

export const USERS = {
  megan: { id: "user-megan", name: "Megan Bowen" },
  adele: { id: "user-adele", name: "Adele Vance" },
  alex: { id: "user-alex", name: "Alex Wilber" },
}
export const ME = USERS.megan
export const REPORTS = [USERS.adele, USERS.alex]
export const nameOf = (id: Id) => Object.values(USERS).find((u) => u.id === id)?.name ?? "Someone"

// ---- Forecast snapshots and the trend --------------------------------------

/** The last 12 Monday snapshots, oldest first. */
export function snapshotDates(): DateOnly[] {
  const [y, m, d] = TODAY.split("-").map(Number)
  const day = new Date(y, m - 1, d).getDay()
  const monday = addDays(TODAY, -((day + 6) % 7))
  return Array.from({ length: 12 }, (_, i) => addDays(monday, -7 * (11 - i)))
}

export type TrendFigures = { closedWon: number; commit: number; bestCase: number; pipeline: number }
export type TrendPoint = TrendFigures & { snapshot: DateOnly; quota: number | null }

const wobble = (seed: number, k: number) => Math.sin(seed * 12.9898 + k * 78.233) * 0.5 + Math.sin(seed * 3.1 + k * 1.7) * 0.5

/** Twelve weekly snapshots ending at today's calculated figures (the latest snapshot is this Monday's). */
export function trendSeries(now: TrendFigures, quota: number | null, seed: number): TrendPoint[] {
  const dates = snapshotDates()
  return dates.map((snapshot, i) => {
    const k = 11 - i // weeks before the latest
    if (k === 0) return { snapshot, quota, ...now }
    const round = (v: number) => Math.round(v / 500) * 500
    const closedWon = round(Math.max(0, now.closedWon * Math.max(0, 1 - k * 0.12)))
    const commit = round(Math.max(closedWon, now.commit * (0.62 + 0.38 * (1 - k / 11)) + wobble(seed, k) * 4000))
    const bestCase = round(Math.max(commit, now.bestCase * (0.78 + 0.22 * (1 - k / 11)) + wobble(seed + 1, k) * 6000))
    const pipeline = round(Math.max(bestCase - closedWon, now.pipeline * (1.08 - 0.08 * (1 - k / 11)) + wobble(seed + 2, k) * 9000))
    return { snapshot, quota, closedWon, commit, bestCase, pipeline }
  })
}

// ---- Changes since ----------------------------------------------------------

export const BUCKETS = [
  { key: "new", label: "New", hint: "Created, or now expected in this period" },
  { key: "increased", label: "Increased", hint: "Estimated value went up" },
  { key: "decreased", label: "Decreased", hint: "Estimated value went down" },
  { key: "movedIn", label: "Moved in", hint: "Expected close date moved into this period" },
  { key: "movedOut", label: "Moved out", hint: "Expected close date moved out of this period" },
  { key: "categoryChanged", label: "Category changed", hint: "Forecast category changed" },
  { key: "won", label: "Won", hint: "Closed Won" },
  { key: "lost", label: "Lost", hint: "Closed Lost" },
] as const
export type BucketKey = (typeof BUCKETS)[number]["key"]

export type Change = {
  opportunityId: Id
  name: string
  ownerId: Id
  bucket: BucketKey
  /** In which week before the latest snapshot it happened (1 = since last week). */
  weeksAgo: number
  old: string
  now: string
  /** Effect on the period's Best case, in euros. */
  delta: number
}

export const CHANGES: Change[] = [
  { opportunityId: "opp-proto-workshops", name: "Fabrikam NV - Workshops", ownerId: USERS.alex.id, bucket: "won", weeksAgo: 1, old: "Commit · €15,000", now: "Won · €14,000", delta: -1000 },
  { opportunityId: "opp-proto-teams", name: "Tailwind Traders - Teams rollout", ownerId: USERS.adele.id, bucket: "increased", weeksAgo: 1, old: "€28,000", now: "€35,000", delta: 7000 },
  { opportunityId: "opp-proto-renewal", name: "Tailwind Traders - Licence renewal", ownerId: USERS.adele.id, bucket: "movedOut", weeksAgo: 1, old: "Close in this month", now: "Close next month", delta: -18000 },
  { opportunityId: "opp-proto-print", name: "Fabrikam NV - Managed print", ownerId: USERS.alex.id, bucket: "categoryChanged", weeksAgo: 1, old: "Pipeline", now: "Best case", delta: 15000 },
  { opportunityId: "opp-proto-training", name: "Northwind BV - Security training", ownerId: USERS.megan.id, bucket: "movedIn", weeksAgo: 1, old: "Close next month", now: "Close in this month", delta: 12000 },
  { opportunityId: "opp-proto-pilot", name: "Tailwind Traders - Pilot", ownerId: USERS.adele.id, bucket: "won", weeksAgo: 2, old: "Best case · €9,500", now: "Won · €9,500", delta: 0 },
  { opportunityId: "opp-proto-helpdesk", name: "Tailwind Traders - Helpdesk", ownerId: USERS.adele.id, bucket: "new", weeksAgo: 2, old: "—", now: "€22,000 · Pipeline", delta: 22000 },
  { opportunityId: "opp-fabrikam-security", name: "Fabrikam NV - Security audit", ownerId: USERS.alex.id, bucket: "decreased", weeksAgo: 2, old: "€26,000", now: "€20,000", delta: -6000 },
  { opportunityId: "opp-proto-wifi", name: "Fabrikam NV - Wifi upgrade", ownerId: USERS.alex.id, bucket: "new", weeksAgo: 1, old: "—", now: "€9,000 · Pipeline", delta: 9000 },
  { opportunityId: "opp-tailwind-network", name: "Tailwind Traders - Network refresh", ownerId: USERS.adele.id, bucket: "lost", weeksAgo: 4, old: "Best case · €60,000", now: "Lost · Chose a competitor", delta: -60000 },
  { opportunityId: "opp-proto-data", name: "Northwind BV - Data platform", ownerId: USERS.alex.id, bucket: "increased", weeksAgo: 3, old: "€48,000", now: "€64,000", delta: 16000 },
  { opportunityId: "opp-northwind-cloud", name: "Northwind BV - Cloud migration", ownerId: USERS.megan.id, bucket: "categoryChanged", weeksAgo: 3, old: "Best case", now: "Commit", delta: 0 },
]

export const COMPARE_OPTIONS = [
  { weeks: 1, label: "Last week" },
  { weeks: 2, label: "2 weeks ago" },
  { weeks: 4, label: "4 weeks ago" },
]

export function changesSince(weeks: number, ownerIds: Id[]): Change[] {
  return CHANGES.filter((c) => c.weeksAgo <= weeks && ownerIds.includes(c.ownerId))
}

// ---- Adjustments -------------------------------------------------------------

export type AdjustFigure = "commit" | "bestCase"
export const FIGURE_LABEL: Record<AdjustFigure, string> = { commit: "Commit", bestCase: "Best case" }

export type AdjustmentEvent = { at: string; by: string; amount: number | null; note: string }
/** Key: person (or "team"), month, figure. The latest event wins; amount null is a Reset. */
type AdjustmentState = {
  events: Record<string, AdjustmentEvent[]>
  adjust: (key: string, amount: number, note: string) => void
  reset: (key: string, note: string) => void
}

export const adjustmentKey = (personId: Id | "team", month: DateOnly, figure: AdjustFigure) => `${personId}|${month}|${figure}`

const thisMonth = `${TODAY.slice(0, 8)}01`
const stamp = (daysAgo: number) => `${addDays(TODAY, -daysAgo)}T10:15:00`

export const useAdjustments = create<AdjustmentState>((set) => ({
  events: {
    [adjustmentKey(USERS.alex.id, thisMonth, "commit")]: [
      { at: stamp(9), by: ME.name, amount: 30000, note: "Managed print signs this month, Alex confirmed on our 1:1." },
      { at: stamp(2), by: ME.name, amount: 36000, note: "Workshops closed; print is verbal yes, PO expected next week." },
    ],
    [adjustmentKey(USERS.adele.id, thisMonth, "bestCase")]: [
      { at: stamp(3), by: ME.name, amount: 50000, note: "Licence renewal slips to next month; Teams rollout is the upside." },
    ],
  },
  adjust: (key, amount, note) =>
    set((s) => ({ events: { ...s.events, [key]: [...(s.events[key] ?? []), { at: new Date().toISOString().slice(0, 19), by: ME.name, amount, note }] } })),
  reset: (key, note) =>
    set((s) => ({ events: { ...s.events, [key]: [...(s.events[key] ?? []), { at: new Date().toISOString().slice(0, 19), by: ME.name, amount: null, note }] } })),
}))

/** The adjusted amount in force, or null when not adjusted (never adjusted, or Reset). */
export function currentAdjustment(events: AdjustmentEvent[] | undefined): AdjustmentEvent | null {
  const last = events?.at(-1)
  return last && last.amount !== null ? last : null
}

/** Who may adjust whose figures: the person's manager, never their own. */
export const canAdjust = (personId: Id | "team") => personId !== ME.id && personId !== "team"

// ---- Stale deals and Last activity -------------------------------------------

export type StaleReason = "noActivity" | "closeDatePassed" | "longInStage"
export const STALE_LABEL: Record<StaleReason, string> = {
  noActivity: "No activity for 14 days",
  closeDatePassed: "Expected close date passed",
  longInStage: "30 days in this Stage",
}
export const STALE_SHORT: Record<StaleReason, string> = {
  noActivity: "No activity",
  closeDatePassed: "Close date passed",
  longInStage: "Long in Stage",
}

/** Days since the latest done activity, per record (Related activity rolls up to Accounts). */
const LAST_ACTIVITY_DAYS: Record<Id, number> = {
  "opp-tailwind-workplace": 30,
  "opp-fabrikam-security": 4,
  "opp-northwind-cloud": 18,
  "opp-northwind-backup": 3,
  "opp-proto-teams": 2,
  "opp-proto-helpdesk": 5,
  "opp-proto-renewal": 21,
  "opp-proto-print": 9,
  "opp-proto-wifi": 1,
  "opp-proto-data": 16,
  "opp-proto-training": 6,
  "opp-proto-workshops": 5,
  "opp-proto-pilot": 8,
  "opp-fabrikam-laptops": 15,
  "opp-tailwind-network": 25,
  "acc-tailwind": 2,
  "acc-fabrikam": 1,
  "acc-northwind": 3,
  "con-lotte": 30,
  "con-pieter": 4,
  "con-femke": 18,
  "lead-thomas": 6,
  "lead-lotte": 36,
  "lead-joris": 5,
  "lead-lucas": 2,
}
/** Days in the current Stage, per open Opportunity. */
const DAYS_IN_STAGE: Record<Id, number> = {
  "opp-tailwind-workplace": 39,
  "opp-fabrikam-security": 20,
  "opp-northwind-cloud": 12,
  "opp-northwind-backup": 8,
  "opp-proto-teams": 11,
  "opp-proto-helpdesk": 12,
  "opp-proto-renewal": 34,
  "opp-proto-print": 33,
  "opp-proto-wifi": 6,
  "opp-proto-data": 14,
  "opp-proto-training": 9,
}

export function lastActivityDate(id: Id): DateOnly | null {
  const days = LAST_ACTIVITY_DAYS[id]
  return days === undefined ? null : addDays(TODAY, -days)
}

export function daysInStage(id: Id): number {
  return DAYS_IN_STAGE[id] ?? 0
}

export function staleReasons(o: { id: Id; stage: string; expectedCloseDate: DateOnly }): StaleReason[] {
  if (o.stage === "closedWon" || o.stage === "closedLost") return []
  const reasons: StaleReason[] = []
  if ((LAST_ACTIVITY_DAYS[o.id] ?? 0) > 14) reasons.push("noActivity")
  if (o.expectedCloseDate < TODAY) reasons.push("closeDatePassed")
  if ((DAYS_IN_STAGE[o.id] ?? 0) >= 30) reasons.push("longInStage")
  return reasons
}

// ---- Opportunity history and Push count --------------------------------------

export type HistoryEntry = { at: DateOnly; field: string; old: string; now: string; by: string; push?: boolean }

const H = (daysAgo: number, field: string, old: string, now: string, by: string, push = false): HistoryEntry => ({
  at: addDays(TODAY, -daysAgo),
  field,
  old,
  now,
  by,
  push,
})

const dt = (offset: number) => formatDate(addDays(TODAY, offset))

const HISTORY: Record<Id, HistoryEntry[]> = {
  "opp-proto-renewal": [
    H(3, "Expected close date", dt(-28), dt(-6), "Adele Vance", true),
    H(20, "Expected close date", dt(-48), dt(-28), "Adele Vance", true),
    H(34, "Stage", "Proposal", "Negotiation", "Adele Vance"),
    H(34, "Probability", "50%", "75%", "Adele Vance"),
    H(41, "Expected close date", dt(-70), dt(-48), "Adele Vance", true),
    H(50, "Estimated value", "€15,000", "€18,000", "Adele Vance"),
  ],
  "opp-tailwind-workplace": [
    H(12, "Expected close date", dt(15), dt(45), "Adele Vance", true),
    H(25, "Estimated value", "€60,000", "€48,000", "Adele Vance"),
    H(39, "Stage", "—", "Qualification", "Adele Vance"),
  ],
  "opp-fabrikam-security": [
    H(10, "Estimated value", "€26,000", "€20,000", "Alex Wilber"),
    H(20, "Stage", "Needs Analysis", "Proposal", "Alex Wilber"),
    H(20, "Probability", "25%", "50%", "Alex Wilber"),
    H(30, "Expected close date", dt(-25), dt(-3), "Alex Wilber", true),
  ],
  "opp-proto-teams": [
    H(5, "Estimated value", "€28,000", "€35,000", "Adele Vance"),
    H(8, "Forecast category", "Best case", "Commit", "Adele Vance"),
    H(11, "Stage", "Needs Analysis", "Proposal", "Adele Vance"),
  ],
  "opp-northwind-cloud": [
    H(16, "Forecast category", "Best case", "Commit", "Megan Bowen"),
    H(12, "Stage", "Proposal", "Negotiation", "Megan Bowen"),
    H(12, "Probability", "50%", "80%", "Megan Bowen"),
  ],
}

export function historyOf(id: Id): HistoryEntry[] {
  return HISTORY[id] ?? [H(7, "Stage", "Qualification", "Needs Analysis", "Alex Wilber")]
}

export function pushCount(id: Id): number {
  return historyOf(id).filter((h) => h.push).length
}

// ---- Lead KPIs ------------------------------------------------------------------

export type LeadKpis = {
  open: number
  notContacted2d: number
  /** Median hours from creation to First touch, this month. */
  firstTouchHours: number
  /** Qualified / (Qualified + Disqualified), this quarter. */
  qualifyRate: number
  qualified: number
  closed: number
}

export const LEAD_KPIS: Record<Id, LeadKpis> = {
  [USERS.megan.id]: { open: 3, notContacted2d: 0, firstTouchHours: 5, qualifyRate: 0.5, qualified: 2, closed: 4 },
  [USERS.adele.id]: { open: 7, notContacted2d: 2, firstTouchHours: 31, qualifyRate: 0.33, qualified: 3, closed: 9 },
  [USERS.alex.id]: { open: 5, notContacted2d: 1, firstTouchHours: 11, qualifyRate: 0.43, qualified: 3, closed: 7 },
}

/** The same figures last month or last quarter, for the arrows. */
export const LEAD_KPIS_BEFORE: Record<Id, LeadKpis> = {
  [USERS.megan.id]: { open: 4, notContacted2d: 1, firstTouchHours: 9, qualifyRate: 0.4, qualified: 2, closed: 5 },
  [USERS.adele.id]: { open: 6, notContacted2d: 0, firstTouchHours: 22, qualifyRate: 0.38, qualified: 3, closed: 8 },
  [USERS.alex.id]: { open: 5, notContacted2d: 2, firstTouchHours: 16, qualifyRate: 0.36, qualified: 2, closed: 6 },
}

export const LEADS_BY_SOURCE = [
  { source: "Website", open: 6, qualified: 3, disqualified: 5 },
  { source: "Referral", open: 3, qualified: 3, disqualified: 1 },
  { source: "Event", open: 4, qualified: 1, disqualified: 3 },
  { source: "Cold outreach", open: 1, qualified: 0, disqualified: 3 },
  { source: "Partner", open: 1, qualified: 1, disqualified: 0 },
]

export const DISQUALIFY_BREAKDOWN = [
  { reason: "No budget", count: 5 },
  { reason: "No need", count: 3 },
  { reason: "Can't reach them", count: 3 },
  { reason: "Chose a competitor", count: 1 },
  { reason: "Duplicate", count: 0 },
  { reason: "Other", count: 0 },
]

export function formatHours(hours: number): string {
  return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d ${hours % 24} h`
}
