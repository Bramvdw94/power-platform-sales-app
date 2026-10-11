// PROTOTYPE (wayfinder #67): throwaway. Never merge to main.
/* eslint-disable react-refresh/only-export-components -- prototype */
// What a record page needs to show and move a running Process. In the real
// build the plug-in enforces this server-side (ADR 0001); here it is all app-side.

import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { LEAD_SOURCE_LABELS, formatDate, formatEuro } from "@/lib/format"
import { LEAD_SOURCES, toDateOnly, type OpenStage } from "@/sales"
import { cn } from "@/lib/utils"
import {
  currentMapping,
  evaluateCheck,
  fieldLabel,
  isLeadStatusMapping,
  landingStep,
  pickProcess,
  setProgress,
  useProcessState,
  type AnyRecord,
  type ProcessDef,
  type Step,
} from "./model"

export function useRecordProcess(r: AnyRecord) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const { processes, progress } = useProcessState()
  const id = r.record.id
  const { data: activities = [] } = useQuery({
    queryKey: ["activities", r.table, id],
    queryFn: () => gateway.listActivities({ type: r.table, id }),
  })

  // The prototype picks the Process on first view; the real build picks it once at creation.
  const existing = progress[id]
  useEffect(() => {
    if (existing) return
    const picked = pickProcess(r, processes)
    if (picked?.published) {
      setProgress(id, { processId: picked.draft.id, version: picked.published.version, stepIndex: landingStep(picked.published.def, currentMapping(r)) })
    }
  }, [existing, id, processes, r])

  const record = existing && processes.find((p) => p.draft.id === existing.processId)
  // Records stay on the version they started on (#60); the prototype keeps only the latest one.
  const def: ProcessDef | undefined = record?.published?.def
  const stepIndex = existing?.stepIndex ?? 0
  const step: Step | undefined = def?.steps[stepIndex]
  const results = step ? step.gate.map((c) => evaluateCheck(r, c, activities)) : []
  const unmet = results.filter((x) => !x.passed)
  const isLast = !!def && stepIndex === def.steps.length - 1
  const isOpen = r.table === "opportunity" ? !r.record.stage.startsWith("closed") : r.record.status === "notContacted" || r.record.status === "working"

  const move = useMutation({
    mutationFn: async (to: number) => {
      if (!def || !existing) return
      const target = def.steps[to]
      if (target.maps !== currentMapping(r)) {
        if (r.table === "opportunity") await gateway.changeStage(id, target.maps as OpenStage)
        else if (isLeadStatusMapping(target.maps)) await gateway.setLeadStatus(id, target.maps)
      }
      // Actions run when a record enters a Step moving forward.
      if (to > existing.stepIndex) {
        for (const action of target.actions) {
          if (action.kind === "createTask") {
            const duplicate = activities.some((a) => a.kind === "task" && !a.completed && a.subject === action.subject)
            if (!duplicate) {
              const due = new Date()
              due.setDate(due.getDate() + action.dueInDays)
              await gateway.addTask({ type: r.table, id }, { subject: action.subject, dueDate: toDateOnly(due) })
            }
          } else if (r.table === "opportunity") {
            await gateway.updateOpportunity(id, { [action.field]: action.value })
          } else {
            await gateway.updateLead(id, { [action.field]: action.value })
          }
        }
      }
      setProgress(id, { ...existing, stepIndex: to })
    },
    onSuccess: () => invalidate(),
  })

  return {
    def,
    version: record?.published?.version,
    stepIndex,
    step,
    results,
    unmet,
    isLast,
    isOpen,
    activities,
    moving: move.isPending,
    error: move.error,
    forward: () => unmet.length === 0 && !isLast && move.mutate(stepIndex + 1),
    back: () => stepIndex > 0 && move.mutate(stepIndex - 1),
  }
}

export type RecordProcess = ReturnType<typeof useRecordProcess>

/** One Key field, edited in place: saved when it loses focus. */
export function KeyField({ r, field, canEdit, compact }: { r: AnyRecord; field: string; canEdit: boolean; compact?: boolean }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const raw = (r.record as Record<string, unknown>)[field]
  const [value, setValue] = useState(raw === undefined || raw === null ? "" : String(raw))
  useEffect(() => setValue(raw === undefined || raw === null ? "" : String(raw)), [raw])
  const save = useMutation({
    mutationFn: async (v: string) => {
      const patch = { [field]: field === "estimatedValue" || field === "probability" ? Number(v) : v }
      if (r.table === "opportunity") await gateway.updateOpportunity(r.record.id, patch)
      else await gateway.updateLead(r.record.id, patch)
    },
    onSuccess: () => invalidate(),
  })
  const label = fieldLabel(r.table, field)
  const empty = raw === undefined || raw === null || raw === ""
  const inputClass = cn(
    "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    empty && "border-amber-500/70",
  )

  let control
  if (field === "primaryContactId") {
    control = <span className="text-sm">{r.table === "opportunity" ? (r.record.primaryContactName ?? "—") : "—"}</span>
  } else if (!canEdit) {
    control = <span className="text-sm">{display(field, raw)}</span>
  } else if (field === "leadSource") {
    control = (
      <select className={inputClass} value={value} onChange={(e) => save.mutate(e.target.value)}>
        <option value="">—</option>
        {LEAD_SOURCES.map((s) => (
          <option key={s} value={s}>
            {LEAD_SOURCE_LABELS[s]}
          </option>
        ))}
      </select>
    )
  } else {
    const type = field === "expectedCloseDate" ? "date" : field === "estimatedValue" || field === "probability" ? "number" : "text"
    control = (
      <input
        className={inputClass}
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== String(raw ?? "") && save.mutate(value)}
      />
    )
  }
  return (
    <label className={cn("block min-w-0 space-y-1", compact && "text-xs")}>
      <span className="text-xs text-muted-foreground">
        {label}
        {empty && <span className="text-amber-700 dark:text-amber-400"> · empty</span>}
      </span>
      <div>{control}</div>
    </label>
  )
}

function display(field: string, raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "—"
  if (field === "estimatedValue") return formatEuro(Number(raw))
  if (field === "expectedCloseDate") return formatDate(String(raw))
  if (field === "leadSource") return LEAD_SOURCE_LABELS[raw as keyof typeof LEAD_SOURCE_LABELS] ?? String(raw)
  if (field === "probability") return `${raw}%`
  return String(raw)
}
