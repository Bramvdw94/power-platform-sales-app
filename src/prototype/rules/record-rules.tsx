// PROTOTYPE (wayfinder #87): throwaway. Never merge to main.
/* eslint-disable react-refresh/only-export-components -- prototype */
// How Business rules show on a record page: three variants of the same five
// effects (required, read-only, set value, warning, block save), on Lead,
// Opportunity, Account and Contact pages.

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Ban, BookCheck, ChevronDown, CircleAlert, CircleCheck, Lock, Sparkles, TriangleAlert, Undo2 } from "lucide-react"
import { ContactPicker } from "@/components/records/account-picker"
import { FormField } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { SalesGateway } from "@/data/gateway"
import { useGateway } from "@/hooks/use-gateway"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { cn } from "@/lib/utils"
import type { Account, Contact, Lead, LeadSource, Opportunity } from "@/sales"
import { PrototypeSwitcher, useVariant, type VariantOption } from "../prototype-switcher"
import {
  ACCOUNT_TYPE_LABELS,
  INDUSTRIES,
  TABLE_SINGULAR,
  allWarnings,
  describeEffect,
  evaluate,
  fieldLabel,
  ownFields,
  setAccountExtras,
  useRulesState,
  type BusinessRule,
  type FieldDef,
  type RuleOutcome,
  type Values,
} from "./model"

export const EFFECT_VARIANTS: VariantOption[] = [
  { key: "A", name: "At the field" },
  { key: "B", name: "Rules panel" },
  { key: "C", name: "Alert bar + toasts" },
]

export type RuledRecord =
  | { table: "lead"; record: Lead }
  | { table: "opportunity"; record: Opportunity }
  | { table: "account"; record: Account }
  | { table: "contact"; record: Contact }

const warnText = "text-amber-800 dark:text-amber-300"
const warnBox = "rounded-md border border-amber-600/40 bg-amber-500/10 p-3 text-sm"
const blockBox = "rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"

/** v1 fields that are always required, whatever the rules say. */
const BASE_REQUIRED: Record<RuledRecord["table"], string[]> = {
  lead: ["lastName", "company"],
  opportunity: ["name", "estimatedValue", "expectedCloseDate"],
  account: ["name"],
  contact: ["lastName"],
}

// --- Values -------------------------------------------------------------------------

function useExtras() {
  return useRulesState().accountExtras
}

export function savedValues(r: RuledRecord, extras: ReturnType<typeof useExtras>): Values {
  const out: Values = {}
  for (const f of ownFields(r.table)) {
    const v = (r.record as Record<string, unknown>)[f.name]
    out[f.name] = v === undefined || v === null ? "" : String(v)
  }
  if (r.table === "account") {
    out.accountType = extras[r.record.id]?.accountType ?? ""
    out.industry = extras[r.record.id]?.industry ?? ""
  }
  const accountId = r.table === "opportunity" || r.table === "contact" ? r.record.accountId : undefined
  if (accountId) {
    out["account.accountType"] = extras[accountId]?.accountType ?? ""
    out["account.industry"] = extras[accountId]?.industry ?? ""
  }
  return out
}

// Live values while a record is being edited, so the panel and alert bar
// (outside the form) follow the form as the user types.
const live = new Map<string, Values>()
const liveListeners = new Set<() => void>()
function setLive(key: string, values: Values | undefined) {
  if (values) live.set(key, values)
  else live.delete(key)
  liveListeners.forEach((l) => l())
}
function useLive(key: string): Values | undefined {
  return useSyncExternalStore(
    (l) => {
      liveListeners.add(l)
      return () => liveListeners.delete(l)
    },
    () => live.get(key),
  )
}

// Block save, as the variants that check on Save report it to the alert bar.
const blockedAttempt = new Map<string, number>()
function markBlocked(key: string) {
  blockedAttempt.set(key, Date.now())
  liveListeners.forEach((l) => l())
}
function useBlockedAttempt(key: string) {
  return useSyncExternalStore(
    (l) => {
      liveListeners.add(l)
      return () => liveListeners.delete(l)
    },
    () => blockedAttempt.get(key),
  )
}

