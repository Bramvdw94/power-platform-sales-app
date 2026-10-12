import type {
  Check,
  ConditionGroup,
  EngineRecord,
  EngineTable,
  FieldCatalogue,
  FieldCondition,
  FieldValue,
  Parents,
  Related,
  RelatedCheck,
  RelatedList,
  Scalar,
} from "./types"

/** Parents one hop up per table, with the lookup field on the record that points at each. */
export const PARENTS: Record<EngineTable, Record<string, { table: EngineTable; lookup: string }>> = {
  lead: {},
  opportunity: {
    account: { table: "account", lookup: "accountId" },
    primaryContact: { table: "contact", lookup: "primaryContactId" },
    originatingLead: { table: "lead", lookup: "originatingLeadId" },
  },
  account: {},
  contact: { account: { table: "account", lookup: "accountId" } },
}

/** The related lists a condition may count on each table, and the table of their items. */
export const RELATED_LISTS: Record<EngineTable, Partial<Record<RelatedList, string>>> = {
  lead: { tasks: "task", phoneCalls: "phoneCall", notes: "note" },
  opportunity: { tasks: "task", phoneCalls: "phoneCall", notes: "note", productLines: "productLine", quotes: "quote" },
  account: { tasks: "task", phoneCalls: "phoneCall", notes: "note", contacts: "contact", opportunities: "opportunity" },
  contact: { tasks: "task", phoneCalls: "phoneCall", notes: "note" },
}

export const ACTIVITY_LISTS: readonly RelatedList[] = ["tasks", "phoneCalls", "notes"]

/**
 * Columns the engine itself manages on a Lead or Opportunity. A Step move is a
 * write to currentStepId; Switch Process and Move to latest version write
 * processVersionId.
 */
export const ENGINE_COLUMNS = ["processVersionId", "currentStepId", "stepEnteredOn"] as const

/**
 * Fields no Gate, Action, Key field or rule may use (#64 point 11): system
 * fields, Owner, Stage, Lead status, the close and disqualify fields, display
 * names, and the engine's own columns.
 */
export const NOT_USABLE_FIELDS: readonly string[] = [
  "id",
  "ownerId",
  "ownerName",
  "createdOn",
  "modifiedOn",
  "stage",
  "status",
  "actualValue",
  "closeDate",
  "lostReason",
  "lostComment",
  "closedById",
  "closedByName",
  "disqualifyReason",
  "disqualifyComment",
  "disqualifiedOn",
  "disqualifiedById",
  "accountName",
  "primaryContactName",
  ...ENGINE_COLUMNS,
]

export function isRelatedCheck(check: Check): check is RelatedCheck {
  return "related" in check
}

export function isEmptyValue(value: FieldValue): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "")
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/

function asComparable(value: FieldValue): number | null {
  if (typeof value === "number") return value
  if (typeof value === "string" && DATE_PATTERN.test(value)) {
    const time = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value)
    return Number.isNaN(time) ? null : time
  }
  return null
}

function sameValue(a: FieldValue, b: Scalar): boolean {
  if (isEmptyValue(a)) return false
  return a === b
}

/** Whether one field condition holds for a value. Comparisons are exact; greater/less work on numbers and dates. */
export function compare(value: FieldValue, condition: Pick<FieldCondition, "op" | "value">): boolean {
  const target = condition.value
  switch (condition.op) {
    case "isEmpty":
      return isEmptyValue(value)
    case "isNotEmpty":
      return !isEmptyValue(value)
    case "equals":
      return sameValue(value, target as Scalar)
    case "isNot":
      return !sameValue(value, target as Scalar)
    case "isOneOf":
      return (Array.isArray(target) ? target : [target as Scalar]).some((t) => sameValue(value, t))
    case "greaterThan":
    case "lessThan": {
      if (isEmptyValue(value)) return false
      const left = asComparable(value)
      const right = asComparable(target as Scalar)
      if (left === null || right === null) return false
      return condition.op === "greaterThan" ? left > right : left < right
    }
  }
}

/** What a condition can see: the record, its parents one hop up and its related lists. */
export type ConditionScope = {
  table: EngineTable
  record: EngineRecord
  parents?: Parents
  related?: Related
}

export function fieldValue(scope: ConditionScope, ref: string): FieldValue {
  const dot = ref.indexOf(".")
  if (dot < 0) return scope.record[ref]
  const parent = scope.parents?.[ref.slice(0, dot)]
  return parent ? parent[ref.slice(dot + 1)] : undefined
}

function relatedCheckHolds(scope: ConditionScope, check: RelatedCheck): boolean {
  let items = scope.related?.[check.related] ?? []
  const since = scope.record.stepEnteredOn
  if (check.sinceStepEntered && typeof since === "string" && since) {
    const from = Date.parse(since)
    items = items.filter((item) => typeof item.createdOn === "string" && Date.parse(item.createdOn) >= from)
  }
  const where = check.where ?? []
  const matching = items.filter((item) =>
    groupHolds(check.match ?? "all", where.map((c) => compare(item[c.field], c))),
  )
  return matching.length >= check.atLeast
}

