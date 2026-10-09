import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { FormAlert, FormField } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import { DISQUALIFY_REASON_LABELS } from "@/lib/format"
import { DISQUALIFY_REASONS, disqualifyErrors, type DisqualifyReason, type Lead } from "@/sales"

/** Disqualify: a required Disqualify reason and an optional comment. The Lead becomes read-only. */
export function DisqualifyDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [reason, setReason] = useState<DisqualifyReason | undefined>()
  const [comment, setComment] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  const close = (next: boolean) => {
    if (!next) {
      setReason(undefined)
      setComment("")
      setErrors({})
      disqualify.reset()
    }
    onOpenChange(next)
  }

  const disqualify = useMutation({
    mutationFn: () => gateway.disqualifyLead(lead.id, { reason, comment }),
    onSuccess: async () => {
      await invalidate()
      close(false)
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = disqualifyErrors({ reason })
    setErrors(found)
    if (Object.keys(found).length === 0) disqualify.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Disqualify Lead</DialogTitle>
            <DialogDescription>
              The Lead becomes read-only. You or the Owner's manager can reopen it later.
            </DialogDescription>
          </DialogHeader>
          <FormField id="disqualify-reason" label="Disqualify reason" required error={errors.reason}>
            <Select value={reason ?? ""} onValueChange={(value) => setReason(value as DisqualifyReason)}>
              <SelectTrigger
                id="disqualify-reason"
                className="w-full"
                aria-invalid={errors.reason ? true : undefined}
                aria-describedby={errors.reason ? "disqualify-reason-error" : undefined}
              >
                <SelectValue placeholder="Pick a reason" />
              </SelectTrigger>
              <SelectContent>
                {DISQUALIFY_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {DISQUALIFY_REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="disqualify-comment" label="Comment">
            <Textarea id="disqualify-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </FormField>
          {disqualify.isError && <FormAlert error={disqualify.error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={disqualify.isPending}>
              Disqualify
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
