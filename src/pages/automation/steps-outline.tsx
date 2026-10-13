import { useState } from "react"
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { stepSummary } from "@/lib/process-labels"
import { deleteStep, insertStep, moveStepInDraft, type ProcessKind } from "@/sales"
import { LIMITS, type ProcessDefinition, type PublishIssue } from "@/sales/engine"
import { StepEditor } from "./step-editor"

/** The Steps as a numbered outline: add, delete, move and "Insert Step here", each expandable to edit. */
export function StepsOutline({
  table,
  draft,
  editable,
  onChange,
  issues,
}: {
  table: ProcessKind
  draft: ProcessDefinition
  editable: boolean
  onChange: (draft: ProcessDefinition) => void
  issues: PublishIssue[]
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const atLimit = draft.steps.length >= LIMITS.stepsPerProcess
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const insertAt = (index: number) => {
    const next = insertStep(draft, index)
    const created = next.steps[Math.max(0, Math.min(index, next.steps.length - 1))]
    onChange(next)
    setOpen((current) => new Set(current).add(created.id))
  }

  return (
    <div className="space-y-2">
      {draft.steps.length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No Steps yet. Add the first one.</p>}
      <ol aria-label="Steps" className="space-y-1">
        {draft.steps.map((step, index) => {
          const isOpen = open.has(step.id)
          const stepIssues = issues.filter((i) => i.stepId === step.id)
          return (
            <li key={step.id}>
              {editable && (
                <div className="flex justify-center">
                  <Button type="button" variant="ghost" size="sm" disabled={atLimit} className="h-6 text-xs text-muted-foreground" onClick={() => insertAt(index)}>
                    <Plus aria-hidden /> Insert Step here
                  </Button>
                </div>
              )}
              <div className="rounded-md border bg-card">
                <div className="flex items-start gap-2 p-2">
                  <span className="mt-1.5 w-6 shrink-0 text-center text-sm text-muted-foreground" aria-hidden>
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={`Step ${index + 1}: ${step.name}`}
                    onClick={() => toggle(step.id)}
                    className="flex min-w-0 flex-1 items-start gap-1.5 rounded-sm px-1 py-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {isOpen ? <ChevronDown className="mt-0.5 size-4 shrink-0" aria-hidden /> : <ChevronRight className="mt-0.5 size-4 shrink-0" aria-hidden />}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{step.name}</span>
                      {!isOpen && <span className="block text-sm text-muted-foreground">{stepSummary(step)}</span>}
                    </span>
                  </button>
                  {editable && (
                    <div className="flex shrink-0">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${step.name} up`} disabled={index === 0} onClick={() => onChange(moveStepInDraft(draft, step.id, "up"))}>
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${step.name} down`} disabled={index === draft.steps.length - 1} onClick={() => onChange(moveStepInDraft(draft, step.id, "down"))}>
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${step.name}`} onClick={() => onChange(deleteStep(draft, step.id))}>
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  )}
                </div>
                {stepIssues.length > 0 && (
                  <ul className="px-3 pb-2 text-sm text-destructive" aria-label={`Problems with ${step.name}`}>
                    {stepIssues.map((issue, i) => (
                      <li key={i}>{issue.message}</li>
                    ))}
                  </ul>
                )}
                {isOpen && (
                  <div className="border-t p-3">
                    <StepEditor table={table} step={step} editable={editable} onChange={(next) => onChange({ ...draft, steps: draft.steps.map((s) => (s.id === step.id ? next : s)) })} />
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={atLimit} onClick={() => insertAt(draft.steps.length)}>
            <Plus aria-hidden /> Add Step
          </Button>
          {atLimit && <span className="text-sm text-muted-foreground">The most is {LIMITS.stepsPerProcess} Steps.</span>}
        </div>
      )}
    </div>
  )
}
