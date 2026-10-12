// PROTOTYPE (wayfinder #67): throwaway. Never merge to main.
/* eslint-disable react-refresh/only-export-components -- prototype */
// Three ways to show a running Process on a Lead or Opportunity record page,
// switchable with ?variant=A|B|C (floating bar at the bottom).

import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck, CircleDashed, Lightbulb, Workflow, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import { describeError } from "@/lib/errors"
import { cn } from "@/lib/utils"
import type { VariantOption } from "../prototype-switcher"
import { MAP_LABELS, describeAction, describeCheck, type AnyRecord, type CheckResult } from "./model"
import { KeyField, useRecordProcess, type RecordProcess } from "./runtime"

export const BAR_VARIANTS: VariantOption[] = [
  { key: "A", name: "Path + coaching panel" },
  { key: "B", name: "Checklist card" },
  { key: "C", name: "Next-move strip" },
]

type BarProps = { r: AnyRecord; canEdit: boolean; onFinish: () => void; fallback?: React.ReactNode }

/** Rendered at the top of the record's main column. */
export function ProcessBarMain(props: BarProps) {
  // Decided in wayfinder #67: variant A. Pinned so ?variant= drives the Business rules prototype (#87).
  const variant: string = "A"
  const isDesktop = useIsDesktop()
  const p = useRecordProcess(props.r)
  return (
    <>
      {!p.def ? (
        (props.fallback ?? <NoProcess r={props.r} />)
      ) : variant === "A" ? (
        <PathVariant p={p} {...props} />
      ) : variant === "B" ? (
        isDesktop ? null : <ChecklistVariant p={p} {...props} collapsible />
      ) : (
        <StripVariant p={p} {...props} />
      )}
    </>
  )
}

/** Rendered above the activity timeline on a desktop (variant B only). */
export function ProcessBarSide(props: BarProps) {
  // Decided in wayfinder #67: variant A. Pinned so ?variant= drives the Business rules prototype (#87).
  const variant: string = "A"
  const isDesktop = useIsDesktop()
  const p = useRecordProcess(props.r)
  if (variant !== "B" || !isDesktop || !p.def) return null
  return <ChecklistVariant p={p} {...props} />
}

/** Whether the record page should keep its v1 Stage path: only when no Process runs. */
export function useHasProcess(r: AnyRecord) {
  return !!useRecordProcess(r).def
}

function NoProcess({ r }: { r: AnyRecord }) {
  return (
    <p className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      <Workflow className="size-4" aria-hidden />
      This {r.table === "opportunity" ? "Opportunity" : "Lead"} follows no Process.
    </p>
  )
}

function finishLabel(r: AnyRecord) {
  return r.table === "opportunity" ? "Close" : "Qualify"
}

function ProcessName({ p }: { p: RecordProcess }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Workflow className="size-3.5" aria-hidden />
      {p.def!.name} · v{p.version}
      <Link to={`/processes/${p.def!.id}`} className="text-primary hover:underline">
        view
      </Link>
    </span>
  )
}

