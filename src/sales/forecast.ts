import { SalesRuleError } from "./errors"
import { FORECAST_CATEGORIES, OPEN_STAGES, type ForecastCategory, type OpenStage, type Opportunity } from "./types"

/** Qualification and Needs Analysis are Pipeline, Proposal Best case, Negotiation Commit. */
export const STAGE_DEFAULT_FORECAST_CATEGORY: Record<OpenStage, ForecastCategory> = {
  qualification: "pipeline",
  needsAnalysis: "pipeline",
  proposal: "bestCase",
  negotiation: "commit",
}

export function defaultForecastCategory(stage: OpenStage): ForecastCategory {
  return STAGE_DEFAULT_FORECAST_CATEGORY[stage]
}

export function isForecastCategory(value: unknown): value is ForecastCategory {
  return (FORECAST_CATEGORIES as readonly unknown[]).includes(value)
}

/**
 * The Forecast category of an Opportunity: the stored one, or the Stage's default
 * when none was stored yet. A closed Opportunity has none: it counts as won or
 * lost by its Stage.
 */
export function effectiveForecastCategory(
  opportunity: Pick<Opportunity, "stage" | "forecastCategory">,
): ForecastCategory | undefined {
  if (!(OPEN_STAGES as readonly string[]).includes(opportunity.stage)) return undefined
  return opportunity.forecastCategory ?? defaultForecastCategory(opportunity.stage as OpenStage)
}

/** Omitted deals stay on the Pipeline board but count in no forecast figure. */
export function countsInForecast(opportunity: Pick<Opportunity, "stage" | "forecastCategory">): boolean {
  const category = effectiveForecastCategory(opportunity)
  return category !== undefined && category !== "omitted"
}

/** The Owner overriding the Forecast category of an open Opportunity. */
export function overrideForecastCategory(
  opportunity: Pick<Opportunity, "stage">,
  category: ForecastCategory,
): ForecastCategory {
  if (!(OPEN_STAGES as readonly string[]).includes(opportunity.stage)) {
    throw new SalesRuleError("A closed Opportunity has no Forecast category: it counts as won or lost by its Stage.")
  }
  if (!isForecastCategory(category)) {
    throw new SalesRuleError("Pick a Forecast category.", { forecastCategory: "Pick a Forecast category." })
  }
  return category
}
