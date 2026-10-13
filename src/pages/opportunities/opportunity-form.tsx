import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { AccountPicker, ContactPicker, type AccountChoice, type ContactChoice } from "@/components/records/account-picker"
import { FormAlert, FormField, TextFields, type TextFieldSpec } from "@/components/records/fields"
import { ruleInputClass } from "@/lib/rule-classes"
import { RuleBlockBox, RuleWarningBox } from "@/components/records/rule-effects"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { OpportunityUpdate } from "@/data/gateway"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { useRuleContext, useRulePreview, type RuleExtras } from "@/hooks/use-rules"
import { fieldErrorsOf } from "@/lib/errors"
import { FORECAST_CATEGORY_LABELS, LEAD_SOURCE_LABELS, STAGE_LABELS } from "@/lib/format"
import { toNumber, toPatch, type FormValues } from "@/lib/form"
import { cn } from "@/lib/utils"
import {
  FORECAST_CATEGORIES,
  LEAD_SOURCES,
  OPEN_STAGES,
  defaultForecastCategory,
  opportunityErrors,
  type FieldRuleView,
  type ForecastCategory,
  type LeadSource,
  type OpenStage,
  type Opportunity,
  type OpportunityInput,
} from "@/sales"

const NAME: TextFieldSpec<"name"> = { name: "name", label: "Name", required: true, wide: true }
const VALUE_SPECS: TextFieldSpec<"estimatedValue" | "expectedCloseDate">[] = [
  { name: "estimatedValue", label: "Estimated value (€)", required: true, type: "number" },
  { name: "expectedCloseDate", label: "Expected close date", required: true, type: "date" },
]

type EditTextField = "name" | "estimatedValue" | "expectedCloseDate" | "probability" | "nextStep" | "description"

const EDIT_SPECS: TextFieldSpec<EditTextField>[] = [
  NAME,
  ...VALUE_SPECS,
  { name: "probability", label: "Probability (%)", required: true, type: "number" },
  { name: "nextStep", label: "Next step", wide: true },
  { name: "description", label: "Description", type: "textarea" },
]

/** A native select: works the same with a mouse, a keyboard and a phone's picker. */
export function ChoiceField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  required,
  error,
  blankLabel,
  rule,
}: {
  id: string
  label: string
  value: T | ""
  options: readonly { value: T; label: string }[]
  onChange: (value: T | "") => void
  required?: boolean
  error?: string
  /** Offers an empty choice with this label. */
  blankLabel?: string
  /** What the Business rules say about this field. */
  rule?: FieldRuleView
}) {
  return (
    <FormField id={id} label={label} required={required} error={error} rule={rule}>
      <select
        id={id}
        value={value}
        required={required}
        disabled={rule?.readOnly ? true : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value as T | "")}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none md:text-sm dark:bg-input/30",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive",
          ruleInputClass(rule),
        )}
      >
        {blankLabel !== undefined && <option value="">{blankLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FormField>
  )
}

export const OPEN_STAGE_OPTIONS = OPEN_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))
const FORECAST_CATEGORY_OPTIONS = FORECAST_CATEGORIES.map((c) => ({ value: c, label: FORECAST_CATEGORY_LABELS[c] }))
const LEAD_SOURCE_OPTIONS = LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] }))

/**
 * "+ New" for Opportunities: the required fields only, then on to the new
 * Opportunity. From an Account page the Account is filled in.
 */
