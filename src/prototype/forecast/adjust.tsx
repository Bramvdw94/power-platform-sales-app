/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): the Adjustment editor every variant wraps
// in its own container (dialog, side panel or popover).

import { useState } from "react"
import { History, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatEuro } from "@/lib/format"
import { cn } from "@/lib/utils"
import { forecastFigures, type DateOnly, type Id, type Opportunity, type Quota } from "@/sales"
import { monthLabel } from "@/pages/forecast/forecast-format"
import { adjustmentKey, currentAdjustment, FIGURE_LABEL, nameOf, useAdjustments, type AdjustFigure } from "./model"
import { timestamp } from "./shared"

const lastDay = (month: DateOnly) => {
  const [y, m] = month.split("-").map(Number)
  return `${month.slice(0, 8)}${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`
}

/** One person's calculated figures for one month. */
export function calculated(opportunities: Opportunity[], quotas: Quota[], personIds: Id[], month: DateOnly) {
  return forecastFigures(
    opportunities.filter((o) => personIds.includes(o.ownerId)),
    quotas.filter((q) => personIds.includes(q.salespersonId)),
    { key: month, from: month, to: lastDay(month), months: [month] },
  )
}

/** The adjusted amount in force for a person, month and figure, or null. */
export function useAdjusted(personId: Id | "team", month: DateOnly, figure: AdjustFigure) {
  const events = useAdjustments((s) => s.events[adjustmentKey(personId, month, figure)])
  return { current: currentAdjustment(events), events: events ?? [] }
}

export type AdjustTarget = { personId: Id; month: DateOnly; figure: AdjustFigure; calculated: number }

export function adjustTitle(t: AdjustTarget) {
  return `${nameOf(t.personId)}: ${FIGURE_LABEL[t.figure]}, ${monthLabel(t.month)}`
}

/** Amount, required note, Save and Reset, and the history underneath. */
export function AdjustEditor({ target, onDone, compact = false }: { target: AdjustTarget; onDone?: () => void; compact?: boolean }) {
  const { current, events } = useAdjusted(target.personId, target.month, target.figure)
  const adjust = useAdjustments((s) => s.adjust)
  const reset = useAdjustments((s) => s.reset)
  const key = adjustmentKey(target.personId, target.month, target.figure)
  const [amount, setAmount] = useState(String(current?.amount ?? target.calculated))
  const [note, setNote] = useState("")
  const [showHistory, setShowHistory] = useState(!compact)
  const value = Number(amount)
  const valid = amount.trim() !== "" && Number.isFinite(value) && value >= 0
  const id = `adj-${target.personId}-${target.month}-${target.figure}`

  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-2 gap-2 rounded-md border p-2">
        <div>
          <dt className="text-xs text-muted-foreground">Calculated</dt>
          <dd className="font-semibold tabular-nums">{formatEuro(target.calculated)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Adjusted now</dt>
          <dd className="font-semibold tabular-nums">{current ? formatEuro(current.amount ?? 0) : "Not adjusted"}</dd>
        </div>
      </dl>
      <div className="space-y-1">
        <Label htmlFor={`${id}-amount`}>Adjusted {FIGURE_LABEL[target.figure]}</Label>
        <Input id={`${id}-amount`} type="number" inputMode="decimal" min={0} step={500} value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular-nums" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-note`}>Note (required)</Label>
        <Textarea id={`${id}-note`} rows={compact ? 2 : 3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you expect a different figure" />
        <p className="text-xs text-muted-foreground">The salesperson sees the adjustment and your note. Their Opportunities don't change.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!valid || note.trim() === ""}
          onClick={() => {
            adjust(key, value, note.trim())
            setNote("")
            onDone?.()
          }}
        >
          Save adjustment
        </Button>
        {current && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={note.trim() === ""}
            title={note.trim() === "" ? "Add a note to Reset" : undefined}
            onClick={() => {
              reset(key, note.trim())
              setNote("")
              setAmount(String(target.calculated))
              onDone?.()
            }}
          >
            <RotateCcw aria-hidden />
            Reset to calculated
          </Button>
        )}
        {compact && events.length > 0 && (
          <Button type="button" size="sm" variant="ghost" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            <History aria-hidden />
            History ({events.length})
          </Button>
        )}
      </div>
      {showHistory && <AdjustHistory events={events} />}
    </div>
  )
}

export function AdjustHistory({ events }: { events: ReturnType<typeof useAdjusted>["events"] }) {
  if (events.length === 0) return <p className="text-xs text-muted-foreground">No adjustments yet.</p>
  return (
    <section aria-label="Adjustment history" className="space-y-1">
      <h3 className="text-xs font-semibold text-muted-foreground">History</h3>
      <ol className="space-y-2 border-l pl-3">
        {[...events].reverse().map((e, i) => (
          <li key={i} className={cn("text-xs", i > 0 && "text-muted-foreground")}>
            <p className="font-medium text-foreground">{e.amount === null ? "Reset to calculated" : `Set to ${formatEuro(e.amount)}`}</p>
            <p>“{e.note}”</p>
            <p className="text-muted-foreground">
              {e.by} · {timestamp(e.at)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
