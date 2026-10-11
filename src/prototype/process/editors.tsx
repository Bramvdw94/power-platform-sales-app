// PROTOTYPE (wayfinder #67): throwaway. Never merge to main.
/* eslint-disable react-refresh/only-export-components -- prototype */
// Small editors the flow builder variants share: Gate checks, Actions, Key fields.

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LEAD_SOURCE_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"
import { LEAD_SOURCES } from "@/sales"
import {
  FIELDS,
  MAP_LABELS,
  OPERATOR_LABELS,
  RELATED_LABELS,
  fieldLabel,
  newId,
  type Action,
  type GateCheck,
  type Operator,
  type ProcessTable,
  type RelatedKind,
  type Step,
} from "./model"

export const inputClass =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"

export function mappingsFor(table: ProcessTable): Step["maps"][] {
  return table === "opportunity" ? ["qualification", "needsAnalysis", "proposal", "negotiation"] : ["notContacted", "working"]
}

export function MapSelect({ table, value, onChange }: { table: ProcessTable; value: Step["maps"]; onChange: (v: Step["maps"]) => void }) {
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value as Step["maps"])} aria-label={table === "opportunity" ? "Stage" : "Lead status"}>
      {mappingsFor(table).map((m) => (
        <option key={m} value={m}>
          {MAP_LABELS[m]}
        </option>
      ))}
    </select>
  )
}

function FieldSelect({ table, value, onChange }: { table: ProcessTable; value: string; onChange: (v: string) => void }) {
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Field">
      {FIELDS[table].map((f) => (
        <option key={f.name} value={f.name}>
          {f.label}
        </option>
      ))}
    </select>
  )
}

function ValueInput({ field, value, onChange }: { field: string; value: string; onChange: (v: string) => void }) {
  if (field === "leadSource") {
    return (
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Value">
        {LEAD_SOURCES.map((s) => (
          <option key={s} value={s}>
            {LEAD_SOURCE_LABELS[s]}
          </option>
        ))}
      </select>
    )
  }
  return <input className={cn(inputClass, "w-32")} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Value" />
}

