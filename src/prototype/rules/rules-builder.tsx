// PROTOTYPE (wayfinder #87): throwaway. Never merge to main.
/* eslint-disable react-refresh/only-export-components -- prototype */
// The Business rules builder for a Process builder: three variants of where
// rules are listed and how one is edited and switched on or off.

import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Ban, Lock, ListChecks, Plus, Sparkles, Trash2, TriangleAlert, Workflow, Asterisk } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useGateway } from "@/hooks/use-gateway"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import { cn } from "@/lib/utils"
import { fullName } from "@/sales"
import { PrototypeSwitcher, useVariant, type VariantOption } from "../prototype-switcher"
import { savedValues, type RuledRecord } from "./record-rules"
import {
  EFFECT_LABELS,
  FIELDS,
  OPERATOR_LABELS,
  TABLES,
  TABLE_LABELS,
  TABLE_SINGULAR,
  blankEffect,
  blankRule,
  conflictsFor,
  deleteRule,
  describeEffect,
  describeWhen,
  evaluate,
  fieldDef,
  newId,
  operatorLabel,
  ownFields,
  ruleApplies,
  saveRule,
  useRulesState,
  type BusinessRule,
  type Condition,
  type Effect,
  type Operator,
  type RuleTable,
} from "./model"

export const BUILDER_VARIANTS: VariantOption[] = [
  { key: "A", name: "List + editor" },
  { key: "B", name: "Rule cards" },
  { key: "C", name: "By field" },
]

const inputClass =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
const warnText = "text-amber-800 dark:text-amber-300"

