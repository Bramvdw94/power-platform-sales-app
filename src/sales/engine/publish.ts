import { checkFieldReference, checkReferences, fieldsRead, isRelatedCheck, type ReferenceProblem } from "./conditions"
import { STEP_STATUS_ORDER } from "./process"
import type { BusinessRuleRow, Check, FieldCatalogue, FieldCondition, ProcessDefinition } from "./types"

/** The builder's size limits (#88 point 9). */
export const LIMITS = {
  stepsPerProcess: 20,
  keyFieldsPerStep: 5,
  conditionsPerGroup: 10,
  relatedChecksPerGroup: 3,
  enabledRulesPerTable: 50,
} as const

export type PublishIssueCode =
  | ReferenceProblem["code"]
  | "noSteps"
  | "tooManySteps"
  | "tooManyKeyFields"
  | "tooManyConditions"
  | "tooManyRelatedChecks"
  | "tooManyRules"
  | "duplicateStepId"
  | "stepStatusInvalid"
  | "stepsOutOfOrder"
  | "gateFieldReadOnly"
  | "setValueCycle"
  | "setsEstimatedValue"
  | "nameMissing"
  | "noEffects"
  | "messageMissing"
  | "sameFieldSetByOtherRule"

export type PublishIssue = {
  code: PublishIssueCode
  message: string
  stepId?: string
  ruleId?: string
  field?: string
}

/** Errors stop Publish; warnings are shown but don't. */
export type PublishResult = { errors: PublishIssue[]; warnings: PublishIssue[] }

const LEAD_STEP_STATUSES = ["notContacted", "working"]
const OPPORTUNITY_STEP_STATUSES = ["qualification", "needsAnalysis", "proposal", "negotiation"]

function sizeIssues(checks: Check[], where: string, extra: Partial<PublishIssue> = {}): PublishIssue[] {
  const issues: PublishIssue[] = []
  if (checks.length > LIMITS.conditionsPerGroup) {
    issues.push({
      code: "tooManyConditions",
      message: `${where} has ${checks.length} conditions; the most is ${LIMITS.conditionsPerGroup}.`,
      ...extra,
    })
  }
  const related = checks.filter(isRelatedCheck).length
  if (related > LIMITS.relatedChecksPerGroup) {
    issues.push({
      code: "tooManyRelatedChecks",
      message: `${where} has ${related} related-record checks; the most is ${LIMITS.relatedChecksPerGroup}.`,
      ...extra,
    })
  }
  return issues
}

/** The record's own fields a Gate needs a value in. */
function gateFields(checks: Check[]): string[] {
  return checks
    .filter((c): c is FieldCondition => !isRelatedCheck(c) && !c.field.includes("."))
    .filter((c) => c.op !== "isEmpty" && c.op !== "isNot")
    .map((c) => c.field)
}

/** Whether a rule's condition can only hold once the field has a value, so its read-only never locks an empty field. */
function onlyWhenFilled(rule: BusinessRuleRow, field: string): boolean {
  const { match, conditions } = rule.definition.when
  if (match !== "all" && conditions.length > 1) return false
  return conditions.some((c) => !isRelatedCheck(c) && c.field === field && c.op !== "isEmpty" && c.op !== "isNot")
}

function readOnlyLocks(rules: BusinessRuleRow[], field: string): BusinessRuleRow[] {
  return rules.filter(
    (r) =>
      r.enabled &&
      r.definition.effects.some((e) => e.type === "readOnly" && e.field === field) &&
      !onlyWhenFilled(r, field),
  )
}

