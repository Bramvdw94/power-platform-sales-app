import { describe, expect, it } from "vitest"
import { forecastFigures, forecastPeriods, myNumbers, salesStats, wonLostByOwner, type ForecastPeriod } from "./forecast-figures"
import type { Opportunity } from "./types"

const TODAY = "2026-10-13"

type Deal = Pick<
  Opportunity,
  "stage" | "forecastCategory" | "estimatedValue" | "actualValue" | "probability" | "expectedCloseDate" | "closeDate" | "createdOn" | "ownerId" | "ownerName"
>

function deal(overrides: Partial<Deal>): Deal {
  return {
    stage: "negotiation",
    estimatedValue: 10000,
    probability: 50,
    expectedCloseDate: "2026-10-20",
    createdOn: "2026-08-01T10:00:00Z",
    ownerId: "u1",
    ownerName: "Adele Vance",
    ...overrides,
  }
}

const [october, november] = forecastPeriods(TODAY, "month")

describe("forecastPeriods", () => {
  it("is this month plus the next 5", () => {
    const periods = forecastPeriods(TODAY, "month")
    expect(periods.map((p) => p.key)).toEqual(["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"])
    expect(periods[0]).toMatchObject({ from: "2026-10-01", to: "2026-10-31" })
    expect(periods[4]).toMatchObject({ from: "2027-02-01", to: "2027-02-28" })
  })

  it("is the quarter we are in plus the next 2, starting at its first month", () => {
    const periods = forecastPeriods(TODAY, "quarter")
    expect(periods.map((p) => [p.from, p.to])).toEqual([
      ["2026-10-01", "2026-12-31"],
      ["2027-01-01", "2027-03-31"],
      ["2027-04-01", "2027-06-30"],
    ])
    expect(periods[0].months).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"])
  })
})

describe("forecastFigures", () => {
  const cases: {
    name: string
    deals: Partial<Deal>[]
    quotas?: { month: string; amount: number }[]
    period?: ForecastPeriod
    expected: Partial<ReturnType<typeof forecastFigures>>
  }[] = [
    {
      name: "no deals and no Quota",
      deals: [],
      expected: { closedWon: 0, commit: 0, bestCase: 0, pipeline: 0, weighted: 0, quota: null, gap: null, coverage: null },
    },
    {
      name: "won deals count in their close month at the actual value",
      deals: [
        { stage: "closedWon", estimatedValue: 30000, actualValue: 27500, closeDate: "2026-10-02", expectedCloseDate: "2026-09-20" },
        { stage: "closedWon", estimatedValue: 8000, closeDate: "2026-10-05" },
        { stage: "closedWon", estimatedValue: 5000, actualValue: 5000, closeDate: "2026-11-05", expectedCloseDate: "2026-10-30" },
      ],
      expected: { closedWon: 35500, commit: 35500, bestCase: 35500, pipeline: 0, weighted: 0 },
    },
    {
      name: "lost deals count nowhere",
      deals: [{ stage: "closedLost", estimatedValue: 60000, closeDate: "2026-10-03", forecastCategory: "commit" }],
      expected: { closedWon: 0, commit: 0, pipeline: 0 },
    },
    {
      name: "open deals count in their Expected close month by Forecast category, defaulted from the Stage",
      deals: [
        { stage: "negotiation", estimatedValue: 120000, probability: 80 },
        { stage: "proposal", estimatedValue: 20000, probability: 50 },
        { stage: "qualification", estimatedValue: 48000, probability: 10 },
        { stage: "negotiation", estimatedValue: 99000, expectedCloseDate: "2026-11-02" },
      ],
      expected: {
        openCommit: 120000,
        openBestCase: 20000,
        openPipeline: 48000,
        commit: 120000,
        bestCase: 140000,
        pipeline: 188000,
        weighted: 110800,
      },
    },
    {
      name: "an overridden Forecast category beats the Stage default",
      deals: [{ stage: "negotiation", forecastCategory: "pipeline", estimatedValue: 7000 }],
      expected: { openCommit: 0, openPipeline: 7000, commit: 0, pipeline: 7000 },
    },
    {
      name: "Omitted deals count in no figure",
      deals: [{ stage: "negotiation", forecastCategory: "omitted", estimatedValue: 50000 }],
      expected: { commit: 0, bestCase: 0, pipeline: 0, weighted: 0 },
    },
    {
      name: "Commit and Best case include what is already won",
      deals: [
        { stage: "closedWon", actualValue: 10000, estimatedValue: 10000, closeDate: "2026-10-01" },
        { stage: "negotiation", estimatedValue: 20000 },
        { stage: "proposal", estimatedValue: 5000 },
        { stage: "qualification", estimatedValue: 2500 },
      ],
      expected: { closedWon: 10000, commit: 30000, bestCase: 35000, pipeline: 27500 },
    },
    {
      name: "Quota, Gap and Coverage",
      deals: [
        { stage: "closedWon", actualValue: 10000, estimatedValue: 10000, closeDate: "2026-10-01" },
        { stage: "proposal", estimatedValue: 30000 },
      ],
      quotas: [{ month: "2026-10-01", amount: 40000 }, { month: "2026-11-01", amount: 99999 }],
      expected: { quota: 40000, gap: 30000, coverage: 1 },
    },
    {
      name: "Gap never goes below 0 and Coverage is then empty",
      deals: [{ stage: "closedWon", actualValue: 50000, estimatedValue: 50000, closeDate: "2026-10-01" }],
      quotas: [{ month: "2026-10-01", amount: 40000 }],
      expected: { quota: 40000, gap: 0, coverage: null },
    },
    {
      name: "a Quota of 0 is a Quota",
      deals: [],
      quotas: [{ month: "2026-10-01", amount: 0 }],
      expected: { quota: 0, gap: 0, coverage: null },
    },
    {
      name: "a quarter adds its months, Quotas included",
      period: forecastPeriods(TODAY, "quarter")[0],
      deals: [
        { stage: "closedWon", actualValue: 4000, estimatedValue: 4000, closeDate: "2026-10-30" },
        { stage: "closedWon", actualValue: 6000, estimatedValue: 6000, closeDate: "2026-12-01" },
        { stage: "proposal", estimatedValue: 9000, expectedCloseDate: "2026-11-15" },
        { stage: "proposal", estimatedValue: 9000, expectedCloseDate: "2027-01-01" },
      ],
      quotas: [
        { month: "2026-10-01", amount: 10000 },
        { month: "2026-11-01", amount: 10000 },
        { month: "2026-12-01", amount: 10000 },
        { month: "2027-01-01", amount: 10000 },
      ],
      expected: { closedWon: 10000, bestCase: 19000, quota: 30000, gap: 20000, coverage: 0.45 },
    },
  ]

  it.each(cases)("$name", ({ deals, quotas = [], period = october, expected }) => {
    expect(forecastFigures(deals.map(deal), quotas, period)).toMatchObject(expected)
  })

  it("leaves other months alone", () => {
    const figures = forecastFigures([deal({ expectedCloseDate: "2026-11-30" })], [], october)
    expect(figures.pipeline).toBe(0)
    expect(forecastFigures([deal({ expectedCloseDate: "2026-11-30" })], [], november).pipeline).toBe(10000)
  })
})

