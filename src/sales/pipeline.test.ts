import { describe, expect, it } from "vitest"
import {
  closeDateRange,
  isOpportunityOverdue,
  isTaskOverdue,
  matchesPipelineFilter,
  pipelineSummary,
  stageTotals,
  weightedValue,
  type CloseDateFilter,
  type PipelineFilter,
} from "./pipeline"
import type { Opportunity, Stage } from "./types"

type Row = Pick<Opportunity, "stage" | "estimatedValue" | "actualValue" | "probability">

const opp = (stage: Stage, estimatedValue: number, probability: number, actualValue?: number): Row => ({
  stage,
  estimatedValue,
  probability,
  actualValue,
})

describe("weightedValue", () => {
  it.each([
    [opp("qualification", 10000, 10), 1000],
    [opp("proposal", 12345.67, 50), 6172.84],
    [opp("negotiation", 0, 75), 0],
    [opp("closedWon", 10000, 100, 8000), 8000],
    [opp("closedWon", 10000, 100), 10000],
    [opp("closedLost", 10000, 0), 0],
    [opp("needsAnalysis", 999.99, 33), 330],
  ])("%o -> %d", (row, expected) => {
    expect(weightedValue(row)).toBe(expected)
  })
})

describe("stageTotals", () => {
  it("is zero for every Stage without Opportunities", () => {
    const totals = stageTotals([])
    expect(Object.values(totals)).toHaveLength(6)
    for (const t of Object.values(totals)) expect(t).toEqual({ count: 0, total: 0, weighted: 0 })
  })

  it("adds count, total and weighted total per Stage", () => {
    const totals = stageTotals([
      opp("qualification", 10000, 10),
      opp("qualification", 5000, 20),
      opp("proposal", 20000, 50),
      opp("closedWon", 30000, 100, 25000),
      opp("closedLost", 7000, 0),
    ])
    expect(totals.qualification).toEqual({ count: 2, total: 15000, weighted: 2000 })
    expect(totals.needsAnalysis).toEqual({ count: 0, total: 0, weighted: 0 })
    expect(totals.proposal).toEqual({ count: 1, total: 20000, weighted: 10000 })
    expect(totals.closedWon).toEqual({ count: 1, total: 25000, weighted: 25000 })
    expect(totals.closedLost).toEqual({ count: 1, total: 7000, weighted: 0 })
  })

  it("keeps cents exact", () => {
    const totals = stageTotals([opp("proposal", 0.1, 50), opp("proposal", 0.2, 50)])
    expect(totals.proposal).toEqual({ count: 2, total: 0.3, weighted: 0.15 })
  })
})

describe("pipelineSummary", () => {
  it("counts only open Opportunities", () => {
    expect(
      pipelineSummary([
        opp("qualification", 10000, 10),
        opp("negotiation", 40000, 80),
        opp("closedWon", 30000, 100, 25000),
        opp("closedLost", 7000, 0),
      ]),
    ).toEqual({ openTotal: 50000, weightedTotal: 33000, openCount: 2 })
  })
})

describe("Overdue", () => {
  it.each([
    ["proposal", "2026-10-08", true],
    ["proposal", "2026-10-09", false],
    ["proposal", "2026-10-10", false],
    ["closedWon", "2026-01-01", false],
    ["closedLost", "2026-01-01", false],
  ] as const)("a %s Opportunity expected to close %s is overdue: %s", (stage, expectedCloseDate, overdue) => {
    expect(isOpportunityOverdue({ stage, expectedCloseDate }, "2026-10-09")).toBe(overdue)
  })

  it.each([
    [false, "2026-10-08", true],
    [false, "2026-10-09", false],
    [false, undefined, false],
    [true, "2026-10-01", false],
  ])("a Task completed=%s due %s is overdue: %s", (completed, dueDate, overdue) => {
    expect(isTaskOverdue({ completed, dueDate }, "2026-10-09")).toBe(overdue)
  })
})

describe("closeDateRange", () => {
  const cases: Array<[CloseDateFilter, string, { from: string; to: string } | null]> = [
    ["any", "2026-10-09", null],
    ["thisQuarter", "2026-10-09", { from: "2026-10-01", to: "2026-12-31" }],
    ["nextQuarter", "2026-10-09", { from: "2027-01-01", to: "2027-03-31" }],
    ["thisQuarter", "2026-01-01", { from: "2026-01-01", to: "2026-03-31" }],
    ["thisQuarter", "2026-05-15", { from: "2026-04-01", to: "2026-06-30" }],
    ["nextQuarter", "2026-05-15", { from: "2026-07-01", to: "2026-09-30" }],
    ["thisQuarter", "2026-09-30", { from: "2026-07-01", to: "2026-09-30" }],
    ["thisYear", "2026-10-09", { from: "2026-01-01", to: "2026-12-31" }],
  ]

  it.each(cases)("%s on %s -> %o", (filter, today, range) => {
    expect(closeDateRange(filter, today)).toEqual(range)
  })
})

describe("matchesPipelineFilter", () => {
  const users = [
    { id: "megan", managerId: null },
    { id: "adele", managerId: "megan" },
    { id: "diego", managerId: null },
  ]
  const context = { userId: "megan", users, today: "2026-10-09" }
  const base: PipelineFilter = { owner: "myTeam", closeDate: "any", showClosed: false }
  const row = (overrides: Partial<Pick<Opportunity, "stage" | "expectedCloseDate" | "closeDate" | "ownerId">>) => ({
    stage: "proposal" as Stage,
    expectedCloseDate: "2026-11-15",
    ownerId: "adele",
    ...overrides,
  })

  it.each([
    ["a report's open deal on My team", base, row({}), true],
    ["an outsider's deal on My team", base, row({ ownerId: "diego" }), false],
    ["an outsider's deal for Everyone", { ...base, owner: "everyone" }, row({ ownerId: "diego" }), true],
    ["a report's deal on My Opportunities", { ...base, owner: "mine" }, row({}), false],
    ["a closed deal with closed hidden", base, row({ stage: "closedWon", closeDate: "2026-10-01" }), false],
    ["a closed deal with Show closed", { ...base, showClosed: true }, row({ stage: "closedWon", closeDate: "2026-10-01" }), true],
    ["a deal closing next year this quarter", { ...base, closeDate: "thisQuarter" }, row({ expectedCloseDate: "2027-01-10" }), false],
    ["a deal closing next quarter", { ...base, closeDate: "nextQuarter" }, row({ expectedCloseDate: "2027-01-10" }), true],
    [
      "a deal closed last quarter, by its close date",
      { ...base, closeDate: "thisQuarter", showClosed: true },
      row({ stage: "closedLost", expectedCloseDate: "2026-11-01", closeDate: "2026-09-20" }),
      false,
    ],
  ] as const)("%s: %s", (_label, filter, opportunity, expected) => {
    expect(matchesPipelineFilter(opportunity, filter, context)).toBe(expected)
  })
})
