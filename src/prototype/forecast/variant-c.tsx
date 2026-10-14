/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): variant C "Inline grid".
// Dynamics-forecast-grid-like: small multiples and one flat Changes table on the
// Trend tab, a people × months roll-up where you click a cell to adjust in a
// popover, sparkline KPI tiles, and quiet text cues for Stale.

import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowUpDown } from "lucide-react"
import { Line, LineChart } from "recharts"
import { RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { ChartContainer } from "@/components/ui/chart"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatEuro, STAGE_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"
import { monthLabel } from "@/pages/forecast/forecast-format"
import type { ForecastData } from "@/pages/forecast/use-forecast-data"
import type { Opportunity } from "@/sales"
import { forecastPeriods } from "@/sales"
import { AdjustEditor, calculated, useAdjusted } from "./adjust"
import {
  BUCKETS,
  changesSince,
  COMPARE_OPTIONS,
  DISQUALIFY_BREAKDOWN,
  formatHours,
  historyOf,
  LEAD_KPIS,
  LEAD_KPIS_BEFORE,
  LEADS_BY_SOURCE,
  lastActivityDate,
  ME,
  nameOf,
  pushCount,
  REPORTS,
  STALE_LABEL,
  STALE_SHORT,
  staleReasons,
  TODAY,
  type AdjustFigure,
  type BucketKey,
  type StaleReason,
} from "./model"
import { ADJ, Delta, lastActivityText, NativeSelect, SCOPES, scopeIds, shortDate, TREND_CONFIG, TREND_PERIODS, TrendChart, useTrend, type Scope, type TrendPeriod } from "./shared"

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  )
}

// ---- Trend tab ---------------------------------------------------------------------------

const FIGURES = [
  { key: "closedWon", label: "Closed won" },
  { key: "commit", label: "Commit" },
  { key: "bestCase", label: "Best case" },
  { key: "pipeline", label: "Pipeline" },
] as const

export function TrendTabC({ data }: { data: ForecastData }) {
  const [scope, setScope] = useState<Scope>("team")
  const [period, setPeriod] = useState<TrendPeriod>("thisMonth")
  const [weeks, setWeeks] = useState(1)
  const [bucket, setBucket] = useState<BucketKey | "all">("all")
  const [sortByDelta, setSortByDelta] = useState(false)
  const points = useTrend(data.opportunities, data.quotas, scope, period)
  const last = points[points.length - 1]
  const then = points[points.length - 1 - weeks]
  const changes = changesSince(weeks, scopeIds(scope))
  const rows = (bucket === "all" ? changes : changes.filter((c) => c.bucket === bucket)).slice().sort((a, b) => (sortByDelta ? Math.abs(b.delta) - Math.abs(a.delta) : 0))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect label="Whose numbers" value={scope} onChange={setScope} options={SCOPES} className="w-44" />
        <NativeSelect label="Period" value={period} onChange={(v) => setPeriod(v as TrendPeriod)} options={TREND_PERIODS} className="w-40" />
        <NativeSelect label="Compare with" value={String(weeks)} onChange={(v) => setWeeks(Number(v))} options={COMPARE_OPTIONS.map((o) => ({ value: String(o.weeks), label: `vs ${o.label.toLowerCase()}` }))} className="w-44" />
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {FIGURES.map((f) => (
          <li key={f.key} role="group" aria-label={f.label} className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{f.label}</p>
            <p className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">{formatEuro(last[f.key])}</span>
              <Delta value={last[f.key] - then[f.key]} />
            </p>
            {last.quota !== null && <p className="text-xs text-muted-foreground">Quota {formatEuro(last.quota)}</p>}
            <TrendChart points={points} height="h-24" only={[f.key, "quota"]} />
          </li>
        ))}
      </ul>

      <section aria-label="Changes since" className="space-y-2">
        <h2 className="text-lg font-semibold">Changes since {COMPARE_OPTIONS.find((o) => o.weeks === weeks)!.label.toLowerCase()}</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Change type">
          <Chip active={bucket === "all"} onClick={() => setBucket("all")}>All {changes.length}</Chip>
          {BUCKETS.map((b) => {
            const n = changes.filter((c) => c.bucket === b.key).length
            return n > 0 ? (
              <Chip key={b.key} active={bucket === b.key} onClick={() => setBucket(b.key)}>
                {b.label} {n}
              </Chip>
            ) : null
          })}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">Opportunity</th>
                <th scope="col" className="hidden px-3 py-2 text-left font-medium md:table-cell">Change</th>
                <th scope="col" className="hidden px-3 py-2 text-left font-medium lg:table-cell">Was</th>
                <th scope="col" className="hidden px-3 py-2 text-left font-medium lg:table-cell">Now</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => setSortByDelta((v) => !v)} aria-pressed={sortByDelta}>
                    Effect <ArrowUpDown className="size-3" aria-hidden />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.opportunityId + c.bucket} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2">
                    <Link to={`/opportunities/${c.opportunityId}`} className="font-medium text-primary hover:underline">{c.name}</Link>
                    <span className="block text-xs text-muted-foreground">{nameOf(c.ownerId)}<span className="md:hidden"> · {BUCKETS.find((b) => b.key === c.bucket)!.label}</span></span>
                    <span className="block text-xs lg:hidden">{c.old} → {c.now}</span>
                  </td>
                  <td className="hidden px-3 py-2 md:table-cell">{BUCKETS.find((b) => b.key === c.bucket)!.label}</td>
                  <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">{c.old}</td>
                  <td className="hidden px-3 py-2 lg:table-cell">{c.now}</td>
                  <td className="px-3 py-2 text-right"><Delta value={c.delta} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ---- Forecast tab: people × months roll-up with inline adjustments ---------------------------

