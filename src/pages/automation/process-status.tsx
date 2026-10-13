import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { processStatus, type ProcessAdmin } from "@/sales"

const STATUS_STYLE = {
  draft: "border-dashed",
  published: "border-green-700/40 bg-green-700/10 text-green-800 dark:border-green-400/40 dark:bg-green-400/10 dark:text-green-300",
  retired: "text-muted-foreground",
} as const

/** Draft, Published vN, Retired, plus "Unpublished changes" and a red "Error" when an Action could not run. */
export function ProcessStatusBadges({ process }: { process: ProcessAdmin }) {
  const status = processStatus(process)
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className={STATUS_STYLE[status]}>
        {status === "draft" ? "Draft" : status === "retired" ? "Retired" : `Published v${process.latestVersionNumber}`}
      </Badge>
      {process.hasUnpublishedChanges && !process.retired && (
        <Badge variant="outline" className="border-amber-600/50 bg-amber-500/10 text-amber-900 dark:border-amber-400/50 dark:text-amber-200">
          Unpublished changes
        </Badge>
      )}
      {process.isFallback && <Badge variant="secondary">Fallback</Badge>}
      {process.engineErrorCount > 0 && (
        <Badge variant="destructive" aria-label={`Error: ${process.engineErrorCount} Engine ${process.engineErrorCount === 1 ? "error" : "errors"}`}>
          <AlertTriangle aria-hidden /> Error
        </Badge>
      )}
    </span>
  )
}