const keyOf = (r: RuledRecord) => `${r.table}:${r.record.id}`

/** The rules' outcome for a record: on the live form values while editing, else on what is saved. */
export function useOutcome(r: RuledRecord) {
  const { rules } = useRulesState()
  const extras = useExtras()
  const liveValues = useLive(keyOf(r))
  const values = liveValues ?? savedValues(r, extras)
  return { outcome: evaluate(r.table, rules, values), editing: !!liveValues, values }
}

// --- Page pieces --------------------------------------------------------------------

/** Replaces the Details card's body: the read view (with rule notices) or the rule-aware form. */
export function RuledDetails({
  r,
  editing,
  onDone,
  readView,
}: {
  r: RuledRecord
  editing: boolean
  onDone: () => void
  readView: ReactNode
}) {
  const variant = useVariant(EFFECT_VARIANTS)
  const isDesktop = useIsDesktop()
  return (
    <>
      <PrototypeSwitcher variants={EFFECT_VARIANTS} label="Rules on records" />
      {editing ? (
        <RuledForm key={variant} r={r} variant={variant} onDone={onDone} />
      ) : (
        <div className="space-y-4">
          {variant === "A" && <ReadNotices r={r} />}
          {variant === "B" && !isDesktop && <RulesPanel r={r} embedded />}
          {readView}
          {r.table === "account" && <AccountExtrasRead r={r} />}
        </div>
      )}
    </>
  )
}

/** Variant B: a "Business rules" card above the activity timeline on a desktop. */
export function RulesSide({ r }: { r: RuledRecord }) {
  const variant = useVariant(EFFECT_VARIANTS)
  const isDesktop = useIsDesktop()
  if (variant !== "B" || !isDesktop) return null
  return <RulesPanel r={r} />
}

/** Variant C: the alert bar at the top of the record's main column. */
export function RulesTop({ r }: { r: RuledRecord }) {
  const variant = useVariant(EFFECT_VARIANTS)
  if (variant !== "C") return null
  return <AlertBar r={r} />
}

function AccountExtrasRead({ r }: { r: Extract<RuledRecord, { table: "account" }> }) {
  const extras = useExtras()[r.record.id] ?? {}
  return (
    <dl className="grid gap-x-6 gap-y-4 border-t pt-4 sm:grid-cols-2">
      <div>
        <dt className="text-xs text-muted-foreground">Account type</dt>
        <dd className="mt-0.5">{extras.accountType ? ACCOUNT_TYPE_LABELS[extras.accountType] : "—"}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Industry</dt>
        <dd className="mt-0.5">{extras.industry ? INDUSTRIES[extras.industry] : "—"}</dd>
      </div>
    </dl>
  )
}

function RuleName({ rule }: { rule: BusinessRule }) {
  return <span className="font-medium">“{rule.name}”</span>
}

// --- Variant A: notices at the top of the Details card in read mode --------------------

function ReadNotices({ r }: { r: RuledRecord }) {
  const { outcome } = useOutcome(r)
  const warnings = allWarnings(outcome)
  if (!warnings.length && !outcome.missing.length && !outcome.blocks.length) return null
  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <p key={i} className={cn(warnBox, "flex items-start gap-2")}>
          <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", warnText)} aria-hidden />
          <span>{w.message}</span>
        </p>
      ))}
      {outcome.missing.length > 0 && (
        <p className={cn(warnBox, "flex items-start gap-2")}>
          <CircleAlert className={cn("mt-0.5 size-4 shrink-0", warnText)} aria-hidden />
          <span>
            Missing:{" "}
            {outcome.missing.map((m, i) => (
              <span key={m.field}>
                {i > 0 && ", "}
                <span className="font-medium">{fieldLabel(r.table, m.field)}</span>
              </span>
            ))}
            . A rule makes {outcome.missing.length === 1 ? "it" : "them"} required, so the next save asks for {outcome.missing.length === 1 ? "it" : "them"}.
          </span>
        </p>
      )}
      {outcome.blocks.map((b, i) => (
        <p key={i} className={cn(blockBox, "flex items-start gap-2")}>
          <Ban className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <span>
            <span className="font-medium">Changes can't be saved:</span> {b.message}
          </span>
        </p>
      ))}
    </div>
  )
}

