import type { ReactNode } from "react"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/hooks/use-current-user"
import { describeError } from "@/lib/errors"
import { formatEuro } from "@/lib/format"
import { cn } from "@/lib/utils"
import { myNumbers, type MyNumbers } from "@/sales"
import { euroOrNone, formatCoverage } from "./forecast/forecast-format"
import { useForecastData } from "./forecast/use-forecast-data"

/** The My numbers row at the top of Home: the same figures as the Forecast tab for me. */
export function MyNumbersRow() {
  const currentUser = useCurrentUser()
  const data = useForecastData()
  if (currentUser.error) return null
  const error = data.error
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-destructive/50 p-4 text-sm">
        {describeError(error)}
      </p>
    )
  }
  if (!currentUser.data || !data.opportunities || !data.quotas) {
    return (
      <div className="flex gap-3 overflow-hidden" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-44 shrink-0" />
        ))}
      </div>
    )
  }
  const me = currentUser.data.user.id
  const numbers = myNumbers(
    data.opportunities.filter((o) => o.ownerId === me),
    data.quotas.filter((q) => q.salespersonId === me),
    data.today,
  )
  return <MyNumbersTiles numbers={numbers} />
}

export function MyNumbersTiles({ numbers: n }: { numbers: MyNumbers }) {
  return (
    <section aria-label="My numbers">
      <ul className="flex gap-3 overflow-x-auto pb-1">
        <QuotaTile label="Won this month" won={n.wonThisMonth} quota={n.quotaThisMonth} />
        <QuotaTile label="Won this quarter" won={n.wonThisQuarter} quota={n.quotaThisQuarter} />
        <Tile label="Gap this quarter" value={euroOrNone(n.gapThisQuarter)} note={n.gapThisQuarter === null ? "No Quota set" : undefined} />
        <Tile
          label="Coverage this quarter"
          value={formatCoverage(n.coverageThisQuarter)}
          note={n.quotaThisQuarter === null ? "No Quota set" : n.gapThisQuarter === 0 ? "Quota reached" : undefined}
        />
        <Tile label="Commit" value={formatEuro(n.commit)} />
        <Tile label="Best case" value={formatEuro(n.bestCase)} />
        <Tile label="Weighted pipeline" value={formatEuro(n.weighted)} />
        <Tile
          label="Closing this month"
          value={String(n.closingThisMonthCount)}
          note={n.closingThisMonthCount > 0 ? formatEuro(n.closingThisMonthValue) : undefined}
        />
        <Tile label="Overdue close dates" value={String(n.overdueCount)} warn={n.overdueCount > 0} />
      </ul>
    </section>
  )
}

function Tile({ label, value, note, warn, children }: { label: string; value: string; note?: string; warn?: boolean; children?: ReactNode }) {
  return (
    <li role="group" aria-label={label} className="min-w-40 flex-1 shrink-0 rounded-md border bg-card p-3 text-card-foreground">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", warn && "text-destructive")}>{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {children}
    </li>
  )
}

function QuotaTile({ label, won, quota }: { label: string; won: number; quota: number | null }) {
  if (quota === null) return <Tile label={label} value={formatEuro(won)} note="No Quota set" />
  const percent = quota > 0 ? Math.round((won / quota) * 100) : 0
  return (
    <Tile label={label} value={formatEuro(won)} note={`${percent}% of ${formatEuro(quota)} Quota`}>
      <Progress value={Math.min(100, percent)} aria-label={`${label} against Quota`} className="mt-2" />
    </Tile>
  )
}
