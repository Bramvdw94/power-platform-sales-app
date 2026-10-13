import { useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { ArrowLeft, ArrowRight, BadgeCheck, Check, ChevronLeft, ChevronRight, Circle, Eye, EyeOff, Trophy } from "lucide-react"
import { FormAlert } from "@/components/records/fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import type { RecordProcess } from "@/hooks/use-process"
import { LEAD_STATUS_LABELS, STAGE_LABELS } from "@/lib/format"
import { STEP_STATUS_LABELS, describeCheck } from "@/lib/process-labels"
import { cn } from "@/lib/utils"
import { isOpenStage, opportunityRelated, activityRelated, toEngineRecord, type Lead, type Opportunity, type ProcessKind, type ProductLine, type Quote } from "@/sales"
import { gateChecklist, keyFieldsOf, stepIndex, type Action, type ConditionScope, type Parents, type Step } from "@/sales/engine"
import { KeyFields } from "./key-fields"
import { SwitchProcessButton } from "./switch-process"

type Following = Extract<RecordProcess, { status: "following" }>

type ProcessBarProps = {
  table: ProcessKind
  record: Lead | Opportunity
  process: Following
  /** The Owner or the Owner's manager: may edit Key fields and move Steps. */
  canEdit: boolean
  /** The Owner's manager or a Process builder. */
  canSwitch: boolean
  parents?: Parents
  productLines?: ProductLine[]
  quotes?: Quote[]
  /** The last Step's button on an Opportunity: opens the Close dialog. */
  onClose?: () => void
  /** The last Step's button on a Lead: opens the Qualify dialog. */
  onQualify?: () => void
}

function isOpenRecord(table: ProcessKind, record: Lead | Opportunity): boolean {
  return table === "lead" ? (record as Lead).status === "notContacted" || (record as Lead).status === "working" : isOpenStage((record as Opportunity).stage)
}

function endLabel(table: ProcessKind, record: Lead | Opportunity): { label: string; tone: "open" | "won" | "lost" } {
  if (table === "lead") {
    const status = (record as Lead).status
    if (status === "qualified") return { label: LEAD_STATUS_LABELS.qualified, tone: "won" }
    if (status === "disqualified") return { label: LEAD_STATUS_LABELS.disqualified, tone: "lost" }
    return { label: "Qualified", tone: "open" }
  }
  const stage = (record as Opportunity).stage
  if (stage === "closedWon") return { label: STAGE_LABELS.closedWon, tone: "won" }
  if (stage === "closedLost") return { label: STAGE_LABELS.closedLost, tone: "lost" }
  return { label: "Closed", tone: "open" }
}

function actionText(action: Action): string {
  return action.type === "createTask" ? `Task “${action.subject}”` : `Set ${action.field} to ${String(action.value ?? "empty")}`
}

/**
 * The process bar of a record that follows a Process: its Steps as a path, the coaching panel for the
 * current Step (Key fields, the live "To move on" checklist, Guidance, Actions), and Back / Next.
 */
export function ProcessBar({ table, record, process, canEdit, canSwitch, parents, productLines = [], quotes = [], onClose, onQualify }: ProcessBarProps) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const isDesktop = useIsDesktop()
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)

  const { definition } = process
  const steps = definition.steps
  const open = isOpenRecord(table, record)
  const found = stepIndex(definition, record.currentStepId)
  const currentIndex = found >= 0 ? found : 0
  const current = steps[currentIndex]
  const preview = previewId && previewId !== current.id ? steps.find((s) => s.id === previewId) : undefined
  const shown = preview ?? current
  const shownIndex = steps.indexOf(shown)
  const isLast = currentIndex === steps.length - 1
  const end = endLabel(table, record)

  const activities = useQuery({ queryKey: ["activities", table, record.id], queryFn: () => gateway.listActivities({ type: table, id: record.id }) })
  const related = useMemo(
    () => (table === "opportunity" ? opportunityRelated(activities.data ?? [], productLines, quotes) : activityRelated(activities.data ?? [])),
    [table, activities.data, productLines, quotes],
  )
  const scope: ConditionScope = useMemo(() => ({ table, record: toEngineRecord(record), parents, related }), [table, record, parents, related])
  const checklist = gateChecklist(shown, scope)
  const currentChecklist = shown === current ? checklist : gateChecklist(current, scope)
  const openChecks = currentChecklist.filter((r) => !r.passed).length

  const move = useMutation({
    mutationFn: (stepId: string) => gateway.moveStep({ type: table, id: record.id }, stepId),
    onSuccess: () => {
      setPreviewId(null)
      return invalidate()
    },
  })

  const next = steps[currentIndex + 1]
  const previous = steps[currentIndex - 1]
  const canMove = canEdit && open
  const pick = (step: Step) => setPreviewId(step.id === current.id ? null : step.id)
  const showPanel = !hidden && (open || !!preview)
  const stepHint = (step: Step) => STEP_STATUS_LABELS[step.mapsTo]

  return (
    <section aria-label="Process" className="space-y-3 rounded-md border p-3 md:p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{process.process.name}</h2>
        {process.retired && <Badge variant="outline">Retired process</Badge>}
        <div className="ml-auto flex items-center gap-2">
          {canSwitch && open && <SwitchProcessButton table={table} record={record} />}
          {open && (
            <Button variant="ghost" size="sm" onClick={() => setHidden((h) => !h)} aria-pressed={hidden}>
              {hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
              {hidden ? "Show coaching" : "Hide coaching"}
            </Button>
          )}
        </div>
      </header>

      {isDesktop ? (
        <nav aria-label="Steps">
          <ol className="flex flex-wrap gap-1">
            {steps.map((step, index) => {
              const isCurrent = open && index === currentIndex
              const done = open ? index < currentIndex : true
              const previewing = preview === step
              return (
                <li key={step.id} className="min-w-28 flex-1">
                  <button
                    type="button"
                    aria-current={isCurrent ? "step" : undefined}
                    onClick={() => pick(step)}
                    title={isCurrent ? undefined : `Preview ${step.name}`}
                    className={cn(
                      "flex min-h-12 w-full flex-col items-center justify-center rounded-md px-2 py-1 text-center text-sm leading-tight",
                      isCurrent ? "bg-primary font-medium text-primary-foreground" : done ? "bg-primary/15 text-foreground hover:bg-primary/25" : "bg-muted text-foreground/80 hover:bg-muted/70",
                      previewing && "ring-2 ring-ring",
                    )}
                  >
                    <span className="flex max-w-full items-center gap-1">
                      {done && !isCurrent && <Check className="size-3.5 shrink-0" aria-hidden />}
                      <span>{step.name}</span>
                    </span>
                    <span className={cn("text-xs", isCurrent ? "text-primary-foreground/80" : "text-muted-foreground")}>{stepHint(step)}</span>
                  </button>
                </li>
              )
            })}
            <li className="min-w-24 flex-1">
              <span
                aria-current={!open ? "step" : undefined}
                className={cn(
                  "flex h-12 w-full items-center justify-center rounded-md px-2 text-sm",
                  end.tone === "won" && "bg-green-700 font-medium text-white",
                  end.tone === "lost" && "bg-red-700 font-medium text-white",
                  end.tone === "open" && "bg-muted text-foreground/80",
                )}
              >
                {end.label}
              </span>
            </li>
          </ol>
        </nav>
      ) : (
        <nav aria-label="Steps" className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous Step" disabled={shownIndex <= 0} onClick={() => pick(steps[shownIndex - 1])}>
            <ChevronLeft aria-hidden />
          </Button>
          <div className="min-w-0 flex-1 rounded-md bg-primary px-3 py-1.5 text-center text-primary-foreground">
            <p className="truncate text-sm font-medium">{shown.name}</p>
            <p className="text-xs text-primary-foreground/80">
              Step {shownIndex + 1} of {steps.length} · {stepHint(shown)}
            </p>
          </div>
          <Button variant="outline" size="icon" aria-label="Next Step" disabled={shownIndex >= steps.length - 1} onClick={() => pick(steps[shownIndex + 1])}>
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}

      {!open && (
        <p className="text-sm text-muted-foreground">
          This {table === "lead" ? "Lead" : "Opportunity"} is {end.label}. It keeps {process.process.name}, so a reopened record carries on with it.
        </p>
      )}

      {preview && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <span>
            Previewing “{preview.name}”. It is read-only.
          </span>
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setPreviewId(null)}>
            Back to the current Step
          </Button>
        </div>
      )}

      {showPanel && (
        <div aria-label="Coaching" role="region" className="grid gap-4 rounded-md bg-muted/40 p-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold">Key fields</h3>
            <KeyFields
              table={table}
              record={record}
              fields={keyFieldsOf(shown)}
              editable={canEdit && open && !preview}
              hasProductLines={productLines.length > 0}
              parents={parents}
              related={related}
            />
          </div>
          <div className="min-w-0 space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">To move on</h3>
              {checklist.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to check on this Step.</p>
              ) : (
                <ul className="space-y-1">
                  {checklist.map((result) => (
                    <li key={result.index} className="flex items-start gap-2 text-sm">
                      {result.passed ? <Check className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                      <span>
                        {describeCheck(result.check)}
                        <span className="sr-only">{result.passed ? " (done)" : " (open)"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {shown.guidance && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Guidance</h3>
                <p className="text-sm whitespace-pre-line">{shown.guidance}</p>
              </div>
            )}
            {(shown.actions?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">{shownIndex <= currentIndex && open ? "Actions that ran" : "Actions when you move in"}</h3>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {shown.actions!.map((action) => (
                    <li key={action.id}>{actionText(action)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {open && canMove && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={!previous || move.isPending} onClick={() => previous && move.mutate(previous.id)}>
            <ArrowLeft aria-hidden />
            Back
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {openChecks > 0 && (
              <span className="text-sm text-muted-foreground">
                {openChecks} open {openChecks === 1 ? "check" : "checks"}
              </span>
            )}
            {isLast ? (
              table === "opportunity" ? (
                <Button onClick={onClose}>
                  <Trophy aria-hidden />
                  Close
                </Button>
              ) : (
                <Button disabled={openChecks > 0} onClick={onQualify}>
                  <BadgeCheck aria-hidden />
                  Qualify
                </Button>
              )
            ) : (
              <Button disabled={openChecks > 0 || move.isPending} onClick={() => move.mutate(next.id)}>
                Next: {next.name}
                <ArrowRight aria-hidden />
              </Button>
            )}
          </div>
        </div>
      )}
      {move.isError && <FormAlert error={move.error} />}
    </section>
  )
}
