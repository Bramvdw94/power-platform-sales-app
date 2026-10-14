/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): variant A "Classic: dialogs and badges".
// Salesforce/Dynamics-like: a Trend tab with one chart and grouped Changes,
// pencil-in-cell adjustments in a dialog, an amber Stale badge, a History card.

import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, ChevronDown, ChevronRight, Pencil } from "lucide-react"
import { RecordSection } from "@/components/records/record-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatEuro, STAGE_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"
import { monthLabel, periodLabel } from "@/pages/forecast/forecast-format"
import type { ForecastData } from "@/pages/forecast/use-forecast-data"
import type { ForecastFigures, ForecastPeriod, Opportunity } from "@/sales"
import { adjustTitle, AdjustEditor, calculated, useAdjusted, type AdjustTarget } from "./adjust"
import {
  BUCKETS,
  changesSince,
  COMPARE_OPTIONS,
  DISQUALIFY_BREAKDOWN,
  formatHours,
  historyOf,
  LEAD_KPIS,
  LEADS_BY_SOURCE,
  ME,
  nameOf,
  pushCount,
  REPORTS,
  STALE_LABEL,
  staleReasons,
  TODAY,
  lastActivityDate,
  type AdjustFigure,
} from "./model"
import { ADJ, CalculatedNote, Delta, lastActivityText, NativeSelect, SCOPES, scopeIds, shortDate, TREND_PERIODS, TrendChart, useTrend, WARN, type Scope, type TrendPeriod } from "./shared"

// ---- Trend tab ----------------------------------------------------------------

