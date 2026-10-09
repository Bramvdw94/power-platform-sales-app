import { isOpenStage } from "./stages"
import { isInView } from "./permissions"
import { STAGES, type DateOnly, type Id, type Opportunity, type Stage, type Task, type User } from "./types"

type PipelineOpportunity = Pick<Opportunity, "stage" | "estimatedValue" | "actualValue" | "probability">

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/** What an Opportunity counts for: the actual value when Closed Won, else the Estimated value. */
export function pipelineValue(opportunity: PipelineOpportunity): number {
  if (opportunity.stage === "closedWon") return opportunity.actualValue ?? opportunity.estimatedValue
  return opportunity.estimatedValue
}

export function weightedValue(opportunity: PipelineOpportunity): number {
  return roundCents((pipelineValue(opportunity) * opportunity.probability) / 100)
}

export type StageTotal = { count: number; total: number; weighted: number }

/** Count, total and weighted total per Stage (the Board columns and Funnel bars). */
export function stageTotals(opportunities: readonly PipelineOpportunity[]): Record<Stage, StageTotal> {
  const totals = Object.fromEntries(STAGES.map((s) => [s, { count: 0, total: 0, weighted: 0 }])) as Record<
    Stage,
    StageTotal
  >
  for (const o of opportunities) {
    const t = totals[o.stage]
    t.count += 1
    t.total = roundCents(t.total + pipelineValue(o))
    t.weighted = roundCents(t.weighted + weightedValue(o))
  }
  return totals
}

export type PipelineSummary = { openTotal: number; weightedTotal: number; openCount: number }

/** The Pipeline page header: open pipeline, weighted pipeline and number of open Opportunities. */
export function pipelineSummary(opportunities: readonly PipelineOpportunity[]): PipelineSummary {
  const open = opportunities.filter((o) => isOpenStage(o.stage))
  return {
    openTotal: roundCents(open.reduce((sum, o) => sum + pipelineValue(o), 0)),
    weightedTotal: roundCents(open.reduce((sum, o) => sum + weightedValue(o), 0)),
    openCount: open.length,
  }
}

/** An open Opportunity whose Expected close date has passed. */
export function isOpportunityOverdue(opportunity: Pick<Opportunity, "stage" | "expectedCloseDate">, today: DateOnly): boolean {
  return isOpenStage(opportunity.stage) && opportunity.expectedCloseDate < today
}

/** An open Task whose due date has passed. */
export function isTaskOverdue(task: Pick<Task, "completed" | "dueDate">, today: DateOnly): boolean {
  return !task.completed && task.dueDate !== undefined && task.dueDate < today
}

export type PipelineOwnerFilter = "mine" | "myTeam" | "everyone"
export type CloseDateFilter = "any" | "thisQuarter" | "nextQuarter" | "thisYear"

export type PipelineFilter = {
  owner: PipelineOwnerFilter
  closeDate: CloseDateFilter
  showClosed: boolean
}

export const DEFAULT_PIPELINE_FILTER: PipelineFilter = { owner: "myTeam", closeDate: "any", showClosed: false }

export type DateRange = { from: DateOnly; to: DateOnly }

function quarterRange(year: number, quarter: number): DateRange {
  const firstMonth = quarter * 3 + 1
  const lastMonth = firstMonth + 2
  const lastDay = new Date(year, lastMonth, 0).getDate()
  const mm = (m: number) => String(m).padStart(2, "0")
  return { from: `${year}-${mm(firstMonth)}-01`, to: `${year}-${mm(lastMonth)}-${lastDay}` }
}

/** The close-date window for a filter, inclusive, or null for "any". */
export function closeDateRange(filter: CloseDateFilter, today: DateOnly): DateRange | null {
  const year = Number(today.slice(0, 4))
  const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3)
  switch (filter) {
    case "any":
      return null
    case "thisQuarter":
      return quarterRange(year, quarter)
    case "nextQuarter":
      return quarter === 3 ? quarterRange(year + 1, 0) : quarterRange(year, quarter + 1)
    case "thisYear":
      return { from: `${year}-01-01`, to: `${year}-12-31` }
  }
}

/** The date the close-date filter looks at: the close date once closed, else the Expected close date. */
export function pipelineDate(opportunity: Pick<Opportunity, "stage" | "expectedCloseDate" | "closeDate">): DateOnly {
  if (!isOpenStage(opportunity.stage)) return opportunity.closeDate ?? opportunity.expectedCloseDate
  return opportunity.expectedCloseDate
}

const OWNER_VIEW = { mine: "my", myTeam: "myTeam", everyone: "all" } as const

export function matchesPipelineFilter(
  opportunity: Pick<Opportunity, "stage" | "expectedCloseDate" | "closeDate" | "ownerId">,
  filter: PipelineFilter,
  context: { userId: Id; users: ReadonlyArray<Pick<User, "id" | "managerId">>; today: DateOnly },
): boolean {
  if (!filter.showClosed && !isOpenStage(opportunity.stage)) return false
  if (!isInView(OWNER_VIEW[filter.owner], opportunity.ownerId, context.userId, context.users)) return false
  const range = closeDateRange(filter.closeDate, context.today)
  if (range) {
    const date = pipelineDate(opportunity)
    if (date < range.from || date > range.to) return false
  }
  return true
}
