import { Link } from "react-router-dom"
import { formatEuro, initials, STAGE_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"
import { STAGES, isOpenStage, type Opportunity, type Stage, type StageTotal } from "@/sales"

/** Moves an Opportunity to a Stage: a Stage change, the Close dialog, or a Reopen. */
export type MoveTo = (opportunity: Opportunity, to: Stage) => void

/** What the Board and Funnel need to show and move the Opportunities. */
export type PipelineViewProps = {
  opportunities: Opportunity[]
  /** The Stages shown: the open ones, plus Closed Won and Closed Lost when "Show closed" is on. */
  stages: readonly Stage[]
  totals: Record<Stage, StageTotal>
  isEditable: (opportunity: Opportunity) => boolean
  moveTo: MoveTo
}

/**
 * The Stage picker on a card or Funnel row, for touch screens and keyboards.
 * A closed Opportunity can only go back to an open Stage (Reopen).
 */
export function StagePicker({
  opportunity,
  disabled,
  moveTo,
  className,
}: {
  opportunity: Opportunity
  disabled: boolean
  moveTo: MoveTo
  className?: string
}) {
  const choices = STAGES.filter((s) => isOpenStage(opportunity.stage) || isOpenStage(s) || s === opportunity.stage)
  return (
    <select
      aria-label={`Stage of ${opportunity.name}`}
      value={opportunity.stage}
      disabled={disabled}
      onChange={(e) => moveTo(opportunity, e.target.value as Stage)}
      className={cn(
        "h-8 rounded-md border border-input bg-transparent px-2 text-base shadow-xs outline-none md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
    >
      {choices.map((s) => (
        <option key={s} value={s}>
          {STAGE_LABELS[s]}
        </option>
      ))}
    </select>
  )
}

export function OwnerInitials({ name }: { name: string }) {
  return (
    <span
      role="img"
      aria-label={`Owner ${name}`}
      title={name}
      className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold"
    >
      {initials(name)}
    </span>
  )
}

export function OpportunityLink({ opportunity }: { opportunity: Opportunity }) {
  return (
    <Link to={`/opportunities/${opportunity.id}`} className="font-medium leading-snug hover:underline">
      {opportunity.name}
    </Link>
  )
}

/** "3 · €120,000 · weighted €90,000" under a column or Funnel bar. */
export function StageTotals({ total, className }: { total: StageTotal; className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground tabular-nums", className)}>
      <span className="sr-only">Count </span>
      {total.count} · <span className="sr-only">Total </span>
      {formatEuro(total.total)} · weighted {formatEuro(total.weighted)}
    </p>
  )
}
