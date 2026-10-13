import { format } from "date-fns"
import { formatEuro } from "@/lib/format"
import type { ForecastPeriod } from "@/sales"

export const NONE = "—"

export const euroOrNone = (value: number | null) => (value === null ? NONE : formatEuro(value))

/** Open pipeline per euro of Gap: "1.5×". */
export function formatCoverage(value: number | null): string {
  return value === null ? NONE : `${value.toFixed(1)}×`
}

export function formatPercent(value: number | null): string {
  return value === null ? NONE : `${Math.round(value * 100)}%`
}

export function monthLabel(month: string): string {
  return format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1), "MMM yyyy")
}

/** "Oct 2026" for a month, "Q4 2026" for a quarter. */
export function periodLabel(period: ForecastPeriod): string {
  if (period.months.length === 1) return monthLabel(period.key)
  const quarter = Math.floor((Number(period.key.slice(5, 7)) - 1) / 3) + 1
  return `Q${quarter} ${period.key.slice(0, 4)}`
}

/** Dark-mode safe: the forecast colours are theme tokens with light and dark values. */
export const CHART_COLORS = {
  won: "var(--forecast-won)",
  commit: "var(--forecast-commit)",
  bestCase: "var(--forecast-best-case)",
  pipeline: "var(--forecast-pipeline)",
  quota: "var(--foreground)",
  lost: "var(--destructive)",
} as const
