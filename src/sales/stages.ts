import { SalesRuleError, throwIfFieldErrors, type FieldErrors } from "./errors"
import { isDateOnly } from "./dates"
import { defaultForecastCategory } from "./forecast"
import {
  LOST_REASONS,
  OPEN_STAGES,
  type DateOnly,
  type ForecastCategory,
  type Id,
  type LostReason,
  type OpenStage,
  type Opportunity,
  type Stage,
} from "./types"

export const STAGE_DEFAULT_PROBABILITY: Record<Stage, number> = {
  qualification: 10,
  needsAnalysis: 25,
  proposal: 50,
  negotiation: 75,
  closedWon: 100,
  closedLost: 0,
}

export function isOpenStage(stage: Stage): stage is OpenStage {
  return (OPEN_STAGES as readonly Stage[]).includes(stage)
}

export function isClosedStage(stage: Stage): boolean {
  return !isOpenStage(stage)
}

/** Closed Opportunities are read-only until reopened. */
export function isOpportunityReadOnly(opportunity: Pick<Opportunity, "stage">): boolean {
  return isClosedStage(opportunity.stage)
}

export function isValidProbability(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100
}

export type StageChange = Pick<Opportunity, "stage" | "probability"> & { forecastCategory: ForecastCategory }

/**
 * Moving an open Opportunity to another open Stage: forward, back or skipping.
 * The Probability and the Forecast category reset to the new Stage's defaults.
 */
export function changeStage(opportunity: Pick<Opportunity, "stage">, to: Stage): StageChange {
  if (!isOpenStage(opportunity.stage)) {
    throw new SalesRuleError("A closed Opportunity must be reopened before its Stage can change.")
  }
  if (!isOpenStage(to)) {
    throw new SalesRuleError("Closed Won and Closed Lost are reached only by closing the Opportunity.")
  }
  return { stage: to, probability: STAGE_DEFAULT_PROBABILITY[to], forecastCategory: defaultForecastCategory(to) }
}

export type CloseInput =
  | {
      outcome: "won"
      /** Defaults to the Estimated value. */
      actualValue?: number
      /** Defaults to today. */
      closeDate?: DateOnly
    }
  | {
      outcome: "lost"
      lostReason?: LostReason
      lostComment?: string
      /** Defaults to today. */
      closeDate?: DateOnly
    }

export type CloseChange = Pick<
  Opportunity,
  "stage" | "probability" | "forecastCategory" | "actualValue" | "closeDate" | "lostReason" | "lostComment" | "closedById"
>

/** Close an open Opportunity as Closed Won or Closed Lost. */
export function closeOpportunity(
  opportunity: Pick<Opportunity, "stage" | "estimatedValue">,
  input: CloseInput,
  context: { today: DateOnly; userId: Id },
): CloseChange {
  if (!isOpenStage(opportunity.stage)) {
    throw new SalesRuleError("This Opportunity is already closed.")
  }
  const closeDate = input.closeDate ?? context.today
  const errors: FieldErrors = {}
  if (!isDateOnly(closeDate)) errors.closeDate = "Enter a valid close date."

  if (input.outcome === "won") {
    const actualValue = input.actualValue ?? opportunity.estimatedValue
    if (!Number.isFinite(actualValue) || actualValue < 0) errors.actualValue = "Enter an actual value of 0 or more."
    throwIfFieldErrors("The Opportunity cannot be closed as won.", errors)
    return {
      stage: "closedWon",
      probability: STAGE_DEFAULT_PROBABILITY.closedWon,
      forecastCategory: undefined,
      actualValue,
      closeDate,
      lostReason: undefined,
      lostComment: undefined,
      closedById: context.userId,
    }
  }

  if (!input.lostReason || !LOST_REASONS.includes(input.lostReason)) errors.lostReason = "Pick a Lost reason."
  throwIfFieldErrors("The Opportunity cannot be closed as lost.", errors)
  return {
    stage: "closedLost",
    probability: STAGE_DEFAULT_PROBABILITY.closedLost,
    forecastCategory: undefined,
    actualValue: undefined,
    closeDate,
    lostReason: input.lostReason,
    lostComment: input.lostComment?.trim() || undefined,
    closedById: context.userId,
  }
}

/** Reopen a closed Opportunity to an open Stage, clearing what Close recorded. */
export function reopenOpportunity(opportunity: Pick<Opportunity, "stage">, to: Stage): CloseChange {
  if (isOpenStage(opportunity.stage)) {
    throw new SalesRuleError("Only a closed Opportunity can be reopened.")
  }
  if (!isOpenStage(to)) {
    throw new SalesRuleError("Reopen to an open Stage.")
  }
  return {
    stage: to,
    probability: STAGE_DEFAULT_PROBABILITY[to],
    forecastCategory: defaultForecastCategory(to),
    actualValue: undefined,
    closeDate: undefined,
    lostReason: undefined,
    lostComment: undefined,
    closedById: undefined,
  }
}
