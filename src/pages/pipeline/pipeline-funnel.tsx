import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { formatDate, formatEuro, STAGE_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"
import { STAGE_DEFAULT_PROBABILITY, isOpenStage, pipelineValue, type Stage } from "@/sales"
import { ExpectedCloseDate } from "../opportunities/expected-close-date"
import { OpportunityLink, OwnerInitials, StagePicker, StageTotals, type PipelineViewProps } from "./pipeline-parts"

const BAR_COLOR: Partial<Record<Stage, string>> = { closedWon: "bg-emerald-500/70", closedLost: "bg-destructive/50" }

/**
 * The Funnel: a bar per Stage, its length the Stage's total and its darker
 * part the weighted total. A bar expands to its Opportunities, soonest
 * Expected close date first, each with a Stage picker.
 */
export function PipelineFunnel({ opportunities, stages, totals, isEditable, moveTo }: PipelineViewProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<Stage>>(new Set())
  const largest = Math.max(1, ...stages.map((s) => totals[s].total))

  const toggle = (stage: Stage) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })

  return (
    <div className="flex max-w-3xl flex-col gap-2">
      {stages.map((stage) => {
        const total = totals[stage]
        const isExpanded = expanded.has(stage)
        const rows = opportunities
          .filter((o) => o.stage === stage)
          .sort((a, b) => a.expectedCloseDate.localeCompare(b.expectedCloseDate))
        return (
          <section key={stage} aria-label={STAGE_LABELS[stage]} className="rounded-lg border">
            <h2>
              <button
                type="button"
                onClick={() => toggle(stage)}
                aria-expanded={isExpanded}
                className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-muted/50"
              >
                <ChevronRight aria-hidden className={cn("size-4 shrink-0 transition-transform", isExpanded && "rotate-90")} />
                <span className="w-28 shrink-0 sm:w-36">
                  <span className="block text-sm font-semibold">{STAGE_LABELS[stage]}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{STAGE_DEFAULT_PROBABILITY[stage]}%</span>
                </span>
                <span aria-hidden className="relative hidden h-6 min-w-0 flex-1 overflow-hidden rounded bg-muted sm:block">
                  <span
                    className={cn("absolute inset-y-0 left-0 opacity-50", BAR_COLOR[stage] ?? "bg-primary")}
                    style={{ width: `${(total.total / largest) * 100}%` }}
                  />
                  <span
                    className={cn("absolute inset-y-0 left-0", BAR_COLOR[stage] ?? "bg-primary")}
                    style={{ width: `${(total.weighted / largest) * 100}%` }}
                  />
                </span>
                <StageTotals total={total} className="ml-auto shrink-0 text-right font-normal" />
              </button>
            </h2>
            {isExpanded && (
              <ul className="divide-y border-t">
                {rows.map((o) => (
                  <li key={o.id} aria-label={o.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                    <div className="min-w-48 flex-1">
                      <OpportunityLink opportunity={o} />
                      <div className="text-xs text-muted-foreground">
                        {o.accountName} · {o.probability}%
                      </div>
                    </div>
                    <span className="text-xs">
                      {isOpenStage(o.stage) ? <ExpectedCloseDate opportunity={o} /> : o.closeDate && formatDate(o.closeDate)}
                    </span>
                    <span className="w-24 text-right font-semibold tabular-nums">{formatEuro(pipelineValue(o))}</span>
                    <OwnerInitials name={o.ownerName} />
                    <StagePicker opportunity={o} disabled={!isEditable(o)} moveTo={moveTo} className="w-40" />
                  </li>
                ))}
                {rows.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">No Opportunities in this Stage.</li>}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
