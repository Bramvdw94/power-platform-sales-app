/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): variant B "Roll-up and side panel".
// Clari-like: the Trend tab explains the week as a bridge (waterfall), managers
// adjust from a team roll-up in a side panel, Stale deals are grouped by reason
// as "Needs attention", and the Opportunity gets a change timeline.

import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import { ArrowDown, ArrowUp, Repeat } from "lucide-react"
import { RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatEuro } from "@/lib/format"
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
  FIGURE_LABEL,
  formatHours,
  historyOf,
  lastActivityDate,
  LEAD_KPIS,
  LEAD_KPIS_BEFORE,
  LEADS_BY_SOURCE,
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
import { ADJ, Delta, lastActivityText, NativeSelect, scopeIds, shortDate, signedEuro, STALE_ICON, TREND_PERIODS, TrendChart, useTrend, WARN, type Scope, type TrendPeriod } from "./shared"

const REASONS: StaleReason[] = ["noActivity", "closeDatePassed", "longInStage"]

function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-lg bg-muted p-[3px]">
      {options.map((o) => (
        <Button key={o.value} type="button" size="sm" variant={value === o.value ? "default" : "ghost"} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Button>
      ))}
    </div>
  )
}

// ---- Trend tab: the bridge ---------------------------------------------------------

const BRIDGE_CONFIG = { value: { label: "Change", color: "var(--forecast-commit)" } } satisfies ChartConfig

