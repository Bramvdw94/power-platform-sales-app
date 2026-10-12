import { describe, expect, it } from "vitest"
import { SalesRuleError } from "./errors"
import {
  countsInForecast,
  defaultForecastCategory,
  effectiveForecastCategory,
  overrideForecastCategory,
} from "./forecast"
import { changeStage, closeOpportunity, reopenOpportunity } from "./stages"
import { OPEN_STAGES, type ForecastCategory, type Opportunity } from "./types"

describe("Forecast category defaults", () => {
  it.each([
    ["qualification", "pipeline"],
    ["needsAnalysis", "pipeline"],
    ["proposal", "bestCase"],
    ["negotiation", "commit"],
  ] as const)("%s defaults to %s", (stage, category) => {
    expect(defaultForecastCategory(stage)).toBe(category)
  })
})

/** An Opportunity as the Owner works it: every Stage change, override and close goes through the rules. */
function work(initial: Pick<Opportunity, "stage" | "forecastCategory">) {
  let o: Pick<Opportunity, "stage" | "forecastCategory"> = initial
  return {
    get category() {
      return effectiveForecastCategory(o)
    },
    move: (to: (typeof OPEN_STAGES)[number]) => void (o = { ...o, ...changeStage(o, to) }),
    override: (category: ForecastCategory) => void (o = { ...o, forecastCategory: overrideForecastCategory(o, category) }),
    close: (outcome: "won" | "lost") =>
      void (o = {
        ...o,
        ...closeOpportunity(
          { stage: o.stage, estimatedValue: 100 },
          outcome === "won" ? { outcome } : { outcome, lostReason: "price" },
          { today: "2026-10-12", userId: "u" },
        ),
      }),
    reopen: (to: (typeof OPEN_STAGES)[number]) => void (o = { ...o, ...reopenOpportunity(o, to) }),
  }
}

describe("Forecast category flow", () => {
  it("resets to the new Stage's default when the Stage changes", () => {
    const o = work({ stage: "qualification", forecastCategory: "pipeline" })
    o.override("commit")
    o.move("proposal")
    expect(o.category).toBe("bestCase")
  })

  it("keeps an override until the next Stage change", () => {
    const o = work({ stage: "proposal", forecastCategory: "bestCase" })
    o.override("omitted")
    expect(o.category).toBe("omitted")
    o.override("commit")
    expect(o.category).toBe("commit")
    o.move("negotiation")
    expect(o.category).toBe("commit")
    o.override("omitted")
    o.move("needsAnalysis")
    expect(o.category).toBe("pipeline")
  })

  it("resets even when the Stage is picked again or the new default equals the old", () => {
    const o = work({ stage: "proposal", forecastCategory: "bestCase" })
    o.override("omitted")
    o.move("proposal")
    expect(o.category).toBe("bestCase")
  })

  it("is dropped on close and reset to the default on reopen", () => {
    const o = work({ stage: "negotiation", forecastCategory: "omitted" })
    o.close("won")
    expect(o.category).toBeUndefined()
    o.reopen("proposal")
    expect(o.category).toBe("bestCase")
  })

  it("cannot be overridden on a closed Opportunity", () => {
    expect(() => overrideForecastCategory({ stage: "closedWon" }, "commit")).toThrow(SalesRuleError)
  })

  it("rejects a value that is not a Forecast category", () => {
    expect(() => overrideForecastCategory({ stage: "proposal" }, "won" as ForecastCategory)).toThrow(SalesRuleError)
  })
})

describe("effectiveForecastCategory and countsInForecast", () => {
  it("falls back to the Stage default for an Opportunity that has none stored", () => {
    expect(effectiveForecastCategory({ stage: "negotiation" })).toBe("commit")
  })

  it("has none for a closed Opportunity, which counts as won or lost by its Stage", () => {
    expect(effectiveForecastCategory({ stage: "closedLost", forecastCategory: "commit" })).toBeUndefined()
  })

  it("counts every open category except Omitted", () => {
    expect(countsInForecast({ stage: "proposal", forecastCategory: "omitted" })).toBe(false)
    expect(countsInForecast({ stage: "proposal", forecastCategory: "pipeline" })).toBe(true)
    expect(countsInForecast({ stage: "closedWon" })).toBe(false)
  })
})
