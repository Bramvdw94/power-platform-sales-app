import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import { formatEuro } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  forecastFigures,
  forecastPeriods,
  type ForecastFigures,
  type ForecastGranularity,
  type ForecastPeriod,
  type User,
} from "@/sales"
import { ForecastChart } from "./forecast-chart"
import { euroOrNone, formatCoverage, periodLabel } from "./forecast-format"
import type { ForecastData } from "./use-forecast-data"

type Scope = "me" | "team" | string

const ROWS: { label: string; value: (f: ForecastFigures) => string }[] = [
  { label: "Closed won", value: (f) => formatEuro(f.closedWon) },
  { label: "Commit", value: (f) => formatEuro(f.commit) },
  { label: "Best case", value: (f) => formatEuro(f.bestCase) },
  { label: "Pipeline", value: (f) => formatEuro(f.pipeline) },
  { label: "Weighted", value: (f) => formatEuro(f.weighted) },
  { label: "Quota", value: (f) => euroOrNone(f.quota) },
  { label: "Gap", value: (f) => euroOrNone(f.gap) },
  { label: "Coverage", value: (f) => formatCoverage(f.coverage) },
]

export function ForecastTab({ data, me, directReports }: { data: ForecastData; me: User; directReports: User[] }) {
  const isDesktop = useIsDesktop()
  const [scope, setScope] = useState<Scope>("me")
  const [granularity, setGranularity] = useState<ForecastGranularity>("month")
  const [index, setIndex] = useState(0)

  const ids = scope === "me" ? [me.id] : scope === "team" ? [me.id, ...directReports.map((u) => u.id)] : [scope]
  const opportunities = data.opportunities.filter((o) => ids.includes(o.ownerId))
  const quotas = data.quotas.filter((q) => ids.includes(q.salespersonId))
  const periods = forecastPeriods(data.today, granularity)
  const figures = periods.map((period) => forecastFigures(opportunities, quotas, period))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {directReports.length > 0 && (
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger aria-label="Whose numbers" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="me">Me</SelectItem>
              <SelectItem value="team">My team</SelectItem>
              {directReports.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div role="group" aria-label="Period" className="inline-flex rounded-lg bg-muted p-[3px]">
          {(["month", "quarter"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={granularity === value ? "default" : "ghost"}
              aria-pressed={granularity === value}
              onClick={() => {
                setGranularity(value)
                setIndex(0)
              }}
            >
              {value === "month" ? "Month" : "Quarter"}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Open deals count in their Expected close month at their Estimated value, won deals in their close month at their actual value.
        Commit and Best case include what is already won; Pipeline is all open deals except Omitted.
      </p>

      {isDesktop ? (
        <>
          <ForecastChart periods={periods} figures={figures} />
          <ForecastGrid periods={periods} figures={figures} />
        </>
      ) : (
        <ForecastPager periods={periods} figures={figures} index={Math.min(index, periods.length - 1)} onIndex={setIndex} />
      )}
    </div>
  )
}

/** Figures as rows, periods as columns, the first column pinned while the rest scrolls. */
function ForecastGrid({ periods, figures }: { periods: ForecastPeriod[]; figures: ForecastFigures[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table aria-label="Forecast figures" className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b">
            <th scope="col" className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">
              <span className="sr-only">Figure</span>
            </th>
            {periods.map((period) => (
              <th key={period.key} scope="col" className="px-3 py-2 text-right font-medium">
                {periodLabel(period)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <th scope="row" className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">
                {row.label}
              </th>
              {figures.map((f, i) => (
                <td key={periods[i].key} className="px-3 py-2 text-right tabular-nums">
                  {row.value(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A phone shows one period at a time, with ‹ › and dots: nothing scrolls sideways. */
function ForecastPager({
  periods,
  figures,
  index,
  onIndex,
}: {
  periods: ForecastPeriod[]
  figures: ForecastFigures[]
  index: number
  onIndex: (index: number) => void
}) {
  const figure = figures[index]
  return (
    <section aria-label="Forecast period" className="space-y-3">
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="icon" aria-label="Previous period" disabled={index === 0} onClick={() => onIndex(index - 1)}>
          <ChevronLeft />
        </Button>
        <h2 className="text-lg font-semibold">{periodLabel(periods[index])}</h2>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next period"
          disabled={index === periods.length - 1}
          onClick={() => onIndex(index + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
      <dl className="divide-y rounded-md border">
        {ROWS.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-3 py-2 text-sm">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-medium tabular-nums">{row.value(figure)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex justify-center gap-2" role="group" aria-label="Periods">
        {periods.map((period, i) => (
          <button
            key={period.key}
            type="button"
            aria-label={periodLabel(period)}
            aria-current={i === index ? "true" : undefined}
            onClick={() => onIndex(i)}
            className={cn("size-2.5 rounded-full", i === index ? "bg-primary" : "bg-muted-foreground/30")}
          />
        ))}
      </div>
    </section>
  )
}
