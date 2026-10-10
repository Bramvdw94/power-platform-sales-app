import { useState, type FormEvent, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery } from "@tanstack/react-query"
import { AccountPicker, ContactPicker } from "@/components/records/account-picker"
import { FormAlert, FormField, TextFields, type TextFieldSpec } from "@/components/records/fields"
import type { RecordChoice } from "@/components/records/record-picker"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { QualifyError, type QualifyChoice, type QualifyInput, type QualifyStep } from "@/data/gateway"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import { fullName, opportunityErrors, type Id, type Lead } from "@/sales"

type DetailField = "name" | "estimatedValue" | "expectedCloseDate"

const DETAIL_SPECS: TextFieldSpec<DetailField>[] = [
  { name: "name", label: "Opportunity name", required: true, wide: true },
  { name: "estimatedValue", label: "Estimated value (€)", required: true, type: "number" },
  { name: "expectedCloseDate", label: "Expected close date", required: true, type: "date" },
]

/** What a section's radio group holds: a suggested record's id, another record picked by name, or a new record. */
type Pick = { kind: "suggested"; id: Id } | { kind: "other"; record: RecordChoice | null } | { kind: "new" }

const STEP_LABELS: Record<QualifyStep, string> = {
  account: "creating the Account",
  contact: "creating the Contact",
  opportunity: "creating the Opportunity",
  lead: "marking the Lead Qualified",
}

function toChoice(pick: Pick): QualifyChoice | null {
  if (pick.kind === "new") return { createNew: true }
  if (pick.kind === "suggested") return { existingId: pick.id }
  return pick.record ? { existingId: pick.record.id } : null
}

/**
 * Qualify (spec #23, decision #5): one dialog with an Account, a Contact and
 * an Opportunity section. Suggested matches are listed with "Create new"; one
 * strong match is preselected, otherwise "Create new" is. Picking an existing
 * record only links it. On success the Lead is Qualified and the new
 * Opportunity opens.
 */