export function checkHolds(scope: ConditionScope, check: Check): boolean {
  if (isRelatedCheck(check)) return relatedCheckHolds(scope, check)
  return compare(fieldValue(scope, check.field), check)
}

function groupHolds(match: "all" | "any", results: boolean[]): boolean {
  if (results.length === 0) return true
  return match === "all" ? results.every(Boolean) : results.some(Boolean)
}

export function conditionsHold(scope: ConditionScope, group: Pick<ConditionGroup, "match" | "conditions">): boolean {
  return groupHolds(
    group.match,
    group.conditions.map((c) => checkHolds(scope, c)),
  )
}

/**
 * The record's own fields a condition group reads. A parent field reads the
 * lookup that points at the parent, so changing the Account of an Opportunity
 * counts as changing "account.accountType".
 */
export function fieldsRead(table: EngineTable, group: Pick<ConditionGroup, "conditions">): Set<string> {
  const fields = new Set<string>()
  for (const check of group.conditions) {
    if (isRelatedCheck(check)) continue
    const dot = check.field.indexOf(".")
    if (dot < 0) fields.add(check.field)
    else {
      const lookup = PARENTS[table][check.field.slice(0, dot)]?.lookup
      if (lookup) fields.add(lookup)
    }
  }
  return fields
}

/** A problem with a field reference: a field or choice value that does not exist, or a field no rule may use. */
export type ReferenceProblem = {
  code: "fieldMissing" | "choiceMissing" | "fieldNotUsable" | "parentNotAllowed" | "relatedNotAllowed"
  field: string
  message: string
}

/** Resolve a field reference to its table and own field name, or a problem when the parent is not one hop up from this table. */
function resolve(table: EngineTable, ref: string): { table: string; field: string } | ReferenceProblem {
  const dot = ref.indexOf(".")
  if (dot < 0) return { table, field: ref }
  const parentName = ref.slice(0, dot)
  const parent = PARENTS[table][parentName]
  if (!parent) {
    return { code: "parentNotAllowed", field: ref, message: `A ${table} has no parent "${parentName}".` }
  }
  return { table: parent.table, field: ref.slice(dot + 1) }
}

/** Check a field reference, and the choice values used with it, against the field catalogue. */
export function checkFieldReference(
  catalogue: FieldCatalogue | undefined,
  table: EngineTable | string,
  ref: string,
  values: (Scalar | null | undefined)[] = [],
): ReferenceProblem | null {
  const resolved = (PARENTS as Record<string, unknown>)[table] ? resolve(table as EngineTable, ref) : { table, field: ref }
  if ("code" in resolved) return resolved
  if (NOT_USABLE_FIELDS.includes(resolved.field)) {
    return { code: "fieldNotUsable", field: ref, message: `The field "${ref}" can't be used in a Process or Business rule.` }
  }
  const fields = catalogue?.[resolved.table]
  if (!fields) return null
  const info = fields[resolved.field]
  if (!info) return { code: "fieldMissing", field: ref, message: `The field "${ref}" no longer exists.` }
  if (info.type === "choice" && info.options) {
    for (const value of values) {
      if (typeof value === "string" && !info.options.includes(value)) {
        return { code: "choiceMissing", field: ref, message: `The choice "${value}" no longer exists for "${ref}".` }
      }
    }
  }
  return null
}

function conditionValues(condition: FieldCondition): Scalar[] {
  if (condition.value === undefined) return []
  return Array.isArray(condition.value) ? condition.value : [condition.value]
}

/** Every reference problem in a list of checks on a table. */
export function checkReferences(
  catalogue: FieldCatalogue | undefined,
  table: EngineTable,
  checks: Check[],
): ReferenceProblem[] {
  const problems: ReferenceProblem[] = []
  for (const check of checks) {
    if (isRelatedCheck(check)) {
      const itemTable = RELATED_LISTS[table][check.related]
      if (!itemTable) {
        problems.push({
          code: "relatedNotAllowed",
          field: check.related,
          message: `A ${table} has no related list "${check.related}".`,
        })
        continue
      }
      for (const c of check.where ?? []) {
        const problem = checkFieldReference(catalogue, itemTable, c.field, conditionValues(c))
        // Fields of related records are read-only data to the condition, so "not usable" doesn't apply to them.
        if (problem && problem.code !== "fieldNotUsable") problems.push({ ...problem, field: `${check.related}.${c.field}` })
      }
      continue
    }
    const problem = checkFieldReference(catalogue, table, check.field, conditionValues(check))
    if (problem) problems.push(problem)
  }
  return problems
}
