// PROTOTYPE: shared bits for the pipeline board variants (issue #7). Throwaway.
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ALL_STAGES, DEFAULT_PROBABILITY, LOST_REASONS, SAMPLE, TODAY, isClosed, money,
  type Filters, type Opportunity, type Stage,
} from "./data"

export type Board = {
  all: Opportunity[]
  lastAction: string
  requestMove: (id: string, stage: Stage) => void
}

type Pending = { id: string; stage: "Closed Won" | "Closed Lost" } | null

export function useBoard() {
  const [all, setAll] = useState<Opportunity[]>(SAMPLE)
  const [lastAction, setLastAction] = useState("Nothing yet. Move a card or change a filter.")
  const [pending, setPending] = useState<Pending>(null)

  const requestMove = (id: string, stage: Stage) => {
    const opp = all.find((x) => x.id === id)
    if (!opp || opp.stage === stage) return
    if (stage === "Closed Won" || stage === "Closed Lost") {
      setPending({ id, stage })
      return
    }
    setAll((prev) => prev.map((x) => x.id === id
      ? { ...x, stage, probability: DEFAULT_PROBABILITY[stage], actualValue: undefined, closeDate: undefined, lostReason: undefined }
      : x))
    setLastAction(`${isClosed(opp.stage) ? "Reopened" : "Moved"} "${opp.name}" from ${opp.stage} to ${stage}; probability reset to ${DEFAULT_PROBABILITY[stage]}%.`)
  }

  const confirmClose = (fields: { actualValue?: number; closeDate: string; lostReason?: string }) => {
    if (!pending) return
    const opp = all.find((x) => x.id === pending.id)!
    setAll((prev) => prev.map((x) => x.id === pending.id
      ? { ...x, stage: pending.stage, probability: DEFAULT_PROBABILITY[pending.stage], ...fields }
      : x))
    setLastAction(pending.stage === "Closed Won"
      ? `Closed "${opp.name}" as won for ${money(fields.actualValue ?? 0)} on ${fields.closeDate}. It is now read-only.`
      : `Closed "${opp.name}" as lost (${fields.lostReason}) on ${fields.closeDate}. It is now read-only.`)
    setPending(null)
  }

  const pendingOpp = pending ? all.find((x) => x.id === pending.id) ?? null : null
  const dialog = (
    <CloseDialog
      key={pending ? pending.id + pending.stage : "none"}
      opp={pendingOpp}
      stage={pending?.stage ?? null}
      onCancel={() => { setLastAction(`Cancelled closing "${pendingOpp?.name}"; it stays in ${pendingOpp?.stage}.`); setPending(null) }}
      onConfirm={confirmClose}
    />
  )
  return { board: { all, lastAction, requestMove } satisfies Board, dialog }
}

function CloseDialog({ opp, stage, onCancel, onConfirm }: {
  opp: Opportunity | null
  stage: "Closed Won" | "Closed Lost" | null
  onCancel: () => void
  onConfirm: (f: { actualValue?: number; closeDate: string; lostReason?: string }) => void
}) {
  const [actual, setActual] = useState(String(opp?.estimatedValue ?? ""))
  const [date, setDate] = useState(TODAY)
  const [reason, setReason] = useState<string>("")
  const won = stage === "Closed Won"
  const valid = date && (won ? Number(actual) > 0 : reason)
  return (
    <Dialog open={!!opp} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{won ? "Close as won" : "Close as lost"}</DialogTitle>
          <DialogDescription>{opp?.name} · {opp?.account}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {won && (
            <div className="grid gap-2">
              <Label htmlFor="proto-actual">Actual value (€)</Label>
              <Input id="proto-actual" inputMode="numeric" value={actual} onChange={(e) => setActual(e.target.value.replace(/\D/g, ""))} />
            </div>
          )}
          {!won && (
            <div className="grid gap-2">
              <Label htmlFor="proto-reason">Lost reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="proto-reason" className="w-full"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="proto-date">Close date</Label>
            <Input id="proto-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={!valid} onClick={() => onConfirm(won
            ? { actualValue: Number(actual), closeDate: date }
            : { lostReason: reason, closeDate: date })}>
            {won ? "Close as won" : "Close as lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function StageSelect({ opp, onMove, className }: { opp: Opportunity; onMove: (s: Stage) => void; className?: string }) {
  return (
    <Select value={opp.stage} onValueChange={(v) => onMove(v as Stage)}>
      <SelectTrigger size="sm" className={className} aria-label={`Stage of ${opp.name}`} onClick={(e) => e.stopPropagation()}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{ALL_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
    </Select>
  )
}

export function FilterBar({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={filters.owner} onValueChange={(v) => setFilters({ ...filters, owner: v as Filters["owner"] })}>
        <SelectTrigger size="sm" aria-label="Owner"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="me">My Opportunities</SelectItem>
          <SelectItem value="team">My team</SelectItem>
          <SelectItem value="everyone">Everyone</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.date} onValueChange={(v) => setFilters({ ...filters, date: v as Filters["date"] })}>
        <SelectTrigger size="sm" aria-label="Close date"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any close date</SelectItem>
          <SelectItem value="this-quarter">Closing this quarter</SelectItem>
          <SelectItem value="next-quarter">Closing next quarter</SelectItem>
          <SelectItem value="this-year">Closing this year</SelectItem>
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox id="proto-show-closed" checked={filters.showClosed} onCheckedChange={(c) => setFilters({ ...filters, showClosed: c === true })} />
        Show closed
      </label>
    </div>
  )
}

// Rule 5 of the prototype skill: show what just changed.
export function StateReadout({ lastAction, filters, shown }: { lastAction: string; filters: Filters; shown: number }) {
  return (
    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Prototype state:</span> {lastAction}{" "}
      <span>Filters: owner={filters.owner}, close date={filters.date}, closed={filters.showClosed ? "shown" : "hidden"}; {shown} shown.</span>
    </div>
  )
}
