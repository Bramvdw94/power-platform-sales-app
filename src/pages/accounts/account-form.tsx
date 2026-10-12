import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { FormAlert, FormField, TextFields, type TextFieldSpec } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import { toInput, toPatch, type FormValues } from "@/lib/form"
import { ACCOUNT_TYPE_LABELS, INDUSTRY_LABELS } from "@/lib/format"
import { ACCOUNT_TYPES, INDUSTRIES, accountErrors, type Account, type AccountInput, type AccountType, type Industry } from "@/sales"
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
export function EditAccountForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState<FormValues<AccountField>>(() =>
    Object.fromEntries(ACCOUNT_FIELDS.map((f) => [f, account[f] ?? ""])),
  )
  const [accountType, setAccountType] = useState<AccountType | undefined>(account.accountType)
  const [industry, setIndustry] = useState<Industry | undefined>(account.industry)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (patch: AccountUpdate) => gateway.updateAccount(account.id, patch),
    onSuccess: async () => {
      await invalidate()
      onDone()
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const onChange = (name: AccountField, value: string) => setValues((v) => ({ ...v, [name]: value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    // A blank Account type or Industry clears it, like a blank text field.
    const patch: AccountUpdate = { ...toPatch(values, ACCOUNT_FIELDS), accountType: accountType ?? "", industry: industry ?? "" }
    const found = accountErrors(patch)
    setErrors(found)
    if (Object.keys(found).length === 0) save.mutate(patch)
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Edit Account" className="grid gap-4 sm:grid-cols-2">
      <TextFields
        idPrefix="edit-account"
        specs={SPECS.filter((s) => s.name !== "description")}
        values={values}
        errors={errors}
        onChange={onChange}
      />
      <ChoiceField id="edit-account-type" label="Account type" value={accountType} onChange={setAccountType} options={ACCOUNT_TYPES} labels={ACCOUNT_TYPE_LABELS} />
      <ChoiceField id="edit-account-industry" label="Industry" value={industry} onChange={setIndustry} options={INDUSTRIES} labels={INDUSTRY_LABELS} />
      <TextFields
        idPrefix="edit-account"
        specs={SPECS.filter((s) => s.name === "description")}
        values={values}
        errors={errors}
        onChange={onChange}
      />
      {save.isError && <FormAlert error={save.error} className="sm:col-span-2" />}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
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
}: {
  id: string
  label: string
  value: T | undefined
  onChange: (value: T | undefined) => void
  options: readonly T[]
  labels: Record<T, string>
}) {
  return (
    <FormField id={id} label={label}>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? undefined : (v as T))}>
        <SelectTrigger id={id} className="w-full">
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
