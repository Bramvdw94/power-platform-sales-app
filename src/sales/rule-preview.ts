// What Business rules do to a Lead, Opportunity, Account or Contact on screen: the
// effects at each field and what would stop a save. It runs the same engine as the
// gateways (a dry run of evaluateSave), so the app shows what the plug-in will do.

import {
  evaluateSave,
  isEmptyValue,
  ruleEffects,
  type BusinessRuleRow,
  type EngineRecord,
  type EngineTable,
  type FieldValue,
  type MessageEffect,
  type Parents,
  type Related,
  type RuleEffects,
  type RuleProblem,
  type RuleRef,
} from "./engine"

export type RuleContext = {
  table: EngineTable
  /** The rules that apply: none when the kill switch is off. */
  rules: BusinessRuleRow[]
  parents?: Parents
  related?: Related
}

/** What the rules say about one field. */
export type FieldRuleView = {
  required?: RuleRef
  /** The required field is empty right now. */
  missing?: boolean
  readOnly?: RuleRef
  /** A rule set this value; the user may still change it. */
  filledBy?: RuleRef
  warnings: MessageEffect[]
  /** The save-stopping problem to show in red under the field. */
  problem?: string
}

export type RulePreview = {
  /** Everything that would stop a save of the draft. */
  problems: RuleProblem[]
  /** Block save rules among the problems, with their own message. */
  blocks: { ruleId: string; ruleName: string; detail: string }[]
  /** Values rules would set on the draft, by field. */
  filled: Record<string, FieldValue>
  /** Warnings that are not about one field. */
  generalWarnings: MessageEffect[]
  viewOf(field: string): FieldRuleView
}

const NO_VIEW: FieldRuleView = { warnings: [] }

function same(a: FieldValue, b: FieldValue): boolean {
  if (isEmptyValue(a) && isEmptyValue(b)) return true
  return a === b
}

/** A draft as the engine reads it: a number field left blank (NaN) is empty. */
export function toDraftRecord(stored: EngineRecord | null, patch: Record<string, unknown>): EngineRecord {
  const draft: EngineRecord = { ...(stored ?? {}) }
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue
    draft[field] = typeof value === "number" && Number.isNaN(value) ? null : (value as FieldValue)
  }
  return draft
}

/**
 * The effects of the rules on a record being viewed, edited or created. `stored` is null for a new record;
 * `draft` holds the record with the user's edits. Read-only follows the stored record, as the plug-in does.
 */
export function previewRules(context: RuleContext, stored: EngineRecord | null, draft: EngineRecord, now = new Date().toISOString()): RulePreview {
  const { table, rules, parents, related } = context
  if (rules.length === 0) return { problems: [], blocks: [], filled: {}, generalWarnings: [], viewOf: () => NO_VIEW }

  const change: EngineRecord = {}
  for (const [field, value] of Object.entries(draft)) if (!stored || !same(stored[field], value)) change[field] = value
  const outcome = evaluateSave({
    table,
    before: stored,
    change,
    parents,
    related,
    caller: { id: "preview" },
    now,
    rules,
    dryRun: true,
  })
  const state: EngineRecord = { ...(stored ?? {}), ...draft, ...outcome.changes }
  const after = ruleEffects({ table, record: state, parents, related }, rules)
  const before: RuleEffects | undefined = stored ? ruleEffects({ table, record: stored, parents, related }, rules) : undefined
  const problems = outcome.problems ?? []

  const filled: Record<string, FieldValue> = {}
  for (const effect of after.setValues) {
    // A value the engine put there that the user did not type.
    if (same(state[effect.field], effect.value) && !same(draft[effect.field], effect.value)) filled[effect.field] = effect.value
  }

  return {
    problems,
    blocks: problems.filter((p) => p.code === "blockSave").map((p) => ({ ruleId: p.ruleId, ruleName: p.ruleName, detail: p.detail ?? p.message })),
    filled,
    generalWarnings: after.warnings.filter((w) => !w.field),
    viewOf(field) {
      const required = after.required.find((e) => e.field === field)
      const readOnly = before?.readOnly.find((e) => e.field === field)
      const filledBy = after.setValues.filter((e) => e.field === field && same(state[field], e.value)).at(-1)
      const problem = problems.find((p) => p.code === "required" && p.field === field)
      return {
        ...(required && { required: { ruleId: required.ruleId, ruleName: required.ruleName }, missing: isEmptyValue(state[field]) }),
        ...(readOnly && { readOnly: { ruleId: readOnly.ruleId, ruleName: readOnly.ruleName } }),
        ...(filledBy && { filledBy: { ruleId: filledBy.ruleId, ruleName: filledBy.ruleName } }),
        warnings: after.warnings.filter((w) => w.field === field),
        ...(problem && { problem: problem.message }),
      }
    },
  }
}

/** What read mode says: warnings, required fields still empty, and blocks that hold on the stored record. */
export type RuleNotices = {
  warnings: MessageEffect[]
  missing: { ruleName: string; field: string }[]
  blocks: MessageEffect[]
}

export function ruleNotices(context: RuleContext, record: EngineRecord): RuleNotices {
  if (context.rules.length === 0) return { warnings: [], missing: [], blocks: [] }
  const effects = ruleEffects({ table: context.table, record, parents: context.parents, related: context.related }, context.rules)
  return {
    warnings: effects.warnings,
    missing: effects.required.filter((e) => isEmptyValue(record[e.field])).map((e) => ({ ruleName: e.ruleName, field: e.field })),
    blocks: effects.blocks,
  }
}
