import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { AccountPicker, type AccountChoice } from "@/components/records/account-picker"
import { FormAlert, FormField, TextFields, type TextFieldSpec } from "@/components/records/fields"
import { RuleBlockBox, RuleWarningBox } from "@/components/records/rule-effects"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { useRuleContext, useRulePreview, type RuleExtras } from "@/hooks/use-rules"
import { fieldErrorsOf } from "@/lib/errors"
import { toInput, toPatch, type FormValues } from "@/lib/form"
import type { ContactUpdate } from "@/data/gateway"
import { contactErrors, type Contact, type ContactInput } from "@/sales"

const CONTACT_FIELDS = ["firstName", "lastName", "jobTitle", "email", "phone", "mobile"] as const
type ContactField = (typeof CONTACT_FIELDS)[number]

const NAME_SPECS: TextFieldSpec<ContactField>[] = [
  { name: "firstName", label: "First name" },
  { name: "lastName", label: "Last name", required: true },
]

const OTHER_SPECS: TextFieldSpec<ContactField>[] = [
  { name: "jobTitle", label: "Job title" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "mobile", label: "Mobile", type: "tel" },
]

/**
 * "+ New" for Contacts: the name and the Account the Contact works at, then
 * on to the new Contact. From an Account page the Account is filled in.
 */
export function NewContactDialog({
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
  const [values, setValues] = useState<FormValues<ContactField>>({})
  const [company, setCompany] = useState<AccountChoice | null>(account)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: (input: ContactInput) => gateway.createContact(input),
    onSuccess: async (contact) => {
      await invalidate()
      navigate(`/contacts/${contact.id}`)
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const close = (next: boolean) => {
    if (!next) {
      setValues({})
      setCompany(account)
      setErrors({})
      create.reset()
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const input = { ...toInput(values, ["firstName", "lastName"]), accountId: company?.id } as ContactInput
    const found = contactErrors(input)
    setErrors(found)
    if (Object.keys(found).length === 0) create.mutate(input)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New Contact</DialogTitle>
            <DialogDescription>You can fill in the other details on the Contact page.</DialogDescription>
          </DialogHeader>
          <TextFields
            idPrefix="new-contact"
            specs={NAME_SPECS}
            values={values}
            errors={errors}
            onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
          />
          <FormField id="new-contact-account" label="Account" error={errors.accountId}>
            <AccountPicker id="new-contact-account" value={company} onChange={setCompany} invalid={!!errors.accountId} />
          </FormField>
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

/** The Contact's details as a form, for its Owner or the Owner's manager. */
export function EditContactForm({ contact, onDone, ruleExtras }: { contact: Contact; onDone: () => void; ruleExtras?: RuleExtras }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState<FormValues<ContactField>>(() =>
    Object.fromEntries(CONTACT_FIELDS.map((f) => [f, contact[f] ?? ""])),
  )
  const [company, setCompany] = useState<AccountChoice | null>(
    contact.accountId ? { id: contact.accountId, name: contact.accountName ?? "" } : null,
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const context = useRuleContext("contact", contact.id, ruleExtras)
  const preview = useRulePreview(context, contact, { ...toPatch(values, CONTACT_FIELDS), accountId: company?.id ?? "" })
  // A value a rule fills in shows until the user types their own.
  const shownValues = Object.fromEntries(
    CONTACT_FIELDS.map((f) => [f, !touched.has(f) && f in preview.filled ? String(preview.filled[f]) : (values[f] ?? "")]),
  ) as FormValues<ContactField>

  const save = useMutation({
    mutationFn: (patch: ContactUpdate) => gateway.updateContact(contact.id, patch),
    onSuccess: async () => {
      await invalidate()
      onDone()
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    // An empty accountId removes the Contact from its Account.
    const patch: ContactUpdate = { ...toPatch(shownValues, CONTACT_FIELDS), accountId: company?.id ?? "" }
    const found = contactErrors(patch)
    setErrors(found)
    if (Object.keys(found).length === 0) save.mutate(patch)
  }

  const onChange = (name: ContactField, value: string) => {
    setTouched((t) => new Set(t).add(name))
    setValues((v) => ({ ...v, [name]: value }))
  }
  return (
    <form onSubmit={submit} noValidate aria-label="Edit Contact" className="grid gap-4 sm:grid-cols-2">
      <RuleWarningBox warnings={preview.generalWarnings} />
      <TextFields idPrefix="edit-contact" specs={NAME_SPECS} values={shownValues} errors={errors} onChange={onChange} ruleViews={preview.viewOf} />
      <FormField id="edit-contact-account" label="Account" error={errors.accountId}>
        <AccountPicker id="edit-contact-account" value={company} onChange={setCompany} invalid={!!errors.accountId} />
      </FormField>
      <TextFields idPrefix="edit-contact" specs={OTHER_SPECS} values={shownValues} errors={errors} onChange={onChange} ruleViews={preview.viewOf} />
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