export function TrendTabA({ data }: { data: ForecastData }) {
  const [scope, setScope] = useState<Scope>("team")
  const [period, setPeriod] = useState<TrendPeriod>("thisMonth")
  const [weeks, setWeeks] = useState(1)
  const points = useTrend(data.opportunities, data.quotas, scope, period)
  const changes = changesSince(weeks, scopeIds(scope))
  const [open, setOpen] = useState<Record<string, boolean>>({})

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect label="Whose numbers" value={scope} onChange={setScope} options={SCOPES} className="w-44" />
        <NativeSelect label="Period" value={period} onChange={(v) => setPeriod(v as TrendPeriod)} options={TREND_PERIODS} className="w-40" />
      </div>
      <p className="text-sm text-muted-foreground">Each point is a Monday snapshot. The chart shows calculated figures; adjustments are not included.</p>
      <TrendChart points={points} />

      <section aria-label="Changes since" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Changes since</h2>
          <NativeSelect label="Compare with" value={String(weeks)} onChange={(v) => setWeeks(Number(v))} options={COMPARE_OPTIONS.map((o) => ({ value: String(o.weeks), label: o.label }))} className="w-36" />
        </div>
        <div className="divide-y rounded-md border">
          {BUCKETS.map((b) => {
            const rows = changes.filter((c) => c.bucket === b.key)
            const isOpen = open[b.key] ?? rows.length > 0
            const total = rows.reduce((s, c) => s + c.delta, 0)
            return (
              <div key={b.key}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  disabled={rows.length === 0}
                  onClick={() => setOpen((o) => ({ ...o, [b.key]: !isOpen }))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  {isOpen && rows.length > 0 ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                  <span className="font-medium">{b.label}</span>
                  <Badge variant="secondary">{rows.length}</Badge>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{b.hint}</span>
                  <span className="ml-auto text-sm">{rows.length > 0 && <Delta value={total} />}</span>
                </button>
                {isOpen && rows.length > 0 && (
                  <ul className="space-y-2 px-3 pb-3 pl-9">
                    {rows.map((c) => (
                      <li key={c.opportunityId + c.bucket} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                        <Link to={`/opportunities/${c.opportunityId}`} className="font-medium text-primary hover:underline">
                          {c.name}
                        </Link>
                        <span className="text-muted-foreground">{nameOf(c.ownerId)}</span>
                        <span className="basis-full sm:basis-auto">
                          <span className="text-muted-foreground line-through decoration-1">{c.old}</span> → <span>{c.now}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ---- Forecast tab: adjusted cells -------------------------------------------------

const ROWS: { label: string; key: keyof ForecastFigures; figure?: AdjustFigure }[] = [
  { label: "Closed won", key: "closedWon" },
  { label: "Commit", key: "commit", figure: "commit" },
  { label: "Best case", key: "bestCase", figure: "bestCase" },
  { label: "Pipeline", key: "pipeline" },
  { label: "Weighted", key: "weighted" },
  { label: "Quota", key: "quota" },
]

/** Desktop: the forecast grid with Commit and Best case adjustable per month; phone: one month at a time. */
export function ForecastGridA({ data, scope, periods, figures, isDesktop }: { data: ForecastData; scope: Scope; periods: ForecastPeriod[]; figures: ForecastFigures[]; isDesktop: boolean }) {
  const personCalc = (id: string, month: string, figure: AdjustFigure) => calculated(data.opportunities, data.quotas, [id], month)[figure]
  const [target, setTarget] = useState<AdjustTarget | null>(null)
  const [index, setIndex] = useState(0)
  const person = scope === "me" ? ME.id : scope === "team" ? null : scope
  const monthly = periods[0].months.length === 1
  const cell = (row: (typeof ROWS)[number], f: ForecastFigures, p: ForecastPeriod) => {
    const value = f[row.key] as number | null
    if (!row.figure || !monthly) return <span className="tabular-nums">{value === null ? "—" : formatEuro(value)}</span>
    return <AdjustableCell personId={person} month={p.key} figure={row.figure} calculated={value ?? 0} onAdjust={setTarget} team={scope === "team"} personCalc={personCalc} />
  }

  return (
    <>
      {scope !== "me" && monthly && (
        <p className="text-sm text-muted-foreground">
          {scope === "team" ? "The team total adds up each person's adjusted figure. Your own manager can adjust the total." : "Click the pencil on Commit or Best case to adjust a month. A note is required."}
        </p>
      )}
      {scope === "me" && <p className="text-sm text-muted-foreground">Your own figures are adjusted by your manager, not by you.</p>}
      {isDesktop ? (
        <div className="overflow-x-auto rounded-md border">
          <table aria-label="Forecast figures" className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">
                  <span className="sr-only">Figure</span>
                </th>
                {periods.map((p) => (
                  <th key={p.key} scope="col" className="px-3 py-2 text-right font-medium">
                    {periodLabel(p)}
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
                    <td key={periods[i].key} className="px-3 py-2 text-right align-top">
                      {cell(row, f, periods[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section aria-label="Forecast period" className="space-y-3">
          <NativeSelect label="Month" value={String(index)} onChange={(v) => setIndex(Number(v))} options={periods.map((p, i) => ({ value: String(i), label: periodLabel(p) }))} className="w-full" />
          <dl className="divide-y rounded-md border">
            {ROWS.map((row) => (
              <div key={row.label} className="flex items-start justify-between px-3 py-2 text-sm">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="text-right font-medium">{cell(row, figures[index], periods[index])}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {target && (
            <>
              <DialogHeader>
                <DialogTitle>Adjust {target.figure === "commit" ? "Commit" : "Best case"}</DialogTitle>
                <DialogDescription>{adjustTitle(target)}</DialogDescription>
              </DialogHeader>
              <AdjustEditor target={target} onDone={() => setTarget(null)} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function AdjustableCell({ personId, month, figure, calculated: calc, onAdjust, team, personCalc }: {
  personId: string | null
  month: string
  figure: AdjustFigure
  calculated: number
  onAdjust: (t: AdjustTarget) => void
  team: boolean
  personCalc: (id: string, month: string, figure: AdjustFigure) => number
}) {
  const own = useAdjusted(personId ?? "team", month, figure).current
  const a1 = useAdjusted(REPORTS[0].id, month, figure).current
  const a2 = useAdjusted(REPORTS[1].id, month, figure).current
  if (team) {
    // The team total counts each person's adjusted figure where there is one.
    const offset = [a1, a2].reduce((s, a, i) => s + (a ? (a.amount ?? 0) - personCalc(REPORTS[i].id, month, figure) : 0), 0)
    if (offset === 0) return <span className="tabular-nums">{formatEuro(calc)}</span>
    return (
      <span className="text-right">
        <span className="inline-flex items-center gap-1">
          <Badge className={cn("px-1.5 py-0 text-[10px]", ADJ)}>Incl. adjustments</Badge>
          <span className="font-semibold tabular-nums">{formatEuro(calc + offset)}</span>
        </span>
        <CalculatedNote amount={calc} />
      </span>
    )
  }
  const editable = personId !== null && personId !== ME.id
  return (
    <span className="inline-flex items-start justify-end gap-1">
      <span className="text-right">
        {own ? (
          <>
            <span className="inline-flex items-center gap-1">
              <Badge className={cn("px-1.5 py-0 text-[10px]", ADJ)}>Adjusted</Badge>
              <span className="font-semibold tabular-nums">{formatEuro(own.amount ?? 0)}</span>
            </span>
            <CalculatedNote amount={calc} />
          </>
        ) : (
          <span className="tabular-nums">{formatEuro(calc)}</span>
        )}
      </span>
      {editable && (
        <Button type="button" variant="ghost" size="icon" className="-my-1 size-7" aria-label={`Adjust ${figure === "commit" ? "Commit" : "Best case"} ${monthLabel(month)}`} onClick={() => onAdjust({ personId, month, figure, calculated: calc })}>
          <Pencil className="size-3.5" />
        </Button>
      )}
    </span>
  )
}

// ---- Team tab extras ----------------------------------------------------------------

export function TeamExtrasA({ data }: { data: ForecastData }) {
  const stale = data.opportunities.map((o) => ({ o, reasons: staleReasons(o) })).filter((s) => s.reasons.length > 0)
  const people = [ME, ...REPORTS]
  return (
    <>
      <section aria-label="Stale deals" className="space-y-2">
        <h2 className="text-lg font-semibold">Stale deals ({stale.length})</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 text-left font-medium">Opportunity</th>
                <th scope="col" className="hidden px-3 py-2 text-left font-medium md:table-cell">Owner</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Why</th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium md:table-cell">Value</th>
              </tr>
            </thead>
            <tbody>
              {stale.map(({ o, reasons }) => (
                <tr key={o.id} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2">
                    <Link to={`/opportunities/${o.id}`} className="font-medium text-primary hover:underline">{o.name}</Link>
                    <span className="block text-xs text-muted-foreground md:hidden">{o.ownerName}</span>
                  </td>
                  <td className="hidden px-3 py-2 md:table-cell">{o.ownerName}</td>
                  <td className="px-3 py-2">
                    <ReasonChips reasons={reasons} />
                  </td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatEuro(o.estimatedValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Leads per person" className="space-y-2">
        <h2 className="text-lg font-semibold">Leads</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b">
                {["Salesperson", "Open Leads", "Not contacted > 2 days", "Median First touch (month)", "Qualify rate (quarter)"].map((h, i) => (
                  <th key={h} scope="col" className={cn("px-3 py-2 font-medium", i === 0 ? "text-left" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const k = LEAD_KPIS[p.id]
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-medium">{p.name}</th>
                    <td className="px-3 py-2 text-right tabular-nums">{k.open}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", k.notContacted2d > 0 && "font-semibold text-destructive")}>{k.notContacted2d}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(k.firstTouchHours)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(k.qualifyRate * 100)}% <span className="text-muted-foreground">({k.qualified}/{k.closed})</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <SimpleTable title="By Lead source (this quarter)" head={["Lead source", "Open", "Qualified", "Disqualified"]} rows={LEADS_BY_SOURCE.map((r) => [r.source, r.open, r.qualified, r.disqualified])} />
          <SimpleTable title="By Disqualify reason (this quarter)" head={["Reason", "Leads"]} rows={DISQUALIFY_BREAKDOWN.map((r) => [r.reason, r.count])} />
        </div>
      </section>
    </>
  )
}

function SimpleTable({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="rounded-md border">
      <h3 className="border-b px-3 py-2 text-sm font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {head.map((h, i) => <th key={h} scope="col" className={cn("px-3 py-1.5 font-medium", i === 0 ? "text-left" : "text-right")}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])} className="border-b last:border-0">
              {r.map((v, i) => <td key={i} className={cn("px-3 py-1.5", i === 0 ? "text-left" : "text-right tabular-nums")}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ReasonChips({ reasons }: { reasons: (keyof typeof STALE_LABEL)[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span key={r} className={cn("rounded border px-1.5 py-0.5 text-xs", WARN)}>{STALE_LABEL[r]}</span>
      ))}
    </span>
  )
}

// ---- Home ------------------------------------------------------------------------------

export function HomeKpisA() {
  const k = LEAD_KPIS[ME.id]
  return (
    <section aria-label="My Leads">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Open Leads" value={String(k.open)} />
        <KpiTile label="Not contacted > 2 days" value={String(k.notContacted2d)} href="/leads?filter=notContacted" note={k.notContacted2d === 0 ? "All contacted in time" : "Open the list"} />
        <KpiTile label="Median First touch" value={formatHours(k.firstTouchHours)} note="This month" />
        <KpiTile label="Qualify rate" value={`${Math.round(k.qualifyRate * 100)}%`} note={`${k.qualified} of ${k.closed} this quarter`} />
      </ul>
    </section>
  )
}

function KpiTile({ label, value, note, href }: { label: string; value: string; note?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </>
  )
  return (
    <li role="group" aria-label={label} className="rounded-md border bg-card p-3 text-card-foreground">
      {href ? <Link to={href} className="block hover:underline">{body}</Link> : body}
    </li>
  )
}

export function HomeStaleA({ opportunities, Section }: { opportunities: Opportunity[]; Section: (p: { title: string; children: ReactNode }) => ReactNode }) {
  const mine = opportunities.filter((o) => o.ownerId === ME.id).map((o) => ({ o, reasons: staleReasons(o) })).filter((s) => s.reasons.length > 0)
  return (
    <Section title={`Stale deals (${mine.length})`}>
      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">None of your deals are stale.</p>
      ) : (
        <ul className="divide-y">
          {mine.map(({ o, reasons }) => (
            <li key={o.id} className="space-y-1 py-2 first:pt-0 last:pb-0">
              <Link to={`/opportunities/${o.id}`} className="font-medium text-primary hover:underline">{o.name}</Link>
              <p className="text-sm text-muted-foreground">{[o.accountName, STAGE_LABELS[o.stage], formatEuro(o.estimatedValue)].join(" · ")}</p>
              <ReasonChips reasons={reasons} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// ---- Pipeline card ---------------------------------------------------------------------

export function PipelineStaleA({ opportunity }: { opportunity: Opportunity }) {
  const reasons = staleReasons(opportunity)
  if (reasons.length === 0) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={cn("inline-flex w-fit items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium", WARN)} aria-label={`Stale: ${reasons.map((r) => STALE_LABEL[r]).join(", ")}`}>
          <AlertTriangle className="size-3" aria-hidden />
          Stale
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <ul>{reasons.map((r) => <li key={r}>{STALE_LABEL[r]}</li>)}</ul>
      </TooltipContent>
    </Tooltip>
  )
}

// ---- Opportunity record ------------------------------------------------------------------

export function oppHighlightsA(o: Opportunity) {
  const pushes = pushCount(o.id)
  const reasons = staleReasons(o)
  return [
    { label: "Last activity", value: lastActivityText(lastActivityDate(o.id)) },
    { label: "Push count", value: pushes === 0 ? "0" : <span className={cn(pushes >= 2 && "font-semibold text-destructive")}>{pushes}</span> },
    ...(reasons.length > 0 ? [{ label: "Stale", value: <ReasonChips reasons={reasons} /> }] : []),
  ]
}

export function OppHistoryA({ opportunity }: { opportunity: Opportunity }) {
  const rows = historyOf(opportunity.id)
  return (
    <RecordSection title="History">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-1.5 pr-3 text-left font-medium">Date</th>
              <th scope="col" className="py-1.5 pr-3 text-left font-medium">Field</th>
              <th scope="col" className="py-1.5 pr-3 text-left font-medium">Old → New</th>
              <th scope="col" className="hidden py-1.5 text-left font-medium md:table-cell">By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => (
              <tr key={i} className="border-b last:border-0 align-top">
                <td className="py-1.5 pr-3 whitespace-nowrap">{shortDate(h.at)}</td>
                <td className="py-1.5 pr-3">
                  {h.field}
                  {h.push && <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">Push</Badge>}
                </td>
                <td className="py-1.5 pr-3">
                  <span className="text-muted-foreground">{h.old}</span> → {h.now}
                </td>
                <td className="hidden py-1.5 md:table-cell">{h.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Stage, Estimated value, Expected close date, Probability and Forecast category. Today is {shortDate(TODAY)}.</p>
    </RecordSection>
  )
}

