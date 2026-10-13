// Building Business rules: the rule a Process builder edits and the pure checks on it.
// The gateways store the rule; nothing here touches data.

import type { BusinessRuleDefinition, BusinessRuleRow, Effect, EngineRecord, EngineTable, FieldInfo, Parents, ProcessDefinition, PublishResult, Related, Scalar } from "./engine"
import { checkRuleForPublish, conditionsHold, ruleEffects, ruleProblem } from "./engine"
import { FIELD_CATALOGUE } from "./field-catalogue"
import type { Id } from "./types"

/** A Business rule as its builder sees it. Saving applies it at once: rules have no versions. */
export type RuleAdmin = BusinessRuleRow & {
  /** Who saved it last, and when. Missing for a rule loaded with the sample data. */
  lastChangedBy?: string
  lastChangedOn?: string
  /** Engine errors recorded against this rule. */
  engineErrorCount: number
}

export type RuleInput = {
  /** Missing for a new rule. */
  id?: Id
  name: string
  enabled: boolean
  definition: BusinessRuleDefinition
}

export function emptyRule(table: EngineTable): RuleInput {
  return { name: "", enabled: true, definition: { schemaVersion: 1, table, when: { match: "all", conditions: [] }, effects: [] } }
}

export type EffectType = Effect["type"]

export const EFFECT_TYPES: EffectType[] = ["required", "readOnly", "setValue", "warning", "blockSave"]

/** The fields of a table a rule effect may point at. A rule can't type a lookup, and Product lines keep Estimated value. */
export function effectFields(table: EngineTable, type: "required" | "readOnly" | "setValue" | "warning"): string[] {
  return Object.entries(FIELD_CATALOGUE[table] ?? {})
    .filter(([name, info]) => type !== "setValue" || (info.type !== "lookup" && !(table === "opportunity" && name === "estimatedValue")))
    .map(([name]) => name)
}

export function fieldInfoOf(table: EngineTable, field: string): FieldInfo | undefined {
  return FIELD_CATALOGUE[table]?.[field]
}

/** The value a new Set value effect starts from. */
export function defaultSetValue(info: FieldInfo | undefined): Scalar {
  switch (info?.type) {
    case "choice":
      return info.options?.[0] ?? ""
    case "number":
      return 0
    case "boolean":
      return true
    default:
      return ""
  }
}

export function newEffect(table: EngineTable, type: EffectType): Effect {
  switch (type) {
    case "required":
    case "readOnly":
      return { type, field: effectFields(table, type)[0] }
    case "setValue": {
      const field = effectFields(table, "setValue")[0]
      return { type, field, value: defaultSetValue(fieldInfoOf(table, field)) }
    }
    case "warning":
      return { type, message: "" }
    case "blockSave":
      return { type, message: "" }
  }
}

/** Everything saving a rule refuses or warns about, against the real field catalogue. */
export function checkRule(input: { rule: RuleInput; otherRules: BusinessRuleRow[]; processes?: ProcessDefinition[] }): PublishResult {
  const { rule, otherRules, processes } = input
  return checkRuleForPublish({
    rule: { id: rule.id ?? "new-rule", name: rule.name, enabled: rule.enabled, definition: rule.definition },
    otherRules,
    processes,
    fields: FIELD_CATALOGUE,
  })
}

/** What a rule would do to a real record, for "Try it on a record". */
export type RuleTry = {
  /** Whether the rule's conditions hold on the record right now. */
  applies: boolean
  effects: Effect[]
}

export function tryRule(
  definition: BusinessRuleDefinition,
  subject: { record: EngineRecord; parents?: Parents; related?: Related },
): RuleTry {
  const scope = { table: definition.table, record: subject.record, parents: subject.parents, related: subject.related }
  const applies = conditionsHold(scope, definition.when)
  // Run through the same engine call the record pages use, with this one rule forced on.
  const outcome = ruleEffects(scope, [{ id: "try", name: "try", enabled: true, definition }], FIELD_CATALOGUE)
  const effects: Effect[] = applies
    ? [
        ...outcome.required.map((e): Effect => ({ type: "required", field: e.field })),
        ...outcome.readOnly.map((e): Effect => ({ type: "readOnly", field: e.field })),
        ...outcome.setValues.map((e): Effect => ({ type: "setValue", field: e.field, value: e.value })),
        ...outcome.warnings.map((e): Effect => ({ type: "warning", message: e.message, ...(e.field ? { field: e.field } : {}) })),
        ...outcome.blocks.map((e): Effect => ({ type: "blockSave", message: e.message })),
      ]
    : []
  return { applies, effects }
}

/** The four tables a rule can be on, in the order the tabs show them. */
export const RULE_TABLES: { value: EngineTable; label: string; noun: string }[] = [
  { value: "lead", label: "Leads", noun: "Lead" },
  { value: "opportunity", label: "Opportunities", noun: "Opportunity" },
  { value: "account", label: "Accounts", noun: "Account" },
  { value: "contact", label: "Contacts", noun: "Contact" },
]

/** The first thing that keeps a rule from running (a removed field or choice value), if any. */
export function ruleProblemOf(rule: BusinessRuleRow) {
  return ruleProblem(rule, FIELD_CATALOGUE)
}