// --- Variant B: the rules panel ----------------------------------------------------------

function RulesPanel({ r, embedded }: { r: RuledRecord; embedded?: boolean }) {
  const { outcome, editing, values } = useOutcome(r)
  const [open, setOpen] = useState(true)
  const count = outcome.active.length
  const body = (
    <ul className="space-y-3">
      {outcome.active.map((rule) => (
        <li key={rule.id} className="space-y-1 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <BookCheck className="size-4 shrink-0 text-primary" aria-hidden />
            {rule.name}
          </p>
          <ul className="space-y-1 pl-6">
            {rule.effects.map((e) => {
              const missing = e.kind === "required" && !values[e.field]?.trim()
              return (
                <li key={e.id} className="flex items-start gap-1.5">
                  {e.kind === "required" &&
                    (missing ? (
                      <CircleAlert className={cn("mt-0.5 size-3.5 shrink-0", warnText)} aria-label="Missing" />
                    ) : (
                      <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-green-700 dark:text-green-400" aria-label="Filled in" />
                    ))}
                  {e.kind === "readOnly" && <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                  {e.kind === "setValue" && <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />}
                  {e.kind === "warning" && <TriangleAlert className={cn("mt-0.5 size-3.5 shrink-0", warnText)} aria-hidden />}
                  {e.kind === "blockSave" && <Ban className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />}
                  <span className={cn(e.kind === "warning" && warnText, e.kind === "blockSave" && "text-destructive")}>
                    {e.kind === "warning" || e.kind === "blockSave" ? e.message : capitalise(describeEffect(r.table, e))}
                    {missing && <span className={cn("ml-1", warnText)}>· missing</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
  if (count === 0 && !editing) return null
  return (
    <Card className={cn("gap-3 py-4", embedded && "border-primary/40")}>
      <CardHeader className="px-4">
        <CardTitle>
          <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
            Business rules
            <span className="rounded-full bg-muted px-2 text-xs font-normal">{count} apply</span>
            <ChevronDown className={cn("ml-auto size-4 transition-transform", !open && "-rotate-90")} aria-hidden />
          </button>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="px-4">
          {count ? body : <p className="text-sm text-muted-foreground">No rules apply to this {TABLE_SINGULAR[r.table]} right now.</p>}
          <p className="mt-3 text-xs text-muted-foreground">{editing ? "Updates as you type." : "Set by your manager in Business rules."}</p>
        </CardContent>
      )}
    </Card>
  )
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// --- Variant C: the alert bar ----------------------------------------------------------------

function AlertBar({ r }: { r: RuledRecord }) {
  const { outcome, editing } = useOutcome(r)
  const blockedAt = useBlockedAttempt(keyOf(r))
  const [open, setOpen] = useState(false)
  const warnings = allWarnings(outcome)
  const showBlocks = outcome.blocks.length > 0 && (!editing || !!blockedAt)
  if (!warnings.length && !outcome.missing.length && !outcome.blocks.length) return null
  const chips: ReactNode[] = []
  if (warnings.length) chips.push(<Chip key="w" tone="warn" icon={<TriangleAlert className="size-3.5" aria-hidden />}>{warnings.length} warning{warnings.length > 1 ? "s" : ""}</Chip>)
  if (outcome.missing.length)
    chips.push(<Chip key="m" tone="warn" icon={<CircleAlert className="size-3.5" aria-hidden />}>{outcome.missing.length} required field{outcome.missing.length > 1 ? "s" : ""} empty</Chip>)
  if (outcome.blocks.length) chips.push(<Chip key="b" tone={showBlocks ? "block" : "quiet"} icon={<Ban className="size-3.5" aria-hidden />}>{editing ? "Can't be saved" : "Saving blocked"}</Chip>)
  return (
    <div className={cn("sticky top-0 z-10 rounded-md border bg-background shadow-sm", showBlocks && "border-destructive/60")} role="status">
      <button type="button" className="flex w-full flex-wrap items-center gap-2 p-2 text-left text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="font-medium">Business rules</span>
        {chips}
        <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="space-y-1.5 border-t p-3 text-sm">
          {warnings.map((w, i) => (
            <li key={`w${i}`} className="flex items-start gap-2">
              <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", warnText)} aria-hidden />
              <span>
                {w.message} <span className="text-muted-foreground">({w.rule.name})</span>
              </span>
            </li>
          ))}
          {outcome.missing.map((m) => (
            <li key={m.field} className="flex items-start gap-2">
              <CircleAlert className={cn("mt-0.5 size-4 shrink-0", warnText)} aria-hidden />
              <span>
                {fieldLabel(r.table, m.field)} is required <span className="text-muted-foreground">({m.rule.name})</span>
              </span>
            </li>
          ))}
          {outcome.blocks.map((b, i) => (
            <li key={`b${i}`} className="flex items-start gap-2">
              <Ban className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <span>
                {b.message} <span className="text-muted-foreground">({b.rule.name})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Chip({ tone, icon, children }: { tone: "warn" | "block" | "quiet"; icon: ReactNode; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "warn" && cn("border-amber-600/40 bg-amber-500/10", warnText),
        tone === "block" && "border-destructive/50 bg-destructive/10 text-red-800 dark:text-red-300",
        tone === "quiet" && "text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </span>
  )
}

// --- The rule-aware edit form -----------------------------------------------------------------

function RuledForm({ r, variant, onDone }: { r: RuledRecord; variant: string; onDone: () => void }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const isDesktop = useIsDesktop()
  const { rules } = useRulesState()
  const extras = useExtras()
  const key = keyOf(r)
  const [values, setValues] = useState<Values>(() => savedValues(r, extras))
  const [contactName, setContactName] = useState(r.table === "opportunity" ? (r.record.primaryContactName ?? "") : "")
  const [setBy, setSetBy] = useState<Record<string, BusinessRule>>({})
  const [tried, setTried] = useState(false)
  const [blockDialog, setBlockDialog] = useState(false)
  const outcome = evaluate(r.table, rules, values)
  const activeIds = useRef(new Set(outcome.active.map((a) => a.id)))

  useEffect(() => {
    setLive(key, values)
  }, [key, values])
  useEffect(
    () => () => {
      setLive(key, undefined)
      blockedAttempt.delete(key)
    },
    [key],
  )

  // Set value fires once, when a rule's condition becomes true.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- prototype: compares against the previous render
  useEffect(() => {
    const now = new Set(outcome.active.map((a) => a.id))
    const fired = outcome.setValues.filter((s) => !activeIds.current.has(s.rule.id) && values[s.field] !== s.value)
    activeIds.current = now
    if (!fired.length) return
    const before = { ...values }
    setValues((v) => ({ ...v, ...Object.fromEntries(fired.map((s) => [s.field, s.value])) }))
    setSetBy((m) => ({ ...m, ...Object.fromEntries(fired.map((s) => [s.field, s.rule])) }))
    if (variant === "C") {
      for (const s of fired) {
        toast(`${fieldLabel(r.table, s.field)} set by a rule`, {
          description: `“${s.rule.name}” filled in “${s.value}”.`,
          action: { label: "Undo", onClick: () => setValues((v) => ({ ...v, [s.field]: before[s.field] ?? "" })) },
        })
      }
    }
  })

  const save = useMutation({
    mutationFn: () => persist(gateway, r, values),
    onSuccess: async () => {
      await invalidate()
      onDone()
    },
  })

  const baseMissing = BASE_REQUIRED[r.table].filter((f) => !values[f]?.trim())
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTried(true)
    if (outcome.blocks.length) {
      if (variant === "B") setBlockDialog(true)
      if (variant === "C") {
        markBlocked(key)
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
      return
    }
    if (outcome.missing.length || baseMissing.length) {
      if (variant === "C") markBlocked(key)
      return
    }
    save.mutate()
  }

  const fieldError = (name: string) => {
    if (!tried) return undefined
    if (BASE_REQUIRED[r.table].includes(name) && !values[name]?.trim()) return "Fill this in."
    const m = outcome.missing.find((x) => x.field === name)
    if (!m) return undefined
    return variant === "A" ? `Required by the rule “${m.rule.name}”.` : "Required."
  }

  const fields = ownFields(r.table)
  return (
    <form onSubmit={submit} noValidate aria-label={`Edit ${TABLE_SINGULAR[r.table]}`} className="grid gap-4 sm:grid-cols-2">
      {variant === "A" && outcome.recordWarnings.length > 0 && (
        <div className="space-y-2 sm:col-span-2">
          {outcome.recordWarnings.map((w, i) => (
            <p key={i} className={cn(warnBox, "flex items-start gap-2")}>
              <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", warnText)} aria-hidden />
              {w.message}
            </p>
          ))}
        </div>
      )}
      {variant === "B" && !isDesktop && (
        <div className="sm:col-span-2">
          <RulesPanel r={r} embedded />
        </div>
      )}
      {fields.map((f) => (
        <RuledField
          key={f.name}
          table={r.table}
          field={f}
          variant={variant}
          value={values[f.name] ?? ""}
          contactName={contactName}
          onContact={(id, name) => {
            setContactName(name)
            setValues((v) => ({ ...v, primaryContactId: id }))
          }}
          onChange={(value) => {
            setValues((v) => ({ ...v, [f.name]: value }))
            setSetBy((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== f.name)))
          }}
          required={BASE_REQUIRED[r.table].includes(f.name) || !!outcome.fields[f.name]?.required}
          requiredBy={outcome.fields[f.name]?.required}
          readOnlyBy={outcome.fields[f.name]?.readOnly}
          warnings={outcome.fields[f.name]?.warnings ?? []}
          setBy={setBy[f.name]}
          error={fieldError(f.name)}
        />
      ))}

      {variant === "A" && outcome.blocks.length > 0 && (
        <div className={cn(blockBox, "space-y-1 sm:col-span-2")} role="alert">
          {outcome.blocks.map((b, i) => (
            <p key={i} className="flex items-start gap-2">
              <Ban className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <span>
                <span className="font-medium">Can't save:</span> {b.message}
              </span>
            </p>
          ))}
        </div>
      )}
      {variant === "B" && tried && (outcome.missing.length > 0 || baseMissing.length > 0) && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          Fill in the required fields, then save.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          Saving failed.
        </p>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || (variant === "A" && outcome.blocks.length > 0)}>
          Save
        </Button>
      </div>

      <Dialog open={blockDialog} onOpenChange={setBlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This {TABLE_SINGULAR[r.table]} can't be saved</DialogTitle>
            <DialogDescription>A business rule set by your manager stops this change.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {outcome.blocks.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <Ban className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <span>
                  {b.message}
                  <br />
                  <span className="text-muted-foreground">Rule: {b.rule.name}</span>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setBlockDialog(false)}>Back to the form</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

function RuledField({
  table,
  field,
  variant,
  value,
  contactName,
  onContact,
  onChange,
  required,
  requiredBy,
  readOnlyBy,
  warnings,
  setBy,
  error,
}: {
  table: RuledRecord["table"]
  field: FieldDef
  variant: string
  value: string
  contactName: string
  onContact: (id: string, name: string) => void
  onChange: (value: string) => void
  required: boolean
  requiredBy?: BusinessRule
  readOnlyBy?: BusinessRule
  warnings: { rule: BusinessRule; message: string }[]
  setBy?: BusinessRule
  error?: string
}) {
  const id = `ruled-${table}-${field.name}`
  const locked = !!readOnlyBy
  const inline = variant === "A"
  const control = (() => {
    const common = {
      id,
      disabled: locked,
      "aria-invalid": error ? true : undefined,
      title: locked && !inline ? `Read-only: rule “${readOnlyBy!.name}”` : undefined,
      className: cn(setBy && "ring-2 ring-primary/60", locked && "pr-8"),
    }
    if (field.type === "lookup") {
      return (
        <ContactPicker
          id={id}
          value={value ? { id: value, name: contactName } : null}
          onChange={(c) => onContact(c?.id ?? "", c?.name ?? "")}
          invalid={!!error}
        />
      )
    }
    if (field.type === "choice") {
      return (
        <select
          {...common}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-9 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-70 md:text-sm dark:bg-input/30",
            "aria-invalid:border-destructive",
            common.className,
          )}
        >
          <option value="">—</option>
          {field.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }
    if (field.type === "textarea") return <Textarea {...common} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    return <Input {...common} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={value} onChange={(e) => onChange(e.target.value)} />
  })()

  return (
    <FormField id={id} label={field.label} required={required} error={error} className={cn((field.wide || field.type === "textarea") && "sm:col-span-2")}>
      <div className="relative">
        {control}
        {locked && <Lock className="pointer-events-none absolute top-2.5 right-2.5 size-4 text-muted-foreground" aria-label="Read-only" />}
      </div>
      {inline && requiredBy && !error && (
        <p className="text-xs text-muted-foreground">
          Required by the rule <RuleName rule={requiredBy} />
        </p>
      )}
      {inline && locked && (
        <p className="text-xs text-muted-foreground">
          Read-only because of the rule <RuleName rule={readOnlyBy!} />
        </p>
      )}
      {setBy && variant !== "C" && (
        <p className="flex items-center gap-1 text-xs text-primary">
          <Sparkles className="size-3.5" aria-hidden />
          {inline ? (
            <>
              Filled in by the rule <RuleName rule={setBy} />. You can change it.
            </>
          ) : (
            "Filled in by a rule"
          )}
        </p>
      )}
      {(inline || variant === "B") &&
        warnings.map((w, i) => (
          <p key={i} className={cn("flex items-start gap-1 text-xs", warnText)}>
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {w.message}
          </p>
        ))}
      {variant === "C" && setBy && (
        <p className="flex items-center gap-1 text-xs text-primary">
          <Undo2 className="size-3.5" aria-hidden />
          Set by a rule
        </p>
      )}
    </FormField>
  )
}

// --- Saving through the in-memory gateway -------------------------------------------------------

async function persist(gateway: SalesGateway, r: RuledRecord, v: Values) {
  const text = (k: string) => v[k] ?? ""
  switch (r.table) {
    case "lead":
      return gateway.updateLead(r.record.id, {
        firstName: text("firstName"),
        lastName: text("lastName"),
        company: text("company"),
        jobTitle: text("jobTitle"),
        email: text("email"),
        phone: text("phone"),
        website: text("website"),
        leadSource: (text("leadSource") || undefined) as LeadSource | undefined,
        description: text("description"),
      })
    case "opportunity":
      return gateway.updateOpportunity(r.record.id, {
        name: text("name"),
        primaryContactId: text("primaryContactId"),
        estimatedValue: Number(text("estimatedValue")),
        expectedCloseDate: text("expectedCloseDate"),
        probability: Number(text("probability")),
        leadSource: text("leadSource") as LeadSource | "",
        nextStep: text("nextStep"),
        description: text("description"),
      })
    case "account":
      setAccountExtras(r.record.id, { accountType: text("accountType") || undefined, industry: text("industry") || undefined })
      return gateway.updateAccount(r.record.id, {
        name: text("name"),
        website: text("website"),
        phone: text("phone"),
        city: text("city"),
        country: text("country"),
        description: text("description"),
      })
    case "contact":
      return gateway.updateContact(r.record.id, {
        firstName: text("firstName"),
        lastName: text("lastName"),
        jobTitle: text("jobTitle"),
        email: text("email"),
        phone: text("phone"),
        mobile: text("mobile"),
      })
  }
}

export type { RuleOutcome }