export function NewOpportunityDialog({
  open,
  onOpenChange,
  account = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: AccountChoice | null
}) {
  const gateway = useGateway()
  const navigate = useNavigate()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState<FormValues<"name" | "estimatedValue" | "expectedCloseDate">>({})
  const [company, setCompany] = useState<AccountChoice | null>(account)
  const [stage, setStage] = useState<OpenStage>("qualification")
  const [forecastOverride, setForecastOverride] = useState<ForecastCategory | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: (input: OpportunityInput) => gateway.createOpportunity(input),
    onSuccess: async (opportunity) => {
      await invalidate()
      navigate(`/opportunities/${opportunity.id}`)
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const close = (next: boolean) => {
    if (!next) {
      setValues({})
      setCompany(account)
      setStage("qualification")
      setForecastOverride(null)
      setErrors({})
      create.reset()
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const input: OpportunityInput = {
      name: values.name?.trim() ?? "",
      accountId: company?.id ?? "",
      stage,
      forecastCategory: forecastOverride ?? undefined,
      estimatedValue: toNumber(values.estimatedValue),
      expectedCloseDate: values.expectedCloseDate ?? "",
    }
    const found = opportunityErrors(input)
    setErrors(found)
    if (Object.keys(found).length === 0) create.mutate(input)
  }

  const onChange = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }))
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New Opportunity</DialogTitle>
            <DialogDescription>You can fill in the other details on the Opportunity page.</DialogDescription>
          </DialogHeader>
          <TextFields idPrefix="new-opportunity" specs={[NAME]} values={values} errors={errors} onChange={onChange} />
          <FormField id="new-opportunity-account" label="Account" required error={errors.accountId}>
            <AccountPicker id="new-opportunity-account" value={company} onChange={setCompany} invalid={!!errors.accountId} />
          </FormField>
          <ChoiceField
            id="new-opportunity-stage"
            label="Stage"
            required
            value={stage}
            options={OPEN_STAGE_OPTIONS}
            onChange={(value) => {
              if (!value) return
              setStage(value)
              setForecastOverride(null)
            }}
            error={errors.stage}
          />
          <ChoiceField
            id="new-opportunity-forecast"
            label="Forecast category"
            value={forecastOverride ?? defaultForecastCategory(stage)}
            options={FORECAST_CATEGORY_OPTIONS}
            onChange={(value) => value && setForecastOverride(value)}
          />
          <TextFields idPrefix="new-opportunity" specs={VALUE_SPECS} values={values} errors={errors} onChange={onChange} />
          {create.isError && <FormAlert error={create.error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The Opportunity's details as a form, for its Owner or the Owner's manager.
 * The Stage changes on the Stage path, not here; the Probability may be overridden.
 */
export function EditOpportunityForm({
  opportunity,
  onDone,
  hasProductLines = false,
  ruleExtras,
}: {
  opportunity: Opportunity
  onDone: () => void
  /** While there are Product lines the Estimated value is their total and can't be typed. */
  hasProductLines?: boolean
  /** The parents and related lists the Business rules may read. */
  ruleExtras?: RuleExtras
}) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState<FormValues<EditTextField>>(() => ({
    name: opportunity.name,
    estimatedValue: String(opportunity.estimatedValue),
    expectedCloseDate: opportunity.expectedCloseDate,
    probability: String(opportunity.probability),
    nextStep: opportunity.nextStep ?? "",
    description: opportunity.description ?? "",
  }))
  const [company, setCompany] = useState<AccountChoice | null>({ id: opportunity.accountId, name: opportunity.accountName })
  const [contact, setContact] = useState<ContactChoice | null>(
    opportunity.primaryContactId ? { id: opportunity.primaryContactId, name: opportunity.primaryContactName ?? "" } : null,
  )
  const [leadSource, setLeadSource] = useState<LeadSource | "">(opportunity.leadSource ?? "")
  const [forecast, setForecast] = useState<ForecastCategory | "">(opportunity.forecastCategory ?? "")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const touch = (name: string) => setTouched((t) => new Set(t).add(name))
  const context = useRuleContext("opportunity", opportunity.id, ruleExtras)
  const preview = useRulePreview(context, opportunity, {
    ...toPatch(values, ["name", "expectedCloseDate", "nextStep", "description"] as const),
    accountId: company?.id ?? "",
    primaryContactId: contact?.id ?? "",
    ...(hasProductLines ? {} : { estimatedValue: toNumber(values.estimatedValue) }),
    probability: toNumber(values.probability),
    leadSource,
    forecastCategory: forecast,
  })
  // A value a rule fills in shows until the user types their own.
  const shown = (name: string, current: string) => (!touched.has(name) && name in preview.filled ? String(preview.filled[name]) : current)
  const shownValues = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, shown(name, value ?? "")])) as FormValues<EditTextField>
  const shownSource = shown("leadSource", leadSource) as LeadSource | ""
  const shownForecast = shown("forecastCategory", forecast) as ForecastCategory | ""

  const save = useMutation({
    mutationFn: (patch: OpportunityUpdate) => gateway.updateOpportunity(opportunity.id, patch),
    onSuccess: async () => {
      await invalidate()
      onDone()
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = toPatch(shownValues, ["name", "expectedCloseDate", "nextStep", "description"] as const)
    // An empty primaryContactId or leadSource clears it.
    const patch: OpportunityUpdate = {
      ...text,
      accountId: company?.id ?? "",
      primaryContactId: contact?.id ?? "",
      ...(hasProductLines ? {} : { estimatedValue: toNumber(shownValues.estimatedValue) }),
      probability: toNumber(shownValues.probability),
      leadSource: shownSource,
      ...(shownForecast && shownForecast !== opportunity.forecastCategory ? { forecastCategory: shownForecast } : {}),
    }
    const found = opportunityErrors({ estimatedValue: opportunity.estimatedValue, ...patch, stage: "qualification", leadSource: undefined })
    setErrors(found)
    if (Object.keys(found).length === 0) save.mutate(patch)
  }

  const onChange = (name: EditTextField, value: string) => {
    touch(name)
    setValues((v) => ({ ...v, [name]: value }))
  }
  return (
    <form onSubmit={submit} noValidate aria-label="Edit Opportunity" className="grid gap-4 sm:grid-cols-2">
      <RuleWarningBox warnings={preview.generalWarnings} />
      <TextFields idPrefix="edit-opportunity" specs={EDIT_SPECS.slice(0, 1)} values={shownValues} errors={errors} onChange={onChange} ruleViews={preview.viewOf} />
      <FormField id="edit-opportunity-account" label="Account" required error={errors.accountId}>
        <AccountPicker id="edit-opportunity-account" value={company} onChange={setCompany} invalid={!!errors.accountId} />
      </FormField>
      <FormField id="edit-opportunity-contact" label="Primary Contact" error={errors.primaryContactId}>
        <ContactPicker id="edit-opportunity-contact" value={contact} onChange={setContact} />
      </FormField>
      <TextFields
        idPrefix="edit-opportunity"
        specs={hasProductLines ? EDIT_SPECS.slice(2, 4) : EDIT_SPECS.slice(1, 4)}
        values={shownValues}
        errors={errors}
        onChange={onChange}
        ruleViews={preview.viewOf}
      />
      {hasProductLines && (
        <FormField id="edit-opportunity-estimated-value" label="Estimated value (€)">
          <Input id="edit-opportunity-estimated-value" type="number" value={opportunity.estimatedValue} readOnly aria-describedby="edit-opportunity-estimated-value-note" />
          <p id="edit-opportunity-estimated-value-note" className="text-xs text-muted-foreground">
            The total of the Product lines. Change the lines to change it.
          </p>
        </FormField>
      )}
      <ChoiceField
        id="edit-opportunity-forecast"
        label="Forecast category"
        value={shownForecast}
        options={FORECAST_CATEGORY_OPTIONS}
        onChange={(value) => {
          touch("forecastCategory")
          setForecast(value)
        }}
        rule={preview.viewOf("forecastCategory")}
      />
      <ChoiceField
        id="edit-opportunity-lead-source"
        label="Lead source"
        value={shownSource}
        options={LEAD_SOURCE_OPTIONS}
        onChange={(value) => {
          touch("leadSource")
          setLeadSource(value)
        }}
        blankLabel="—"
        rule={preview.viewOf("leadSource")}
      />
      <TextFields idPrefix="edit-opportunity" specs={EDIT_SPECS.slice(4)} values={shownValues} errors={errors} onChange={onChange} ruleViews={preview.viewOf} />
      <RuleBlockBox blocks={preview.blocks} className="sm:col-span-2" />
      {save.isError && <FormAlert error={save.error} className="sm:col-span-2" />}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || preview.problems.length > 0}>
          Save
        </Button>
      </div>
    </form>
  )
}