export function GateCheckEditor({ table, check, onChange, onRemove }: { table: ProcessTable; check: GateCheck; onChange: (c: GateCheck) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/50 p-1.5 text-sm">
      {check.kind === "required" && (
        <>
          <FieldSelect table={table} value={check.field} onChange={(field) => onChange({ ...check, field })} />
          <span>is filled in</span>
        </>
      )}
      {check.kind === "condition" && (
        <>
          <FieldSelect table={table} value={check.field} onChange={(field) => onChange({ ...check, field })} />
          <select className={inputClass} value={check.operator} onChange={(e) => onChange({ ...check, operator: e.target.value as Operator })} aria-label="Operator">
            {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {check.operator !== "hasValue" && <ValueInput field={check.field} value={check.value} onChange={(value) => onChange({ ...check, value })} />}
        </>
      )}
      {check.kind === "related" && (
        <>
          <span>At least</span>
          <input
            type="number"
            min={1}
            className={cn(inputClass, "w-14")}
            value={check.atLeast}
            onChange={(e) => onChange({ ...check, atLeast: Number(e.target.value) })}
            aria-label="At least"
          />
          <select className={inputClass} value={check.related} onChange={(e) => onChange({ ...check, related: e.target.value as RelatedKind })} aria-label="Related records">
            {Object.entries(RELATED_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </>
      )}
      <Button variant="ghost" size="icon" className="ml-auto size-7" aria-label="Remove check" onClick={onRemove}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

export function GateEditor({ table, gate, onChange }: { table: ProcessTable; gate: GateCheck[]; onChange: (g: GateCheck[]) => void }) {
  const first = FIELDS[table][0].name
  return (
    <div className="space-y-1.5">
      {gate.map((c, i) => (
        <GateCheckEditor
          key={c.id}
          table={table}
          check={c}
          onChange={(next) => onChange(gate.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(gate.filter((_, j) => j !== i))}
        />
      ))}
      <div className="flex flex-wrap gap-1">
        <AddButton onClick={() => onChange([...gate, { id: newId("g"), kind: "required", field: first }])}>Required field</AddButton>
        <AddButton onClick={() => onChange([...gate, { id: newId("g"), kind: "condition", field: first, operator: "greaterThan", value: "0" }])}>
          Condition
        </AddButton>
        <AddButton onClick={() => onChange([...gate, { id: newId("g"), kind: "related", related: "phoneCall", atLeast: 1 }])}>Related records</AddButton>
      </div>
    </div>
  )
}

export function ActionsEditor({ table, actions, onChange }: { table: ProcessTable; actions: Action[]; onChange: (a: Action[]) => void }) {
  const update = (i: number, next: Action) => onChange(actions.map((x, j) => (j === i ? next : x)))
  return (
    <div className="space-y-1.5">
      {actions.map((a, i) => (
        <div key={a.id} className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/50 p-1.5 text-sm">
          {a.kind === "createTask" ? (
            <>
              <span>Create Task</span>
              <input className={cn(inputClass, "min-w-40 flex-1")} value={a.subject} onChange={(e) => update(i, { ...a, subject: e.target.value })} aria-label="Task subject" />
              <span>due in</span>
              <input
                type="number"
                min={0}
                className={cn(inputClass, "w-14")}
                value={a.dueInDays}
                onChange={(e) => update(i, { ...a, dueInDays: Number(e.target.value) })}
                aria-label="Due in days"
              />
              <span>days</span>
            </>
          ) : (
            <>
              <span>Set</span>
              <FieldSelect table={table} value={a.field} onChange={(field) => update(i, { ...a, field })} />
              <span>to</span>
              <ValueInput field={a.field} value={a.value} onChange={(value) => update(i, { ...a, value })} />
            </>
          )}
          <Button variant="ghost" size="icon" className="ml-auto size-7" aria-label="Remove Action" onClick={() => onChange(actions.filter((_, j) => j !== i))}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        <AddButton onClick={() => onChange([...actions, { id: newId("a"), kind: "createTask", subject: "Follow up", dueInDays: 2 }])}>Create Task</AddButton>
        <AddButton onClick={() => onChange([...actions, { id: newId("a"), kind: "setField", field: FIELDS[table][0].name, value: "" }])}>Set field</AddButton>
      </div>
    </div>
  )
}

export function KeyFieldsEditor({ table, value, onChange }: { table: ProcessTable; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {FIELDS[table]
        .filter((f) => !f.name.startsWith("account."))
        .map((f) => {
          const on = value.includes(f.name)
          return (
            <button
              key={f.name}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== f.name) : [...value, f.name])}
              className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {fieldLabel(table, f.name)}
            </button>
          )
        })}
    </div>
  )
}

export function GuidanceEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      className="min-h-16 w-full rounded-md border border-input bg-transparent p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      value={value}
      placeholder="Tips for working the record on this Step"
      onChange={(e) => onChange(e.target.value)}
      aria-label="Guidance"
    />
  )
}

export function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary" onClick={onClick}>
      <Plus className="size-3.5" aria-hidden />
      {children}
    </Button>
  )
}

/** Steps must follow Stage order; returns the first Step that breaks it. */
export function orderProblem(table: ProcessTable, steps: Step[]): string | undefined {
  const order = mappingsFor(table)
  for (let i = 1; i < steps.length; i++) {
    if (order.indexOf(steps[i].maps) < order.indexOf(steps[i - 1].maps)) {
      return `“${steps[i].name}” (${MAP_LABELS[steps[i].maps]}) comes after “${steps[i - 1].name}” (${MAP_LABELS[steps[i - 1].maps]}): Steps must follow the ${table === "opportunity" ? "Stage" : "Lead status"} order.`
    }
  }
}
