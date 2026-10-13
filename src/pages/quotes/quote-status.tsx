import { Badge } from "@/components/ui/badge"
import { QUOTE_STATUS_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"
import { isQuoteExpired, toDateOnly, type Quote, type QuoteStatus } from "@/sales"

const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: "border-border bg-background text-foreground",
  sent: "border-transparent bg-secondary text-secondary-foreground",
  accepted: "border-transparent bg-green-700 text-white",
  rejected: "border-transparent bg-red-700 text-white",
  revised: "border-border bg-muted text-muted-foreground",
}

/** The Quote's status, and "Expired" next to a Sent Quote past its Valid until (its status does not change). */
export function QuoteStatusBadges({ quote }: { quote: Pick<Quote, "status" | "validUntil"> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge className={cn(STATUS_STYLE[quote.status])}>{QUOTE_STATUS_LABELS[quote.status]}</Badge>
      {isQuoteExpired(quote, toDateOnly(new Date())) && (
        <Badge variant="outline" className="border-red-700 text-red-700 dark:border-red-400 dark:text-red-400">
          Expired
        </Badge>
      )}
    </span>
  )
}
