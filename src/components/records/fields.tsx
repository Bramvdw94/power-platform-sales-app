import type { ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { describeError } from "@/lib/errors"
import type { FormValues } from "@/lib/form"
import { cn } from "@/lib/utils"

/** A text field on a New or Edit form. */
export type TextFieldSpec<K extends string = string> = {
  name: K
  label: string
  required?: boolean
  type?: "text" | "email" | "url" | "tel" | "textarea"
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
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
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
    </div>
  )
}

export function TextFields<K extends string>({
  idPrefix,
  specs,
  values,
  errors,
  onChange,
}: {
  idPrefix: string
  specs: TextFieldSpec<K>[]
  values: FormValues<K>
  errors: Record<string, string>
  onChange: (name: K, value: string) => void
}) {
  return specs.map((spec) => {
    const id = `${idPrefix}-${spec.name}`
    const common = {
      id,
      value: values[spec.name] ?? "",
      required: spec.required,
      "aria-invalid": errors[spec.name] ? true : undefined,
      "aria-describedby": errors[spec.name] ? `${id}-error` : undefined,
      onChange: (e: { target: { value: string } }) => onChange(spec.name, e.target.value),
    }
    return (
      <FormField
        key={spec.name}
        id={id}
        label={spec.label}
        required={spec.required}
        error={errors[spec.name]}
        className={cn((spec.wide || spec.type === "textarea") && "sm:col-span-2")}
      >
        {spec.type === "textarea" ? <Textarea {...common} rows={3} /> : <Input {...common} type={spec.type ?? "text"} />}
      </FormField>
    )
  })
}

/** Read-only details: label and value pairs. Empty values show a dash. */
export function DetailList({ items }: { items: { label: string; value: ReactNode; wide?: boolean }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.wide && "sm:col-span-2")}>
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 break-words whitespace-pre-line">{isEmpty(item.value) ? "—" : item.value}</dd>
        </div>
      ))}
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
