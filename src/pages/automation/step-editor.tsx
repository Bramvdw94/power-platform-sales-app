import { Plus, X } from "lucide-react"
import { ConditionBuilder, ValueEditor } from "@/components/conditions/condition-builder"
import { Button } from "@/components/ui/button"
import { CommitInput, CommitTextarea } from "@/components/ui/commit-input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { STEP_STATUS_LABELS, fieldLabel } from "@/lib/process-labels"
import {
  FIELD_CATALOGUE,
  SET_FIELD_CHOICES,
  defaultScalar,
  keyFieldCandidates,
  newAction,
  stepStatusChoices,
  tidyStep,
  type ProcessKind,
} from "@/sales"
import { keyFieldsOf, LIMITS, type Action, type Check, type CreateTaskAction, type SetFieldAction, type Step } from "@/sales/engine"

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-medium">{children}</h4>
}

function KeyFieldsEditor({ table, step, editable, onChange }: { table: ProcessKind; step: Step; editable: boolean; onChange: (step: Step) => void }) {
  const chosen = step.keyFields ?? []
  const fromGate = keyFieldsOf(step).filter((f) => !chosen.includes(f))
  const candidates = keyFieldCandidates(table, step)
  return (
    <div className="grid gap-2">
      <SectionTitle>Key fields</SectionTitle>
      <p className="text-xs text-muted-foreground">Up to {LIMITS.keyFieldsPerStep}. Fields the Gate needs are added automatically.</p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Key fields">
        {chosen.map((field) => (
          <li key={field} className="flex items-center gap-1 rounded-full border bg-card py-0.5 pl-2.5 pr-1 text-sm">
            {fieldLabel(field)}
            {editable && (
              <Button type="button" variant="ghost" size="icon-sm" className="size-6" aria-label={`Remove Key field ${fieldLabel(field)}`} onClick={() => onChange(tidyStep({ ...step, keyFields: chosen.filter((f) => f !== field) }))}>
                <X aria-hidden />
              </Button>
            )}
          </li>
        ))}
        {fromGate.map((field) => (
          <li key={field} className="rounded-full border border-dashed px-2.5 py-0.5 text-sm text-muted-foreground">
            {fieldLabel(field)} <span className="text-xs">(from the Gate)</span>
          </li>
        ))}
        {chosen.length === 0 && fromGate.length === 0 && <li className="text-sm text-muted-foreground">No Key fields.</li>}
      </ul>
      {editable && (
        <NativeSelect
          aria-label="Add Key field"
          className="w-64"
          value=""
          disabled={candidates.length === 0}
          onChange={(e) => e.target.value && onChange({ ...step, keyFields: [...chosen, e.target.value] })}
        >
          <option value="">{candidates.length === 0 && chosen.length >= LIMITS.keyFieldsPerStep ? `The most is ${LIMITS.keyFieldsPerStep}` : "Add a Key field…"}</option>
          {candidates.map((field) => (
            <option key={field} value={field}>
              {fieldLabel(field)}
            </option>
          ))}
        </NativeSelect>
      )}
    </div>
  )
}

function ActionEditor({ table, action, index, editable, onChange, onRemove }: { table: ProcessKind; action: Action; index: number; editable: boolean; onChange: (action: Action) => void; onRemove: () => void }) {
  const label = `Action ${index + 1}`
  return (
    <div role="group" aria-label={label} className="grid gap-2 rounded-md border bg-card p-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{action.type === "createTask" ? "Create Task" : "Set field"}</span>
        {editable && (
          <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
            <X aria-hidden />
          </Button>
        )}
      </div>
      {action.type === "createTask" ? <CreateTaskEditor label={label} action={action} onChange={onChange} /> : <SetFieldEditor table={table} label={label} action={action} onChange={onChange} />}
    </div>
  )
}

function CreateTaskEditor({ label, action, onChange }: { label: string; action: CreateTaskAction; onChange: (action: Action) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label>
          Subject
          <CommitInput aria-label={`${label} subject`} value={action.subject} onCommit={(subject) => onChange({ ...action, subject })} />
        </Label>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label>
          Description (optional)
          <CommitInput
            aria-label={`${label} description`}
            value={action.description ?? ""}
            onCommit={(description) => {
              const { description: _old, ...rest } = action
              void _old
              onChange(description.trim() ? { ...rest, description } : rest)
            }}
          />
        </Label>
      </div>
      <div className="grid gap-1.5">
        <Label>
          Due (days after entering the Step)
          <CommitInput aria-label={`${label} due in days`} type="number" min={0} value={String(action.dueInDays)} onCommit={(days) => onChange({ ...action, dueInDays: Math.max(0, Math.round(Number(days)) || 0) })} />
        </Label>
      </div>
      <div className="grid gap-1.5">
        <Label>
          Assigned to
          <NativeSelect aria-label={`${label} assigned to`} value={action.assignTo} onChange={(e) => onChange({ ...action, assignTo: e.target.value as CreateTaskAction["assignTo"] })}>
            <option value="owner">The Owner</option>
            <option value="ownersManager">The Owner's manager</option>
          </NativeSelect>
        </Label>
      </div>
    </div>
  )
}