export function RollupGridC({ data, scope, isDesktop }: { data: ForecastData; scope: Scope; isDesktop: boolean }) {
  const months = forecastPeriods(TODAY, "month").slice(0, 3).map((p) => p.key)
  const people = scope === "me" ? [ME] : scope === "team" ? [...REPORTS, ME] : REPORTS.filter((u) => u.id === scope)
  const ids = people.map((p) => p.id)
  const cols: { key: "closedWon" | AdjustFigure | "quota"; label: string }[] = [
    { key: "commit", label: "Commit" },
    { key: "bestCase", label: "Best case" },
    { key: "quota", label: "Quota" },
  ]
  const hint = <p className="text-sm text-muted-foreground">Click a Commit or Best case figure of someone who reports to you to adjust it. A dot marks an adjusted figure; hover it for the calculated one.</p>

  if (!isDesktop) {
    return (
      <div className="space-y-3">
        {hint}
        {people.map((p) => (
          <article key={p.id} aria-label={p.name} className="rounded-md border p-3">
            <h3 className="mb-2 font-semibold">{p.name}</h3>
            <dl className="space-y-2 text-sm">
              {months.map((m) => {
                const f = calculated(data.opportunities, data.quotas, [p.id], m)
                return (
                  <div key={m} className="grid grid-cols-[5rem_1fr_1fr] items-start gap-2">
                    <dt className="text-muted-foreground">{monthLabel(m)}</dt>
                    <dd><span className="block text-xs text-muted-foreground">Commit</span><GridCell personId={p.id} month={m} figure="commit" calc={f.commit} /></dd>
                    <dd><span className="block text-xs text-muted-foreground">Best case</span><GridCell personId={p.id} month={m} figure="bestCase" calc={f.bestCase} /></dd>
                  </div>
                )
              })}
            </dl>
          </article>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {hint}
      <div className="overflow-x-auto rounded-md border">
        <table aria-label="Forecast roll-up" className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b">
              <th scope="col" rowSpan={2} className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">Salesperson</th>
              {months.map((m) => (
                <th key={m} scope="colgroup" colSpan={cols.length} className="border-l px-3 pt-2 text-center font-medium">{monthLabel(m)}</th>
              ))}
            </tr>
            <tr className="border-b">
              {months.map((m) => cols.map((c, i) => (
                <th key={m + c.key} scope="col" className={cn("px-3 pb-2 text-right text-xs font-normal text-muted-foreground", i === 0 && "border-l")}>{c.label}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-b">
                <th scope="row" className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">
                  {p.name}
                  {p.id === ME.id && <span className="block text-xs font-normal text-muted-foreground">Only your manager adjusts yours</span>}
                </th>
                {months.map((m) => {
                  const f = calculated(data.opportunities, data.quotas, [p.id], m)
                  return cols.map((c, i) => (
                    <td key={m + c.key} className={cn("px-2 py-1 text-right", i === 0 && "border-l")}>
                      {c.key === "commit" || c.key === "bestCase" ? (
                        <GridCell personId={p.id} month={m} figure={c.key} calc={f[c.key]} />
                      ) : (
                        <span className="px-1 tabular-nums">{c.key === "quota" ? (f.quota === null ? "—" : formatEuro(f.quota)) : formatEuro(f.closedWon)}</span>
                      )}
                    </td>
                  ))
                })}
              </tr>
            ))}
            {people.length > 1 && (
              <tr className="bg-muted/50 font-semibold">
                <th scope="row" className="sticky left-0 z-10 bg-muted px-3 py-2 text-left">Team total</th>
                {months.map((m) => {
                  const f = calculated(data.opportunities, data.quotas, ids, m)
                  return cols.map((c, i) => (
                    <td key={m + c.key} className={cn("px-3 py-2 text-right tabular-nums", i === 0 && "border-l")}>
                      {c.key === "quota" ? (f.quota === null ? "—" : formatEuro(f.quota)) : <TeamTotal ids={ids} month={m} figureKey={c.key} calc={f[c.key]} data={data} />}
                    </td>
                  ))
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TeamTotal({ ids, month, figureKey, calc, data }: { ids: string[]; month: string; figureKey: "closedWon" | AdjustFigure; calc: number; data: ForecastData }) {
  const a = useAdjusted(REPORTS[0].id, month, figureKey === "closedWon" ? "commit" : figureKey).current
  const b = useAdjusted(REPORTS[1].id, month, figureKey === "closedWon" ? "commit" : figureKey).current
  if (figureKey === "closedWon") return <>{formatEuro(calc)}</>
  const offset = [a, b].reduce((s, adj, i) => (adj && ids.includes(REPORTS[i].id) ? s + (adj.amount ?? 0) - calculated(data.opportunities, data.quotas, [REPORTS[i].id], month)[figureKey] : s), 0)
  if (offset === 0) return <>{formatEuro(calc)}</>
  return (
    <span title={`Calculated ${formatEuro(calc)}`} className="inline-flex items-center gap-1">
      <span className="size-1.5 rounded-full bg-violet-600 dark:bg-violet-400" aria-hidden />
      {formatEuro(calc + offset)}
      <span className="sr-only">, includes adjustments; calculated {formatEuro(calc)}</span>
    </span>
  )
}

function GridCell({ personId, month, figure, calc }: { personId: string; month: string; figure: AdjustFigure; calc: number }) {
  const { current } = useAdjusted(personId, month, figure)
  const [open, setOpen] = useState(false)
  const shown = current ? (current.amount ?? 0) : calc
  const label = (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {current && <span className="size-1.5 rounded-full bg-violet-600 dark:bg-violet-400" aria-hidden />}
      {formatEuro(shown)}
      {current && <span className="sr-only">, adjusted; calculated {formatEuro(calc)}</span>}
    </span>
  )
  if (personId === ME.id) return <span className="px-1" title={current ? `Calculated ${formatEuro(calc)}` : undefined}>{label}</span>
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={current ? `Adjusted. Calculated ${formatEuro(calc)}` : "Click to adjust"}
          aria-label={`${nameOf(personId)} ${figure === "commit" ? "Commit" : "Best case"} ${monthLabel(month)}: ${formatEuro(shown)}${current ? ", adjusted" : ""}. Adjust`}
          className={cn("rounded px-1 py-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", current && ADJ)}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <p className="mb-2 text-sm font-semibold">
          {nameOf(personId)} · {figure === "commit" ? "Commit" : "Best case"} · {monthLabel(month)}
        </p>
        <AdjustEditor target={{ personId, month, figure, calculated: calc }} onDone={() => setOpen(false)} compact />
      </PopoverContent>
    </Popover>
  )
}

// ---- Team tab extras ----------------------------------------------------------------

export function TeamExtrasC({ data }: { data: ForecastData }) {
  const [reason, setReason] = useState<StaleReason | "all">("all")
  const stale = data.opportunities.map((o) => ({ o, reasons: staleReasons(o) })).filter((s) => s.reasons.length > 0)
  const shown = reason === "all" ? stale : stale.filter((s) => s.reasons.includes(reason))
  return (
    <>
      <section aria-label="Stale deals" className="space-y-2">
        <h2 className="text-lg font-semibold">Stale deals</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reason">
          <Chip active={reason === "all"} onClick={() => setReason("all")}>All {stale.length}</Chip>
          {(["noActivity", "closeDatePassed", "longInStage"] as const).map((r) => (
            <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
              {STALE_SHORT[r]} {stale.filter((s) => s.reasons.includes(r)).length}
            </Chip>
          ))}
        </div>
        <StaleTable rows={shown} />
      </section>
      <section aria-label="Leads per person" className="space-y-2">
        <h2 className="text-lg font-semibold">Leads</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b">
                {["Salesperson", "Open", "Not contacted > 2 d", "First touch", "Qualify rate"].map((h, i) => (
                  <th key={h} scope="col" className={cn("px-3 py-2 font-medium", i === 0 ? "text-left" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[ME, ...REPORTS].map((p) => {
                const k = LEAD_KPIS[p.id]
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-medium">{p.name}</th>
                    <td className="px-3 py-2 text-right tabular-nums">{k.open}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", k.notContacted2d > 0 && "text-destructive")}>{k.notContacted2d}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(k.firstTouchHours)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-16 rounded bg-muted" aria-hidden><span className="block h-1.5 rounded" style={{ width: `${k.qualifyRate * 100}%`, background: "var(--forecast-won)" }} /></span>
                        <span className="tabular-nums">{Math.round(k.qualifyRate * 100)}%</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">By Lead source and Disqualify reason</summary>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <ul className="space-y-1">
              {LEADS_BY_SOURCE.map((r) => (
                <li key={r.source} className="flex justify-between"><span>{r.source}</span><span className="tabular-nums">{r.qualified}/{r.qualified + r.disqualified} qualified · {r.open} open</span></li>
              ))}
            </ul>
            <ul className="space-y-1">
              {DISQUALIFY_BREAKDOWN.map((r) => (
                <li key={r.reason} className="flex justify-between"><span>{r.reason}</span><span className="tabular-nums">{r.count}</span></li>
              ))}
            </ul>
          </div>
        </details>
      </section>
    </>
  )
}

function StaleTable({ rows }: { rows: { o: Opportunity; reasons: StaleReason[] }[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th scope="col" className="px-3 py-2 text-left font-medium">Opportunity</th>
            <th scope="col" className="hidden px-3 py-2 text-left font-medium md:table-cell">Stage</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">Last activity</th>
            <th scope="col" className="hidden px-3 py-2 text-left font-medium md:table-cell">Expected close</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ o, reasons }) => (
            <tr key={o.id} className="border-b last:border-0 align-top">
              <td className="px-3 py-2">
                <Link to={`/opportunities/${o.id}`} className="font-medium text-primary hover:underline">{o.name}</Link>
                <span className="block text-xs text-muted-foreground">{o.ownerName} · {reasons.map((r) => STALE_SHORT[r]).join(", ")}</span>
              </td>
              <td className={cn("hidden px-3 py-2 md:table-cell", reasons.includes("longInStage") && "font-semibold text-amber-800 dark:text-amber-300")}>{STAGE_LABELS[o.stage]}</td>
              <td className={cn("px-3 py-2", reasons.includes("noActivity") && "font-semibold text-amber-800 dark:text-amber-300")}>{shortDate(lastActivityDate(o.id) ?? TODAY)}</td>
              <td className={cn("hidden px-3 py-2 md:table-cell", reasons.includes("closeDatePassed") && "font-semibold text-destructive")}>{shortDate(o.expectedCloseDate)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-muted-foreground">Nothing stale.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---- Home ------------------------------------------------------------------------------

function Spark({ values }: { values: number[] }) {
  return (
    <ChartContainer config={{ v: { label: "Trend", color: TREND_CONFIG.commit.color } }} className="aspect-auto h-8 w-full" aria-hidden>
      <LineChart data={values.map((v) => ({ v }))} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <Line dataKey="v" stroke="var(--color-v)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  )
}

export function HomeKpisC({ opportunities }: { opportunities: Opportunity[] }) {
  const k = LEAD_KPIS[ME.id]
  const b = LEAD_KPIS_BEFORE[ME.id]
  const [showStale, setShowStale] = useState(false)
  const stale = opportunities.filter((o) => o.ownerId === ME.id).map((o) => ({ o, reasons: staleReasons(o) })).filter((s) => s.reasons.length > 0)
  const tiles = [
    { label: "Open Leads", value: String(k.open), spark: [5, 6, 4, 5, b.open, k.open] },
    { label: "Not contacted > 2 days", value: String(k.notContacted2d), spark: [2, 1, 3, 1, b.notContacted2d, k.notContacted2d], href: "/leads?filter=notContacted" },
    { label: "Median First touch", value: formatHours(k.firstTouchHours), spark: [14, 12, 10, 11, b.firstTouchHours, k.firstTouchHours] },
    { label: "Qualify rate", value: `${Math.round(k.qualifyRate * 100)}%`, spark: [0.3, 0.35, 0.33, 0.42, b.qualifyRate, k.qualifyRate] },
  ]
  return (
    <section aria-label="Leads and Stale deals" className="space-y-2">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <li key={t.label} role="group" aria-label={t.label} className="rounded-md border bg-card p-3 text-card-foreground">
            <p className="text-xs text-muted-foreground">{t.href ? <Link to={t.href} className="hover:underline">{t.label}</Link> : t.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{t.value}</p>
            <Spark values={t.spark} />
          </li>
        ))}
        <li role="group" aria-label="Stale deals" className="col-span-2 rounded-md border bg-card p-3 text-card-foreground md:col-span-1">
          <p className="text-xs text-muted-foreground">Stale deals</p>
          <p className="text-2xl font-semibold tabular-nums">{stale.length}</p>
          <Button type="button" variant="link" className="h-auto p-0 text-xs" aria-expanded={showStale} onClick={() => setShowStale((v) => !v)}>
            {showStale ? "Hide" : "Show which"}
          </Button>
        </li>
      </ul>
      {showStale && <StaleTable rows={stale} />}
    </section>
  )
}

// ---- Pipeline card ---------------------------------------------------------------------

export function PipelineStaleC({ opportunity }: { opportunity: Opportunity }) {
  const reasons = staleReasons(opportunity)
  if (reasons.length === 0) return null
  return <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Stale: {reasons.map((r) => STALE_SHORT[r].toLowerCase()).join(", ")}</p>
}

// ---- Opportunity record ------------------------------------------------------------------

export function oppHighlightsC(o: Opportunity) {
  const pushes = pushCount(o.id)
  return [
    { label: "Last activity", value: lastActivityText(lastActivityDate(o.id)) },
    ...(pushes > 0 ? [{ label: "Pushed", value: <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100")}>{pushes}×</span> }] : []),
  ]
}

const FIELDS = ["Stage", "Estimated value", "Expected close date", "Probability", "Forecast category"]

export function OppHistoryC({ opportunity }: { opportunity: Opportunity }) {
  const [field, setField] = useState<string>("all")
  const rows = historyOf(opportunity.id).filter((h) => field === "all" || h.field === field)
  const reasons = staleReasons(opportunity)
  return (
    <RecordSection title="History">
      {reasons.length > 0 && <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">Stale: {reasons.map((r) => STALE_LABEL[r].toLowerCase()).join("; ")}.</p>}
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Field">
        <Chip active={field === "all"} onClick={() => setField("all")}>All</Chip>
        {FIELDS.map((f) => <Chip key={f} active={field === f} onClick={() => setField(f)}>{f}</Chip>)}
      </div>
      <ul className="divide-y text-sm">
        {rows.map((h, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
            <span className="w-24 shrink-0 text-xs text-muted-foreground">{shortDate(h.at)}</span>
            <span className="font-medium">{h.field}</span>
            <span><span className="text-muted-foreground">{h.old}</span> → {h.now}</span>
            {h.push && <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">push</span>}
            <span className="ml-auto text-xs text-muted-foreground">{h.by}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-muted-foreground">No changes to this field.</li>}
      </ul>
    </RecordSection>
  )
}
