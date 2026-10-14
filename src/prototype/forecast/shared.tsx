/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): bits the three #161 variants share.

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { CalendarX, Clock, Hourglass } from "lucide-react"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatDate, formatEuro } from "@/lib/format"
import { cn } from "@/lib/utils"
import { CHART_COLORS } from "@/pages/forecast/forecast-format"
import type { Id, Opportunity, Quota } from "@/sales"
import { forecastFigures, forecastPeriods } from "@/sales"
import { daysBetween, ME, REPORTS, TODAY, trendSeries, type StaleReason, type TrendPoint } from "./model"
import "./prototype.css"

export const VARIANTS = [
  { key: "A", name: "Classic: dialogs and badges" },
  { key: "B", name: "Roll-up and side panel" },
  { key: "C", name: "Inline grid" },
]

export const STALE_ICON: Record<StaleReason, typeof Clock> = { noActivity: Clock, closeDatePassed: CalendarX, longInStage: Hourglass }

/** Amber that reads in both themes. */
export const WARN = "bg-amber-100 text-amber-950 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800"
/** The "adjusted" accent, violet in both themes. */
export const ADJ = "bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100"

export const shortDate = (d: string) => formatDate(d)
export const signedEuro = (v: number) => (v > 0 ? `+${formatEuro(v)}` : v < 0 ? `−${formatEuro(-v)}` : formatEuro(0))

export function lastActivityText(date: string | null): string {
  if (!date) return "None yet"
  const days = daysBetween(date, TODAY)
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${formatDate(date)} (${days} days ago)`
}

export type Scope = "me" | "team" | Id
export const SCOPES: { value: Scope; label: string }[] = [
  { value: "me", label: "Me" },
  { value: "team", label: "My team" },
  ...REPORTS.map((u) => ({ value: u.id, label: u.name })),
]
export const scopeIds = (scope: Scope): Id[] => (scope === "me" ? [ME.id] : scope === "team" ? [ME.id, ...REPORTS.map((u) => u.id)] : [scope])

export type TrendPeriod = "thisMonth" | "nextMonth" | "thisQuarter"
export const TREND_PERIODS: { value: TrendPeriod; label: string }[] = [
  { value: "thisMonth", label: "This month" },
  { value: "nextMonth", label: "Next month" },
  { value: "thisQuarter", label: "This quarter" },
]

/** Today's calculated figures for the scope and period, walked back over 12 made-up snapshots. */
export function useTrend(opportunities: Opportunity[], quotas: Quota[], scope: Scope, period: TrendPeriod): TrendPoint[] {
  const ids = scopeIds(scope)
  const p =
    period === "thisQuarter" ? forecastPeriods(TODAY, "quarter")[0] : forecastPeriods(TODAY, "month")[period === "thisMonth" ? 0 : 1]
  const f = forecastFigures(
    opportunities.filter((o) => ids.includes(o.ownerId)),
    quotas.filter((q) => ids.includes(q.salespersonId)),
    p,
  )
  const seed = ids.length * 7 + (period === "thisQuarter" ? 3 : period === "nextMonth" ? 2 : 1)
  return trendSeries({ closedWon: f.closedWon, commit: f.commit, bestCase: f.bestCase, pipeline: f.pipeline }, f.quota, seed)
}

const axisEuro = (value: number) => (value >= 1000 ? `€${Math.round(value / 1000)}k` : `€${value}`)

export const TREND_CONFIG = {
  closedWon: { label: "Closed won", color: CHART_COLORS.won },
  commit: { label: "Commit", color: CHART_COLORS.commit },
  bestCase: { label: "Best case", color: CHART_COLORS.bestCase },
  pipeline: { label: "Pipeline", color: "var(--muted-foreground)" },
  quota: { label: "Quota", color: CHART_COLORS.quota },
} satisfies ChartConfig

/** The 12-snapshot line chart, calculated figures only, against the Quota. */
export function TrendChart({ points, height = "h-72", only }: { points: TrendPoint[]; height?: string; only?: (keyof typeof TREND_CONFIG)[] }) {
  const data = points.map((p) => ({ ...p, label: formatDate(p.snapshot).replace(/ \d{4}$/, "") }))
  const show = (k: keyof typeof TREND_CONFIG) => !only || only.includes(k)
  return (
    <div role="img" aria-label="Forecast trend over the last 12 weekly snapshots against the Quota">
      <ChartContainer config={TREND_CONFIG} className={cn("aspect-auto w-full", height)}>
        <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tickFormatter={axisEuro} tickLine={false} axisLine={false} width={48} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatEuro(Number(value))} />} />
          {!only && <ChartLegend content={<ChartLegendContent />} />}
          {show("pipeline") && <Line dataKey="pipeline" stroke="var(--color-pipeline)" strokeWidth={2} dot={false} />}
          {show("bestCase") && <Line dataKey="bestCase" stroke="var(--color-bestCase)" strokeWidth={2} dot={false} />}
          {show("commit") && <Line dataKey="commit" stroke="var(--color-commit)" strokeWidth={2.5} dot={false} />}
          {show("closedWon") && <Line dataKey="closedWon" stroke="var(--color-closedWon)" strokeWidth={2.5} dot={false} />}
          {show("quota") && <Line dataKey="quota" stroke="var(--color-quota)" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />}
        </LineChart>
      </ChartContainer>
    </div>
  )
}

/** A native select styled like the app's inputs, readable in dark mode. */
export function NativeSelect({ label, value, onChange, options, className }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-background text-foreground">
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Delta({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const good = inverse ? value < 0 : value > 0
  return (
    <span className={cn("tabular-nums", value === 0 ? "text-muted-foreground" : good ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
      {signedEuro(value)}
    </span>
  )
}

/** "Calculated €X" under an adjusted figure. */
export function CalculatedNote({ amount }: { amount: number }) {
  return <span className="block text-xs text-muted-foreground tabular-nums">Calculated {formatEuro(amount)}</span>
}

export const timestamp = (at: string) => `${formatDate(at.slice(0, 10))} ${at.slice(11, 16)}`
