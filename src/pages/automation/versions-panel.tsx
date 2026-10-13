import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NativeSelect } from "@/components/ui/native-select"
import { useGateway } from "@/hooks/use-gateway"
import { describeError } from "@/lib/errors"
import { formatDate } from "@/lib/format"
import type { ProcessAdmin } from "@/sales"
import { useRefreshProcesses } from "./use-process-admin"

const records = (n: number) => `${n} ${n === 1 ? "record" : "records"}`

/** The Process versions and how many open records sit on each; Move to latest version and, for a retired Process, Switch all. */
export function VersionsPanel({ process, others, canBuild }: { process: ProcessAdmin; others: ProcessAdmin[]; canBuild: boolean }) {
  const gateway = useGateway()
  const refresh = useRefreshProcesses()
  const [confirm, setConfirm] = useState<"move" | "switch" | null>(null)
  const [target, setTarget] = useState("")
  const [message, setMessage] = useState<string>()

  const total = process.versions.reduce((sum, v) => sum + v.openRecords, 0)
  const behind = process.versions.filter((v) => v.id !== process.latestVersionId).reduce((sum, v) => sum + v.openRecords, 0)
  const targets = others.filter((p) => p.id !== process.id && !p.retired && p.latestVersionId)

  const run = useMutation({
    mutationFn: async () => {
      if (confirm === "move") return { kind: "move" as const, count: await gateway.moveToLatestVersion(process.id) }
      return { kind: "switch" as const, count: await gateway.switchAllRecords(process.id, target || null) }
    },
    onSuccess: async (result) => {
      setConfirm(null)
      setMessage(
        result.kind === "move"
          ? `Moved ${records(result.count)} to version ${process.latestVersionNumber}.`
          : `Switched ${records(result.count)} ${target ? `to “${targets.find((p) => p.id === target)?.name}”` : "to no Process"}.`,
      )
      await refresh()
    },
  })

  if (process.versions.length === 0) return <p className="text-sm text-muted-foreground">Not published yet. Records get a Process version only after you Publish.</p>

  return (
    <div className="space-y-3">
      <ul aria-label="Process versions" className="divide-y rounded-md border">
        {process.versions.map((v) => (
          <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-2.5">
            <span className="font-medium">Version {v.number}</span>
            {v.id === process.latestVersionId && <span className="text-xs text-muted-foreground">latest</span>}
            <span className="text-sm text-muted-foreground">{v.publishedOn ? `published ${formatDate(v.publishedOn)}` : ""}</span>
            <span className="ml-auto text-sm">{records(v.openRecords)} open</span>
          </li>
        ))}
      </ul>

      {canBuild && !process.retired && behind > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setConfirm("move")}>
            Move to latest version
          </Button>
          <span className="text-sm text-muted-foreground">{records(behind)} on older versions.</span>
        </div>
      )}
      {canBuild && process.retired && total > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-sm">
            Switch Process for all {records(total)} to
            <NativeSelect className="w-64" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Switch all records to">
              <option value="">No Process</option>
              {targets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button type="button" onClick={() => setConfirm("switch")}>
            Switch all records
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}

      {confirm && (
        <Dialog open onOpenChange={(open) => !open && setConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirm === "move" ? "Move to latest version" : "Switch all records"}</DialogTitle>
              <DialogDescription>
                {confirm === "move"
                  ? `${records(behind)} will move to version ${process.latestVersionNumber}. A record stays on its Step when that Step still exists with the same ${process.table === "lead" ? "Lead status" : "Stage"}; otherwise it lands on the closest earlier Step. Gates are not checked and Actions do not run.`
                  : `${records(total)} will leave “${process.name}” for ${target ? `“${targets.find((p) => p.id === target)?.name}”` : "no Process"}. Each lands on the first Step that fits its ${process.table === "lead" ? "Lead status" : "Stage"}. Gates are not checked and Actions do not run.`}
              </DialogDescription>
            </DialogHeader>
            {run.isError && (
              <p role="alert" className="text-sm text-destructive">
                {describeError(run.error)}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={run.isPending} onClick={() => run.mutate()}>
                {confirm === "move" ? "Move records" : "Switch records"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
