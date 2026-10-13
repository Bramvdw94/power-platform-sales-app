import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { ContactPicker } from "@/components/records/account-picker"
import { FormField } from "@/components/records/fields"
import { ruleInputClass } from "@/lib/rule-classes"
import { FieldRuleNotes } from "@/components/records/rule-effects"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { useBusinessRules, useRulePreview } from "@/hooks/use-rules"
import { describeError, fieldErrorsOf } from "@/lib/errors"
import { FORECAST_CATEGORY_LABELS, LEAD_SOURCE_LABELS, formatDate, formatEuro } from "@/lib/format"
import { fieldLabel } from "@/lib/process-labels"
import { FORECAST_CATEGORIES, LEAD_SOURCES, previewRules, toDraftRecord, toEngineRecord, type FieldRuleView, type Lead, type Opportunity, type ProcessKind, type RuleContext } from "@/sales"
import type { Parents, Related } from "@/sales/engine"
import { cn } from "@/lib/utils"

type Editor =
  | { kind: "text" | "textarea" | "email" | "tel" | "url" | "number" | "date" }
  | { kind: "choice"; options: { value: string; label: string }[] }
  | { kind: "contact" }

const LEAD_SOURCE_OPTIONS = LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] }))

const EDITORS: Record<ProcessKind, Record<string, Editor>> = {
  lead: {
    firstName: { kind: "text" },
    lastName: { kind: "text" },
    company: { kind: "text" },
    jobTitle: { kind: "text" },
    email: { kind: "email" },
    phone: { kind: "tel" },
    website: { kind: "url" },
    leadSource: { kind: "choice", options: LEAD_SOURCE_OPTIONS },
    description: { kind: "textarea" },
  },
  opportunity: {
    name: { kind: "text" },
    estimatedValue: { kind: "number" },
    expectedCloseDate: { kind: "date" },
    probability: { kind: "number" },
    nextStep: { kind: "text" },
    description: { kind: "textarea" },
    leadSource: { kind: "choice", options: LEAD_SOURCE_OPTIONS },
    forecastCategory: { kind: "choice", options: FORECAST_CATEGORIES.map((c) => ({ value: c, label: FORECAST_CATEGORY_LABELS[c] })) },
    primaryContactId: { kind: "contact" },
  },
}

/** A Key field's value as text, for a Step the user can only read. */
function keyFieldText(record: Lead | Opportunity, field: string): string {
  const value = (record as Record<string, unknown>)[field]
  if (field === "primaryContactId") return (record as Opportunity).primaryContactName ?? ""
  if (field === "accountId") return (record as Opportunity).accountName ?? ""
  if (value === undefined || value === null || value === "") return ""
  if (field === "leadSource") return LEAD_SOURCE_LABELS[value as keyof typeof LEAD_SOURCE_LABELS] ?? String(value)
  if (field === "forecastCategory") return FORECAST_CATEGORY_LABELS[value as keyof typeof FORECAST_CATEGORY_LABELS] ?? String(value)
  if (field === "estimatedValue" && typeof value === "number") return formatEuro(value)
  if (field === "expectedCloseDate" && typeof value === "string") return formatDate(value)
  if (field === "probability") return `${String(value)}%`
  return String(value)
}

