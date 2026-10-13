import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { Shuffle } from "lucide-react"
import { FormAlert } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { useProcessDefinitions } from "@/hooks/use-process"
import { PROCESS_TABLE_NOUN } from "@/lib/process-labels"
import type { Lead, Opportunity, ProcessKind } from "@/sales"

const NONE = "none"

/**
 * Switch Process: for the Owner's manager and Process builders, who put a record on another
 * Process or on none. The record lands on the first Step that fits its Stage or Lead status,
 * and no Gates are checked.
 */
export function SwitchProcessButton({ table, record, label = "Switch Process" }: { table: ProcessKind; record: Lead | Opportunity; label?: string }) {
  const [open, setOpen] = useState(false)
  const { data } = useProcessDefinitions(table)
  const processes = (data?.processes ?? []).filter((p) => !p.retired && p.latestVersionId)
  if (!data?.engineEnabled || (processes.length === 0 && !record.processVersionId)) return null
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Shuffle aria-hidden />
        {label}
      </Button>
      {open && <SwitchProcessDialog table={table} record={record} open={open} onOpenChange={setOpen} />}
    </>
  )
}

function SwitchProcessDialog({
  table,
  record,
  open,
  onOpenChange,
}: {
  table: ProcessKind
  record: Lead | Opportunity
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const { data } = useProcessDefinitions(table)
  const processes = (data?.processes ?? []).filter((p) => !p.retired && p.latestVersionId)
  const currentVersion = data?.versions.find((v) => v.id === record.processVersionId)
  const [choice, setChoice] = useState<string>("")

  const save = useMutation({
    mutationFn: (versionId: string | null) => gateway.switchProcess({ type: table, id: record.id }, versionId),
    onSuccess: async () => {
      await invalidate()
      onOpenChange(false)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!choice) return
    save.mutate(choice === NONE ? null : choice)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Switch Process</DialogTitle>
            <DialogDescription>
              This {PROCESS_TABLE_NOUN[table]} lands on the first Step that fits where it stands now. Gates are not checked and no Actions run.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Process</legend>
            {processes.map((p) => {
              const selected = currentVersion?.processId === p.id
              return (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="process" value={p.latestVersionId!} checked={choice === p.latestVersionId} disabled={selected} onChange={() => setChoice(p.latestVersionId!)} />
                  <span>{p.name}</span>
                  {selected && <span className="text-xs text-muted-foreground">(current)</span>}
                </label>
              )
            })}
            {record.processVersionId && (
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="process" value={NONE} checked={choice === NONE} onChange={() => setChoice(NONE)} />
                <span>No Process</span>
              </label>
            )}
          </fieldset>
          {save.isError && <FormAlert error={save.error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!choice || save.isPending}>
              Switch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
