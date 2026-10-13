import { checkFieldReference, checkReferences, conditionsHold, type ConditionScope, type ReferenceProblem } from "./conditions"
import type { BusinessRuleRow, EngineErrorReport, EngineTable, FieldCatalogue, Scalar } from "./types"

export type RuleRef = { ruleId: string; ruleName: string }
export type FieldEffect = RuleRef & { field: string }
export type MessageEffect = RuleRef & { message: string; field?: string }
export type SetValueEffect = FieldEffect & { value: Scalar | null }

/** The rule effects that hold on a record as it is now, for showing at the field. */
export type RuleEffects = {
  required: FieldEffect[]
  readOnly: FieldEffect[]
  /** Values rules set, for the "Filled in by the rule" hint. */
  setValues: SetValueEffect[]
  warnings: MessageEffect[]
  blocks: MessageEffect[]
  engineErrors: EngineErrorReport[]
}

/** The first problem that keeps a rule from running: a removed field or choice value, or a field no rule may use. */
export function ruleProblem(rule: BusinessRuleRow, catalogue: FieldCatalogue | undefined): ReferenceProblem | null {
  const table = rule.definition.table
  const conditionProblem = checkReferences(catalogue, table, rule.definition.when.conditions)[0]
  if (conditionProblem) return conditionProblem
  for (const effect of rule.definition.effects) {
    if (!("field" in effect) || !effect.field) continue
    const values = effect.type === "setValue" ? [effect.value] : []
    const problem = checkFieldReference(catalogue, table, effect.field, values)
    if (problem) return problem
  }
  return null
}

/**
 * The enabled rules of a table that can run, plus an Engine error for each one
 * that can't. A broken rule fails open: it is skipped, never blocks (#88 point 7).
 */
export function runnableRules(
  table: EngineTable,
  rules: BusinessRuleRow[],
  catalogue: FieldCatalogue | undefined,
): { rules: BusinessRuleRow[]; engineErrors: EngineErrorReport[] } {
  const runnable: BusinessRuleRow[] = []
  const engineErrors: EngineErrorReport[] = []
  for (const rule of rules) {
    if (!rule.enabled || rule.definition.table !== table) continue
    const problem = ruleProblem(rule, catalogue)
    if (problem) engineErrors.push({ ruleId: rule.id, code: problem.code, message: problem.message })
    else runnable.push(rule)
  }
  return { rules: runnable, engineErrors }
}

export function ruleEffects(
  scope: ConditionScope,
  rules: BusinessRuleRow[],
  catalogue?: FieldCatalogue,
): RuleEffects {
  const { rules: runnable, engineErrors } = runnableRules(scope.table, rules, catalogue)
  const effects: RuleEffects = { required: [], readOnly: [], setValues: [], warnings: [], blocks: [], engineErrors }
  for (const rule of runnable) {
    if (!conditionsHold(scope, rule.definition.when)) continue
    const ref = { ruleId: rule.id, ruleName: rule.name }
    for (const effect of rule.definition.effects) {
      switch (effect.type) {
        case "required":
          effects.required.push({ ...ref, field: effect.field })
          break
        case "readOnly":
          effects.readOnly.push({ ...ref, field: effect.field })
          break
        case "setValue":
          effects.setValues.push({ ...ref, field: effect.field, value: effect.value })
          break
        case "warning":
          effects.warnings.push({ ...ref, message: effect.message, field: effect.field })
          break
        case "blockSave":
          effects.blocks.push({ ...ref, message: effect.message })
          break
      }
    }
  }
  return effects
}

export function blockMessage(ruleName: string, message: string): string {
  return `Blocked by the rule “${ruleName}”: ${message}`
}

export function requiredMessage(ruleName: string, field: string): string {
  return `${field} is required by the rule “${ruleName}”.`
}

export function readOnlyMessage(ruleName: string, field: string): string {
  return `${field} is read-only because of the rule “${ruleName}”.`
}