export function checkProcessForPublish(input: {
  definition: ProcessDefinition
  /** The table's published Business rules. */
  rules?: BusinessRuleRow[]
  fields?: FieldCatalogue
}): PublishResult {
  const { definition, fields } = input
  const table = definition.table
  const rules = (input.rules ?? []).filter((r) => r.definition.table === table)
  const errors: PublishIssue[] = []
  const reference = (problem: ReferenceProblem, stepId?: string): PublishIssue => ({
    code: problem.code,
    message: problem.message,
    field: problem.field,
    ...(stepId ? { stepId } : {}),
  })

  if (definition.steps.length === 0) {
    errors.push({ code: "noSteps", message: "A Process needs at least one Step." })
  }
  if (definition.steps.length > LIMITS.stepsPerProcess) {
    errors.push({
      code: "tooManySteps",
      message: `This Process has ${definition.steps.length} Steps; the most is ${LIMITS.stepsPerProcess}.`,
    })
  }

  const criteria = definition.entryCriteria?.conditions ?? []
  errors.push(...sizeIssues(criteria, "The Entry criteria"))
  errors.push(...checkReferences(fields, table, criteria).map((p) => reference(p)))

  const allowed = table === "lead" ? LEAD_STEP_STATUSES : OPPORTUNITY_STEP_STATUSES
  const seen = new Set<string>()
  let highest = -1
  let outOfOrder = false
  for (const step of definition.steps) {
    const at = { stepId: step.id }
    if (seen.has(step.id)) errors.push({ code: "duplicateStepId", message: `Two Steps share the id ${step.id}.`, ...at })
    seen.add(step.id)

    if (!allowed.includes(step.mapsTo)) {
      errors.push({ code: "stepStatusInvalid", message: `“${step.name}” maps to ${step.mapsTo}, which a ${table} can't have.`, ...at })
    } else {
      const order = STEP_STATUS_ORDER[step.mapsTo]
      if (order < highest && !outOfOrder) {
        outOfOrder = true
        errors.push({
          code: "stepsOutOfOrder",
          message: `“${step.name}” maps to an earlier ${table === "lead" ? "Lead status" : "Stage"} than the Step before it. Put the Steps in ${table === "lead" ? "Lead status" : "Stage"} order.`,
          ...at,
        })
      }
      highest = Math.max(highest, order)
    }

    const keyFields = step.keyFields ?? []
    if (keyFields.length > LIMITS.keyFieldsPerStep) {
      errors.push({
        code: "tooManyKeyFields",
        message: `“${step.name}” has ${keyFields.length} Key fields; the most is ${LIMITS.keyFieldsPerStep}.`,
        ...at,
      })
    }
    for (const field of keyFields) {
      const problem = checkFieldReference(fields, table, field)
      if (problem) errors.push(reference(problem, step.id))
    }

    const checks = step.gate?.checks ?? []
    errors.push(...sizeIssues(checks, `The Gate of “${step.name}”`, at))
    errors.push(...checkReferences(fields, table, checks).map((p) => reference(p, step.id)))
    for (const field of gateFields(checks)) {
      for (const rule of readOnlyLocks(rules, field)) {
        errors.push({
          code: "gateFieldReadOnly",
          message: `The Gate of “${step.name}” needs ${field}, but the rule “${rule.name}” can make it read-only while it is empty.`,
          ...at,
          ruleId: rule.id,
          field,
        })
      }
    }

    for (const action of step.actions ?? []) {
      if (action.type !== "setField") continue
      const problem = checkFieldReference(fields, table, action.field, [action.value])
      if (problem) errors.push(reference(problem, step.id))
    }
  }
  return { errors, warnings: [] }
}

/**
 * The set value cycle a rule would close among the enabled rules of its
 * table: rule A sets a field rule B reads, and so on back to A. A rule that
 * reads and sets the same field on its own (a default value) is not a cycle.
 */
function setValueCycle(rule: BusinessRuleRow, others: BusinessRuleRow[]): string[] | null {
  const all = [rule, ...others.filter((r) => r.enabled && r.id !== rule.id)]
  const sets = new Map(all.map((r) => [r.id, r.definition.effects.flatMap((e) => (e.type === "setValue" ? [e.field] : []))]))
  const reads = new Map(all.map((r) => [r.id, fieldsRead(r.definition.table, r.definition.when)]))
  // Rule X feeds rule Y when X sets a field Y reads.
  const feeds = (x: string, y: string) => x !== y && sets.get(x)!.some((f) => reads.get(y)!.has(f))

  const path: string[] = []
  const visit = (id: string): string[] | null => {
    if (path.includes(id)) return id === rule.id ? [...path] : null
    path.push(id)
    for (const next of all) {
      if (feeds(id, next.id)) {
        const cycle = visit(next.id)
        if (cycle) return cycle
      }
    }
    path.pop()
    return null
  }
  return visit(rule.id)
}

