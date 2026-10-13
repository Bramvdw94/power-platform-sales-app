import { Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatEuro } from "@/lib/format"
import type { ForecastFigures, ForecastPeriod, OwnerOutcome, StageTotal } from "@/sales"
import { CHART_COLORS, periodLabel } from "./forecast-format"

const axisEuro = (value: number) => (value >= 1000 ? `€${Math.round(value / 1000)}k` : `€${value}`)

const FORECAST_CONFIG = {
  closedWon: { label: "Closed won", color: CHART_COLORS.won },
  openCommit: { label: "Commit", color: CHART_COLORS.commit },
  openBestCase: { label: "Best case", color: CHART_COLORS.bestCase },
  openPipeline: { label: "Pipeline", color: CHART_COLORS.pipeline },
  quota: { label: "Quota", color: CHART_COLORS.quota },
} satisfies ChartConfig

/** Closed won, Commit, Best case and Pipeline stacked per period, with the Quota as a line above. */
export function ForecastChart({ periods, figures }: { periods: ForecastPeriod[]; figures: ForecastFigures[] }) {
  const data = periods.map((period, i) => ({ period: periodLabel(period), ...figures[i] }))
  return (
    <div role="img" aria-label="Forecast chart: Closed won, Commit, Best case and Pipeline per period against the Quota">
      <ChartContainer config={FORECAST_CONFIG} className="aspect-auto h-72 w-full">
        <ComposedChart data={data} margin={{ left: 4, right: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="period" tickLine={false} axisLine={false} />
          <YAxis tickFormatter={axisEuro} tickLine={false} axisLine={false} width={48} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatEuro(Number(value))} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="closedWon" stackId="forecast" fill="var(--color-closedWon)" />
          <Bar dataKey="openCommit" stackId="forecast" fill="var(--color-openCommit)" />
          <Bar dataKey="openBestCase" stackId="forecast" fill="var(--color-openBestCase)" />
          <Bar dataKey="openPipeline" stackId="forecast" fill="var(--color-openPipeline)" />
          <Line dataKey="quota" type="monotone" stroke="var(--color-quota)" strokeWidth={2} strokeDasharray="6 3" dot connectNulls={false} />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

const FUNNEL_CONFIG = { total: { label: "Open value", color: CHART_COLORS.commit } } satisfies ChartConfig

/** Open value per Stage, widest first stage on top. */
export function FunnelChart({ stages }: { stages: { label: string; totals: StageTotal }[] }) {
  const data = stages.map((s) => ({ stage: s.label, total: s.totals.total, count: s.totals.count }))
  return (
    <div role="img" aria-label="Funnel: open value per Stage">
      <ChartContainer config={FUNNEL_CONFIG} className="aspect-auto h-64 w-full">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickFormatter={axisEuro} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="stage" tickLine={false} axisLine={false} width={104} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatEuro(Number(value))} />} />
          <Bar dataKey="total" fill="var(--color-total)" radius={4} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}

const OUTCOME_CONFIG = {
  won: { label: "Won", color: CHART_COLORS.won },
  lost: { label: "Lost", color: CHART_COLORS.lost },
} satisfies ChartConfig

/** Value won against value lost per Owner. */
export function WonLostChart({ owners }: { owners: OwnerOutcome[] }) {
  return (
    <div role="img" aria-label="Won versus lost value per Owner">
      <ChartContainer config={OUTCOME_CONFIG} className="aspect-auto h-64 w-full">
        <BarChart data={owners} margin={{ left: 4, right: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="ownerName" tickLine={false} axisLine={false} />
          <YAxis tickFormatter={axisEuro} tickLine={false} axisLine={false} width={48} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatEuro(Number(value))} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="won" fill="var(--color-won)" radius={4} />
          <Bar dataKey="lost" fill="var(--color-lost)" radius={4} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
