import { useState, type FormEvent } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { UserRoundPen } from "lucide-react"
import { FormAlert, FormField } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import { cn } from "@/lib/utils"
import type { Id, RecordRef } from "@/sales"

const NOUNS: Record<RecordRef["type"], string> = {
  lead: "Lead",
  opportunity: "Opportunity",
  account: "Account",
  contact: "Contact",
}

/**
 * The Reassign header action: for the Owner and the Owner's manager, also on
 * read-only records (a Qualified Lead, a closed Opportunity).
 */
export function ReassignButton({ record, ownerId, name }: { record: RecordRef; ownerId: Id; name: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserRoundPen aria-hidden />
        Reassign
      </Button>
      {open && <ReassignDialog record={record} ownerId={ownerId} name={name} open={open} onOpenChange={setOpen} />}
    </>
  )
}

/** Picks another salesperson as the record's Owner. */
export function ReassignDialog({
  record,
  ownerId,
  name,
  open,
  onOpenChange,
}: {
  record: RecordRef
  ownerId: Id
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [newOwnerId, setNewOwnerId] = useState("")
  const [error, setError] = useState<string>()
  const salespeople = useQuery({ queryKey: ["salespeople"], queryFn: () => gateway.listSalespeople() })
  const candidates = (salespeople.data ?? []).filter((u) => u.id !== ownerId)

  const save = useMutation({
    mutationFn: (id: Id) => gateway.reassign(record, id),
    onSuccess: async () => {
      await invalidate()
      onOpenChange(false)
    },
    onError: (e) => setError(fieldErrorsOf(e).ownerId),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!newOwnerId) {
      setError("Pick a salesperson.")
      return
    }
    setError(undefined)
    save.mutate(newOwnerId)
  }

  const noun = NOUNS[record.type]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Reassign {noun}</DialogTitle>
            <DialogDescription>
              {name} gets a new Owner. Its open Tasks and Phone Calls move along; completed activities and Notes
              keep their Owner.
              {record.type === "account" && " Its Contacts and Opportunities keep their own Owners."}
            </DialogDescription>
          </DialogHeader>
          <FormField id="reassign-owner" label="New Owner" required error={error}>
            <select
              id="reassign-owner"
              value={newOwnerId}
              required
              disabled={salespeople.isPending}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "reassign-owner-error" : undefined}
              onChange={(e) => setNewOwnerId(e.target.value)}
              className={cn(
                "h-9 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none md:text-sm dark:bg-input/30",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "aria-invalid:border-destructive",
              )}
            >
              <option value="">{salespeople.isPending ? "Loading salespeople…" : "Pick a salesperson"}</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </FormField>
          {salespeople.isError && <FormAlert error={salespeople.error} />}
          {save.isError && !error && <FormAlert error={save.error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Reassign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
