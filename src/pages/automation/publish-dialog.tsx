import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useGateway } from "@/hooks/use-gateway"
import { describeError } from "@/lib/errors"
import type { Id, ProcessAdmin } from "@/sales"

const SHOWN_BLOCKED = 10

/** Runs the Publish checks, shows what would be refused and how many open records would be blocked, then publishes. */
export function PublishDialog({
  process,
  publishing,
  error,
  onConfirm,
  onClose,
}: {
  process: ProcessAdmin
  publishing: boolean
  error: unknown
  onConfirm: () => void
  onClose: () => void
}) {
  const gateway = useGateway()
  const preview = useQuery({
    queryKey: ["process-admin", "preview", process.id as Id, process.latestVersionId],
    queryFn: () => gateway.previewPublish(process.id),
    gcTime: 0,
  })
  const next = (process.latestVersionNumber ?? 0) + 1
  const refused = (preview.data?.errors.length ?? 0) > 0

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish “{process.name}”</DialogTitle>
          <DialogDescription>
            This makes version {next}. New records get it; open records stay on the version they started on until you move them.
          </DialogDescription>
        </DialogHeader>

        {preview.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : preview.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {describeError(preview.error)}
          </p>
        ) : (
          <div className="grid gap-4 text-sm">
            {refused && (
              <section aria-label="Publish refused" className="grid gap-1">
                <h3 className="font-medium text-destructive">This Process can't be published yet</h3>
                <ul className="list-disc space-y-1 pl-5">
                  {preview.data.errors.map((issue, i) => (
                    <li key={i}>{issue.message}</li>
                  ))}
                </ul>
              </section>
            )}
            {preview.data.warnings.length > 0 && (
              <section aria-label="Warnings" className="grid gap-1">
                <h3 className="font-medium">Heads up</h3>
                <ul className="list-disc space-y-1 pl-5">
                  {preview.data.warnings.map((issue, i) => (
                    <li key={i}>{issue.message}</li>
                  ))}
                </ul>
              </section>
            )}
            <section aria-label="Impact" className="grid gap-1">
              <h3 className="font-medium">Impact on open records</h3>
              <p>
                {preview.data.impact.openRecords === 0
                  ? "No open records follow this Process."
                  : `${preview.data.impact.openRecords} open ${preview.data.impact.openRecords === 1 ? "record follows" : "records follow"} this Process.`}{" "}
                {preview.data.impact.blocked.length === 0
                  ? preview.data.impact.openRecords > 0 && "None would be blocked at their current Gate if moved to this version."
                  : `${preview.data.impact.blocked.length} would be blocked at their current Gate if moved to this version:`}
              </p>
              {preview.data.impact.blocked.length > 0 && (
                <ul className="space-y-1 rounded-md border p-2">
                  {preview.data.impact.blocked.slice(0, SHOWN_BLOCKED).map((b) => (
                    <li key={b.id}>
                      <Link to={`/${b.table === "lead" ? "leads" : "opportunities"}/${b.id}`} className="underline-offset-4 hover:underline">
                        {b.name}
                      </Link>{" "}
                      <span className="text-muted-foreground">
                        at “{b.stepName}”: {b.openChecks} open {b.openChecks === 1 ? "check" : "checks"}
                      </span>
                    </li>
                  ))}
                  {preview.data.impact.blocked.length > SHOWN_BLOCKED && (
                    <li className="text-muted-foreground">and {preview.data.impact.blocked.length - SHOWN_BLOCKED} more</li>
                  )}
                </ul>
              )}
            </section>
          </div>
        )}
        {error != null && (
          <p role="alert" className="text-sm text-destructive">
            {describeError(error)}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={preview.isPending || preview.isError || refused || publishing} onClick={onConfirm}>
            Publish version {next}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