export function QualifyDialog({ lead, open, onOpenChange }: { lead: Lead; open: boolean; onOpenChange: (open: boolean) => void }) {
  const gateway = useGateway()
  const navigate = useNavigate()
  const invalidate = useInvalidateRecords()
  const suggestions = useQuery({
    queryKey: ["Lead", lead.id, "qualify"],
    queryFn: () => gateway.getQualifySuggestions(lead.id),
    enabled: open,
  })
  // The user's picks; until they pick, the suggestions' preselection applies.
  const [accountPick, setAccountPick] = useState<Pick>()
  const [contactPick, setContactPick] = useState<Pick>()
  const [values, setValues] = useState<Partial<Record<DetailField, string>>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const preselected = (id: Id | null | undefined): Pick => (id ? { kind: "suggested", id } : { kind: "new" })
  const account = accountPick ?? preselected(suggestions.data?.accounts.preselectedId)
  const contact = contactPick ?? preselected(suggestions.data?.contacts.preselectedId)
  const details = { name: suggestions.data?.opportunityName ?? "", ...values }

  const qualify = useMutation({
    mutationFn: (input: QualifyInput) => gateway.qualifyLead(lead.id, input),
    onSuccess: async (result) => {
      await invalidate()
      close(false)
      navigate(`/opportunities/${result.opportunityId}`)
    },
    onError: (error) => {
      setErrors(fieldErrorsOf(error))
      // Records already created are linked from now on, so trying again never duplicates them.
      if (error instanceof QualifyError) {
        if (error.created.accountId) setAccountPick({ kind: "other", record: { id: error.created.accountId, name: lead.company } })
        if (error.created.contactId) setContactPick({ kind: "other", record: { id: error.created.contactId, name: fullName(lead) } })
      }
    },
  })

  function close(next: boolean) {
    if (!next) {
      setAccountPick(undefined)
      setContactPick(undefined)
      setValues({})
      setErrors({})
      qualify.reset()
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const accountChoice = toChoice(account)
    const contactChoice = toChoice(contact)
    const opportunity = {
      name: details.name.trim(),
      estimatedValue: details.estimatedValue?.trim() ? Number(details.estimatedValue) : Number.NaN,
      expectedCloseDate: details.expectedCloseDate?.trim() ?? "",
    }
    const found: Record<string, string> = opportunityErrors({ ...opportunity, accountId: "picked below", stage: "qualification" })
    if (!accountChoice) found.account = "Pick an Account, or create a new one."
    if (!contactChoice) found.contact = "Pick a Contact, or create a new one."
    setErrors(found)
    if (Object.keys(found).length === 0) qualify.mutate({ account: accountChoice!, contact: contactChoice!, opportunity })
  }

  const failedStep = qualify.error instanceof QualifyError ? qualify.error.step : undefined
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Qualify Lead</DialogTitle>
            <DialogDescription>
              Turns {fullName(lead)} into an Opportunity. The Lead becomes Qualified and read-only.
            </DialogDescription>
          </DialogHeader>

          {suggestions.isPending ? (
            <div className="grid gap-3" aria-label="Looking for matches">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : suggestions.isError ? (
            <FormAlert error={suggestions.error} />
          ) : (
            <>
              <ChoiceSection
                name="account"
                title="Account"
                pick={account}
                onPick={setAccountPick}
                error={errors.account}
                suggestions={suggestions.data.accounts.matches.map((a) => ({ id: a.id, label: a.name, detail: a.city }))}
                none={`No Account named like "${lead.company}".`}
                otherLabel="Another existing Account"
                picker={(props) => <AccountPicker {...props} />}
                newLabel={`Create new Account "${lead.company}"`}
              />
              <ChoiceSection
                name="contact"
                title="Contact"
                pick={contact}
                onPick={setContactPick}
                error={errors.contact}
                suggestions={suggestions.data.contacts.matches.map((c) => ({
                  id: c.id,
                  label: fullName(c),
                  detail: [c.email, c.accountName && `at ${c.accountName}`].filter(Boolean).join(", "),
                }))}
                none={lead.email ? `No Contact with ${lead.email} or named ${fullName(lead)}.` : `No Contact named ${fullName(lead)}.`}
                note={
                  contact.kind !== "new"
                    ? "An existing Contact stays at their own Account; Qualify only links them."
                    : "The new Contact is created under the Account above."
                }
                otherLabel="Another existing Contact"
                picker={(props) => <ContactPicker {...props} />}
                newLabel={`Create new Contact "${fullName(lead)}"`}
              />
              <fieldset className="grid gap-3">
                <legend className="mb-1 text-sm font-medium">Opportunity</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextFields
                    idPrefix="qualify"
                    specs={DETAIL_SPECS}
                    values={details}
                    errors={errors}
                    onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Starts at Qualification (10%), owned by {lead.ownerName || "the Lead's Owner"}, with the Lead's source and
                  description.
                </p>
              </fieldset>
            </>
          )}

          {qualify.isError && (
            <div className="grid gap-1">
              <FormAlert error={qualify.error} />
              {failedStep && (
                <p className="text-sm text-muted-foreground">
                  Qualify stopped while {STEP_LABELS[failedStep]}. The Lead is still open; anything already created is kept and
                  reused when you try again.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={qualify.isPending || !suggestions.isSuccess}>
              {failedStep ? "Try again" : "Qualify"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type PickerProps = { id: string; value: RecordChoice | null; onChange: (value: RecordChoice | null) => void; invalid?: boolean }

/** One section: the suggested matches, another record picked by name, or a new one; nothing is linked without a pick. */
function ChoiceSection({
  name,
  title,
  pick,
  onPick,
  error,
  suggestions,
  none,
  note,
  otherLabel,
  picker,
  newLabel,
}: {
  name: string
  title: string
  pick: Pick
  onPick: (pick: Pick) => void
  error?: string
  suggestions: { id: Id; label: string; detail?: string }[]
  none: string
  note?: string
  otherLabel: string
  picker: (props: PickerProps) => ReactNode
  newLabel: string
}) {
  const radio = (value: string, checked: boolean, onSelect: () => void, label: ReactNode) => (
    <div key={value} className="flex items-start gap-2">
      <input
        type="radio"
        id={`qualify-${name}-${value}`}
        name={`qualify-${name}`}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <Label htmlFor={`qualify-${name}-${value}`} className="block font-normal leading-snug">
        {label}
      </Label>
    </div>
  )
  return (
    <fieldset className="grid gap-2" aria-describedby={error ? `qualify-${name}-error` : undefined}>
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      {suggestions.length === 0 && <p className="text-sm text-muted-foreground">{none}</p>}
      {suggestions.map((s) =>
        radio(
          s.id,
          pick.kind === "suggested" && pick.id === s.id,
          () => onPick({ kind: "suggested", id: s.id }),
          <>
            {s.label}
            {s.detail && <span className="ml-2 text-muted-foreground">{s.detail}</span>}
          </>,
        ),
      )}
      {radio("other", pick.kind === "other", () => onPick({ kind: "other", record: pick.kind === "other" ? pick.record : null }), otherLabel)}
      {pick.kind === "other" && (
        <FormField id={`qualify-${name}-picker`} label={`Find ${title}`} className="ml-6">
          {picker({
            id: `qualify-${name}-picker`,
            value: pick.record,
            onChange: (record) => onPick({ kind: "other", record }),
            invalid: !!error,
          })}
        </FormField>
      )}
      {radio("new", pick.kind === "new", () => onPick({ kind: "new" }), newLabel)}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {error && (
        <p id={`qualify-${name}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}
