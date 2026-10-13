import { describe, expect, it } from "vitest"
import type { BusinessRuleRow } from "./engine"
import { previewRules, ruleNotices, toDraftRecord } from "./rule-preview"

const rule = (id: string, effects: BusinessRuleRow["definition"]["effects"], conditions: BusinessRuleRow["definition"]["when"]["conditions"]): BusinessRuleRow => ({
  id,
  name: id,
  enabled: true,
  definition: { schemaVersion: 1, table: "opportunity", when: { match: "all", conditions }, effects },
})

const big = [{ field: "estimatedValue", op: "greaterThan", value: 100 }] as const
const context = (...rules: BusinessRuleRow[]) => ({ table: "opportunity" as const, rules })

describe("previewRules", () => {
  it("lets an unrelated edit through when a required field is empty on an older record, and stops clearing it", () => {
    const stored = { estimatedValue: 500, nextStep: "Call" }
    const ctx = context(rule("needs-next-step", [{ type: "required", field: "nextStep" }], [...big]))
    expect(previewRules(ctx, { estimatedValue: 500 }, { estimatedValue: 500, description: "x" }).problems).toEqual([])
    const cleared = previewRules(ctx, stored, toDraftRecord(stored, { nextStep: "" }))
    expect(cleared.problems.map((p) => [p.code, p.field])).toEqual([["required", "nextStep"]])
    expect(cleared.viewOf("nextStep")).toMatchObject({ required: { ruleName: "needs-next-step" }, missing: true, problem: expect.any(String) })
  })

  it("collects a block save and a required problem together, so both show at once", () => {
    const ctx = context(
      rule("block", [{ type: "blockSave", message: "No." }], [{ field: "estimatedValue", op: "greaterThan", value: 100 }]),
      rule("req", [{ type: "required", field: "nextStep" }], [...big]),
    )
    const stored = { estimatedValue: 50, nextStep: "Call" }
    const result = previewRules(ctx, stored, toDraftRecord(stored, { estimatedValue: 500, nextStep: "" }))
    expect(result.problems.map((p) => p.code).sort()).toEqual(["blockSave", "required"])
    expect(result.blocks).toEqual([{ ruleId: "block", ruleName: "block", detail: "No." }])
  })

  it("fills in a set value when its condition becomes true, but not on a record that already matched", () => {
    const ctx = context(rule("best", [{ type: "setValue", field: "forecastCategory", value: "bestCase" }], [{ field: "leadSource", op: "equals", value: "partner" }]))
    const stored = { leadSource: "website", forecastCategory: "pipeline" }
    expect(previewRules(ctx, stored, toDraftRecord(stored, { leadSource: "partner" })).filled).toEqual({ forecastCategory: "bestCase" })
    const matched = { leadSource: "partner", forecastCategory: "pipeline" }
    expect(previewRules(ctx, matched, matched).filled).toEqual({})
  })

  it("treats a blank number as empty and shows nothing without rules", () => {
    expect(toDraftRecord({ estimatedValue: 5 }, { estimatedValue: Number.NaN }).estimatedValue).toBeNull()
    const none = previewRules(context(), { a: 1 }, { a: 2 })
    expect(none.problems).toEqual([])
    expect(none.viewOf("a")).toEqual({ warnings: [] })
  })
})

describe("ruleNotices", () => {
  it("lists warnings, empty required fields and the blocks that hold on the record", () => {
    const ctx = context(
      rule("w", [{ type: "warning", message: "Careful." }], [...big]),
      rule("r", [{ type: "required", field: "nextStep" }], [...big]),
      rule("b", [{ type: "blockSave", message: "No." }], [...big]),
    )
    const notices = ruleNotices(ctx, { estimatedValue: 500 })
    expect(notices.warnings.map((w) => w.message)).toEqual(["Careful."])
    expect(notices.missing).toEqual([{ ruleName: "r", field: "nextStep" }])
    expect(notices.blocks.map((b) => b.message)).toEqual(["No."])
  })
})
