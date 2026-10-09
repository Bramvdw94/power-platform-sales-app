import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { FormAlert, FormField, TextFields, type TextFieldSpec } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { LeadUpdate } from "@/data/gateway"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import { LEAD_SOURCE_LABELS } from "@/lib/format"
import { toInput, toPatch, type FormValues } from "@/lib/form"
import { LEAD_SOURCES, leadErrors, type Lead, type LeadInput, type LeadSource } from "@/sales"

const LEAD_FIELDS = ["firstName", "lastName", "company", "jobTitle", "email", "phone", "website", "description"] as const
type LeadField = (typeof LEAD_FIELDS)[number]

const NEW_SPECS: TextFieldSpec<LeadField>[] = [
  { name: "firstName", label: "First name" },
  { name: "lastName", label: "Last name", required: true },
  { name: "company", label: "Company", required: true, wide: true },
]

const SPECS: TextFieldSpec<LeadField>[] = [
  ...NEW_SPECS,
  { name: "jobTitle", label: "Job title" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "website", label: "Website", type: "url" },
]

const DESCRIPTION: TextFieldSpec<LeadField> = { name: "description", label: "Description", type: "textarea" }

/** "+ New" for Leads: the name and Company, then on to the new Lead. It starts as Not Contacted. */
export function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const gateway = useGateway()
  const navigate = useNavigate()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState<FormValues<LeadField>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: (input: LeadInput) => gateway.createLead(input),
    onSuccess: async (lead) => {
      await invalidate()
      navigate(`/leads/${lead.id}`)
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
    const input = toInput(values, ["firstName", "lastName", "company"]) as LeadInput
    const found = leadErrors(input)
    setErrors(found)
    if (Object.keys(found).length === 0) create.mutate(input)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <DialogHeader className="sm:col-span-2">
            <DialogTitle>New Lead</DialogTitle>
            <DialogDescription>You can fill in the other details on the Lead page.</DialogDescription>
          </DialogHeader>
          <TextFields
            idPrefix="new-lead"
            specs={NEW_SPECS}
            values={values}
            errors={errors}
            onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
          />
          {create.isError && <FormAlert error={create.error} className="sm:col-span-2" />}
          <DialogFooter className="sm:col-span-2">
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

const NO_SOURCE = "none"

/** The Lead's details as a form, for its Owner or the Owner's manager while the Lead is open. */
export function EditLeadForm({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState<FormValues<LeadField>>(() =>
    Object.fromEntries(LEAD_FIELDS.map((f) => [f, lead[f] ?? ""])),
  )
  const [leadSource, setLeadSource] = useState<LeadSource | undefined>(lead.leadSource)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (patch: LeadUpdate) => gateway.updateLead(lead.id, patch),
    onSuccess: async () => {
      await invalidate()
      onDone()
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    // A blank Lead source clears it, like a blank text field.
    const patch = { ...toPatch(values, LEAD_FIELDS), leadSource: (leadSource ?? "") as LeadSource }
    const found = leadErrors({ ...patch, leadSource })
    setErrors(found)
    if (Object.keys(found).length === 0) save.mutate(patch)
  }

  const onChange = (name: LeadField, value: string) => setValues((v) => ({ ...v, [name]: value }))

  return (
    <form onSubmit={submit} noValidate aria-label="Edit Lead" className="grid gap-4 sm:grid-cols-2">
      <TextFields idPrefix="edit-lead" specs={SPECS} values={values} errors={errors} onChange={onChange} />
      <FormField id="edit-lead-source" label="Lead source" error={errors.leadSource}>
        <Select
          value={leadSource ?? NO_SOURCE}
          onValueChange={(value) => setLeadSource(value === NO_SOURCE ? undefined : (value as LeadSource))}
        >
          <SelectTrigger id="edit-lead-source" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SOURCE}>—</SelectItem>
            {LEAD_SOURCES.map((source) => (
              <SelectItem key={source} value={source}>
                {LEAD_SOURCE_LABELS[source]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <TextFields idPrefix="edit-lead" specs={[DESCRIPTION]} values={values} errors={errors} onChange={onChange} />
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
