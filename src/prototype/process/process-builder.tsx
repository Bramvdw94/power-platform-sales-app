// PROTOTYPE (wayfinder #67): throwaway. Never merge to main.
/* eslint-disable react-refresh/only-export-components -- prototype */
// Three ways for a Process builder to build a Process, switchable with
// ?variant=A|B|C: Stage lanes, an outline, or plain-language sentences.

import { useState, type ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Flag, Plus, Trash2, TriangleAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import { cn } from "@/lib/utils"
import type { VariantOption } from "../prototype-switcher"
import {
  ActionsEditor,
  AddButton,
  GateCheckEditor,
  GateEditor,
  GuidanceEditor,
  KeyFieldsEditor,
  MapSelect,
  inputClass,
  mappingsFor,
  orderProblem,
} from "./editors"
import {
  MAP_LABELS,
  describeAction,
  describeCheck,
  fieldLabel,
  newId,
  publish,
  retire,
  saveDraft,
  useProcessState,
  type ProcessDef,
  type Step,
} from "./model"
import { statusBadge } from "./process-list"

export const BUILDER_VARIANTS: VariantOption[] = [
  { key: "A", name: "Stage lanes" },
  { key: "B", name: "Outline" },
  { key: "C", name: "Sentences + preview" },
]

type EditProps = { def: ProcessDef; change: (def: ProcessDef) => void }

function newStep(maps: Step["maps"]): Step {
  return { id: newId("step"), name: "New Step", maps, keyFields: [], guidance: "", gate: [], actions: [] }
}

function setStep(def: ProcessDef, i: number, step: Step): ProcessDef {
  return { ...def, steps: def.steps.map((s, j) => (j === i ? step : s)) }
}

function moveStep(def: ProcessDef, i: number, d: -1 | 1): ProcessDef {
  const steps = [...def.steps]
  const j = i + d
  if (j < 0 || j >= steps.length) return def
  ;[steps[i], steps[j]] = [steps[j], steps[i]]
  return { ...def, steps }
}

export default function ProcessBuilderPage() {
  const { id = "" } = useParams()
  const { processes } = useProcessState()
  // Decided in wayfinder #67: variant B. Pinned (#87).
  const variant: string = "B"
  const record = processes.find((p) => p.draft.id === id)
  if (!record) return <p className="p-6">No such Process.</p>
  const def = record.draft
  const change = (next: ProcessDef) => saveDraft(next)
  const problem = orderProblem(def.table, def.steps)
  const tableLabel = def.table === "opportunity" ? "Opportunity" : "Lead"

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 pb-24 md:p-6">
      <Link to="/processes" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        Processes
      </Link>
      <header className="space-y-3 rounded-md border p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm text-muted-foreground">{tableLabel} Process</p>
            <input
              className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none focus-visible:underline"
              value={def.name}
              onChange={(e) => change({ ...def, name: e.target.value })}
              aria-label="Process name"
            />
            {statusBadge(record)}
          </div>
          <div className="flex flex-wrap gap-2">
            {record.status === "published" && (
              <Button variant="outline" onClick={() => retire(def.id)}>
                Retire
              </Button>
            )}
            <Button disabled={!!problem} onClick={() => publish(def.id)}>
              Publish
            </Button>
          </div>
        </div>
        <EntryCriteria def={def} change={change} />
        {problem && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
            {problem}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Edits are a draft until you Publish. Records already on this Process keep the version they started on.</p>
      </header>

      {variant === "A" && <LanesVariant def={def} change={change} />}
      {variant === "B" && <OutlineVariant def={def} change={change} />}
      {variant === "C" && <SentencesVariant def={def} change={change} />}
    </div>
  )
}

function EntryCriteria({ def, change }: EditProps) {
  const [open, setOpen] = useState(false)
  const summary = def.isFallback
    ? "Fallback: every new record no other Process matches"
    : def.entry.length
      ? def.entry.map((c) => describeCheck(def.table, c)).join(" and ")
      : "No Entry criteria: no record gets this Process yet"
  return (
    <div className="rounded-md bg-muted/40 p-2 text-sm">
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="font-medium">Who gets it:</span>
        <span className="flex-1 text-muted-foreground">{summary}</span>
        <ChevronDown className={cn("size-4", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={def.isFallback} onChange={(e) => change({ ...def, isFallback: e.target.checked })} />
            Fallback (for records no other Process matches)
          </label>
          {!def.isFallback && (
            <>
              {def.entry.map((c, i) => (
                <GateCheckEditor
                  key={c.id}
                  table={def.table}
                  check={c}
                  onChange={(next) => change({ ...def, entry: def.entry.map((x, j) => (j === i ? (next as typeof c) : x)) })}
                  onRemove={() => change({ ...def, entry: def.entry.filter((_, j) => j !== i) })}
                />
              ))}
              <AddButton
                onClick={() => change({ ...def, entry: [...def.entry, { id: newId("e"), kind: "condition", field: "leadSource", operator: "equals", value: "website" }] })}
              >
                Condition
              </AddButton>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Everything about one Step, in sections; used by the lanes inspector and the outline. */
function StepSections({ def, change, index, layout }: EditProps & { index: number; layout: "stack" | "grid" }) {
  const step = def.steps[index]
  const update = (patch: Partial<Step>) => change(setStep(def, index, { ...step, ...patch }))
  const isLast = index === def.steps.length - 1
  return (
    <div className={cn("gap-4", layout === "grid" ? "grid md:grid-cols-2" : "space-y-4")}>
      <Section title="Key fields" hint="Shown to the user on this Step">
        <KeyFieldsEditor table={def.table} value={step.keyFields} onChange={(keyFields) => update({ keyFields })} />
      </Section>
      <Section title="Guidance">
        <GuidanceEditor value={step.guidance} onChange={(guidance) => update({ guidance })} />
      </Section>
      <Section title="Gate" hint={isLast && def.table === "opportunity" ? "To move on, and to Close as won" : isLast ? "To Qualify" : "To move on to the next Step"}>
        <GateEditor table={def.table} gate={step.gate} onChange={(gate) => update({ gate })} />
      </Section>
      <Section title="Actions" hint="When a record enters this Step">
        <ActionsEditor table={def.table} actions={step.actions} onChange={(actions) => update({ actions })} />
      </Section>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
        {hint && <span className="ml-1 font-normal normal-case">· {hint}</span>}
      </h3>
      {children}
    </section>
  )
}

function StepHeaderFields({ def, change, index }: EditProps & { index: number }) {
  const step = def.steps[index]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className={cn(inputClass, "min-w-40 flex-1 font-medium")}
        value={step.name}
        onChange={(e) => change(setStep(def, index, { ...step, name: e.target.value }))}
        aria-label="Step name"
      />
      <MapSelect table={def.table} value={step.maps} onChange={(maps) => change(setStep(def, index, { ...step, maps }))} />
    </div>
  )
}

// --- A: Stage lanes -----------------------------------------------------------

function LanesVariant({ def, change }: EditProps) {
  const isDesktop = useIsDesktop()
  const [selected, setSelected] = useState<string | null>(def.steps[0]?.id ?? null)
  const lanes = mappingsFor(def.table)
  const index = def.steps.findIndex((s) => s.id === selected)

  const addToLane = (lane: Step["maps"]) => {
    const order = lanes.indexOf(lane)
    let at = def.steps.length
    for (let i = def.steps.length - 1; i >= 0; i--) {
      if (lanes.indexOf(def.steps[i].maps) <= order) {
        at = i + 1
        break
      }
      at = i
    }
    const step = newStep(lane)
    change({ ...def, steps: [...def.steps.slice(0, at), step, ...def.steps.slice(at)] })
    setSelected(step.id)
  }

  const inspector = index >= 0 && (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{index + 1}</span>
        <div className="flex-1">
          <StepHeaderFields def={def} change={change} index={index} />
        </div>
      </div>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={index === 0} onClick={() => change(moveStep(def, index, -1))}>
          <ArrowLeft aria-hidden />
          Earlier
        </Button>
        <Button variant="outline" size="sm" disabled={index === def.steps.length - 1} onClick={() => change(moveStep(def, index, 1))}>
          Later
          <ArrowRight aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-destructive"
          disabled={def.steps.length === 1}
          onClick={() => {
            change({ ...def, steps: def.steps.filter((_, j) => j !== index) })
            setSelected(null)
          }}
        >
          <Trash2 aria-hidden />
          Delete
        </Button>
      </div>
      <StepSections def={def} change={change} index={index} layout="stack" />
    </div>
  )

  return (
    <div className={cn("gap-4", isDesktop && "grid grid-cols-[minmax(0,1fr)_380px]")}>
      <div className={cn("gap-2", isDesktop ? "flex overflow-x-auto" : "space-y-2")}>
        {lanes.map((lane) => {
          const inLane = def.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.maps === lane)
          return (
            <section key={lane} className={cn("rounded-md bg-muted/40 p-2", isDesktop && "min-w-36 flex-1")}>
              <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{MAP_LABELS[lane]}</h2>
              <ol className="space-y-2">
                {inLane.map(({ s, i }) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(s.id)}
                      className={cn("w-full rounded-md border bg-background p-2 text-left shadow-xs", selected === s.id && "ring-2 ring-primary")}
                    >
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px]">{i + 1}</span>
                        {s.name}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {s.gate.length} Gate check{s.gate.length === 1 ? "" : "s"} · {s.actions.length} Action{s.actions.length === 1 ? "" : "s"} · {s.keyFields.length} Key
                        fields
                      </p>
                    </button>
                  </li>
                ))}
              </ol>
              <AddButton onClick={() => addToLane(lane)}>Step</AddButton>
            </section>
          )
        })}
        <section className={cn("rounded-md border border-dashed p-2 text-xs text-muted-foreground", isDesktop && "w-32 shrink-0")}>
          <h2 className="mb-1 flex items-center gap-1 font-semibold uppercase">
            <Flag className="size-3.5" aria-hidden />
            {def.table === "opportunity" ? "Close" : "Qualify"}
          </h2>
          {def.table === "opportunity"
            ? "Closed Won must pass the last Step's Gate. Closed Lost is possible from any Step."
            : "Leaving the last Step means Qualify. Disqualify is possible from any Step."}
        </section>
      </div>
      {isDesktop ? (
        <aside className="rounded-md border p-3">{inspector || <p className="text-sm text-muted-foreground">Pick a Step to edit it.</p>}</aside>
      ) : (
        <Dialog open={index >= 0 && selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Step</DialogTitle>
            </DialogHeader>
            {inspector}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// --- B: Outline ---------------------------------------------------------------

function OutlineVariant({ def, change }: EditProps) {
  const [open, setOpen] = useState<Set<string>>(new Set(def.steps.slice(0, 1).map((s) => s.id)))
  const toggle = (id: string) => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setOpen(next)
  }
  const insert = (at: number) => {
    const step = newStep(def.steps[Math.max(0, at - 1)]?.maps ?? mappingsFor(def.table)[0])
    change({ ...def, steps: [...def.steps.slice(0, at), step, ...def.steps.slice(at)] })
    setOpen(new Set(open).add(step.id))
  }

  return (
    <ol className="space-y-2">
      {def.steps.map((s, i) => (
        <li key={s.id} className="space-y-2">
          <div className="rounded-md border">
            <div className="flex flex-wrap items-center gap-2 p-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <StepHeaderFields def={def} change={change} index={i} />
              </div>
              <div className="flex">
                <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => change(moveStep(def, i, -1))}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === def.steps.length - 1} onClick={() => change(moveStep(def, i, 1))}>
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete Step"
                  disabled={def.steps.length === 1}
                  onClick={() => change({ ...def, steps: def.steps.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </Button>
                <Button variant="ghost" size="icon" aria-label={open.has(s.id) ? "Collapse" : "Expand"} onClick={() => toggle(s.id)}>
                  <ChevronDown className={cn(open.has(s.id) && "rotate-180")} />
                </Button>
              </div>
            </div>
            {open.has(s.id) ? (
              <div className="border-t p-3">
                <StepSections def={def} change={change} index={i} layout="grid" />
              </div>
            ) : (
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                {[
                  s.keyFields.length && `Key fields: ${s.keyFields.map((f) => fieldLabel(def.table, f)).join(", ")}`,
                  s.gate.length && `Gate: ${s.gate.map((c) => describeCheck(def.table, c)).join("; ")}`,
                  s.actions.length && `Actions: ${s.actions.map((a) => describeAction(def.table, a)).join("; ")}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Empty Step"}
              </p>
            )}
          </div>
          <div className="flex justify-center">
            <AddButton onClick={() => insert(i + 1)}>Insert Step here</AddButton>
          </div>
        </li>
      ))}
      <li className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        <Flag className="size-4" aria-hidden />
        {def.table === "opportunity" ? "Close (Closed Won must pass the last Step's Gate)" : "Qualify"}
      </li>
    </ol>
  )
}

// --- C: Sentences + live preview ---------------------------------------------

function SentencesVariant({ def, change }: EditProps) {
  const [index, setIndex] = useState(0)
  const i = Math.min(index, def.steps.length - 1)
  const step = def.steps[i]
  const update = (patch: Partial<Step>) => change(setStep(def, i, { ...step, ...patch }))
  const record = def.table === "opportunity" ? "the Opportunity" : "the Lead"

  return (
    <div className="space-y-4">
      <section aria-label="Preview" className="space-y-1">
        <p className="text-xs text-muted-foreground">What users see on a record (click a Step to edit it)</p>
        <ol className="flex gap-0.5 overflow-x-auto rounded-md border p-2">
          {def.steps.map((s, j) => (
            <li key={s.id} className="min-w-28 flex-1">
              <button
                type="button"
                onClick={() => setIndex(j)}
                className={cn(
                  "flex h-11 w-full flex-col items-center justify-center px-3 text-sm [clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)]",
                  j === i ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/75 hover:bg-primary/20",
                )}
              >
                <span className="max-w-full truncate font-medium">{s.name}</span>
                <span className="text-[10px] opacity-80">{MAP_LABELS[s.maps]}</span>
              </button>
            </li>
          ))}
          <li>
            <Button
              variant="ghost"
              className="h-11"
              aria-label="Add Step"
              onClick={() => {
                change({ ...def, steps: [...def.steps, newStep(def.steps[def.steps.length - 1]?.maps ?? mappingsFor(def.table)[0])] })
                setIndex(def.steps.length)
              }}
            >
              <Plus />
            </Button>
          </li>
        </ol>
      </section>

      <article className="space-y-5 rounded-md border p-4 text-sm leading-relaxed">
        <div className="flex flex-wrap items-center gap-2">
          <span>Step {i + 1},</span>
          <input className={cn(inputClass, "w-48 font-medium")} value={step.name} onChange={(e) => update({ name: e.target.value })} aria-label="Step name" />
          <span>, puts {record} in</span>
          <MapSelect table={def.table} value={step.maps} onChange={(maps) => update({ maps })} />
          <span className="ml-auto flex">
            <Button variant="ghost" size="icon" aria-label="Move earlier" disabled={i === 0} onClick={() => (change(moveStep(def, i, -1)), setIndex(i - 1))}>
              <ArrowLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Move later"
              disabled={i === def.steps.length - 1}
              onClick={() => (change(moveStep(def, i, 1)), setIndex(i + 1))}
            >
              <ArrowRight />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete Step"
              disabled={def.steps.length === 1}
              onClick={() => (change({ ...def, steps: def.steps.filter((_, j) => j !== i) }), setIndex(Math.max(0, i - 1)))}
            >
              <X />
            </Button>
          </span>
        </div>

        <Sentence lead={`When ${record} enters this Step, the app will`}>
          <ActionsEditor table={def.table} actions={step.actions} onChange={(actions) => update({ actions })} />
        </Sentence>
        <Sentence lead="While it is here, show these fields">
          <KeyFieldsEditor table={def.table} value={step.keyFields} onChange={(keyFields) => update({ keyFields })} />
        </Sentence>
        <Sentence lead="and tell the user">
          <GuidanceEditor value={step.guidance} onChange={(guidance) => update({ guidance })} />
        </Sentence>
        <Sentence
          lead={
            i === def.steps.length - 1
              ? def.table === "opportunity"
                ? "Before it can be Closed Won, it needs"
                : "Before it can be Qualified, it needs"
              : `Before it can move on to “${def.steps[i + 1].name}”, it needs`
          }
        >
          <GateEditor table={def.table} gate={step.gate} onChange={(gate) => update({ gate })} />
        </Sentence>
      </article>
    </div>
  )
}

function Sentence({ lead, children }: { lead: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-medium">{lead}…</p>
      <div className="pl-3">{children}</div>
    </div>
  )
}
