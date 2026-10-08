// PROTOTYPE variants D, E, F: ways to combine the Kanban (A) and the funnel (B) (issue #7). Throwaway.
import { useState } from "react"
import { cn } from "@/lib/utils"
import { OPEN_STAGES, money, moneyShort, totals, type Opportunity } from "./data"
import type { Board } from "./shared"
import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"

type Props = { list: Opportunity[]; board: Board }

export const nameD = "Toggle: Board | Funnel"
export function VariantD({ list, board }: Props) {
  const [view, setView] = useState<"board" | "funnel">("board")
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div role="tablist" aria-label="View" className="inline-flex w-fit rounded-md border p-0.5 text-sm">
        {(["board", "funnel"] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={cn("rounded px-3 py-1", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {v === "board" ? "Board" : "Funnel"}
          </button>
        ))}
      </div>
      {view === "board" ? <VariantA list={list} board={board} /> : <VariantB list={list} board={board} />}
    </div>
  )
}

export const nameE = "Stacked: funnel strip above board"
export function VariantE({ list, board }: Props) {
  const open = list.filter((x) => OPEN_STAGES.includes(x.stage as typeof OPEN_STAGES[number]))
  const t = totals(open)
  const shades = ["bg-primary/30", "bg-primary/50", "bg-primary/70", "bg-primary/90"]
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <section aria-label="Funnel" className="flex flex-col gap-1.5">
        <div className="flex h-7 w-full overflow-hidden rounded-md bg-muted">
          {OPEN_STAGES.map((s, i) => {
            const st = totals(open.filter((x) => x.stage === s))
            return st.total > 0 ? (
              <div key={s} className={cn("h-full border-r border-background last:border-r-0", shades[i])}
                style={{ width: `${(st.total / Math.max(1, t.total)) * 100}%` }} title={`${s}: ${money(st.total)}`} />
            ) : null
          })}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
          {OPEN_STAGES.map((s, i) => {
            const st = totals(open.filter((x) => x.stage === s))
            return (
              <div key={s} className="flex items-center gap-1.5 min-w-0">
                <span className={cn("size-2.5 shrink-0 rounded-sm", shades[i])} />
                <span className="truncate">{s}</span>
                <span className="ml-auto tabular-nums font-medium">{moneyShort(st.total)}</span>
                <span className="tabular-nums text-muted-foreground">/ {moneyShort(st.weighted)}</span>
              </div>
            )
          })}
        </div>
      </section>
      <VariantA list={list} board={board} />
    </div>
  )
}

export const nameF = "Split: board on desktop, funnel on phone"
export function VariantF({ list, board }: Props) {
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <p className="text-xs text-muted-foreground">Narrow the window (or open on a phone) to see the phone layout.</p>
      <div className="hidden md:block min-w-0"><VariantA list={list} board={board} /></div>
      <div className="md:hidden"><VariantB list={list} board={board} /></div>
    </div>
  )
}