/** The Key fields of a Step: edited in place on the current Step of an open record, otherwise read-only. */
export function KeyFields({
  table,
  record,
  fields,
  editable,
  hasProductLines,
  parents,
  related,
}: {
  table: ProcessKind
  record: Lead | Opportunity
  fields: string[]
  editable: boolean
  hasProductLines: boolean
  /** What the Business rules may read beyond the record itself. */
  parents?: Parents
  related?: Related
}) {
  const rules = useBusinessRules(table)
  const context = useMemo<RuleContext>(
    () => ({ table, rules: rules.data?.engineEnabled ? rules.data.rules : [], parents, related }),
    [table, rules.data, parents, related],
  )
  // The same effects as in the Details form: required, read-only, filled in by a rule, warnings.
  const preview = useRulePreview(context, record)
  if (fields.length === 0) return <p className="text-sm text-muted-foreground">This Step has no Key fields.</p>
  return (
    <div className="grid gap-3">
      {fields.map((field) => {
        const editor = EDITORS[table][field]
        const locked = field === "estimatedValue" && hasProductLines
        const view = preview.viewOf(field)
        if (!editable || !editor || locked || view.readOnly) {
          const text = keyFieldText(record, field)
          return (
            <div key={field} className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {fieldLabel(field)}
                {view.required && <span aria-hidden className="text-destructive"> *</span>}
              </p>
              <p className={cn("break-words whitespace-pre-line text-sm", view.filledBy && "rounded bg-amber-50 px-1 dark:bg-amber-400/10")}>{text || "—"}</p>
              {locked && <p className="text-xs text-muted-foreground">Total of the Product lines.</p>}
              <FieldRuleNotes id={`key-${record.id}-${field}`} view={view} />
            </div>
          )
        }
        return (
          <KeyFieldEditor
            key={`${field}:${keyFieldText(record, field)}`}
            table={table}
            record={record}
            field={field}
            editor={editor}
            view={view}
            context={context}
          />
        )
      })}
    </div>
  )
}

function KeyFieldEditor({
  table,
  record,
  field,
  editor,
  view,
  context,
}: {
  table: ProcessKind
  record: Lead | Opportunity
  field: string
  editor: Editor
  view: FieldRuleView
  context: RuleContext
}) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const raw = (record as Record<string, unknown>)[field]
  const initial = raw === undefined || raw === null ? "" : String(raw)
  const [value, setValue] = useState(initial)
  const [problem, setProblem] = useState<string>()
  const id = `key-${record.id}-${field}`

  const save = useMutation({
    mutationFn: async (update: Record<string, string | number>) => {
      if (table === "lead") await gateway.updateLead(record.id, update)
      else await gateway.updateOpportunity(record.id, update)
    },
    onSuccess: () => {
      setProblem(undefined)
      return invalidate()
    },
    onError: (error) => setProblem(fieldErrorsOf(error)[field] ?? describeError(error)),
  })

  // Rules that would stop this change are shown right here, as on the Details form, and nothing is sent.
  const refused = (change: Record<string, string | number>): string | undefined => {
    const stored = toEngineRecord(record)
    const { problems } = previewRules(context, stored, toDraftRecord(stored, change))
    const first = problems[0]
    if (!first) return undefined
    if (first.code === "blockSave") return `Can't save: ${first.detail ?? first.message}`
    if (first.code === "required") return `${fieldLabel(first.field ?? field)} is required by the rule “${first.ruleName}”.`
    return first.message
  }
  const submit = (change: Record<string, string | number>) => {
    const why = refused(change)
    if (why) return setProblem(why)
    save.mutate(change)
  }

  const commit = (next: string) => {
    if (next.trim() === initial.trim()) return
    if (editor.kind === "number") {
      const parsed = Number(next)
      if (!next.trim() || !Number.isFinite(parsed)) return setProblem("Enter a number.")
      return submit({ [field]: parsed })
    }
    submit({ [field]: next.trim() })
  }

  return (
    <FormField id={id} label={fieldLabel(field)} error={problem} rule={view}>
      {editor.kind === "contact" ? (
        <ContactPicker
          id={id}
          value={record.id && (record as Opportunity).primaryContactId ? { id: (record as Opportunity).primaryContactId!, name: (record as Opportunity).primaryContactName ?? "" } : null}
          onChange={(choice) => submit({ primaryContactId: choice?.id ?? "" })}
        />
      ) : editor.kind === "choice" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            commit(e.target.value)
          }}
          className={cn("h-9 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50", ruleInputClass(view))}
        >
          <option value="">—</option>
          {editor.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : editor.kind === "textarea" ? (
        <Textarea id={id} rows={3} className={ruleInputClass(view)} value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => commit(value)} aria-invalid={problem ? true : undefined} />
      ) : (
        <Input
          id={id}
          type={editor.kind}
          className={ruleInputClass(view)}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => commit(value)}
          onKeyDown={(e) => e.key === "Enter" && commit(value)}
          aria-invalid={problem ? true : undefined}
        />
      )}
    </FormField>
  )
}