function SetFieldEditor({ table, label, action, onChange }: { table: ProcessKind; label: string; action: SetFieldAction; onChange: (action: Action) => void }) {
  const info = FIELD_CATALOGUE[table]?.[action.field]
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Label className="grid gap-1.5">
        Field
        <NativeSelect
          aria-label={`${label} field`}
          value={action.field}
          onChange={(e) => onChange({ ...action, field: e.target.value, value: defaultScalar(FIELD_CATALOGUE[table]?.[e.target.value]) })}
        >
          {!SET_FIELD_CHOICES[table].includes(action.field) && <option value={action.field}>{action.field} (removed)</option>}
          {SET_FIELD_CHOICES[table].map((field) => (
            <option key={field} value={field}>
              {fieldLabel(field)}
            </option>
          ))}
        </NativeSelect>
      </Label>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Value</span>
        <ValueEditor info={info} condition={{ field: action.field, op: "equals", value: action.value ?? undefined }} label={`${label} value`} onChange={(value) => onChange({ ...action, value: value as SetFieldAction["value"] })} />
      </div>
    </div>
  )
}

/** One Step opened up: name, Stage or Lead status, Key fields, Guidance, Gate and Actions. */
export function StepEditor({ table, step, editable, onChange }: { table: ProcessKind; step: Step; editable: boolean; onChange: (step: Step) => void }) {
  const gateChecks = step.gate?.checks ?? []
  const actions = step.actions ?? []
  const statusLabel = table === "lead" ? "Lead status" : "Stage"
  const setGate = (checks: Check[]) => onChange(tidyStep({ ...step, gate: { checks } }))
  return (
    <fieldset disabled={!editable} className="grid min-w-0 gap-5 border-0 p-0 [&_:disabled]:opacity-100! [&_:disabled]:cursor-default">
      <div className="grid gap-3 sm:grid-cols-2">
        <Label className="grid gap-1.5">
          Step name
          <CommitInput aria-label="Step name" value={step.name} onCommit={(name) => name.trim() && onChange({ ...step, name: name.trim() })} />
        </Label>
        <Label className="grid gap-1.5">
          {statusLabel}
          <NativeSelect aria-label={statusLabel} value={step.mapsTo} onChange={(e) => onChange({ ...step, mapsTo: e.target.value as Step["mapsTo"] })}>
            {stepStatusChoices(table).map((status) => (
              <option key={status} value={status}>
                {STEP_STATUS_LABELS[status]}
              </option>
            ))}
          </NativeSelect>
        </Label>
      </div>

      <KeyFieldsEditor table={table} step={step} editable={editable} onChange={onChange} />

      <div className="grid gap-2">
        <SectionTitle>Guidance</SectionTitle>
        <CommitTextarea aria-label="Guidance" rows={3} value={step.guidance ?? ""} onCommit={(guidance) => onChange(tidyStep({ ...step, guidance }))} />
      </div>

      <div className="grid gap-2">
        <SectionTitle>Gate: to move on</SectionTitle>
        <p className="text-xs text-muted-foreground">Every check must pass before the record can leave this Step forward.</p>
        <ConditionBuilder
          table={table}
          kind="gate"
          label="Gate"
          allowSince
          readOnly={!editable}
          value={{ match: "all", conditions: gateChecks }}
          onChange={(group) => setGate(group.conditions)}
        />
      </div>

      <div className="grid gap-2">
        <SectionTitle>Actions: when a record moves forward into this Step</SectionTitle>
        {actions.map((action, index) => (
          <ActionEditor
            key={action.id}
            table={table}
            action={action}
            index={index}
            editable={editable}
            onChange={(next) => onChange(tidyStep({ ...step, actions: actions.map((a) => (a.id === action.id ? next : a)) }))}
            onRemove={() => onChange(tidyStep({ ...step, actions: actions.filter((a) => a.id !== action.id) }))}
          />
        ))}
        {actions.length === 0 && <p className="text-sm text-muted-foreground">No Actions.</p>}
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...step, actions: [...actions, newAction(actions, "createTask", table)] })}>
              <Plus aria-hidden /> Add Create Task
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...step, actions: [...actions, newAction(actions, "setField", table)] })}>
              <Plus aria-hidden /> Add Set field
            </Button>
          </div>
        )}
      </div>
    </fieldset>
  )
}

