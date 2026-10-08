// PROTOTYPE variant A: Kanban columns, drag cards between stages (issue #7). Throwaway.
import { useState } from "react"
import { cn } from "@/lib/utils"
import { CLOSED_STAGES, OPEN_STAGES, dateLabel, initials, isClosed, isOverdue, money, moneyShort, totals, value, type Opportunity, type Stage } from "./data"
import { StageSelect, type Board } from "./shared"

export const name = "Kanban columns, drag to move"

export function VariantA({ list, board }: { list: Opportunity[]; board: Board }) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<Stage | null>(null)
  const showClosedColumns = list.some((x) => isClosed(x.stage))

  const drop = (stage: Stage) => {
    if (dragId) board.requestMove(dragId, stage)
    setDragId(null); setOver(null)
  }
  const zoneProps = (stage: Stage) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(stage) },
    onDragLeave: () => setOver((s) => (s === stage ? null : s)),
    onDrop: () => drop(stage),
  })
  const open = list.filter((x) => !isClosed(x.stage))
  const t = totals(open)

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <p className="text-sm text-muted-foreground">
        Open pipeline <span className="font-semibold text-foreground tabular-nums">{money(t.total)}</span> ·
        weighted <span className="font-semibold text-foreground tabular-nums">{money(t.weighted)}</span> · {t.count} Opportunities
      </p>
      <div className="overflow-x-auto pb-2 -mx-1 px-1">
        <div className="flex gap-3 min-w-max">
          {OPEN_STAGES.map((stage) => {
            const cards = list.filter((x) => x.stage === stage)
            const ct = totals(cards)
            return (
              <section key={stage} {...zoneProps(stage)}
                className={cn("w-64 shrink-0 rounded-lg bg-muted/60 p-2 flex flex-col gap-2 transition-colors", over === stage && "bg-accent ring-2 ring-ring/40")}>
                <header className="px-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{stage}</h3>
                    <span className="text-xs text-muted-foreground tabular-nums">{ct.count}</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {money(ct.total)} · <span title="Weighted by probability">wtd {moneyShort(ct.weighted)}</span>
                  </div>
                </header>
                {cards.map((x) => (
                  <article key={x.id} draggable onDragStart={() => setDragId(x.id)} onDragEnd={() => { setDragId(null); setOver(null) }}
                    className={cn("rounded-md border bg-card p-2.5 shadow-xs cursor-grab active:cursor-grabbing text-sm flex flex-col gap-1", dragId === x.id && "opacity-40")}>
                    <div className="font-medium leading-snug">{x.name}</div>
                    <div className="text-xs text-muted-foreground">{x.account}</div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="font-semibold tabular-nums">{money(value(x))}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{x.probability}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={cn("tabular-nums", isOverdue(x) ? "text-destructive font-medium" : "text-muted-foreground")}>
                        {isOverdue(x) ? "Overdue · " : ""}{dateLabel(x.expectedCloseDate)}
                      </span>
                      <span title={x.owner} className="grid size-6 place-items-center rounded-full bg-secondary text-[10px] font-semibold">{initials(x.owner)}</span>
                    </div>
                    {/* Touch screens can't drag: a stage picker on each card. */}
                    <StageSelect opp={x} onMove={(s) => board.requestMove(x.id, s)} className="mt-1 w-full md:hidden" />
                  </article>
                ))}
                {cards.length === 0 && <p className="text-xs text-muted-foreground px-1 py-4 text-center">No Opportunities</p>}
              </section>
            )
          })}
          <div className="w-44 shrink-0 flex flex-col gap-2">
            {CLOSED_STAGES.map((stage) => {
              const cards = list.filter((x) => x.stage === stage)
              const won = stage === "Closed Won"
              return (
                <section key={stage} {...zoneProps(stage)}
                  className={cn("rounded-lg border-2 border-dashed p-3 text-sm flex-1 transition-colors",
                    won ? "border-emerald-500/50" : "border-destructive/40",
                    over === stage && (won ? "bg-emerald-500/10" : "bg-destructive/10"))}>
                  <h3 className="font-semibold">{stage}</h3>
                  <p className="text-xs text-muted-foreground">Drop here to close</p>
                  {showClosedColumns && cards.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 text-xs">
                      {cards.map((x) => (
                        <li key={x.id} draggable onDragStart={() => setDragId(x.id)} className="cursor-grab rounded border bg-card px-2 py-1" title="Drag back to an open stage to reopen">
                          {x.name} <span className="tabular-nums text-muted-foreground">{moneyShort(value(x))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