describe("salesStats", () => {
  it("is empty when nothing closed in the last 90 days", () => {
    expect(salesStats([deal({ stage: "closedWon", closeDate: "2026-05-01" })], TODAY)).toEqual({
      winRate: null,
      averageDealSize: null,
      salesCycleDays: null,
      won: 0,
      lost: 0,
    })
  })

  it("computes Win rate, Average deal size and Sales cycle over the last 90 days", () => {
    const stats = salesStats(
      [
        deal({ stage: "closedWon", actualValue: 20000, closeDate: "2026-10-01", createdOn: "2026-09-01T09:00:00Z" }),
        deal({ stage: "closedWon", actualValue: 10000, closeDate: "2026-09-15", createdOn: "2026-09-05T09:00:00Z" }),
        deal({ stage: "closedLost", closeDate: "2026-08-01" }),
        deal({ stage: "closedLost", closeDate: "2026-07-16" }),
        deal({ stage: "closedWon", actualValue: 99999, closeDate: "2026-07-01" }),
        deal({ stage: "negotiation" }),
      ],
      TODAY,
    )
    expect(stats).toEqual({ winRate: 0.5, averageDealSize: 15000, salesCycleDays: 20, won: 2, lost: 2 })
  })
})

describe("wonLostByOwner", () => {
  it("adds up value won and lost per Owner, biggest winner first", () => {
    const rows = wonLostByOwner(
      [
        deal({ stage: "closedWon", actualValue: 5000, closeDate: "2026-10-01", ownerId: "a", ownerName: "Alex" }),
        deal({ stage: "closedWon", actualValue: 9000, closeDate: "2026-10-02", ownerId: "b", ownerName: "Adele" }),
        deal({ stage: "closedLost", estimatedValue: 3000, closeDate: "2026-10-03", ownerId: "a", ownerName: "Alex" }),
        deal({ stage: "closedLost", estimatedValue: 1, closeDate: "2026-01-03", ownerId: "a", ownerName: "Alex" }),
      ],
      TODAY,
    )
    expect(rows).toEqual([
      { ownerId: "b", ownerName: "Adele", won: 9000, lost: 0 },
      { ownerId: "a", ownerName: "Alex", won: 5000, lost: 3000 },
    ])
  })
})

describe("myNumbers", () => {
  it("sums this month and this quarter against the Quota", () => {
    const numbers = myNumbers(
      [
        deal({ stage: "closedWon", actualValue: 8000, closeDate: "2026-10-02" }),
        deal({ stage: "closedWon", actualValue: 2000, closeDate: "2026-11-02", expectedCloseDate: "2026-11-02" }),
        deal({ stage: "negotiation", estimatedValue: 10000, probability: 80, expectedCloseDate: "2026-10-20" }),
        deal({ stage: "proposal", estimatedValue: 4000, probability: 50, expectedCloseDate: "2026-10-05" }),
        deal({ stage: "proposal", estimatedValue: 1000, probability: 50, expectedCloseDate: "2026-10-01" }),
      ],
      [{ month: "2026-10-01", amount: 20000 }, { month: "2026-11-01", amount: 10000 }],
      TODAY,
    )
    expect(numbers).toMatchObject({
      wonThisMonth: 8000,
      wonThisQuarter: 10000,
      quotaThisMonth: 20000,
      quotaThisQuarter: 30000,
      gapThisQuarter: 20000,
      commit: 20000,
      bestCase: 25000,
      weighted: 10500,
      closingThisMonthCount: 3,
      closingThisMonthValue: 15000,
      overdueCount: 2,
    })
    expect(numbers.coverageThisQuarter).toBe(0.75)
  })

  it("has no Quota figures without a Quota", () => {
    expect(myNumbers([], [], TODAY)).toMatchObject({ quotaThisMonth: null, quotaThisQuarter: null, gapThisQuarter: null, coverageThisQuarter: null })
  })
})
