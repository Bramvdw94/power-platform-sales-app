import { describe, expect, it } from "vitest"
import {
  STAGE_DEFAULT_PROBABILITY,
  changeStage,
  closeOpportunity,
  isOpportunityReadOnly,
  reopenOpportunity,
} from "./stages"
import { SalesRuleError } from "./errors"
import { defaultForecastCategory } from "./forecast"
import type { OpenStage, Stage } from "./types"

const context = { today: "2026-10-09", userId: "u-adele" }

function fieldErrorsOf(action: () => unknown) {
  try {
    action()
  } catch (error) {
    if (error instanceof SalesRuleError) return error.fieldErrors
    throw error
  }
  throw new Error("Expected a SalesRuleError")
}

describe("Stage defaults", () => {
  it("matches the glossary", () => {
    expect(STAGE_DEFAULT_PROBABILITY).toEqual({
      qualification: 10,
      needsAnalysis: 25,
      proposal: 50,
      negotiation: 75,
      closedWon: 100,
      closedLost: 0,
    })
  })
})

describe("changeStage", () => {
  const moves: Array<[Stage, Stage, number | "refused"]> = [
    ["qualification", "needsAnalysis", 25],
    ["qualification", "negotiation", 75],
    ["negotiation", "qualification", 10],
    ["proposal", "needsAnalysis", 25],
    ["needsAnalysis", "proposal", 50],
    ["proposal", "proposal", 50],
    ["proposal", "closedWon", "refused"],
    ["proposal", "closedLost", "refused"],
    ["closedWon", "proposal", "refused"],
    ["closedLost", "qualification", "refused"],
  ]

  it.each(moves)("%s -> %s gives Probability %s", (from, to, expected) => {
    if (expected === "refused") {
      expect(() => changeStage({ stage: from }, to)).toThrow(SalesRuleError)
    } else {
      expect(changeStage({ stage: from }, to)).toEqual({ stage: to, probability: expected, forecastCategory: defaultForecastCategory(to as OpenStage) })
    }
  })
})

describe("closeOpportunity", () => {
  const open = { stage: "proposal" as const, estimatedValue: 12000 }

  it("closes as won with the Estimated value and today by default", () => {
    expect(closeOpportunity(open, { outcome: "won" }, context)).toMatchObject({
      stage: "closedWon",
      probability: 100,
      actualValue: 12000,
      closeDate: "2026-10-09",
      closedById: "u-adele",
    })
  })

  it("records the actual value and close date given", () => {
    expect(
      closeOpportunity(open, { outcome: "won", actualValue: 9500, closeDate: "2026-10-01" }, context),
    ).toMatchObject({ actualValue: 9500, closeDate: "2026-10-01" })
  })

  it("closes as lost with a Lost reason and comment", () => {
    expect(
      closeOpportunity(open, { outcome: "lost", lostReason: "price", lostComment: " Too expensive " }, context),
    ).toMatchObject({
      stage: "closedLost",
      probability: 0,
      actualValue: undefined,
      lostReason: "price",
      lostComment: "Too expensive",
      closedById: "u-adele",
    })
  })

  it("needs a Lost reason to close as lost", () => {
    expect(fieldErrorsOf(() => closeOpportunity(open, { outcome: "lost" }, context))).toHaveProperty("lostReason")
  })

  it.each([
    [{ outcome: "won" as const, actualValue: -1 }, "actualValue"],
    [{ outcome: "won" as const, closeDate: "2026-02-30" }, "closeDate"],
    [{ outcome: "lost" as const, lostReason: "price" as const, closeDate: "soon" }, "closeDate"],
  ])("refuses %o (field %s)", (input, field) => {
    expect(fieldErrorsOf(() => closeOpportunity(open, input, context))).toHaveProperty(field)
  })

  it.each(["closedWon", "closedLost"] as const)("refuses to close a %s Opportunity again", (stage) => {
    expect(() => closeOpportunity({ stage, estimatedValue: 1 }, { outcome: "won" }, context)).toThrow(SalesRuleError)
  })
})

describe("reopenOpportunity", () => {
  it.each([
    ["closedWon", "negotiation", 75],
    ["closedLost", "qualification", 10],
    ["closedLost", "proposal", 50],
  ] as const)("reopens %s to %s with Probability %i and clears the close", (from, to, probability) => {
    expect(reopenOpportunity({ stage: from }, to)).toEqual({
      stage: to,
      probability,
      forecastCategory: defaultForecastCategory(to),
      actualValue: undefined,
      closeDate: undefined,
      lostReason: undefined,
      lostComment: undefined,
      closedById: undefined,
    })
  })

  it.each([
    ["proposal", "negotiation"],
    ["closedWon", "closedLost"],
  ] as const)("refuses %s -> %s", (from, to) => {
    expect(() => reopenOpportunity({ stage: from }, to)).toThrow(SalesRuleError)
  })
})

describe("isOpportunityReadOnly", () => {
  it.each([
    ["qualification", false],
    ["negotiation", false],
    ["closedWon", true],
    ["closedLost", true],
  ] as const)("%s -> %s", (stage, readOnly) => {
    expect(isOpportunityReadOnly({ stage })).toBe(readOnly)
  })
})
