import { formatEuro, STAGE_LABELS } from "@/lib/format"
import { OPEN_STAGES, myNumbers, salesStats, stageTotals, wonLostByOwner, type MyNumbers, type User } from "@/sales"
import { ProtoTeamExtras } from "@/prototype/forecast"
import { FunnelChart, WonLostChart } from "./forecast-chart"
import { euroOrNone, formatCoverage, formatPercent } from "./forecast-format"
import type { ForecastData } from "./use-forecast-data"

const COLUMNS: { label: string; value: (n: MyNumbers) => string }[] = [
  { label: "Won this month", value: (n) => formatEuro(n.wonThisMonth) },
  { label: "Won this quarter", value: (n) => formatEuro(n.wonThisQuarter) },
  { label: "Quota this quarter", value: (n) => euroOrNone(n.quotaThisQuarter) },
  { label: "Gap", value: (n) => euroOrNone(n.gapThisQuarter) },
  { label: "Coverage", value: (n) => formatCoverage(n.coverageThisQuarter) },
  { label: "Commit", value: (n) => formatEuro(n.commit) },
  { label: "Best case", value: (n) => formatEuro(n.bestCase) },
  { label: "Weighted", value: (n) => formatEuro(n.weighted) },
  { label: "Closing this month", value: (n) => String(n.closingThisMonthCount) },
  { label: "Overdue", value: (n) => String(n.overdueCount) },
]

export function TeamTab({ data, me, directReports }: { data: ForecastData; me: User; directReports: User[] }) {
  const people = [me, ...directReports]
  const rows = [
    ...people.map((person) => ({
      key: person.id,
      name: person.fullName,
      numbers: myNumbers(
        data.opportunities.filter((o) => o.ownerId === person.id),
        data.quotas.filter((q) => q.salespersonId === person.id),
        data.today,
      ),
    })),
    { key: "team", name: "Team total", numbers: myNumbers(data.opportunities, data.quotas, data.today) },
  ]
  const stats = salesStats(data.opportunities, data.today)
  const open = data.opportunities.filter((o) => (OPEN_STAGES as readonly string[]).includes(o.stage))
  const totals = stageTotals(open)

  return (
    <div className="space-y-6">
      <section aria-label="Team numbers" className="space-y-2">
        <h2 className="text-lg font-semibold">My numbers</h2>
        <div className="hidden overflow-x-auto rounded-md border md:block">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Salesperson
                </th>
                {COLUMNS.map((c) => (
                  <th key={c.label} scope="col" className="px-3 py-2 text-right font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={row.key === "team" ? "border-t bg-muted/50 font-semibold" : "border-b"}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {row.name}
                  </th>
                  {COLUMNS.map((c) => (
                    <td key={c.label} className="px-3 py-2 text-right tabular-nums">
                      {c.value(row.numbers)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 md:hidden">
          {rows.map((row) => (
            <article key={row.key} aria-label={row.name} className="rounded-md border p-3">
              <h3 className="mb-2 font-semibold">{row.name}</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {COLUMNS.map((c) => (
                  <div key={c.label}>
                    <dt className="text-xs text-muted-foreground">{c.label}</dt>
                    <dd className="font-medium tabular-nums">{c.value(row.numbers)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>

      <ProtoTeamExtras data={data} />

      <section aria-label="Last 90 days" className="space-y-2">
        <h2 className="text-lg font-semibold">Last 90 days</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile label="Win rate" value={formatPercent(stats.winRate)} />
          <Tile label="Average deal size" value={stats.averageDealSize === null ? "—" : formatEuro(stats.averageDealSize)} />
          <Tile label="Sales cycle" value={stats.salesCycleDays === null ? "—" : `${stats.salesCycleDays} days`} />
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Funnel by Stage" className="space-y-2">
          <h2 className="text-lg font-semibold">Funnel by Stage</h2>
          <FunnelChart stages={OPEN_STAGES.map((stage) => ({ label: STAGE_LABELS[stage], totals: totals[stage] }))} />
        </section>
        <section aria-label="Won versus lost by Owner" className="space-y-2">
          <h2 className="text-lg font-semibold">Won vs. lost by Owner (last 90 days)</h2>
          <WonLostChart owners={wonLostByOwner(data.opportunities, data.today)} />
        </section>
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
