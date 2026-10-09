import { describe, expect, it } from "vitest"
import {
  allowedLeadActions,
  canApplyLeadAction,
  isLeadReadOnly,
  leadStatusAfter,
  manualLeadAction,
  type LeadAction,
} from "./lead-status"
import { SalesRuleError } from "./errors"
import type { LeadStatus } from "./types"

describe("Lead status transitions", () => {
  const cases: Array<[LeadStatus, LeadAction, LeadStatus | "refused"]> = [
    ["notContacted", "markWorking", "working"],
    ["notContacted", "markNotContacted", "refused"],
    ["notContacted", "disqualify", "disqualified"],
    ["notContacted", "qualify", "qualified"],
    ["notContacted", "reopen", "refused"],
    ["working", "markNotContacted", "notContacted"],
    ["working", "markWorking", "refused"],
    ["working", "disqualify", "disqualified"],
    ["working", "qualify", "qualified"],
    ["working", "reopen", "refused"],
    ["qualified", "markWorking", "refused"],
    ["qualified", "markNotContacted", "refused"],
    ["qualified", "disqualify", "refused"],
    ["qualified", "reopen", "refused"],
    ["qualified", "qualify", "refused"],
    ["disqualified", "reopen", "working"],
    ["disqualified", "markWorking", "refused"],
    ["disqualified", "markNotContacted", "refused"],
    ["disqualified", "qualify", "refused"],
    ["disqualified", "disqualify", "refused"],
  ]

  it.each(cases)("%s + %s -> %s", (from, action, expected) => {
    if (expected === "refused") {
      expect(canApplyLeadAction(from, action)).toBe(false)
      expect(() => leadStatusAfter(from, action)).toThrow(SalesRuleError)
    } else {
      expect(canApplyLeadAction(from, action)).toBe(true)
      expect(leadStatusAfter(from, action)).toBe(expected)
    }
  })

  it("offers no action on a Qualified Lead, which is final", () => {
    expect(allowedLeadActions("qualified")).toEqual([])
  })

  it.each([
    ["working", "markWorking"],
    ["notContacted", "markNotContacted"],
    ["qualified", null],
    ["disqualified", null],
  ] as const)("setting status %s by hand uses %s", (to, action) => {
    expect(manualLeadAction(to)).toBe(action)
  })

  it.each([
    ["notContacted", false],
    ["working", false],
    ["qualified", true],
    ["disqualified", true],
  ] as const)("a %s Lead is read-only: %s", (status, readOnly) => {
    expect(isLeadReadOnly({ status })).toBe(readOnly)
  })
})