function CheckList({ results, compact }: { results: CheckResult[]; compact?: boolean }) {
  if (results.length === 0) return <p className="text-sm text-muted-foreground">Nothing to check: move on when ready.</p>
  return (
    <ul className={cn("space-y-1.5", compact && "space-y-1")}>
      {results.map((x) => (
        <li key={x.check.id} className="flex items-start gap-2 text-sm">
          {x.passed ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-600" aria-label="Done" />
          ) : (
            <CircleDashed className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-label="Open" />
          )}
          <span className={cn(x.passed && "text-muted-foreground")}>
            {x.label}
            {x.detail && !x.passed && <span className="text-muted-foreground"> ({x.detail})</span>}
            {!x.passed && x.check.kind === "related" && (
              <span className="block text-xs text-muted-foreground">Log it in the Activity timeline.</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

function MoveButtons({ p, r, canEdit, onFinish, size }: { p: RecordProcess; size?: "sm" } & BarProps) {
  if (!canEdit || !p.isOpen) return null
  const blocked = p.unmet.length > 0
  const next = p.def!.steps[p.stepIndex + 1]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {p.stepIndex > 0 && (
        <Button variant="outline" size={size} disabled={p.moving} onClick={p.back}>
          <ArrowLeft aria-hidden />
          Back
        </Button>
      )}
      {p.isLast ? (
        <Button size={size} disabled={p.moving || (r.table === "lead" && blocked)} onClick={onFinish}>
          {finishLabel(r)}
        </Button>
      ) : (
        <Button size={size} disabled={p.moving || blocked} onClick={p.forward}>
          {blocked ? `${p.unmet.length} open check${p.unmet.length === 1 ? "" : "s"}` : `Next: ${next.name}`}
          <ArrowRight aria-hidden />
        </Button>
      )}
      {p.isLast && r.table === "opportunity" && blocked && (
        <span className="text-xs text-amber-700 dark:text-amber-400">Closed Won needs the open checks; Closed Lost does not.</span>
      )}
      {p.error && <span className="text-xs text-destructive">{describeError(p.error)}</span>}
    </div>
  )
}

// --- A: Path + coaching panel (Salesforce Path style) -------------------------

function PathVariant({ p, r, canEdit, onFinish }: { p: RecordProcess } & BarProps) {
  const isDesktop = useIsDesktop()
  const [viewing, setViewing] = useState<number | null>(null)
  const [open, setOpen] = useState(true)
  const steps = p.def!.steps
  const shown = viewing ?? p.stepIndex
  const step = steps[shown]
  const isCurrent = shown === p.stepIndex

  return (
    <section aria-label="Process" className="rounded-md border">
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <ProcessName p={p} />
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen(!open)}>
          {open ? "Hide guidance" : "Show guidance"}
        </button>
      </div>

      {isDesktop ? (
        <ol className="flex gap-0.5 p-3">
          {steps.map((s, i) => {
            const done = i < p.stepIndex
            const current = i === p.stepIndex
            return (
              <li key={s.id} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setViewing(i === p.stepIndex ? null : i)}
                  className={cn(
                    "flex h-10 w-full flex-col items-center justify-center px-3 text-sm [clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)] first:[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%)]",
                    current ? "bg-primary text-primary-foreground" : done ? "bg-primary/20" : "bg-muted text-foreground/75",
                    shown === i && !current && "ring-2 ring-primary ring-inset",
                  )}
                >
                  <span className="flex max-w-full items-center gap-1 truncate font-medium">
                    {done && <Check className="size-3.5 shrink-0" aria-hidden />}
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="truncate text-[10px] opacity-80">{MAP_LABELS[s.maps]}</span>
                </button>
              </li>
            )
          })}
          <li className="w-28 shrink-0">
            <span className="flex h-10 items-center justify-center rounded-r-md bg-muted text-sm text-foreground/75">
              {r.table === "opportunity" ? "Closed" : "Qualified"}
            </span>
          </li>
        </ol>
      ) : (
        <div className="flex items-center gap-2 p-3">
          <Button variant="ghost" size="icon" aria-label="Previous Step" disabled={shown === 0} onClick={() => setViewing(shown - 1)}>
            <ChevronLeft />
          </Button>
          <div className={cn("flex-1 rounded-md px-3 py-1.5 text-center", isCurrent ? "bg-primary text-primary-foreground" : "bg-muted")}>
            <p className="text-sm font-medium">{step.name}</p>
            <p className="text-[11px] opacity-80">
              {MAP_LABELS[step.maps]} · Step {shown + 1} of {steps.length}
              {!isCurrent && " · preview"}
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Next Step" disabled={shown === steps.length - 1} onClick={() => setViewing(shown + 1)}>
            <ChevronRight />
          </Button>
        </div>
      )}

      {open && (
        <div className="grid gap-4 border-t p-3 md:grid-cols-3">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Key fields</h3>
            {step.keyFields.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
            {step.keyFields.map((f) => (
              <KeyField key={f} r={r} field={f} canEdit={canEdit && isCurrent && p.isOpen} />
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">To move on</h3>
            {isCurrent ? (
              <CheckList results={p.results} />
            ) : (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {step.gate.map((c) => (
                  <li key={c.id}>• {p.results.find((x) => x.check.id === c.id)?.label ?? describeCheck(r.table, c)}</li>
                ))}
                {step.gate.length === 0 && <li>No checks</li>}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Guidance</h3>
            <p className="text-sm">{step.guidance || "—"}</p>
            {step.actions.length > 0 && (
              <p className="text-xs text-muted-foreground">On entering: {step.actions.map((a) => describeAction(r.table, a)).join("; ")}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t p-3">
        {isCurrent ? (
          <MoveButtons p={p} r={r} canEdit={canEdit} onFinish={onFinish} />
        ) : (
          <Button variant="link" className="px-0" onClick={() => setViewing(null)}>
            Back to the current Step
          </Button>
        )}
      </div>
    </section>
  )
}

// --- B: Checklist card (vertical stepper beside the activity) ----------------

function ChecklistVariant({ p, r, canEdit, onFinish, collapsible }: { p: RecordProcess; collapsible?: boolean } & BarProps) {
  const [expanded, setExpanded] = useState(!collapsible)
  const steps = p.def!.steps
  const passed = p.results.filter((x) => x.passed).length

  return (
    <section aria-label="Process" className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-2 p-3 text-left"
        onClick={() => collapsible && setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {steps[p.stepIndex].name}
            <span className="font-normal text-muted-foreground">
              {" "}
              · Step {p.stepIndex + 1} of {steps.length}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {passed} of {p.results.length} checks done · {p.def!.name}
          </p>
        </div>
        {collapsible && <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />}
      </button>

      {expanded && (
        <ol className="border-t px-3 py-2">
          {steps.map((s, i) => {
            const done = i < p.stepIndex
            const current = i === p.stepIndex
            return (
              <li key={s.id} className="relative flex gap-3 pb-3 last:pb-1">
                {i < steps.length - 1 && <span className="absolute top-6 bottom-0 left-[9px] w-px bg-border" aria-hidden />}
                <span className="relative z-10 mt-0.5">
                  {done ? (
                    <CircleCheck className="size-5 bg-background text-green-600" />
                  ) : current ? (
                    <Circle className="size-5 fill-primary bg-background text-primary" />
                  ) : (
                    <Circle className="size-5 bg-background text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className={cn("text-sm", current ? "font-semibold" : "text-muted-foreground")}>
                    {s.name} <span className="text-xs font-normal text-muted-foreground">({MAP_LABELS[s.maps]})</span>
                  </p>
                  {current && (
                    <>
                      {s.guidance && <p className="rounded bg-muted p-2 text-xs">{s.guidance}</p>}
                      <CheckList results={p.results} compact />
                      {s.keyFields.length > 0 && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {s.keyFields.map((f) => (
                            <KeyField key={f} r={r} field={f} canEdit={canEdit && p.isOpen} compact />
                          ))}
                        </div>
                      )}
                      <MoveButtons p={p} r={r} canEdit={canEdit} onFinish={onFinish} size="sm" />
                    </>
                  )}
                </div>
              </li>
            )
          })}
          <li className="flex gap-3 pt-1 text-sm text-muted-foreground">
            <Circle className="size-5 border-dashed" />
            {r.table === "opportunity" ? "Close" : "Qualify"}
          </li>
        </ol>
      )}
    </section>
  )
}

// --- C: Next-move strip (one action, details on demand) ----------------------

function StripVariant({ p, r, canEdit, onFinish }: { p: RecordProcess } & BarProps) {
  const isDesktop = useIsDesktop()
  const [checking, setChecking] = useState(false)
  const [tip, setTip] = useState(false)
  const steps = p.def!.steps
  const step = steps[p.stepIndex]
  const next = steps[p.stepIndex + 1]
  const blocked = p.unmet.length > 0

  const primary =
    canEdit && p.isOpen ? (
      <Button
        className={cn(!isDesktop && "w-full")}
        disabled={p.moving}
        variant={blocked && !p.isLast ? "outline" : "default"}
        onClick={() => (p.isLast && !(r.table === "lead" && blocked) ? onFinish() : blocked ? setChecking(true) : p.forward())}
      >
        {p.isLast ? finishLabel(r) : blocked ? `${p.unmet.length} to do before ${next.name}` : `Next: ${next.name}`}
        <ArrowRight aria-hidden />
      </Button>
    ) : null

  return (
    <section aria-label="Process" className="space-y-2 rounded-md border p-3">
      <div className="flex gap-1" aria-hidden>
        {steps.map((s, i) => (
          <span
            key={s.id}
            title={s.name}
            className={cn("h-1.5 flex-1 rounded-full", i < p.stepIndex ? "bg-primary" : i === p.stepIndex ? "bg-primary/60" : "bg-muted")}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold">{step.name}</span>
            <span className="text-muted-foreground">
              {" "}
              · {MAP_LABELS[step.maps]} · Step {p.stepIndex + 1} of {steps.length}
            </span>
            {step.guidance && (
              <button type="button" className="ml-2 inline-flex align-middle text-amber-700 dark:text-amber-400" aria-label="Guidance" onClick={() => setTip(!tip)}>
                <Lightbulb className="size-4" />
              </button>
            )}
          </p>
          <ProcessName p={p} />
        </div>
        {p.stepIndex > 0 && canEdit && p.isOpen && (
          <Button variant="ghost" size="sm" disabled={p.moving} onClick={p.back}>
            <ArrowLeft aria-hidden />
            Back
          </Button>
        )}
        {isDesktop && primary}
      </div>
      {tip && <p className="rounded bg-amber-500/10 p-2 text-sm">{step.guidance}</p>}
      {step.keyFields.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {step.keyFields.map((f) => (
            <KeyField key={f} r={r} field={f} canEdit={canEdit && p.isOpen} compact />
          ))}
        </div>
      )}
      {!isDesktop && primary && (
        <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-background p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">{primary}</div>
      )}

      <Dialog open={checking} onOpenChange={setChecking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Before {next?.name ?? finishLabel(r)}</DialogTitle>
            <DialogDescription>These checks on “{step.name}” are still open.</DialogDescription>
          </DialogHeader>
          <CheckList results={p.results} />
          <div className="grid gap-2">
            {p.unmet
              .filter((x) => x.check.kind !== "related")
              .map((x) => (
                <KeyField key={x.check.id} r={r} field={(x.check as { field: string }).field} canEdit={canEdit} />
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChecking(false)}>
              <X aria-hidden />
              Close
            </Button>
            <Button
              disabled={p.unmet.length > 0}
              onClick={() => {
                setChecking(false)
                p.forward()
              }}
            >
              Move on
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
