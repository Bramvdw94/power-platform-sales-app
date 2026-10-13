import { effectiveForecastCategory } from "./forecast"
import { quarterOf, quotaMonths } from "./quota"
import type { DateOnly, Id, Opportunity, Quota } from "./types"

type FigureOpportunity = Pick<
  Opportunity,
  "stage" | "forecastCategory" | "estimatedValue" | "actualValue" | "probability" | "expectedCloseDate" | "closeDate"
>

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

function addDays(date: DateOnly, days: number): DateOnly {
  const [y, m, d] = date.split("-").map(Number)
  const moved = new Date(y, m - 1, d + days)
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, "0")}-${String(moved.getDate()).padStart(2, "0")}`
}

function daysBetween(from: DateOnly, to: DateOnly): number {
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

function lastDayOfMonth(month: DateOnly): DateOnly {
  const [y, m] = month.split("-").map(Number)
  return `${month.slice(0, 8)}${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`
}

export type ForecastGranularity = "month" | "quarter"

export type ForecastPeriod = {
  /** The first month of the period, as the Quota month "YYYY-MM-01". */
  key: DateOnly
  /** First and last day, both included. */
  from: DateOnly
  to: DateOnly
  /** The Quota months the period spans. */
  months: DateOnly[]
}

/**
 * The periods the Forecast shows: this month plus the next 5, or the quarter
 * we are in plus the next 2 (so a quarter always counts what is already won
 * in its earlier months).
 */
export function forecastPeriods(today: DateOnly, granularity: ForecastGranularity): ForecastPeriod[] {
  if (granularity === "month") {
    return quotaMonths(today, 6).map((month) => ({ key: month, from: month, to: lastDayOfMonth(month), months: [month] }))
  }
  const quarterStart = `${today.slice(0, 5)}${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`
  const months = quotaMonths(quarterStart, 9)
  return [0, 1, 2].map((i) => {
    const own = months.slice(i * 3, i * 3 + 3)
    return { key: own[0], from: own[0], to: lastDayOfMonth(own[2]), months: own }
  })
}

/** The Quota months to load for a set of periods. */
export function forecastQuotaWindow(periods: readonly ForecastPeriod[]): { from: DateOnly; months: number } {
  return { from: periods[0].key, months: periods.reduce((sum, p) => sum + p.months.length, 0) }
}

export function periodQuarterLabel(period: ForecastPeriod): string {
  return quarterOf(period.key)
}

export type ForecastFigures = {
  /** Won Opportunities closed in the period, at their actual value. */
  closedWon: number
  /** Open Opportunities per Forecast category expected to close in the period (Omitted counts nowhere). */
  openCommit: number
  openBestCase: number
  openPipeline: number
  /** Commit + won. */
  commit: number
  /** Best case + Commit + won. */
  bestCase: number
  /** All open except Omitted. */
  pipeline: number
  /** Estimated value x Probability of the open ones. */
  weighted: number
  /** Null when no Quota is set for the period. */
  quota: number | null
  /** Quota - Closed won, never below 0; null without a Quota. */
  gap: number | null
  /** Open pipeline / Gap; null without a Quota or when the Gap is 0. */
  coverage: number | null
}

const inPeriod = (date: DateOnly, period: Pick<ForecastPeriod, "from" | "to">) => date >= period.from && date <= period.to

/** Open deals count in their Expected close month at their Estimated value, won deals in their close month at their actual value. */
export function forecastFigures(
  opportunities: readonly FigureOpportunity[],
  quotas: readonly Pick<Quota, "month" | "amount">[],
  period: ForecastPeriod,
): ForecastFigures {
  let closedWon = 0
  let openCommit = 0
  let openBestCase = 0
  let openPipeline = 0
  let weighted = 0
  for (const o of opportunities) {
    if (o.stage === "closedWon") {
      if (inPeriod(o.closeDate ?? o.expectedCloseDate, period)) closedWon += o.actualValue ?? o.estimatedValue
      continue
    }
    const category = effectiveForecastCategory(o)
    if (category === undefined || category === "omitted" || !inPeriod(o.expectedCloseDate, period)) continue
    if (category === "commit") openCommit += o.estimatedValue
    else if (category === "bestCase") openBestCase += o.estimatedValue
    else openPipeline += o.estimatedValue
    weighted += (o.estimatedValue * o.probability) / 100
  }
  const periodQuotas = quotas.filter((q) => period.months.includes(q.month))
  const quota = periodQuotas.length > 0 ? roundCents(periodQuotas.reduce((sum, q) => sum + q.amount, 0)) : null
  closedWon = roundCents(closedWon)
  const pipeline = roundCents(openCommit + openBestCase + openPipeline)
  const gap = quota === null ? null : roundCents(Math.max(0, quota - closedWon))
  return {
    closedWon,
    openCommit: roundCents(openCommit),
    openBestCase: roundCents(openBestCase),
    openPipeline: roundCents(openPipeline),
    commit: roundCents(closedWon + openCommit),
    bestCase: roundCents(closedWon + openCommit + openBestCase),
    pipeline,
    weighted: roundCents(weighted),
    quota,
    gap,
    coverage: gap === null || gap === 0 ? null : Math.round((pipeline / gap) * 100) / 100,
  }
}

export type SalesStats = {
  /** Won / (won + lost) by number of deals; null when nothing closed. */
  winRate: number | null
  /** Average actual value of the won deals; null when none were won. */
  averageDealSize: number | null
  /** Average days from creation to close of the won deals; null when none were won. */
  salesCycleDays: number | null
  won: number
  lost: number
}

export const STATS_WINDOW_DAYS = 90

function closedInWindow<T extends Pick<Opportunity, "stage" | "closeDate">>(opportunities: readonly T[], today: DateOnly): T[] {
  const from = addDays(today, -STATS_WINDOW_DAYS)
  return opportunities.filter(
    (o) => (o.stage === "closedWon" || o.stage === "closedLost") && o.closeDate !== undefined && o.closeDate > from && o.closeDate <= today,
  )
}

/** Win rate, Average deal size and Sales cycle over deals closed in the last 90 days. */
export function salesStats(
  opportunities: readonly (FigureOpportunity & Pick<Opportunity, "createdOn">)[],
  today: DateOnly,
): SalesStats {
  const closed = closedInWindow(opportunities, today)
  const won = closed.filter((o) => o.stage === "closedWon")
  const lost = closed.length - won.length
  const mean = (values: number[]) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length)
  const average = mean(won.map((o) => o.actualValue ?? o.estimatedValue))
  const cycle = mean(won.map((o) => Math.max(0, daysBetween(o.createdOn.slice(0, 10), o.closeDate as DateOnly))))
  return {
    winRate: closed.length === 0 ? null : won.length / closed.length,
    averageDealSize: average === null ? null : roundCents(average),
    salesCycleDays: cycle === null ? null : Math.round(cycle),
    won: won.length,
    lost,
  }
}

export type OwnerOutcome = { ownerId: Id; ownerName: string; won: number; lost: number }

/** Value won and lost per Owner over the last 90 days, biggest winner first. */
export function wonLostByOwner(
  opportunities: readonly Pick<Opportunity, "stage" | "closeDate" | "ownerId" | "ownerName" | "estimatedValue" | "actualValue">[],
  today: DateOnly,
): OwnerOutcome[] {
  const byOwner = new Map<Id, OwnerOutcome>()
  for (const o of closedInWindow(opportunities, today)) {
    const row = byOwner.get(o.ownerId) ?? { ownerId: o.ownerId, ownerName: o.ownerName, won: 0, lost: 0 }
    if (o.stage === "closedWon") row.won = roundCents(row.won + (o.actualValue ?? o.estimatedValue))
    else row.lost = roundCents(row.lost + o.estimatedValue)
    byOwner.set(o.ownerId, row)
  }
  return [...byOwner.values()].sort((a, b) => b.won - a.won || a.ownerName.localeCompare(b.ownerName))
}

export type MyNumbers = {
  wonThisMonth: number
  wonThisQuarter: number
  quotaThisMonth: number | null
  quotaThisQuarter: number | null
  gapThisQuarter: number | null
  coverageThisQuarter: number | null
  /** The rest of this quarter's figures. */
  commit: number
  bestCase: number
  weighted: number
  /** Open deals expected to close this month. */
  closingThisMonthCount: number
  closingThisMonthValue: number
  /** Open deals whose Expected close date has passed. */
  overdueCount: number
}

/** One person's numbers: what Home shows, the Team tab compares, and the Forecast page builds on. */
export function myNumbers(
  opportunities: readonly FigureOpportunity[],
  quotas: readonly Pick<Quota, "month" | "amount">[],
  today: DateOnly,
): MyNumbers {
  const [month] = forecastPeriods(today, "month")
  const [quarter] = forecastPeriods(today, "quarter")
  const m = forecastFigures(opportunities, quotas, month)
  const q = forecastFigures(opportunities, quotas, quarter)
  const open = opportunities.filter((o) => o.stage !== "closedWon" && o.stage !== "closedLost")
  const closing = open.filter((o) => inPeriod(o.expectedCloseDate, month))
  return {
    wonThisMonth: m.closedWon,
    wonThisQuarter: q.closedWon,
    quotaThisMonth: m.quota,
    quotaThisQuarter: q.quota,
    gapThisQuarter: q.gap,
    coverageThisQuarter: q.coverage,
    commit: q.commit,
    bestCase: q.bestCase,
    weighted: q.weighted,
    closingThisMonthCount: closing.length,
    closingThisMonthValue: roundCents(closing.reduce((sum, o) => sum + o.estimatedValue, 0)),
    overdueCount: open.filter((o) => o.expectedCloseDate < today).length,
  }
}
