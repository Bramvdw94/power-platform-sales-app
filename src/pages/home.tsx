import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { CompleteTaskButton } from "@/components/records/activity-timeline"
import { RecordSection } from "@/components/records/record-page"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useGateway } from "@/hooks/use-gateway"
import { describeError } from "@/lib/errors"
import { formatDate, formatEuro, LEAD_SOURCE_LABELS, recordHref, STAGE_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MyNumbersRow } from "./my-numbers-tiles"
import { fullName, isTaskOverdue, toDateOnly } from "@/sales"

/** "My work": my open Tasks (overdue first), my Opportunities closing this month, my Leads still Not Contacted. */
export default function HomePage() {
  const gateway = useGateway()
  const { data: me } = useCurrentUser()
  const { data, error, isPending } = useQuery({ queryKey: ["home"], queryFn: () => gateway.getHome() })
  const firstName = me?.user.fullName.split(" ")[0]
  const today = toDateOnly(new Date())

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My work</h1>
        {firstName && <p className="text-sm text-muted-foreground">Welcome, {firstName}. Here is what needs your attention.</p>}
      </div>
      <MyNumbersRow />
      {isPending ? (
        <div className="grid gap-4 lg:grid-cols-3" aria-busy="true">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : error ? (
        <p role="alert" className="rounded-md border border-destructive/50 p-4 text-sm">
          {describeError(error)}
        </p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <RecordSection title="My open Tasks">
            <HomeList empty="No open Tasks. Nice work.">
              {data.openTasks.map((task) => {
                const overdue = isTaskOverdue(task, today)
                return (
                  <li key={task.id} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium break-words">{task.subject}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                        <Link to={recordHref(task.regarding)} className="text-primary hover:underline">
                          {task.regardingName || "Open record"}
                        </Link>
                        {task.dueDate && <span className={cn(overdue && "text-destructive")}>Due {formatDate(task.dueDate)}</span>}
                        {overdue && <Badge variant="destructive">Overdue</Badge>}
                      </p>
                    </div>
                    <CompleteTaskButton task={task} />
                  </li>
                )
              })}
            </HomeList>
          </RecordSection>
          <RecordSection title="Closing this month">
            <HomeList empty="None of your open Opportunities close this month.">
              {data.opportunitiesClosingThisMonth.map((o) => (
                <li key={o.id} className="py-2 first:pt-0 last:pb-0">
                  <Link to={recordHref({ type: "opportunity", id: o.id })} className="font-medium text-primary hover:underline">
                    {o.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {[o.accountName, STAGE_LABELS[o.stage], formatEuro(o.estimatedValue), formatDate(o.expectedCloseDate)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </HomeList>
          </RecordSection>
          <RecordSection title="Leads to contact">
            <HomeList empty="All your Leads have been contacted.">
              {data.leadsNotContacted.map((lead) => (
                <li key={lead.id} className="py-2 first:pt-0 last:pb-0">
                  <Link to={recordHref({ type: "lead", id: lead.id })} className="font-medium text-primary hover:underline">
                    {fullName(lead)}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {[lead.company, lead.leadSource && LEAD_SOURCE_LABELS[lead.leadSource], formatDate(lead.createdOn)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </HomeList>
          </RecordSection>
        </div>
      )}
    </div>
  )
}

function HomeList({ empty, children }: { empty: string; children: ReactNode[] }) {
  if (children.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return <ul className="divide-y">{children}</ul>
}
