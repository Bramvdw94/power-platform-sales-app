// PROTOTYPE (throwaway, never merge): editor pieces the three Decision rule editor variants lay out differently.

import { useState } from "react"
import { AlertTriangle, Bot, Plus, ShieldAlert, Trash2, UserRound } from "lucide-react"
import { ConditionBuilder } from "@/components/conditions/condition-builder"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { describeConditions } from "@/lib/process-labels"
import { cn } from "@/lib/utils"
import {
  ACTION_LABELS,
  ASSIGN_TARGETS,
  DECISION_TABLES,
  INPUT_FIELDS,
  MAX_INPUTS,
  NOTIFY_TARGETS,
  PEOPLE,
  QUESTION_TYPES,
  SET_FIELDS,
  TASK_FOR,
  TRY_SAMPLES,
  actionSentence,
  answersOf,
  defaultBands,
  newAction,
  nid,
  tryRule,
  untrustedInputs,
  type Action,
  type ActionType,
  type Answer,
  type DecisionRule,
  type DecisionTable,
  type QuestionType,
  type TryResult,
} from "./model"

export type Edit = (patch: Partial<DecisionRule>) => void

export function tableOf(rule: DecisionRule) {
  return DECISION_TABLES.find((t) => t.value === rule.table)!
}

export function UntrustedBadge() {
  return (
    <Badge variant="outline" className="border-amber-500/60 font-normal text-amber-800 dark:text-amber-300">
      <ShieldAlert aria-hidden /> Untrusted
    </Badge>
  )
}

export function triggerSentence(rule: DecisionRule): string {
  const t = tableOf(rule)
  const n = rule.table === "email" ? (rule.emailNarrow ? ` and ${rule.emailNarrow}` : "") : rule.narrow.conditions.length > 0 ? ` and ${describeConditions(rule.narrow.conditions, rule.narrow.match)}` : ""
  return `After the save, when ${t.trigger}${n}`
}

// ---------- When ----------

export function TriggerSection({ rule, edit }: { rule: DecisionRule; edit: Edit }) {
  const t = tableOf(rule)
  return (
    <div className="grid gap-3">
      <p className="text-sm">
        Runs <strong>after the save</strong>, when <strong>{t.trigger}</strong>. The Owner or their manager can also press <em>Ask again</em> on a record.
      </p>
      {rule.table === "email" ? (
        <div className="grid gap-1.5">
          <label htmlFor="email-narrow" className="text-sm font-medium">
            Only when (optional)
          </label>
          <Input id="email-narrow" placeholder="e.g. Regarding is an open Opportunity" value={rule.emailNarrow} onChange={(e) => edit({ emailNarrow: e.target.value })} />
        </div>
      ) : (
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">Only when (optional)</p>
          <ConditionBuilder table={rule.table} kind="entry" label="Only when" value={rule.narrow} onChange={(narrow) => edit({ narrow })} />
        </div>
      )}
    </div>
  )
}

// ---------- Inputs ----------

