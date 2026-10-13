import type { ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { describeError } from "@/lib/errors"
import type { FormValues } from "@/lib/form"
import { cn } from "@/lib/utils"
import type { FieldRuleView } from "@/sales"
import { ruleInputClass } from "@/lib/rule-classes"
import { FieldRuleNotes } from "./rule-effects"

/** A text field on a New or Edit form. */
export type TextFieldSpec<K extends string = string> = {
  name: K
  label: string
  required?: boolean
  type?: "text" | "email" | "url" | "tel" | "number" | "date" | "textarea"
  /** Spans both columns of the form grid. */
  wide?: boolean
}

/** A label, an input and the field's error message, wired together for screen readers. */
export function FormField({
  id,
  label,
  required,
  error,
  className,
  rule,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  className?: string
  /** What the Business rules say about this field. */
  rule?: FieldRuleView
  children: ReactNode
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {(required || rule?.required) && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
      <FieldRuleNotes id={id} view={rule} />
    </div>
  )
}

export function TextFields<K extends string>({
  idPrefix,
  specs,
  values,
  errors,
  onChange,
  ruleViews,
}: {
  idPrefix: string
  specs: TextFieldSpec<K>[]
  values: FormValues<K>
  errors: Record<string, string>
  onChange: (name: K, value: string) => void
  /** What the Business rules say about each field, when the form follows them. */
  ruleViews?: (name: K) => FieldRuleView | undefined
}) {
  return specs.map((spec) => {
    const id = `${idPrefix}-${spec.name}`
    const view = ruleViews?.(spec.name)
    const common = {
      id,
      value: values[spec.name] ?? "",
      required: spec.required,
      disabled: view?.readOnly ? true : undefined,
      className: ruleInputClass(view),
      "aria-invalid": errors[spec.name] || view?.problem ? true : undefined,
      "aria-describedby": [errors[spec.name] ? `${id}-error` : "", view ? `${id}-rules` : ""].filter(Boolean).join(" ") || undefined,
      onChange: (e: { target: { value: string } }) => onChange(spec.name, e.target.value),
    }
    return (
      <FormField
        key={spec.name}
        id={id}
        label={spec.label}
        required={spec.required}
        error={errors[spec.name]}
        rule={view}
        className={cn((spec.wide || spec.type === "textarea") && "sm:col-span-2")}
      >
        {spec.type === "textarea" ? <Textarea {...common} rows={3} /> : <Input {...common} type={spec.type ?? "text"} />}
      </FormField>
    )
  })
}

/** Read-only details: label and value pairs. Empty values show a dash. */
export function DetailList({
  items,
  ruleViews,
}: {
  items: { label: string; value: ReactNode; wide?: boolean; /** The field's name, for what the Business rules say about it. */ field?: string }[]
  ruleViews?: (field: string) => FieldRuleView | undefined
}) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => {
        const view = item.field ? ruleViews?.(item.field) : undefined
        return (
          <div key={item.label} className={cn("min-w-0", item.wide && "sm:col-span-2")}>
            <dt className="text-xs text-muted-foreground">
              {item.label}
              {view?.required && (
                <span className="text-destructive" aria-hidden>
                  {" "}*
                </span>
              )}
            </dt>
            <dd className="mt-0.5 break-words whitespace-pre-line">{isEmpty(item.value) ? "—" : item.value}</dd>
            {view && <FieldRuleNotes id={`detail-${item.field}`} view={{ ...view, warnings: [] }} />}
          </div>
        )
      })}
    </dl>
  )
}

function isEmpty(value: ReactNode): boolean {
  return value === undefined || value === null || value === false || value === ""
}

/** Why a save failed, under the form. */
export function FormAlert({ error, className }: { error: unknown; className?: string }) {
  return (
    <p role="alert" className={cn("text-sm text-destructive", className)}>
      {describeError(error)}
    </p>
  )
}
