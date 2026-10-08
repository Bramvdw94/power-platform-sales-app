// PROTOTYPE variant C: stage path on top, one sortable table below (issue #7). Throwaway.
import { useState } from "react"
import { cn } from "@/lib/utils"
import { ALL_STAGES, OPEN_STAGES, dateLabel, initials, isClosed, isOverdue, money, moneyShort, totals, value, type Opportunity, type Stage } from "./data"
import { StageSelect, type Board } from "./shared"

export const name = "Stage path + table"

type Sort = "close" | "value" | "probability"

export function VariantC({ list, board }: { list: Opportunity[]; board: Board }) {
  const [selected, setSelected] = useState<Stage | "open">("open")
  const [sort, setSort] = useState<Sort>("close")
  const stages = ALL_STAGES.filter((s) => !isClosed(s) || list.some((x) => x.stage === s))
  const rows = list
    .filter((x) => (selected === "open" ? !isClosed(x.stage) : x.stage === selected))
    .sort((a, b) => sort === "close" ? a.expectedCloseDate.localeCompare(b.expectedCloseDate)
      : sort === "value" ? value(b) - value(a) : b.probability - a.probability)
  const openT = totals(list.filter((x) => !isClosed(x.stage)))

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="overflow-x-auto">
        <div className="flex min-w-max">
          <button type="button" onClick={() => setSelected("open")}
            className={cn("px-4 py-2 rounded-l-full border text-left", selected === "open" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}>
            <div className="text-xs opacity-80">All open</div>
            <div className="text-sm font-semibold tabular-nums">{moneyShort(openT.total)}</div>
          </button>
          {stages.map((s, i) => {
            const t = totals(list.filter((x) => x.stage === s))
            const active = selected === s
            return (
              <button key={s} type="button" onClick={() => setSelected(s)}
                className={cn("px-4 py-2 border border-l-0 text-left", i === stages.length - 1 && "rounded-r-full",
                  active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
                  !active && s === "Closed Won" && "text-emerald-700 dark:text-emerald-400",
                  !active && s === "Closed Lost" && "text-destructive")}>
                <div className="text-xs opacity-80 whitespace-nowrap">{s} · {t.count}</div>
                <div className="text-sm font-semibold tabular-nums">{moneyShort(t.total)}{OPEN_STAGES.includes(s as typeof OPEN_STAGES[number]) && <span className="font-normal opacity-70"> / {moneyShort(t.weighted)}</span>}</div>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {selected === "open" ? "All open Opportunities" : selected} · {rows.length} ·{" "}
          <span className="text-foreground font-medium tabular-nums">{money(totals(rows).total)}</span>{" "}
          (weighted {money(totals(rows).weighted)})
        </span>
        <span className="flex items-center gap-1 text-xs">
          Sort:
          {(["close", "value", "probability"] as Sort[]).map((k) => (
            <button key={k} type="button" onClick={() => setSort(k)}
              className={cn("rounded px-2 py-1", sort === k ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}>
              {k === "close" ? "Close date" : k === "value" ? "Value" : "Probability"}
            </button>
          ))}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Opportunity</th>
              <th className="text-left font-medium px-3 py-2">Owner</th>
              <th className="text-left font-medium px-3 py-2">Close date</th>
              <th className="text-right font-medium px-3 py-2">Value</th>
              <th className="text-right font-medium px-3 py-2">Prob.</th>
              <th className="text-left font-medium px-3 py-2">Stage</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((x) => (
              <tr key={x.id}>
                <td className="px-3 py-2"><div className="font-medium">{x.name}</div><div className="text-xs text-muted-foreground">{x.account}</div></td>
                <td className="px-3 py-2"><span title={x.owner} className="grid size-7 place-items-center rounded-full bg-secondary text-[10px] font-semibold">{initials(x.owner)}</span></td>
                <td className={cn("px-3 py-2 whitespace-nowrap tabular-nums", isOverdue(x) ? "text-destructive font-medium" : "")}>{dateLabel(x.closeDate ?? x.expectedCloseDate)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(value(x))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.probability}%</td>
                <td className="px-3 py-2"><StageSelect opp={x} onMove={(s) => board.requestMove(x.id, s)} className="w-40" /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">No Opportunities here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