export function InputsSection({ rule, edit, compact = false }: { rule: DecisionRule; edit: Edit; compact?: boolean }) {
  const fields = INPUT_FIELDS[rule.table]
  const full = rule.inputs.length >= MAX_INPUTS
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">
        What Jev may read: up to {MAX_INPUTS} fields from the {tableOf(rule).noun} and its parents. Free text is marked untrusted and cleaned and trimmed before it is sent.
      </p>
      <ul className={cn("grid gap-1", !compact && "sm:grid-cols-2")} aria-label="Input fields">
        {fields.map((f) => {
          const on = f.always || rule.inputs.includes(f.key)
          return (
            <li key={f.key}>
              <label className={cn("flex min-h-9 items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm", on && "bg-muted/50")}>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={on}
                  disabled={f.always || (!on && full)}
                  onChange={(e) => edit({ inputs: e.target.checked ? [...rule.inputs, f.key] : rule.inputs.filter((k) => k !== f.key) })}
                />
                <span className="min-w-0 flex-1">{f.label}</span>
                {f.always && <span className="text-xs text-muted-foreground">always</span>}
                {f.freeText && <UntrustedBadge />}
              </label>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground tabular-nums">
        {rule.inputs.length} of {MAX_INPUTS} picked{full ? ". That's the most." : "."}
      </p>
    </div>
  )
}

// ---------- Question ----------

export function QuestionTypePicker({ rule, edit }: { rule: DecisionRule; edit: Edit }) {
  const setType = (type: QuestionType) => {
    const q = { ...rule.question, type }
    if (type === "score" && q.bands.length === 0) q.bands = defaultBands(q.levels)
    edit({ question: q, branches: {} })
  }
  return (
    <div role="radiogroup" aria-label="Answer type" className="grid gap-2 sm:grid-cols-3">
      {QUESTION_TYPES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={rule.question.type === t.value}
          onClick={() => setType(t.value)}
          className="rounded-md border p-2.5 text-left text-sm aria-checked:border-primary aria-checked:ring-2 aria-checked:ring-primary/30"
        >
          <span className="block font-medium">{t.label}</span>
          <span className="block text-xs text-muted-foreground">{t.hint}</span>
        </button>
      ))}
    </div>
  )
}

export function QuestionSection({ rule, edit, showType = true }: { rule: DecisionRule; edit: Edit; showType?: boolean }) {
  const q = rule.question
  const setQ = (patch: Partial<typeof q>) => edit({ question: { ...q, ...patch } })
  const untrusted = untrustedInputs(rule)
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor="dr-question" className="text-sm font-medium">
          Question
        </label>
        <Textarea id="dr-question" rows={3} placeholder="Ask one clear question about this record." value={q.text} onChange={(e) => setQ({ text: e.target.value })} />
      </div>
      {showType && (
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">Answer type</p>
          <QuestionTypePicker rule={rule} edit={edit} />
        </div>
      )}
      {q.type === "pick" && <OptionsEditor rule={rule} edit={edit} />}
      {q.type === "score" && <BandsEditor rule={rule} edit={edit} />}
      {untrusted.length > 0 && (
        <p className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {untrusted.map((f) => f.label).join(", ")} {untrusted.length === 1 ? "is" : "are"} untrusted, so Jev is also asked whether the text tries to give it instructions. If it does, the record goes to Needs review.
          </span>
        </p>
      )}
    </div>
  )
}

