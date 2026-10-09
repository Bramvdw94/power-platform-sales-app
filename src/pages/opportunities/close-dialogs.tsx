import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { FormAlert, TextFields, type TextFieldSpec } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import { LOST_REASON_LABELS } from "@/lib/format"
import { LOST_REASONS, toDateOnly, type CloseInput, type LostReason, type OpenStage, type Opportunity } from "@/sales"
import { ChoiceField, OPEN_STAGE_OPTIONS } from "./opportunity-form"

type Outcome = CloseInput["outcome"]
type CloseField = "actualValue" | "closeDate" | "lostComment"

const WON_SPECS: TextFieldSpec<CloseField>[] = [
  { name: "actualValue", label: "Actual value (€)", required: true, type: "number" },
  { name: "closeDate", label: "Close date", required: true, type: "date" },
]
const LOST_DATE: TextFieldSpec<CloseField> = { name: "closeDate", label: "Close date", required: true, type: "date" }
const LOST_COMMENT: TextFieldSpec<CloseField> = { name: "lostComment", label: "Comment", type: "textarea" }
const LOST_REASON_OPTIONS = LOST_REASONS.map((r) => ({ value: r, label: LOST_REASON_LABELS[r] }))

/**
 * Close an open Opportunity as Closed Won (actual value and close date) or
 * Closed Lost (close date, Lost reason and an optional comment).
 */
export function CloseOpportunityDialog({
  opportunity,
  open,
  onOpenChange,
  initialOutcome = "won",
}: {
  opportunity: Opportunity
  open: boolean
  onOpenChange: (open: boolean) => void
  initialOutcome?: Outcome
}) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const initialValues = () => ({ actualValue: String(opportunity.estimatedValue), closeDate: toDateOnly(new Date()), lostComment: "" })
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome)
  const [values, setValues] = useState<Partial<Record<CloseField, string>>>(initialValues)
  const [lostReason, setLostReason] = useState<LostReason | "">("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (input: CloseInput) => gateway.closeOpportunity(opportunity.id, input),
    onSuccess: async () => {
      await invalidate()
      close(false)
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  function close(next: boolean) {
    if (!next) {
      setOutcome(initialOutcome)
      setValues(initialValues())
      setLostReason("")
      setErrors({})
      save.reset()
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const closeDate = values.closeDate?.trim() ?? ""
    const found: Record<string, string> = {}
    if (!closeDate) found.closeDate = "Enter a close date."
    let input: CloseInput
    if (outcome === "won") {
      const actualValue = values.actualValue?.trim() ? Number(values.actualValue) : Number.NaN
      if (!Number.isFinite(actualValue) || actualValue < 0) found.actualValue = "Enter an actual value of 0 or more."
      input = { outcome, actualValue, closeDate }
    } else {
      if (!lostReason) found.lostReason = "Pick a Lost reason."
      input = { outcome, lostReason: lostReason || undefined, lostComment: values.lostComment, closeDate }
    }
    setErrors(found)
    if (Object.keys(found).length === 0) save.mutate(input)
  }

  const onChange = (name: CloseField, value: string) => setValues((v) => ({ ...v, [name]: value }))
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Close Opportunity</DialogTitle>
            <DialogDescription>{opportunity.name} becomes read-only once closed.</DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Outcome</legend>
            <div className="flex gap-4">
              {(["won", "lost"] as const).map((value) => (
                <div key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`close-outcome-${value}`}
                    name="outcome"
                    value={value}
                    checked={outcome === value}
                    onChange={() => {
                      setOutcome(value)
                      setErrors({})
                    }}
                    className="size-4 accent-primary"
                  />
                  <Label htmlFor={`close-outcome-${value}`}>{value === "won" ? "Closed Won" : "Closed Lost"}</Label>
                </div>
              ))}
            </div>
          </fieldset>
          {outcome === "won" ? (
            <TextFields idPrefix="close" specs={WON_SPECS} values={values} errors={errors} onChange={onChange} />
          ) : (
            <>
              <ChoiceField
                id="close-lost-reason"
                label="Lost reason"
                required
                value={lostReason}
                options={LOST_REASON_OPTIONS}
                onChange={setLostReason}
                blankLabel="Pick a reason"
                error={errors.lostReason}
              />
              <TextFields idPrefix="close" specs={[LOST_DATE, LOST_COMMENT]} values={values} errors={errors} onChange={onChange} />
            </>
          )}
          {save.isError && <FormAlert error={save.error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {outcome === "won" ? "Close as won" : "Close as lost"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Reopen a closed Opportunity to an open Stage; what Close recorded is cleared. */
export function ReopenOpportunityDialog({
  opportunity,
  open,
  onOpenChange,
}: {
  opportunity: Opportunity
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  // Reopening usually corrects a deal closed too early, so it starts at the last open Stage.
  const [stage, setStage] = useState<OpenStage>("negotiation")

  const save = useMutation({
    mutationFn: (to: OpenStage) => gateway.reopenOpportunity(opportunity.id, to),
    onSuccess: async () => {
      await invalidate()
      close(false)
    },
  })

  function close(next: boolean) {
    if (!next) {
      setStage("negotiation")
      save.reset()
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate(stage)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Reopen Opportunity</DialogTitle>
            <DialogDescription>
              {opportunity.name} becomes editable again. Its close date, actual value and Lost reason are cleared.
            </DialogDescription>
          </DialogHeader>
          <ChoiceField
            id="reopen-stage"
            label="Stage"
            required
            value={stage}
            options={OPEN_STAGE_OPTIONS}
            onChange={(value) => value && setStage(value)}
          />
          {save.isError && <FormAlert error={save.error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Reopen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