/** Processes and Business rules share one "Automation" header, so the two builders sit side by side. */
export function AutomationTabs({ current }: { current: "processes" | "rules" }) {
  return (
    <nav className="flex gap-1 border-b" aria-label="Automation">
      {[
        { key: "processes", to: "/processes", label: "Processes", icon: Workflow },
        { key: "rules", to: "/rules", label: "Business rules", icon: ListChecks },
      ].map((t) => (
        <Link
          key={t.key}
          to={t.to}
          aria-current={current === t.key ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
            current === t.key ? "border-primary font-medium" : "border-transparent text-foreground/75 hover:text-foreground",
          )}
        >
          <t.icon className="size-4" aria-hidden />
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

export default function BusinessRulesPage() {
  const variant = useVariant(BUILDER_VARIANTS)
  const { rules } = useRulesState()
  const [table, setTable] = useState<RuleTable>("opportunity")
  const [editing, setEditing] = useState<BusinessRule | null>(null)
  const rows = rules.filter((r) => r.table === table).sort((a, b) => Number(b.on) - Number(a.on) || a.name.localeCompare(b.name))

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 pb-24 md:p-6">
      <PrototypeSwitcher variants={BUILDER_VARIANTS} label="Rules builder" />
      <AutomationTabs current="rules" />
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ListChecks className="size-6" aria-hidden />
            Business rules
          </h1>
          <p className="text-sm text-foreground/75">
            Each rule is checked on its own, in no particular order. A saved change applies at once to every {TABLE_SINGULAR[table]}.
          </p>
        </div>
        {variant !== "C" && (
          <Button onClick={() => setEditing(blankRule(table))}>
            <Plus aria-hidden />
            New rule
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 rounded-md border p-0.5" role="tablist" aria-label="Table">
        {TABLES.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={table === t}
            onClick={() => setTable(t)}
            className={cn("rounded px-3 py-1 text-sm", table === t ? "bg-primary text-primary-foreground" : "text-foreground/75 hover:text-foreground")}
          >
            {TABLE_LABELS[t]} <span className="opacity-80">({rules.filter((r) => r.table === t).length})</span>
          </button>
        ))}
      </div>

      {variant === "A" && <ListVariant rows={rows} onOpen={setEditing} />}
      {variant === "B" && <CardsVariant key={table} rows={rows} table={table} adding={editing} onAdded={() => setEditing(null)} />}
      {variant === "C" && <FieldVariant table={table} rows={rows} onOpen={setEditing} />}

      {editing && variant !== "B" && <RuleDialog rule={editing} onClose={() => setEditing(null)} />}
      <p className="text-xs text-muted-foreground">Prototype: changes live in this browser tab only and are lost on reload. Try a rule, then open a record in the same tab.</p>
    </div>
  )
}

// --- Shared pieces ---------------------------------------------------------------------------

export function OnSwitch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors", on ? "border-primary bg-primary" : "border-input bg-muted")}
    >
      <span className={cn("inline-block size-4 rounded-full bg-background shadow transition-transform", on ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  )
}

function EffectIcon({ kind, className }: { kind: Effect["kind"]; className?: string }) {
  const c = cn("size-3.5 shrink-0", className)
  if (kind === "required") return <Asterisk className={c} aria-hidden />
  if (kind === "readOnly") return <Lock className={c} aria-hidden />
  if (kind === "setValue") return <Sparkles className={c} aria-hidden />
  if (kind === "warning") return <TriangleAlert className={cn(c, warnText)} aria-hidden />
  return <Ban className={cn(c, "text-destructive")} aria-hidden />
}

function ValueInput({ table, field, value, onChange, multi }: { table: RuleTable; field: string; value: string; onChange: (v: string) => void; multi?: boolean }) {
  const def = fieldDef(table, field)
  if (def?.options && !multi) {
    return (
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Value">
        <option value="">—</option>
        {def.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  if (def?.options && multi) {
    const chosen = value ? value.split(",") : []
    return (
      <span className="inline-flex flex-wrap gap-1">
        {def.options.map((o) => (
          <label key={o.value} className={cn("cursor-pointer rounded-full border px-2 py-0.5 text-xs", chosen.includes(o.value) ? "border-primary bg-primary/15" : "border-input")}>
            <input
              type="checkbox"
              className="sr-only"
              checked={chosen.includes(o.value)}
              onChange={(e) => onChange((e.target.checked ? [...chosen, o.value] : chosen.filter((x) => x !== o.value)).join(","))}
            />
            {o.label}
          </label>
        ))}
      </span>
    )
  }
  if (def?.type === "date") {
    return (
      <span className="inline-flex items-center gap-1">
        <select className={inputClass} value={value === "today" ? "today" : "date"} onChange={(e) => onChange(e.target.value === "today" ? "today" : "")} aria-label="Compare with">
          <option value="today">today</option>
          <option value="date">a date</option>
        </select>
        {value !== "today" && <input type="date" className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Date" />}
      </span>
    )
  }
  return (
    <input
      className={cn(inputClass, "w-36")}
      type={def?.type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Value"
    />
  )
}

function operatorsFor(table: RuleTable, field: string): Operator[] {
  const t = fieldDef(table, field)?.type
  if (t === "number" || t === "date") return ["equals", "notEquals", "greaterThan", "lessThan", "isEmpty", "hasValue"]
  if (t === "choice") return ["equals", "notEquals", "isOneOf", "isEmpty", "hasValue"]
  return ["equals", "notEquals", "isEmpty", "hasValue"]
}

function ConditionRow({ table, c, onChange, onRemove }: { table: RuleTable; c: Condition; onChange: (c: Condition) => void; onRemove?: () => void }) {
  const ops = operatorsFor(table, c.field)
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/50 p-1.5 text-sm">
      <select
        className={inputClass}
        value={c.field}
        onChange={(e) => {
          const field = e.target.value
          const op = operatorsFor(table, field).includes(c.operator) ? c.operator : "equals"
          onChange({ ...c, field, operator: op, value: fieldDef(table, field)?.type === "date" ? "today" : "" })
        }}
        aria-label="Field"
      >
        <optgroup label={TABLE_SINGULAR[table]}>
          {ownFields(table).map((f) => (
            <option key={f.name} value={f.name}>
              {f.label}
            </option>
          ))}
        </optgroup>
        {FIELDS[table].some((f) => f.parent) && (
          <optgroup label="Account">
            {FIELDS[table]
              .filter((f) => f.parent)
              .map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
          </optgroup>
        )}
      </select>
      <select className={inputClass} value={c.operator} onChange={(e) => onChange({ ...c, operator: e.target.value as Operator, value: e.target.value === "isOneOf" ? "" : c.value })} aria-label="Operator">
        {ops.map((o) => (
          <option key={o} value={o}>
            {operatorLabel(table, c.field, o) ?? OPERATOR_LABELS[o]}
          </option>
        ))}
      </select>
      {c.operator !== "isEmpty" && c.operator !== "hasValue" && (
        <ValueInput table={table} field={c.field} value={c.value} multi={c.operator === "isOneOf"} onChange={(value) => onChange({ ...c, value })} />
      )}
      {onRemove && (
        <Button variant="ghost" size="icon" className="ml-auto size-7" aria-label="Remove condition" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

function EffectRow({ table, e, onChange, onRemove }: { table: RuleTable; e: Effect; onChange: (e: Effect) => void; onRemove?: () => void }) {
  const fieldSelect = (value: string, set: (v: string) => void, optional?: boolean) => (
    <select className={inputClass} value={value} onChange={(x) => set(x.target.value)} aria-label="Field">
      {optional && <option value="">the whole record</option>}
      {ownFields(table).map((f) => (
        <option key={f.name} value={f.name}>
          {f.label}
        </option>
      ))}
    </select>
  )
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/50 p-1.5 text-sm">
      <EffectIcon kind={e.kind} className="ml-1" />
      <select
        className={inputClass}
        value={e.kind}
        onChange={(x) => onChange(blankEffect(table, x.target.value as Effect["kind"], "field" in e ? e.field : undefined))}
        aria-label="Effect"
      >
        {Object.entries(EFFECT_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {(e.kind === "required" || e.kind === "readOnly") && fieldSelect(e.field, (field) => onChange({ ...e, field }))}
      {e.kind === "setValue" && (
        <>
          {fieldSelect(e.field, (field) => onChange({ ...e, field, value: "" }))}
          <span>to</span>
          <ValueInput table={table} field={e.field} value={e.value} onChange={(value) => onChange({ ...e, value })} />
        </>
      )}
      {(e.kind === "warning" || e.kind === "blockSave") && (
        <>
          {e.kind === "warning" && (
            <>
              <span>on</span>
              {fieldSelect(e.field ?? "", (field) => onChange({ ...e, field: field || undefined }), true)}
            </>
          )}
          <input
            className={cn(inputClass, "min-w-48 flex-1")}
            placeholder={e.kind === "warning" ? "Warning text" : "Why it can't be saved"}
            value={e.message}
            onChange={(x) => onChange({ ...e, message: x.target.value })}
            aria-label="Message"
          />
        </>
      )}
      {onRemove && (
        <Button variant="ghost" size="icon" className="ml-auto size-7" aria-label="Remove effect" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

/** Name, conditions and effects: the body of every editor. */
function RuleEditorBody({ rule, change }: { rule: BusinessRule; change: (r: BusinessRule) => void }) {
  const t = rule.table
  return (
    <div className="space-y-4">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Name</span>
        <input className={cn(inputClass, "h-9")} value={rule.name} placeholder="e.g. Large deals need a next step" onChange={(e) => change({ ...rule, name: e.target.value })} />
      </label>
      <section className="space-y-1.5">
        <h3 className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          When
          <select className={inputClass} value={rule.match} onChange={(e) => change({ ...rule, match: e.target.value as "all" | "any" })} aria-label="Match">
            <option value="all">all of these are true</option>
            <option value="any">any of these is true</option>
          </select>
        </h3>
        {rule.conditions.map((c, i) => (
          <ConditionRow
            key={c.id}
            table={t}
            c={c}
            onChange={(next) => change({ ...rule, conditions: rule.conditions.map((x, j) => (j === i ? next : x)) })}
            onRemove={() => change({ ...rule, conditions: rule.conditions.filter((_, j) => j !== i) })}
          />
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => change({ ...rule, conditions: [...rule.conditions, { id: newId("c"), field: ownFields(t)[0].name, operator: "hasValue", value: "" }] })}
        >
          <Plus aria-hidden />
          Add condition
        </Button>
        <p className="text-xs text-muted-foreground">Related-record checks (“at least N Tasks where …”) use the same builder as Gates; left out of this prototype.</p>
      </section>
      <section className="space-y-1.5">
        <h3 className="text-sm font-medium">Then</h3>
        {rule.effects.map((e, i) => (
          <EffectRow
            key={e.id}
            table={t}
            e={e}
            onChange={(next) => change({ ...rule, effects: rule.effects.map((x, j) => (j === i ? next : x)) })}
            onRemove={rule.effects.length > 1 ? () => change({ ...rule, effects: rule.effects.filter((_, j) => j !== i) }) : undefined}
          />
        ))}
        <Button variant="ghost" size="sm" onClick={() => change({ ...rule, effects: [...rule.effects, blankEffect(t, "required")] })}>
          <Plus aria-hidden />
          Add effect
        </Button>
        <p className="text-xs text-muted-foreground">Required, read-only and warnings hold while the condition is true. Set value fills the field once, when the condition becomes true.</p>
      </section>
    </div>
  )
}

function problemsOf(rule: BusinessRule): string[] {
  const out: string[] = []
  if (!rule.name.trim()) out.push("Give the rule a name.")
  if (rule.effects.some((e) => (e.kind === "warning" || e.kind === "blockSave") && !e.message.trim())) out.push("Write the message the user sees.")
  return out
}

/** Pick one of the table's records and see whether the rule applies to it. */
function TryOnRecord({ rule }: { rule: BusinessRule }) {
  const gateway = useGateway()
  const { accountExtras } = useRulesState()
  const [id, setId] = useState("")
  const { data = [] } = useQuery({
    queryKey: ["rules-try", rule.table],
    queryFn: async (): Promise<RuledRecord[]> => {
      const q = { view: "all" as const, pageSize: 25 }
      if (rule.table === "lead") return (await gateway.listLeads(q)).items.map((record) => ({ table: "lead", record }))
      if (rule.table === "opportunity") return (await gateway.listOpportunities(q)).items.map((record) => ({ table: "opportunity", record }))
      if (rule.table === "account") return (await gateway.listAccounts(q)).items.map((record) => ({ table: "account", record }))
      return (await gateway.listContacts(q)).items.map((record) => ({ table: "contact", record }))
    },
  })
  const picked = data.find((r) => r.record.id === id)
  const name = (r: RuledRecord) => (r.table === "lead" || r.table === "contact" ? fullName(r.record) : r.record.name)
  const values = picked && savedValues(picked, accountExtras)
  const applies = values && ruleApplies({ ...rule, on: true }, values)
  const outcome = values && evaluate(rule.table, [{ ...rule, on: true }], values)
  return (
    <section className="space-y-1.5 rounded-md border p-3">
      <h3 className="text-sm font-medium">Try it on {aOrAn(TABLE_SINGULAR[rule.table])}</h3>
      <select className={cn(inputClass, "w-full")} value={id} onChange={(e) => setId(e.target.value)} aria-label="Record to try">
        <option value="">Pick {aOrAn(TABLE_SINGULAR[rule.table])}…</option>
        {data.map((r) => (
          <option key={r.record.id} value={r.record.id}>
            {name(r)}
          </option>
        ))}
      </select>
      {picked && (
        <p className="text-sm">
          {applies ? (
            <>
              <span className="font-medium text-green-700 dark:text-green-400">Applies.</span>{" "}
              {outcome!.missing.length > 0 && `Missing now: ${outcome!.missing.map((m) => fieldDef(rule.table, m.field)?.label).join(", ")}. `}
              {outcome!.blocks.length > 0 && "Saving would be blocked. "}
              {allWarningsCount(outcome!) > 0 && "The warning shows. "}
            </>
          ) : (
            <span className="text-foreground/75">Doesn't apply to this {TABLE_SINGULAR[rule.table]}.</span>
          )}
        </p>
      )}
    </section>
  )
}

const aOrAn = (noun: string) => (/^[AEIOU]/.test(noun) ? `an ${noun}` : `a ${noun}`)

const allWarningsCount = (o: ReturnType<typeof evaluate>) => o.recordWarnings.length + Object.values(o.fields).reduce((n, f) => n + f.warnings.length, 0)

function RuleDialog({ rule: initial, onClose }: { rule: BusinessRule; onClose: () => void }) {
  const { rules } = useRulesState()
  const [rule, setRule] = useState(initial)
  const [tried, setTried] = useState(false)
  const isNew = !rules.some((r) => r.id === initial.id)
  const problems = problemsOf(rule)
  const conflicts = conflictsFor(rule, rules)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? `New ${TABLE_SINGULAR[rule.table]} rule` : rule.name}</DialogTitle>
          <DialogDescription>
            {isNew ? "Saved rules apply at once." : `Changed by ${rule.changedBy} on ${rule.changedOn}. Saving applies the change at once.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 text-sm">
          <OnSwitch on={rule.on} onChange={(on) => setRule({ ...rule, on })} label="Rule is on" />
          {rule.on ? "On" : "Off: saved but not applied"}
        </div>
        <RuleEditorBody rule={rule} change={setRule} />
        <TryOnRecord rule={rule} />
        {conflicts.map((c) => (
          <p key={c} className={cn("flex items-start gap-2 text-sm", warnText)}>
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {c}
          </p>
        ))}
        {tried && problems.length > 0 && (
          <p role="alert" className="text-sm text-destructive">
            {problems.join(" ")}
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {!isNew ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                deleteRule(rule.id)
                onClose()
              }}
            >
              <Trash2 aria-hidden />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setTried(true)
                if (problems.length) return
                saveRule(rule)
                onClose()
              }}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EffectSummary({ rule }: { rule: BusinessRule }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {rule.effects.map((e) => (
        <li key={e.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
          <EffectIcon kind={e.kind} />
          {describeEffect(rule.table, e)}
        </li>
      ))}
    </ul>
  )
}

// --- Variant A: a list with an editor dialog -------------------------------------------------------

function ListVariant({ rows, onOpen }: { rows: BusinessRule[]; onOpen: (r: BusinessRule) => void }) {
  if (!rows.length) return <p className="rounded-md border p-6 text-center text-sm text-foreground/75">No rules for this table yet.</p>
  return (
    <ul className="divide-y rounded-md border">
      {rows.map((r) => (
        <li key={r.id} className={cn("flex items-start gap-3 p-3", !r.on && "bg-muted/40")}>
          <div className="pt-0.5">
            <OnSwitch on={r.on} onChange={(on) => saveRule({ ...r, on })} label={`${r.name} is on`} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <button type="button" className="text-left font-medium text-primary hover:underline" onClick={() => onOpen(r)}>
              {r.name}
            </button>
            {!r.on && <span className="ml-2 text-xs text-foreground/75">Off</span>}
            <p className="text-sm text-foreground/75">{describeWhen(r)}</p>
            <EffectSummary rule={r} />
          </div>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
            {r.changedBy}
            <br />
            {r.changedOn}
          </span>
        </li>
      ))}
    </ul>
  )
}

// --- Variant B: every rule as an editable card, saved per card ----------------------------------------

function CardsVariant({ rows, table, adding, onAdded }: { rows: BusinessRule[]; table: RuleTable; adding: BusinessRule | null; onAdded: () => void }) {
  const [drafts, setDrafts] = useState<BusinessRule[]>([])
  useEffect(() => {
    if (adding && adding.table === table) {
      setDrafts((d) => [adding, ...d])
      onAdded()
    }
  }, [adding, table, onAdded])
  return (
    <div className="space-y-3">
      {drafts.map((d) => (
        <RuleCard key={d.id} rule={d} isNew onDone={() => setDrafts((all) => all.filter((x) => x.id !== d.id))} />
      ))}
      {rows.map((r) => (
        <RuleCard key={r.id} rule={r} />
      ))}
      {!rows.length && !drafts.length && <p className="rounded-md border p-6 text-center text-sm text-foreground/75">No rules for this table yet.</p>}
    </div>
  )
}

function RuleCard({ rule: saved, isNew, onDone }: { rule: BusinessRule; isNew?: boolean; onDone?: () => void }) {
  const { rules } = useRulesState()
  const [rule, setRule] = useState(saved)
  const [open, setOpen] = useState(!!isNew)
  const [tried, setTried] = useState(false)
  useEffect(() => setRule(saved), [saved])
  const dirty = isNew || JSON.stringify(rule) !== JSON.stringify(saved)
  const problems = problemsOf(rule)
  const conflicts = conflictsFor(rule, rules)
  return (
    <article className={cn("rounded-md border", !rule.on && "bg-muted/40", dirty && "border-primary")}>
      <header className="flex flex-wrap items-center gap-3 p-3">
        <OnSwitch on={rule.on} onChange={(on) => (dirty ? setRule({ ...rule, on }) : saveRule({ ...saved, on }))} label={`${rule.name || "New rule"} is on`} />
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">{rule.name || "New rule"}</h2>
          {!open && (
            <p className="text-sm text-foreground/75">
              {describeWhen(rule)} <ArrowRight className="inline size-3.5" aria-hidden /> {rule.effects.map((e) => describeEffect(rule.table, e)).join("; ")}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Close" : "Edit"}
        </Button>
      </header>
      {open && (
        <div className="space-y-3 border-t p-3">
          <RuleEditorBody rule={rule} change={setRule} />
          <TryOnRecord rule={rule} />
          {conflicts.map((c) => (
            <p key={c} className={cn("flex items-start gap-2 text-sm", warnText)}>
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {c}
            </p>
          ))}
        </div>
      )}
      {dirty && (
        <footer className="flex flex-wrap items-center gap-2 border-t bg-primary/5 p-2">
          <span className="text-sm">{isNew ? "Not saved yet" : "Unsaved changes"}</span>
          {tried && problems.length > 0 && (
            <span role="alert" className="text-sm text-destructive">
              {problems.join(" ")}
            </span>
          )}
          <span className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isNew) onDone?.()
                else setRule(saved)
              }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setTried(true)
                if (problems.length) return
                saveRule(rule)
                onDone?.()
              }}
            >
              Save and apply
            </Button>
          </span>
        </footer>
      )}
      {!dirty && open && (
        <footer className="flex items-center justify-between border-t p-2 text-xs text-muted-foreground">
          <span>
            Changed by {saved.changedBy} on {saved.changedOn}
          </span>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRule(saved.id)}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        </footer>
      )}
    </article>
  )
}

// --- Variant C: a field-by-effect grid ---------------------------------------------------------------

const COLUMNS: Effect["kind"][] = ["required", "readOnly", "setValue", "warning"]

function FieldVariant({ table, rows, onOpen }: { table: RuleTable; rows: BusinessRule[]; onOpen: (r: BusinessRule) => void }) {
  const isDesktop = useIsDesktop()
  const fields = ownFields(table)
  const rulesFor = (field: string | null, kind: Effect["kind"]) =>
    rows.filter((r) => r.effects.some((e) => e.kind === kind && (field === null ? !("field" in e) || !e.field : "field" in e && e.field === field)))
  const chip = (r: BusinessRule) => (
    <button
      key={r.id}
      type="button"
      onClick={() => onOpen(r)}
      className={cn("rounded-full border px-2 py-0.5 text-left text-xs hover:bg-accent", r.on ? "border-primary/50 bg-primary/10" : "border-dashed text-foreground/75")}
      title={describeWhen(r)}
    >
      {r.name}
      {!r.on && " (off)"}
    </button>
  )
  const add = (field: string | null, kind: Effect["kind"]) => (
    <button
      type="button"
      aria-label={`New ${EFFECT_LABELS[kind].toLowerCase()} rule${field ? ` for ${fieldDef(table, field)?.label}` : ""}`}
      className="rounded-full p-0.5 text-muted-foreground opacity-60 hover:bg-accent hover:opacity-100 focus-visible:opacity-100"
      onClick={() => onOpen(blankRule(table, blankEffect(table, kind, field ?? undefined)))}
    >
      <Plus className="size-3.5" />
    </button>
  )
  if (!isDesktop) {
    return (
      <div className="space-y-2">
        {fields.map((f) => {
          const count = COLUMNS.reduce((n, k) => n + rulesFor(f.name, k).length, 0)
          return (
            <details key={f.name} className="rounded-md border p-3" open={count > 0}>
              <summary className="cursor-pointer text-sm font-medium">
                {f.label} <span className="font-normal text-foreground/75">· {count} rule{count === 1 ? "" : "s"}</span>
              </summary>
              <dl className="mt-2 space-y-2 text-sm">
                {COLUMNS.map((k) => (
                  <div key={k}>
                    <dt className="flex items-center gap-1 text-xs text-foreground/75">
                      <EffectIcon kind={k} />
                      {EFFECT_LABELS[k]}
                    </dt>
                    <dd className="mt-1 flex flex-wrap items-center gap-1">
                      {rulesFor(f.name, k).map(chip)}
                      {add(f.name, k)}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )
        })}
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">Whole record</p>
                    <div className="mt-2"><RecordRowCells warn={rulesFor(null, "warning")} block={rulesFor(null, "blockSave")} chip={chip} add={add} /></div>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="p-2 font-medium">Field</th>
            {COLUMNS.map((k) => (
              <th key={k} className="p-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  <EffectIcon kind={k} />
                  {EFFECT_LABELS[k].replace("Make ", "").replace(/^./, (c) => c.toUpperCase())}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {fields.map((f) => (
            <tr key={f.name}>
              <th scope="row" className="p-2 text-left font-normal">
                {f.label}
              </th>
              {COLUMNS.map((k) => (
                <td key={k} className="p-2 align-top">
                  <div className="flex flex-wrap items-center gap-1">
                    {rulesFor(f.name, k).map(chip)}
                    {add(f.name, k)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
          <tr className="bg-muted/30">
            <th scope="row" className="p-2 text-left font-medium">
              Whole record
            </th>
            <td className="p-2 text-xs text-foreground/75" colSpan={2}>
              Warnings not tied to a field, and Block save
            </td>
            <td className="p-2 align-top" colSpan={2}>
              <RecordRowCells warn={rulesFor(null, "warning")} block={rulesFor(null, "blockSave")} chip={chip} add={add} />
            </td>
          </tr>
        </tbody>
      </table>
      <p className="border-t p-2 text-xs text-muted-foreground">Hover a rule to see when it applies; click it to edit. A rule with several effects shows in several cells.</p>
    </div>
  )
}

function RecordRowCells({
  warn,
  block,
  chip,
  add,
}: {
  warn: BusinessRule[]
  block: BusinessRule[]
  chip: (r: BusinessRule) => ReactNode
  add: (field: string | null, kind: Effect["kind"]) => ReactNode
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <p className="mb-1 flex items-center gap-1 text-xs text-foreground/75">
          <EffectIcon kind="warning" />
          Warning
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {warn.map(chip)}
          {add(null, "warning")}
        </div>
      </div>
      <div>
        <p className="mb-1 flex items-center gap-1 text-xs text-foreground/75">
          <EffectIcon kind="blockSave" />
          Block save
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {block.map(chip)}
          {add(null, "blockSave")}
        </div>
      </div>
    </div>
  )
}
