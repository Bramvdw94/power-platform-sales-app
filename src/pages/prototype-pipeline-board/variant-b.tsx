// PROTOTYPE variant B: funnel of stage bars that expand into rows; no dragging (issue #7). Throwaway.
import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ALL_STAGES, DEFAULT_PROBABILITY, dateLabel, isClosed, isOverdue, money, totals, value, type Opportunity, type Stage } from "./data"
import { StageSelect, type Board } from "./shared"

export const name = "Funnel bars that expand"

export function VariantB({ list, board }: { list: Opportunity[]; board: Board }) {
  const [openStages, setOpenStages] = useState<Set<Stage>>(new Set(["Negotiation"]))
  const stages = ALL_STAGES.filter((s) => !isClosed(s) || list.some((x) => x.stage === s))
  const max = Math.max(1, ...stages.map((s) => totals(list.filter((x) => x.stage === s)).total))
  const open = totals(list.filter((x) => !isClosed(x.stage)))

  const toggle = (s: Stage) => setOpenStages((prev) => {
    const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next
  })

  return (
    <div className="flex flex-col gap-2 max-w-3xl">
      <div className="grid grid-cols-3 gap-3 text-sm mb-2">
        <div><div className="text-xs text-muted-foreground">Open pipeline</div><div className="text-xl font-semibold tabular-nums">{money(open.total)}</div></div>
        <div><div className="text-xs text-muted-foreground">Weighted</div><div className="text-xl font-semibold tabular-nums">{money(open.weighted)}</div></div>
        <div><div className="text-xs text-muted-foreground">Open Opportunities</div><div className="text-xl font-semibold tabular-nums">{open.count}</div></div>
      </div>
      {stages.map((stage) => {
        const rows = list.filter((x) => x.stage === stage).sort((a, b) => a.expectedCloseDate.localeCompare(b.expectedCloseDate))
        const t = totals(rows)
        const expanded = openStages.has(stage)
        return (
          <section key={stage} className="rounded-lg border">
            <button type="button" onClick={() => toggle(stage)} aria-expanded={expanded}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 rounded-lg">
              <ChevronRight className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-90")} />
              <div className="w-32 shrink-0">
                <div className="text-sm font-semibold">{stage}</div>
                <div className="text-xs text-muted-foreground">{t.count} · {DEFAULT_PROBABILITY[stage]}%</div>
              </div>
              <div className="flex-1 min-w-0 h-6 rounded bg-muted overflow-hidden relative" aria-hidden>
                <div className={cn("h-full", stage === "Closed Won" ? "bg-emerald-500/70" : stage === "Closed Lost" ? "bg-destructive/50" : "bg-primary/80")}
                  style={{ width: `${(t.total / max) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 bg-primary/30" style={{ width: `${(t.weighted / max) * 100}%` }} />
              </div>
              <div className="w-28 shrink-0 text-right">
                <div className="text-sm font-semibold tabular-nums">{money(t.total)}</div>
                <div className="text-xs text-muted-foreground tabular-nums">wtd {money(t.weighted)}</div>
              </div>
            </button>
            {expanded && (
              <ul className="border-t divide-y">
                {rows.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-48">
                      <div className="font-medium">{x.name}</div>
                      <div className="text-xs text-muted-foreground">{x.account} · {x.owner}{x.nextStep && ` · Next: ${x.nextStep}`}</div>
                    </div>
                    <span className={cn("text-xs tabular-nums w-24", isOverdue(x) ? "text-destructive font-medium" : "text-muted-foreground")}>
                      {dateLabel(x.closeDate ?? x.expectedCloseDate)}
                    </span>
                    <span className="w-24 text-right font-semibold tabular-nums">{money(value(x))}</span>
                    <StageSelect opp={x} onMove={(s) => board.requestMove(x.id, s)} className="w-40" />
                  </li>
                ))}
                {rows.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">No Opportunities in this stage.</li>}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
