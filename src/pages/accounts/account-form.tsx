import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { FormAlert, FormField, TextFields, type TextFieldSpec } from "@/components/records/fields"
import { ruleInputClass } from "@/lib/rule-classes"
import { RuleBlockBox, RuleWarningBox } from "@/components/records/rule-effects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { useRuleContext, useRulePreview, type RuleExtras } from "@/hooks/use-rules"
import { cn } from "@/lib/utils"
import { fieldErrorsOf } from "@/lib/errors"
import { toInput, toPatch, type FormValues } from "@/lib/form"
import { ACCOUNT_TYPE_LABELS, INDUSTRY_LABELS } from "@/lib/format"
import { ACCOUNT_TYPES, INDUSTRIES, accountErrors, type Account, type AccountInput, type FieldRuleView, type AccountType, type Industry } from "@/sales"
import type { AccountUpdate } from "@/data/gateway"

const NONE = "none"

const ACCOUNT_FIELDS = ["name", "website", "phone", "street", "city", "postcode", "country", "description"] as const
type AccountField = (typeof ACCOUNT_FIELDS)[number]

const SPECS: TextFieldSpec<AccountField>[] = [
  { name: "name", label: "Account Name", required: true, wide: true },
  { name: "website", label: "Website", type: "url" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "street", label: "Street", wide: true },
  { name: "postcode", label: "Postcode" },
  { name: "city", label: "City" },
  { name: "country", label: "Country" },
  { name: "description", label: "Description", type: "textarea" },
]

/** "+ New" for Accounts: the required field only, then on to the new Account. */
export function NewAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const gateway = useGateway()
  const navigate = useNavigate()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState<FormValues<AccountField>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: (input: AccountInput) => gateway.createAccount(input),
    onSuccess: async (account) => {
      await invalidate()
      navigate(`/accounts/${account.id}`)
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const close = (next: boolean) => {
    if (!next) {
      setValues({})
      setErrors({})
      create.reset()
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const input = toInput(values, ["name"]) as AccountInput
    const found = accountErrors(input)
    setErrors(found)
    if (Object.keys(found).length === 0) create.mutate(input)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New Account</DialogTitle>
            <DialogDescription>You can fill in the other details on the Account page.</DialogDescription>
          </DialogHeader>
          <TextFields
            idPrefix="new-account"
            specs={SPECS.filter((s) => s.required)}
            values={values}
            errors={errors}
            onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
          />
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

/** The Account's details as a form, for its Owner or the Owner's manager. */
export function EditAccountForm({ account, onDone, ruleExtras }: { account: Account; onDone: () => void; ruleExtras?: RuleExtras }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState<FormValues<AccountField>>(() =>
    Object.fromEntries(ACCOUNT_FIELDS.map((f) => [f, account[f] ?? ""])),
  )
  const [accountType, setAccountType] = useState<AccountType | undefined>(account.accountType)
  const [industry, setIndustry] = useState<Industry | undefined>(account.industry)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const touch = (name: string) => setTouched((t) => new Set(t).add(name))
  const context = useRuleContext("account", account.id, ruleExtras)
  const preview = useRulePreview(context, account, { ...toPatch(values, ACCOUNT_FIELDS), accountType: accountType ?? "", industry: industry ?? "" })
  // A value a rule fills in shows until the user types their own.
  const shown = (name: string, current: string) => (!touched.has(name) && name in preview.filled ? String(preview.filled[name]) : current)
  const shownValues = Object.fromEntries(ACCOUNT_FIELDS.map((f) => [f, shown(f, values[f] ?? "")])) as FormValues<AccountField>
  const shownType = (shown("accountType", accountType ?? "") || undefined) as AccountType | undefined
  const shownIndustry = (shown("industry", industry ?? "") || undefined) as Industry | undefined

  const save = useMutation({
    mutationFn: (patch: AccountUpdate) => gateway.updateAccount(account.id, patch),
    onSuccess: async () => {
      await invalidate()
      onDone()
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const onChange = (name: AccountField, value: string) => {
    touch(name)
    setValues((v) => ({ ...v, [name]: value }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    // A blank Account type or Industry clears it, like a blank text field.
    const patch: AccountUpdate = { ...toPatch(shownValues, ACCOUNT_FIELDS), accountType: shownType ?? "", industry: shownIndustry ?? "" }
    const found = accountErrors(patch)
    setErrors(found)
    if (Object.keys(found).length === 0) save.mutate(patch)
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Edit Account" className="grid gap-4 sm:grid-cols-2">
      <RuleWarningBox warnings={preview.generalWarnings} />
      <TextFields
        idPrefix="edit-account"
        specs={SPECS.filter((s) => s.name !== "description")}
        values={shownValues}
        errors={errors}
        onChange={onChange}
        ruleViews={preview.viewOf}
      />
      <ChoiceField id="edit-account-type" label="Account type" value={shownType} onChange={(v) => { touch("accountType"); setAccountType(v) }} options={ACCOUNT_TYPES} labels={ACCOUNT_TYPE_LABELS} rule={preview.viewOf("accountType")} />
      <ChoiceField id="edit-account-industry" label="Industry" value={shownIndustry} onChange={(v) => { touch("industry"); setIndustry(v) }} options={INDUSTRIES} labels={INDUSTRY_LABELS} rule={preview.viewOf("industry")} />
      <TextFields
        idPrefix="edit-account"
        specs={SPECS.filter((s) => s.name === "description")}
        values={shownValues}
        errors={errors}
        onChange={onChange}
        ruleViews={preview.viewOf}
      />
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

function ChoiceField<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  labels,
  rule,
}: {
  id: string
  label: string
  value: T | undefined
  onChange: (value: T | undefined) => void
  options: readonly T[]
  labels: Record<T, string>
  rule?: FieldRuleView
}) {
  return (
    <FormField id={id} label={label} rule={rule}>
      <Select value={value ?? NONE} disabled={!!rule?.readOnly} onValueChange={(v) => onChange(v === NONE ? undefined : (v as T))}>
        <SelectTrigger id={id} className={cn("w-full", ruleInputClass(rule))}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  )
}