export function TrendTabB({ data }: { data: ForecastData }) {
  const [scope, setScope] = useState<Scope>("team")
  const [period, setPeriod] = useState<TrendPeriod>("thisMonth")
  const [weeks, setWeeks] = useState(1)
  const [picked, setPicked] = useState<BucketKey | null>(null)
  const points = useTrend(data.opportunities, data.quotas, scope, period)
  const changes = changesSince(weeks, scopeIds(scope))
  const now = points[points.length - 1].bestCase
  const start = now - changes.reduce((s, c) => s + c.delta, 0)

  // Waterfall: invisible base + visible step per bucket.
  let running = start
  const steps = [
    { name: COMPARE_OPTIONS.find((o) => o.weeks === weeks)!.label, base: 0, value: start, kind: "total" as const, key: null },
    ...BUCKETS.map((b) => {
      const delta = changes.filter((c) => c.bucket === b.key).reduce((s, c) => s + c.delta, 0)
      const from = running
      running += delta
      return { name: b.label, base: Math.min(from, running), value: Math.abs(delta), delta, kind: delta >= 0 ? ("up" as const) : ("down" as const), key: b.key }
    }).filter((s) => s.delta !== 0),
    { name: "Now", base: 0, value: now, kind: "total" as const, key: null },
  ]
  const color = (kind: string) => (kind === "total" ? "var(--forecast-commit)" : kind === "up" ? "var(--forecast-won)" : "var(--destructive)")
  const shown = picked ? changes.filter((c) => c.bucket === picked) : changes

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Whose numbers" value={scope} onChange={setScope} options={[{ value: "me", label: "Me" }, { value: "team", label: "My team" }, ...REPORTS.map((u) => ({ value: u.id, label: u.name.split(" ")[0] }))]} />
        <Segmented label="Period" value={period} onChange={setPeriod} options={TREND_PERIODS} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Trend" className="space-y-1 rounded-md border p-3">
          <h2 className="font-semibold">Last 12 Mondays</h2>
          <p className="text-xs text-muted-foreground">Calculated figures, without adjustments.</p>
          <TrendChart points={points} height="h-64" />
        </section>
        <section aria-label="What moved Best case" className="space-y-1 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">What moved Best case since</h2>
            <NativeSelect label="Compare with" value={String(weeks)} onChange={(v) => { setWeeks(Number(v)); setPicked(null) }} options={COMPARE_OPTIONS.map((o) => ({ value: String(o.weeks), label: o.label.toLowerCase() }))} className="h-8 w-36" />
          </div>
          <p className="text-xs text-muted-foreground">Click a bar to see its deals.</p>
          <div role="img" aria-label={`Best case went from ${formatEuro(start)} to ${formatEuro(now)}`}>
            <ChartContainer config={BRIDGE_CONFIG} className="aspect-auto h-64 w-full">
              <BarChart data={steps} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={48} />
                <YAxis tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} width={48} />
                <ChartTooltip
                  content={({ payload }) => {
                    const p = payload?.[1]?.payload ?? payload?.[0]?.payload
                    if (!p) return null
                    return (
                      <div className="rounded-md border bg-background px-2 py-1 text-xs shadow">
                        {p.name}: {p.kind === "total" ? formatEuro(p.value) : signedEuro(p.delta)}
                      </div>
                    )
                  }}
                />
                <Bar dataKey="base" stackId="w" fill="transparent" />
                <Bar dataKey="value" stackId="w" radius={3} onClick={(d: { key?: BucketKey | null }) => setPicked(d.key ?? null)} className="cursor-pointer">
                  {steps.map((s) => (
                    <Cell key={s.name} fill={color(s.kind)} opacity={picked && s.key !== picked ? 0.35 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        </section>
      </div>

      <section aria-label="Changed deals" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{picked ? BUCKETS.find((b) => b.key === picked)!.label : "All changes"} ({shown.length})</h2>
          {picked && <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(null)}>Show all</Button>}
        </div>
        <ul className="divide-y rounded-md border">
          {shown.map((c) => (
            <li key={c.opportunityId + c.bucket} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <Link to={`/opportunities/${c.opportunityId}`} className="font-medium text-primary hover:underline">{c.name}</Link>
                <p className="text-xs text-muted-foreground">
                  {BUCKETS.find((b) => b.key === c.bucket)!.label} · {nameOf(c.ownerId)} · {c.old} → {c.now}
                </p>
              </div>
              <Delta value={c.delta} />
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Nothing changed.</li>}
        </ul>
      </section>
    </div>
  )
}

// ---- Forecast tab: team roll-up with a side panel --------------------------------------

export function RollupB({ data, defaultGrid }: { data: ForecastData; defaultGrid: ReactNode }) {
  const months = forecastPeriods(TODAY, "month").slice(0, 3).map((p) => p.key)
  const [month, setMonth] = useState(months[0])
  const [panel, setPanel] = useState<string | null>(null)
  const people = [...REPORTS, ME]
  return (
    <div className="space-y-4">
      <section aria-label="Team roll-up" className="space-y-2 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Team roll-up</h2>
          <NativeSelect label="Month" value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} className="h-8 w-36" />
        </div>
        <ul className="divide-y">
          {people.map((p) => (
            <RollupRow key={p.id} person={p} month={month} data={data} onOpen={() => setPanel(p.id)} />
          ))}
        </ul>
      </section>
      {defaultGrid}
      <Dialog open={panel !== null} onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent className="content-start top-0 right-0 left-auto h-dvh max-h-dvh w-full max-w-md translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l sm:max-w-md data-[state=open]:slide-in-from-right">
          {panel && <SidePanel personId={panel} month={month} data={data} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RollupRow({ person, month, data, onOpen }: { person: { id: string; name: string }; month: string; data: ForecastData; onOpen: () => void }) {
  const f = calculated(data.opportunities, data.quotas, [person.id], month)
  const commit = useAdjusted(person.id, month, "commit").current
  const best = useAdjusted(person.id, month, "bestCase").current
  const own = person.id === ME.id
  const fig = (label: string, calc: number, adj: typeof commit) => (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular-nums">
        {adj ? (
          <>
            <span className={cn("rounded px-1 font-semibold", ADJ)}>{formatEuro(adj.amount ?? 0)}</span>{" "}
            <span className="text-xs text-muted-foreground">calc. {formatEuro(calc)}</span>
          </>
        ) : (
          formatEuro(calc)
        )}
      </p>
    </div>
  )
  return (
    <li className="grid grid-cols-2 items-center gap-2 py-2 text-sm sm:grid-cols-[10rem_1fr_1fr_1fr_auto]">
      <p className="col-span-2 font-medium sm:col-span-1">{person.name}</p>
      {fig("Won", f.closedWon, null)}
      {fig("Commit", f.commit, commit)}
      {fig("Best case", f.bestCase, best)}
      {own ? (
        <p className="col-span-2 text-xs text-muted-foreground sm:col-span-1">Your manager adjusts yours</p>
      ) : (
        <Button type="button" size="sm" variant="outline" className="col-span-2 sm:col-span-1" onClick={onOpen}>
          Adjust…
        </Button>
      )}
    </li>
  )
}

function SidePanel({ personId, month, data }: { personId: string; month: string; data: ForecastData }) {
  const [figure, setFigure] = useState<AdjustFigure>("commit")
  const f = calculated(data.opportunities, data.quotas, [personId], month)
  const deals = data.opportunities.filter((o) => o.ownerId === personId && o.expectedCloseDate.slice(0, 7) === month.slice(0, 7) && o.stage !== "closedLost")
  return (
    <>
      <DialogHeader>
        <DialogTitle>{nameOf(personId)}</DialogTitle>
        <DialogDescription>Forecast for {monthLabel(month)}</DialogDescription>
      </DialogHeader>
      <Segmented label="Figure" value={figure} onChange={setFigure} options={[{ value: "commit", label: "Commit" }, { value: "bestCase", label: "Best case" }]} />
      <AdjustEditor key={figure} target={{ personId, month, figure, calculated: f[figure] }} />
      <section aria-label="Deals behind the figure" className="space-y-1">
        <h3 className="text-xs font-semibold text-muted-foreground">Deals this month ({FIGURE_LABEL[figure]} counts Commit{figure === "bestCase" ? " and Best case" : ""} plus won)</h3>
        <ul className="divide-y rounded-md border text-sm">
          {deals.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
              <Link to={`/opportunities/${o.id}`} className="min-w-0 truncate text-primary hover:underline">{o.name}</Link>
              <span className="shrink-0 tabular-nums">{formatEuro(o.actualValue ?? o.estimatedValue)}</span>
            </li>
          ))}
          {deals.length === 0 && <li className="px-2 py-2 text-muted-foreground">No deals expected this month.</li>}
        </ul>
      </section>
    </>
  )
}

// ---- Team tab extras ----------------------------------------------------------------

export function TeamExtrasB({ data }: { data: ForecastData }) {
  const people = [ME, ...REPORTS]
  return (
    <>
      <NeedsAttention opportunities={data.opportunities} title="Needs attention (team)" />
      <section aria-label="Leads per person" className="space-y-2">
        <h2 className="text-lg font-semibold">Leads</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {people.map((p) => (
            <article key={p.id} aria-label={p.name} className="rounded-md border p-3">
              <h3 className="mb-2 font-semibold">{p.name}</h3>
              <LeadStrip personId={p.id} compact />
            </article>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <article className="rounded-md border p-3">
            <h3 className="mb-2 text-sm font-semibold">By Lead source (this quarter)</h3>
            <ul className="space-y-2 text-sm">
              {LEADS_BY_SOURCE.map((r) => {
                const total = r.open + r.qualified + r.disqualified
                return (
                  <li key={r.source}>
                    <div className="flex justify-between">
                      <span>{r.source}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{r.qualified} qualified · {r.disqualified} disqualified · {r.open} open</span>
                    </div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded bg-muted" aria-hidden>
                      <div style={{ width: `${(r.qualified / total) * 100}%`, background: "var(--forecast-won)" }} />
                      <div style={{ width: `${(r.disqualified / total) * 100}%`, background: "var(--destructive)" }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </article>
          <article className="rounded-md border p-3">
            <h3 className="mb-2 text-sm font-semibold">By Disqualify reason (this quarter)</h3>
            <ul className="space-y-2 text-sm">
              {DISQUALIFY_BREAKDOWN.map((r) => (
                <li key={r.reason} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2">
                  <span>{r.reason}</span>
                  <div className="h-2 rounded bg-muted" aria-hidden>
                    <div className="h-2 rounded" style={{ width: `${(r.count / 5) * 100}%`, background: "var(--forecast-best-case)" }} />
                  </div>
                  <span className="text-right tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </>
  )
}

function NeedsAttention({ opportunities, title, Section }: { opportunities: Opportunity[]; title: string; Section?: (p: { title: string; children: ReactNode }) => ReactNode }) {
  const groups = REASONS.map((r) => ({ reason: r, deals: opportunities.filter((o) => staleReasons(o).includes(r)) }))
  const body = (
    <div className="grid gap-3 md:grid-cols-3">
      {groups.map(({ reason, deals }) => {
        const Icon = STALE_ICON[reason]
        return (
          <div key={reason} className="rounded-md border p-2">
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <Icon className="size-4" aria-hidden />
              {STALE_LABEL[reason]} <span className="text-muted-foreground">({deals.length})</span>
            </h3>
            <ul className="space-y-1 text-sm">
              {deals.map((o) => (
                <li key={o.id}>
                  <Link to={`/opportunities/${o.id}`} className="text-primary hover:underline">{o.name}</Link>
                  <span className="block text-xs text-muted-foreground">{o.ownerName} · {formatEuro(o.estimatedValue)}</span>
                </li>
              ))}
              {deals.length === 0 && <li className="text-muted-foreground">None</li>}
            </ul>
          </div>
        )
      })}
    </div>
  )
  if (Section) return <Section title={title}>{body}</Section>
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {body}
    </section>
  )
}

// ---- Home ------------------------------------------------------------------------------

function Trend({ now, before, lowerIsBetter = false, format }: { now: number; before: number; lowerIsBetter?: boolean; format: (v: number) => string }) {
  if (now === before) return <span className="text-xs text-muted-foreground">same as before</span>
  const up = now > before
  const good = lowerIsBetter ? !up : up
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs", good ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
      <Icon className="size-3" aria-hidden />
      from {format(before)}
    </span>
  )
}

function LeadStrip({ personId, compact = false }: { personId: string; compact?: boolean }) {
  const k = LEAD_KPIS[personId]
  const b = LEAD_KPIS_BEFORE[personId]
  const items = [
    { label: "Open Leads", value: String(k.open), trend: <Trend now={k.open} before={b.open} format={String} /> },
    { label: "Not contacted > 2 days", value: String(k.notContacted2d), warn: k.notContacted2d > 0, href: "/leads?filter=notContacted", trend: <Trend now={k.notContacted2d} before={b.notContacted2d} lowerIsBetter format={String} /> },
    { label: "Median First touch", value: formatHours(k.firstTouchHours), trend: <Trend now={k.firstTouchHours} before={b.firstTouchHours} lowerIsBetter format={formatHours} /> },
    { label: "Qualify rate", value: `${Math.round(k.qualifyRate * 100)}%`, trend: <Trend now={k.qualifyRate} before={b.qualifyRate} format={(v) => `${Math.round(v * 100)}%`} /> },
  ]
  return (
    <dl className={cn("grid grid-cols-2", compact ? "gap-2" : "divide-x-0 gap-y-3 md:grid-cols-4 md:divide-x")}>
      {items.map((i) => (
        <div key={i.label} className={cn(!compact && "md:px-4 md:first:pl-0")}>
          <dt className="text-xs text-muted-foreground">{i.href ? <Link to={i.href} className="hover:underline">{i.label}</Link> : i.label}</dt>
          <dd className={cn("font-semibold tabular-nums", compact ? "text-lg" : "text-2xl", i.warn && "text-destructive")}>{i.value}</dd>
          <dd>{i.trend}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HomeKpisB() {
  return (
    <section aria-label="My Leads" className="rounded-md border bg-card p-3 text-card-foreground">
      <h2 className="mb-2 text-sm font-semibold">My Leads <span className="font-normal text-muted-foreground">· First touch this month, Qualify rate this quarter</span></h2>
      <LeadStrip personId={ME.id} />
    </section>
  )
}

export function HomeStaleB({ opportunities, Section }: { opportunities: Opportunity[]; Section: (p: { title: string; children: ReactNode }) => ReactNode }) {
  const mine = opportunities.filter((o) => o.ownerId === ME.id)
  const groups = REASONS.map((r) => ({ reason: r, deals: mine.filter((o) => staleReasons(o).includes(r)) })).filter((g) => g.deals.length > 0)
  return (
    <Section title="Needs attention">
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is stale.</p>
      ) : (
        <div className="space-y-3">
          {groups.map(({ reason, deals }) => {
            const Icon = STALE_ICON[reason]
            return (
              <div key={reason}>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Icon className="size-3.5" aria-hidden />
                  {STALE_LABEL[reason]}
                </h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {deals.map((o) => (
                    <li key={o.id}>
                      <Link to={`/opportunities/${o.id}`} className="font-medium text-primary hover:underline">{o.name}</Link>
                      <span className="text-muted-foreground"> · {formatEuro(o.estimatedValue)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

// ---- Pipeline card ---------------------------------------------------------------------

export const pipelineCardClassB = (o: Opportunity) => (staleReasons(o).length > 0 ? "border-l-4 border-l-amber-500" : "")

export function PipelineStaleB({ opportunity }: { opportunity: Opportunity }) {
  const reasons = staleReasons(opportunity)
  if (reasons.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Stale">
      {reasons.map((r) => {
        const Icon = STALE_ICON[r]
        return (
          <li key={r} title={STALE_LABEL[r]} className={cn("inline-flex items-center gap-1 rounded border px-1 py-0.5 text-[11px]", WARN)}>
            <Icon className="size-3" aria-hidden />
            {STALE_SHORT[r]}
          </li>
        )
      })}
    </ul>
  )
}

// ---- Opportunity record ------------------------------------------------------------------

export function oppHighlightsB(o: Opportunity) {
  return [{ label: "Last activity", value: lastActivity(o.id) }]
}

const lastActivity = (id: string) => lastActivityText(lastActivityDate(id))

export function OppHistoryB({ opportunity }: { opportunity: Opportunity }) {
  const rows = historyOf(opportunity.id)
  const pushes = pushCount(opportunity.id)
  return (
    <>
      {pushes > 0 && (
        <div role="note" className={cn("flex items-start gap-2 rounded-md border p-3 text-sm", WARN)}>
          <Repeat className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>Pushed {pushes} {pushes === 1 ? "time" : "times"}.</strong> The Expected close date moved into a later month {pushes === 1 ? "once" : `${pushes} times`}.
          </p>
        </div>
      )}
      <RecordSection title="Changes">
        <ol className="relative space-y-3 border-l pl-4">
          {rows.map((h, i) => (
            <li key={i} className="text-sm">
              <span className={cn("absolute -left-[5px] mt-1.5 size-2.5 rounded-full", h.push ? "bg-amber-500" : "bg-muted-foreground")} aria-hidden />
              <p>
                <span className="font-medium">{h.field}</span> {h.old === "—" ? "set to" : <>changed from <span className="text-muted-foreground">{h.old}</span> to</>} <span className="font-medium">{h.now}</span>
                {h.push && <span className="ml-1 text-xs font-semibold text-amber-800 dark:text-amber-300">pushed</span>}
              </p>
              <p className="text-xs text-muted-foreground">{h.by} · {shortDate(h.at)}</p>
            </li>
          ))}
        </ol>
      </RecordSection>
    </>
  )
}
