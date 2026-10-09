import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { isOpportunityOverdue, toDateOnly, type Opportunity } from "@/sales"

/** The Expected close date, in red with "Overdue" once it has passed on an open Opportunity. */
export function ExpectedCloseDate({ opportunity }: { opportunity: Pick<Opportunity, "stage" | "expectedCloseDate"> }) {
  const overdue = isOpportunityOverdue(opportunity, toDateOnly(new Date()))
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn(overdue && "text-destructive")}>{formatDate(opportunity.expectedCloseDate)}</span>
      {overdue && <Badge variant="destructive">Overdue</Badge>}
    </span>
  )
}