function OptionsEditor({ rule, edit }: { rule: DecisionRule; edit: Edit }) {
  const q = rule.question
  const set = (options: string[]) => edit({ question: { ...q, options } })
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">Options</p>
      {q.options.map((o, i) => (
        <div key={i} className="flex gap-2">
          <Input aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} value={o} onChange={(e) => set(q.options.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove option ${i + 1}`} disabled={q.options.length <= 2} onClick={() => set(q.options.filter((_, j) => j !== i))}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={q.options.length >= 10} onClick={() => set([...q.options, ""])}>
          <Plus aria-hidden /> Add option
        </Button>
        <span className="text-xs text-muted-foreground">“None of these” is always added last.</span>
      </div>
    </div>
  )
}

function BandsEditor({ rule, edit }: { rule: DecisionRule; edit: Edit }) {
  const q = rule.question
  const setBands = (bands: typeof q.bands) => edit({ question: { ...q, bands } })
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="dr-levels" className="font-medium">
          Levels
        </label>
        <span>1 to</span>
        <NativeSelect id="dr-levels" className="w-20" value={q.levels} onChange={(e) => edit({ question: { ...q, levels: Number(e.target.value), bands: defaultBands(Number(e.target.value)) }, branches: {} })}>
          {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </NativeSelect>
      </div>
      <p className="text-sm font-medium">Bands (each gets its own Actions)</p>
      {q.bands.map((b, i) => (
        <div key={b.id} role="group" aria-label={`Band ${i + 1}`} className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto_4.5rem_auto] items-center gap-2 text-sm">
          <Input aria-label={`Band ${i + 1} name`} value={b.label} onChange={(e) => setBands(q.bands.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)))} />
          <NativeSelect aria-label={`Band ${i + 1} from`} value={b.from} onChange={(e) => setBands(q.bands.map((x) => (x.id === b.id ? { ...x, from: Number(e.target.value) } : x)))}>
            {Array.from({ length: q.levels }, (_, n) => n + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
          <span>to</span>
          <NativeSelect aria-label={`Band ${i + 1} to`} value={b.to} onChange={(e) => setBands(q.bands.map((x) => (x.id === b.id ? { ...x, to: Number(e.target.value) } : x)))}>
            {Array.from({ length: q.levels }, (_, n) => n + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove band ${i + 1}`} disabled={q.bands.length <= 2} onClick={() => setBands(q.bands.filter((x) => x.id !== b.id))}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" disabled={q.bands.length >= q.levels} onClick={() => setBands([...q.bands, { id: nid("b"), label: "New band", from: 1, to: 1 }])}>
        <Plus aria-hidden /> Add band
      </Button>
    </div>
  )
}

// ---------- Actions ----------

function ActionRow({ table, action, label, onChange, onRemove }: { table: DecisionTable; action: Action; label: string; onChange: (a: Action) => void; onRemove: () => void }) {
  const setFields = SET_FIELDS[table]
  return (
    <div role="group" aria-label={label} className="grid gap-2 rounded-md border bg-card p-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-start">
      <p className="pt-1.5 text-sm font-medium">{ACTION_LABELS[action.type]}</p>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        {action.type === "setField" && (
          <>
            <NativeSelect aria-label={`${label} field`} value={action.field} onChange={(e) => onChange({ ...action, field: e.target.value, value: setFields.find((f) => f.label === e.target.value)?.values[0] ?? "" })}>
              {setFields.map((f) => (
                <option key={f.key}>{f.label}</option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label={`${label} value`} value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })}>
              {(setFields.find((f) => f.label === action.field)?.values ?? []).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </NativeSelect>
          </>
        )}
        {action.type === "assign" && (
          <NativeSelect aria-label={`${label} to`} className="sm:col-span-2" value={action.to} onChange={(e) => onChange({ ...action, to: e.target.value })}>
            {ASSIGN_TARGETS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </NativeSelect>
        )}
        {action.type === "createTask" && (
          <>
            <Input aria-label={`${label} subject`} className="sm:col-span-2" value={action.subject} onChange={(e) => onChange({ ...action, subject: e.target.value })} />
            <NativeSelect aria-label={`${label} for`} value={action.for} onChange={(e) => onChange({ ...action, for: e.target.value })}>
              {TASK_FOR.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label={`${label} due`} value={action.dueInDays} onChange={(e) => onChange({ ...action, dueInDays: Number(e.target.value) })}>
              {[0, 1, 2, 3, 5, 7, 14].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "Due today" : `Due in ${d} ${d === 1 ? "day" : "days"}`}
                </option>
              ))}
            </NativeSelect>
          </>
        )}
        {action.type === "notify" && (
          <>
            <NativeSelect aria-label={`${label} who`} value={action.who} onChange={(e) => onChange({ ...action, who: e.target.value })}>
              {NOTIFY_TARGETS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </NativeSelect>
            <Input aria-label={`${label} text`} placeholder="Fixed text" value={action.text} onChange={(e) => onChange({ ...action, text: e.target.value })} />
          </>
        )}
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
        <Trash2 aria-hidden />
      </Button>
    </div>
  )
}

export function ActionsList({ rule, answer, edit }: { rule: DecisionRule; answer: Answer; edit: Edit }) {
  const [adding, setAdding] = useState<ActionType>("setField")
  const actions = rule.branches[answer.key] ?? []
  const set = (next: Action[]) => edit({ branches: { ...rule.branches, [answer.key]: next } })
  return (
    <div className="grid gap-2">
      {actions.length === 0 && <p className="text-sm text-muted-foreground">Nothing happens for this answer; the Decision is still on the timeline.</p>}
      {actions.map((a, i) => (
        <ActionRow key={a.id} table={rule.table} action={a} label={`${answer.label} action ${i + 1}`} onChange={(n) => set(actions.map((x) => (x.id === a.id ? n : x)))} onRemove={() => set(actions.filter((x) => x.id !== a.id))} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label={`New action for ${answer.label}`} className="w-40" value={adding} onChange={(e) => setAdding(e.target.value as ActionType)}>
          {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => (
            <option key={t} value={t}>
              {ACTION_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
        <Button type="button" variant="outline" size="sm" onClick={() => set([...actions, newAction(adding, rule.table)])}>
          <Plus aria-hidden /> Add action
        </Button>
      </div>
    </div>
  )
}

export function NeedsReviewNote({ rule }: { rule: DecisionRule }) {
  return (
    <div className="grid gap-1 rounded-md border border-dashed p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <UserRound className="size-4" aria-hidden /> Needs review
      </p>
      <p className="text-muted-foreground">
        Below {rule.threshold}% confidence, when the injection check fires, when Jev can't be reached or a spend cap is reached: no Actions run. The Owner (or {rule.reviewer}, when the Owner isn't a salesperson) sees Jev's best guess, picks the answer or dismisses it.
      </p>
    </div>
  )
}

export function AnswersSection({ rule, edit }: { rule: DecisionRule; edit: Edit }) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Only set a field, assign, create a Task or notify. Actions are normal saves, so Business rules still apply.</p>
      {answersOf(rule.question).map((a) => (
        <section key={a.key} aria-label={`When Jev answers ${a.label}`} className="grid gap-2 rounded-md border p-3">
          <h4 className="text-sm font-medium">
            When Jev answers <span className="rounded bg-muted px-1.5 py-0.5">{a.label}</span>
          </h4>
          <ActionsList rule={rule} answer={a} edit={edit} />
        </section>
      ))}
      <NeedsReviewNote rule={rule} />
    </div>
  )
}

// ---------- Safety ----------

export function ThresholdField({ rule, edit }: { rule: DecisionRule; edit: Edit }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor="dr-threshold" className="text-sm font-medium">
        Confidence threshold
      </label>
      <div className="flex items-center gap-3">
        <input id="dr-threshold" type="range" min={30} max={95} step={5} className="w-full accent-primary" value={rule.threshold} onChange={(e) => edit({ threshold: Number(e.target.value) })} />
        <span className="w-12 text-right text-sm font-medium tabular-nums">{rule.threshold}%</span>
      </div>
      <p className="text-xs text-muted-foreground">Below this, the record goes to Needs review instead of running Actions.</p>
    </div>
  )
}

export function SafetySection({ rule, edit }: { rule: DecisionRule; edit: Edit }) {
  return (
    <div className="grid gap-4">
      <ThresholdField rule={rule} edit={edit} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="dr-reviewer" className="text-sm font-medium">
            Reviewer
          </label>
          <NativeSelect id="dr-reviewer" value={rule.reviewer} onChange={(e) => edit({ reviewer: e.target.value })}>
            {PEOPLE.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">Reviews when the Owner isn't a salesperson, such as a new web Lead.</p>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="dr-cap" className="text-sm font-medium">
            Daily cap
          </label>
          <Input id="dr-cap" type="number" min={1} value={rule.dailyCap} onChange={(e) => edit({ dailyCap: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground">Decisions per day for this rule. App-wide monthly cap: 5,000.</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Model: {rule.model}</p>
    </div>
  )
}

// ---------- Try ----------

export function useTry(rule: DecisionRule, edit: Edit) {
  const samples = TRY_SAMPLES.filter((s) => s.table === rule.table)
  const [picked, setPicked] = useState<string[]>(() => samples.map((s) => s.id))
  const [results, setResults] = useState<TryResult[] | null>(null)
  const [pasted, setPasted] = useState("")
  const run = () => {
    const chosen = samples.filter((s) => picked.includes(s.id))
    const extra = pasted.trim()
      ? [{ id: "paste", table: rule.table, label: "Pasted sample", detail: pasted.trim(), canned: { yesno: ["yes", 58] as [string, number], pick: [0, 58] as [number, number], score: [3, 58] as [number, number] }, injection: /ignore|instruction/i.test(pasted) }]
      : []
    setResults(tryRule(rule, [...chosen, ...extra]))
    edit({ lastTried: "just now", changedSinceTry: false })
  }
  return { samples, picked, setPicked, results, run, pasted, setPasted }
}

export type TryState = ReturnType<typeof useTry>

export function TryPicker({ t }: { t: TryState }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <ul aria-label="Records to try" className="grid grid-cols-1 gap-1">
        {t.samples.map((s) => (
          <li key={s.id}>
            <label className="flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm">
              <input type="checkbox" className="mt-1 size-4 accent-primary" checked={t.picked.includes(s.id)} onChange={(e) => t.setPicked(e.target.checked ? [...t.picked, s.id] : t.picked.filter((x) => x !== s.id))} />
              <span className="min-w-0">
                <span className="block font-medium">{s.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Textarea aria-label="Or paste a sample text" rows={2} placeholder="Or paste a sample text (e.g. a web form message)" value={t.pasted} onChange={(e) => t.setPasted(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={t.run} disabled={t.picked.length === 0 && !t.pasted.trim()}>
          <Bot aria-hidden /> Try
        </Button>
        <span className="text-xs text-muted-foreground">Up to 10 records. Asks Jev for real; runs no Actions. Counts toward the caps.</span>
      </div>
    </div>
  )
}

export function ConfidenceBar({ value, threshold }: { value: number; threshold: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn("absolute inset-y-0 left-0 rounded-full", value >= threshold ? "bg-emerald-600 dark:bg-emerald-400" : "bg-amber-500")} style={{ width: `${value}%` }} />
        <span className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${threshold}%` }} />
      </span>
      <span className="text-xs tabular-nums">{value}%</span>
    </span>
  )
}

export function TryResults({ results, rule }: { results: TryResult[]; rule: DecisionRule }) {
  return (
    <ul aria-label="Try results" className="min-w-0 divide-y rounded-md border">
      {results.map((r) => (
        <li key={r.sample.id} className="grid gap-1.5 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{r.sample.label}</span>
            <span className="ml-auto flex items-center gap-2">
              <Badge variant={r.needsReview ? "outline" : "secondary"} className={cn("font-normal", r.needsReview && "border-amber-500/60 text-amber-800 dark:text-amber-300")}>
                {r.needsReview ? "Needs review" : r.answer?.label ?? r.raw}
              </Badge>
              <ConfidenceBar value={r.confidence} threshold={rule.threshold} />
            </span>
          </div>
          {r.needsReview ? (
            <p className="flex gap-1.5 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {r.needsReview} Jev's best guess: {r.answer?.label ?? r.raw}. No Actions would run.
              </span>
            </p>
          ) : r.actions.length === 0 ? (
            <p className="text-muted-foreground">Jev said {r.raw}. No Actions for this answer.</p>
          ) : (
            <ul className="list-disc pl-5 text-muted-foreground">
              {r.actions.map((a) => (
                <li key={a.id}>Would {actionSentence(a).charAt(0).toLowerCase() + actionSentence(a).slice(1)}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

export function TrySection({ rule, edit }: { rule: DecisionRule; edit: Edit }) {
  const t = useTry(rule, edit)
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      <TryPicker t={t} />
      {t.results && <TryResults results={t.results} rule={rule} />}
    </div>
  )
}

export function PublishWarning({ rule }: { rule: DecisionRule }) {
  if (!rule.changedSinceTry) return null
  return (
    <p role="status" className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {rule.lastTried ? "You changed the rule since its last Try." : "This rule hasn't been tried yet."} You can still publish.
    </p>
  )
}