export function checkRuleForPublish(input: {
  rule: BusinessRuleRow
  /** The other published rules of the table. */
  otherRules?: BusinessRuleRow[]
  /** The latest published Process definitions, to protect their Gates. */
  processes?: ProcessDefinition[]
  fields?: FieldCatalogue
}): PublishResult {
  const { rule, fields } = input
  const { table, when, effects } = rule.definition
  const others = (input.otherRules ?? []).filter((r) => r.id !== rule.id && r.definition.table === table)
  const errors: PublishIssue[] = []
  const warnings: PublishIssue[] = []
  const at = { ruleId: rule.id }

  if (!rule.name.trim()) errors.push({ code: "nameMissing", message: "Give the rule a name.", ...at })
  if (effects.length === 0) errors.push({ code: "noEffects", message: "Add at least one effect.", ...at })
  for (const effect of effects) {
    if ((effect.type === "warning" || effect.type === "blockSave") && !effect.message.trim()) {
      errors.push({ code: "messageMissing", message: `Write the message of the ${effect.type === "warning" ? "warning" : "block save"} effect.`, ...at })
    }
  }
  errors.push(...sizeIssues(when.conditions, "This rule", at))
  const enabled = others.filter((r) => r.enabled).length + (rule.enabled ? 1 : 0)
  if (enabled > LIMITS.enabledRulesPerTable) {
    errors.push({
      code: "tooManyRules",
      message: `A table can have at most ${LIMITS.enabledRulesPerTable} rules switched on.`,
      ...at,
    })
  }

  for (const problem of checkReferences(fields, table, when.conditions)) {
    errors.push({ code: problem.code, message: problem.message, field: problem.field, ...at })
  }
  for (const effect of effects) {
    if (!("field" in effect) || !effect.field) continue
    const problem = checkFieldReference(fields, table, effect.field, effect.type === "setValue" ? [effect.value] : [])
    if (problem) errors.push({ code: problem.code, message: problem.message, field: problem.field, ...at })
  }

  for (const effect of effects) {
    if (effect.type === "setValue" && table === "opportunity" && effect.field === "estimatedValue") {
      errors.push({
        code: "setsEstimatedValue",
        message: "A rule can't set Estimated value: Product lines keep it up to date when an Opportunity has them.",
        ...at,
        field: effect.field,
      })
    }
  }

  const cycle = setValueCycle(rule, others)
  if (cycle) {
    const names = cycle.map((id) => `“${[rule, ...others].find((r) => r.id === id)!.name}”`)
    errors.push({
      code: "setValueCycle",
      message: `The rules ${names.join(" → ")} would keep setting each other's fields.`,
      ...at,
    })
  }

  for (const effect of effects) {
    if (effect.type === "setValue") {
      for (const other of others) {
        if (other.enabled && other.definition.effects.some((e) => e.type === "setValue" && e.field === effect.field)) {
          warnings.push({
            code: "sameFieldSetByOtherRule",
            message: `The rule “${other.name}” also sets ${effect.field}; the last change wins.`,
            ...at,
            field: effect.field,
          })
        }
      }
    }
    if (effect.type === "readOnly" && rule.enabled && !onlyWhenFilled(rule, effect.field)) {
      for (const process of input.processes ?? []) {
        if (process.table !== table) continue
        const step = process.steps.find((s) => gateFields(s.gate?.checks ?? []).includes(effect.field))
        if (step) {
          errors.push({
            code: "gateFieldReadOnly",
            message: `The Gate of “${step.name}” needs ${effect.field}, and this rule can make it read-only while it is empty.`,
            ...at,
            stepId: step.id,
            field: effect.field,
          })
        }
      }
    }
  }
  return { errors, warnings }
}
