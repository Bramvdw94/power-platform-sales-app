/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): mounts the #161 variants on the real
// Forecast, Home, Pipeline and record pages, switched with ?variant=A|B|C.

import type { ReactNode } from "react"
import { RecordSection } from "@/components/records/record-page"
import type { ForecastData } from "@/pages/forecast/use-forecast-data"
import type { ForecastFigures, ForecastPeriod, Opportunity } from "@/sales"
import { lastActivityDate } from "./model"
import { PrototypeSwitcher, useVariant } from "./prototype-switcher"
import { lastActivityText, VARIANTS, type Scope } from "./shared"
import { ForecastGridA, HomeKpisA, HomeStaleA, oppHighlightsA, OppHistoryA, PipelineStaleA, TeamExtrasA, TrendTabA } from "./variant-a"
import { HomeKpisB, HomeStaleB, oppHighlightsB, OppHistoryB, pipelineCardClassB, PipelineStaleB, RollupB, TeamExtrasB, TrendTabB } from "./variant-b"
import { HomeKpisC, oppHighlightsC, OppHistoryC, PipelineStaleC, RollupGridC, TeamExtrasC, TrendTabC } from "./variant-c"

const KEYS = VARIANTS.map((v) => v.key)
const Section = ({ title, children }: { title: string; children: ReactNode }) => <RecordSection title={title}>{children}</RecordSection>

export function ProtoSwitcher() {
  return <PrototypeSwitcher variants={VARIANTS} current={useVariant(KEYS)} />
}

export function ProtoTrendTab({ data }: { data: ForecastData }) {
  const v = useVariant(KEYS)
  return v === "B" ? <TrendTabB data={data} /> : v === "C" ? <TrendTabC data={data} /> : <TrendTabA data={data} />
}

/** Replaces the Forecast tab's grid (and phone pager). */
export function ProtoForecastGrid(props: { data: ForecastData; scope: Scope; periods: ForecastPeriod[]; figures: ForecastFigures[]; isDesktop: boolean; defaultGrid: ReactNode }) {
  const v = useVariant(KEYS)
  if (v === "B") return <RollupB data={props.data} defaultGrid={props.defaultGrid} />
  if (v === "C") return props.periods[0].months.length === 1 ? <RollupGridC data={props.data} scope={props.scope} isDesktop={props.isDesktop} /> : <>{props.defaultGrid}</>
  return <ForecastGridA {...props} />
}

export function ProtoTeamExtras({ data }: { data: ForecastData }) {
  const v = useVariant(KEYS)
  return v === "B" ? <TeamExtrasB data={data} /> : v === "C" ? <TeamExtrasC data={data} /> : <TeamExtrasA data={data} />
}

/** Home: the Lead KPI row under My numbers, and the Stale card in the grid. */
export function useProtoHome(opportunities: Opportunity[] | undefined) {
  const v = useVariant(KEYS)
  const opps = opportunities ?? []
  return {
    kpis: v === "B" ? <HomeKpisB /> : v === "C" ? <HomeKpisC opportunities={opps} /> : <HomeKpisA />,
    staleCard: v === "B" ? <HomeStaleB opportunities={opps} Section={Section} /> : v === "C" ? null : <HomeStaleA opportunities={opps} Section={Section} />,
  }
}

export function useProtoPipelineCard() {
  const v = useVariant(KEYS)
  return {
    className: (o: Opportunity) => (v === "B" ? pipelineCardClassB(o) : ""),
    extra: (o: Opportunity) => (v === "B" ? <PipelineStaleB opportunity={o} /> : v === "C" ? <PipelineStaleC opportunity={o} /> : <PipelineStaleA opportunity={o} />),
  }
}

export function useProtoOpportunity() {
  const v = useVariant(KEYS)
  return {
    highlights: (o: Opportunity) => (v === "B" ? oppHighlightsB(o) : v === "C" ? oppHighlightsC(o) : oppHighlightsA(o)),
    history: (o: Opportunity) => (v === "B" ? <OppHistoryB opportunity={o} /> : v === "C" ? <OppHistoryC opportunity={o} /> : <OppHistoryA opportunity={o} />),
  }
}

/** Last activity in record headers and list columns (same in every variant). */
export const lastActivityHighlight = (id: string) => ({ label: "Last activity", value: lastActivityText(lastActivityDate(id)) })
export const lastActivityCell = (id: string) => {
  const d = lastActivityDate(id)
  return d ? lastActivityText(d).replace(/ \(.*\)$/, "") : "—"
}
