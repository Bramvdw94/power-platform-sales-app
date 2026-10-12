import {
  checkFieldReference,
  checkReferences,
  conditionsHold,
  fieldsRead,
  isEmptyValue,
  ENGINE_COLUMNS,
  type ConditionScope,
} from "./conditions"
import { gateChecklist, landingStep, lastStep, pickProcess, stepIndex, STEP_STATUS_ORDER } from "./process"
import { blockMessage, readOnlyMessage, requiredMessage, ruleEffects, runnableRules } from "./rules"
import type {
  BusinessRuleRow,
  EngineErrorReport,
  EngineRecord,
  EngineTable,
  FieldCatalogue,
  FieldValue,
  Parents,
  ProcessRow,
  ProcessVersionRow,
  Related,
  Step,
  UserInfo,
} from "./types"

/** How many rounds set values may chain in one save before it fails (#88 point 1). */
export const MAX_SET_VALUE_ROUNDS = 5

export type SaveInput = {
  table: EngineTable
  /** The record as stored; null on create. */
  before: EngineRecord | null
  /** The fields the caller writes. */
  change: EngineRecord
  /** Parents one hop up of the record as it will be after the save. */
  parents?: Parents
  /** The record's related lists as they are now. */
  related?: Related
  caller: { id: string; isProcessBuilder?: boolean }
  users?: Record<string, UserInfo>
  /** The moment of the save, as an ISO timestamp. */
  now: string
  /** The kill switch: false means neither engine evaluates anything. */
  engineEnabled?: boolean
  processes?: ProcessRow[]
  versions?: ProcessVersionRow[]
  /** The table's published Business rules (enabled or not). */
  rules?: BusinessRuleRow[]
  fields?: FieldCatalogue
}

/**
 * What kind of save this is. Reassign, Close as lost, Disqualify, Switch
 * Process and Move to latest version are recognised by the columns they change
 * and are never stopped by a required, read-only or block save rule (#88 point 4).
 */
export type SaveKind = "create" | "update" | "reassign" | "closeLost" | "disqualify" | "switchProcess"

export const EXEMPT_SAVE_KINDS: readonly SaveKind[] = ["reassign", "closeLost", "disqualify", "switchProcess"]

export type RejectionCode =
  | "gate"
  | "required"
  | "readOnly"
  | "blockSave"
  | "setValueLoop"
  | "switchNotAllowed"
  | "closedRecord"
  | "unknownStep"
  | "unknownVersion"
  | "stepStatusMismatch"
  | "noStepForStatus"
  | "qualifyNotFromLastStep"

export type Rejection = {
  code: RejectionCode
  message: string
  ruleIds?: string[]
  stepId?: string
  /** Gate checks that failed, by their position in the Gate. */
  failedChecks?: number[]
}

export type TaskToCreate = {
  actionId: string
  stepId: string
  subject: string
  description?: string
  dueDate: string
  ownerId: string
}

export type SaveOutcome = {
  kind: SaveKind
  allowed: boolean
  rejection?: Rejection
  /** What to write: the caller's change plus everything the engine sets. */
  changes: EngineRecord
  /** Action Tasks to create after the save, in the same transaction. */
  tasks: TaskToCreate[]
  warnings: { ruleId: string; message: string; field?: string }[]
  engineErrors: EngineErrorReport[]
}

const STATUS_FIELD: Partial<Record<EngineTable, string>> = { opportunity: "stage", lead: "status" }

function same(a: FieldValue, b: FieldValue): boolean {
  if (isEmptyValue(a) && isEmptyValue(b)) return true
  return a === b
}

function isOpenStatus(status: FieldValue): boolean {
  return typeof status === "string" && status in STEP_STATUS_ORDER
}

function addDays(now: string, days: number): string {
  const date = new Date(`${now.slice(0, 10)}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function classifySave(table: EngineTable, before: EngineRecord | null, change: EngineRecord): SaveKind {
  if (!before) return "create"
  const changed = Object.keys(change).filter((f) => !same(before[f], change[f]))
  if (changed.includes("processVersionId")) return "switchProcess"
  if (table === "opportunity" && changed.includes("stage") && change.stage === "closedLost") return "closeLost"
  if (table === "lead" && changed.includes("status") && change.status === "disqualified") return "disqualify"
  if (changed.length > 0 && changed.every((f) => f === "ownerId" || f === "ownerName")) return "reassign"
  return "update"
}

class Rejected extends Error {
  readonly rejection: Rejection
  constructor(rejection: Rejection) {
    super(rejection.message)
    this.rejection = rejection
  }
}

/**
 * Decide a save of a Lead, Opportunity, Account or Contact: what the plug-in
 * does before the write (pick a Process, check Gates, set Stage or Lead status
 * from the Step, apply rules) and which Action Tasks it creates after it. The
 * in-memory gateway runs the same function, so the app behaves like the plug-in.
 */
export function evaluateSave(input: SaveInput): SaveOutcome {
  const kind = classifySave(input.table, input.before, input.change)
  const outcome: SaveOutcome = {
    kind,
    allowed: true,
    changes: { ...input.change },
    tasks: [],
    warnings: [],
    engineErrors: [],
  }
  if (input.engineEnabled === false) return outcome
  if (!input.before) {
    // The engine picks the Process of a new record; a create can't choose its own.
    const change = { ...input.change }
    for (const column of ENGINE_COLUMNS) delete change[column]
    input = { ...input, change }
    outcome.changes = { ...change }
  }
  try {
    return runSave(input, outcome)
  } catch (error) {
    if (error instanceof Rejected) return { ...outcome, allowed: false, rejection: error.rejection, tasks: [] }
    throw error
  }
}

function runSave(input: SaveInput, outcome: SaveOutcome): SaveOutcome {
  const { table, before, change } = input
  const exempt = EXEMPT_SAVE_KINDS.includes(outcome.kind)
  const state: EngineRecord = { ...(before ?? {}), ...change }
  const scopeOf = (record: EngineRecord): ConditionScope => ({
    table,
    record,
    parents: input.parents,
    related: input.related,
  })
  const addError = (error: EngineErrorReport) => {
    const key = JSON.stringify([error.ruleId, error.processId, error.actionId, error.code])
    if (!outcome.engineErrors.some((e) => JSON.stringify([e.ruleId, e.processId, e.actionId, e.code]) === key)) {
      outcome.engineErrors.push(error)
    }
  }

  const { rules, engineErrors: ruleErrors } = runnableRules(table, input.rules ?? [], input.fields)
  ruleErrors.forEach(addError)

  // Set value fires when its condition becomes true: it holds now but did not
  // hold on the stored record (or the record is new).
  const heldBefore = new Map(
    rules.map((r) => [r.id, before ? conditionsHold(scopeOf(before), r.definition.when) : false]),
  )
  let roundsUsed = 0
  const everChanged = new Set<string>()
  const runSetValues = () => {
    if (exempt) return
    for (;;) {
      const snapshot = { ...state }
      const changedBy = new Set<string>()
      for (const rule of rules) {
        if (heldBefore.get(rule.id) || !conditionsHold(scopeOf(snapshot), rule.definition.when)) continue
        for (const effect of rule.definition.effects) {
          if (effect.type !== "setValue") continue
          // Estimated value is kept from Product lines while they exist (#69); rules don't fight it.
          if (effect.field === "estimatedValue" && (input.related?.productLines?.length ?? 0) > 0) continue
          if (!same(state[effect.field], effect.value)) {
            state[effect.field] = effect.value
            changedBy.add(rule.id)
          }
        }
      }
      if (changedBy.size === 0) return
      changedBy.forEach((id) => everChanged.add(id))
      roundsUsed += 1
      if (roundsUsed > MAX_SET_VALUE_ROUNDS) {
        const names = rules.filter((r) => everChanged.has(r.id)).map((r) => `“${r.name}”`)
        throw new Rejected({
          code: "setValueLoop",
          message: `The rules ${names.join(", ")} keep changing each other's fields, so the record can't be saved.`,
          ruleIds: [...everChanged],
        })
      }
    }
  }

  runSetValues()
  const statusMoved = handleProcess(input, outcome, state, scopeOf, addError)
  runSetValues()

  if (!exempt) checkRules(input, rules, state, statusMoved, scopeOf)

  outcome.warnings = ruleEffects(scopeOf(state), rules).warnings.map(({ ruleId, message, field }) =>
    field ? { ruleId, message, field } : { ruleId, message },
  )
  outcome.changes = diff(before, change, state)
  return outcome

  function diff(stored: EngineRecord | null, written: EngineRecord, final: EngineRecord): EngineRecord {
    const changes: EngineRecord = { ...written }
    for (const [field, value] of Object.entries(final)) {
      if (field in written || !stored || !same(stored[field], value)) changes[field] = value
    }
    for (const field of Object.keys(changes)) if (changes[field] === undefined) delete changes[field]
    return changes
  }
}

/**
 * Process work for a Lead or Opportunity save: pick at create, Switch Process
 * and Move to latest version, Step moves with their Gates and Actions, and the
 * Stage or Lead status following the Step. Returns whether the record moved
 * Step, Stage or status in a way that makes required rules fire.
 */
function handleProcess(
  input: SaveInput,
  outcome: SaveOutcome,
  state: EngineRecord,
  scopeOf: (record: EngineRecord) => ConditionScope,
  addError: (error: EngineErrorReport) => void,
): boolean {
  const { table, before, change, now } = input
  const statusField = STATUS_FIELD[table]
  if (!statusField) return before === null
  const versions = input.versions ?? []
  const beforeStatus = before?.[statusField]
  const afterStatus = state[statusField]

  const land = (step: Step, keepEntered: boolean) => {
    state.currentStepId = step.id
    if (!keepEntered) state.stepEnteredOn = now
    state[statusField] = step.mapsTo
  }

  if (!before) {
    const usable = (input.processes ?? []).filter((p) => {
      const version = versions.find((v) => v.id === p.latestVersionId)
      const problems = checkReferences(input.fields, table, version?.definition.entryCriteria?.conditions ?? [])
      problems.forEach((problem) => addError({ processId: p.id, code: problem.code, message: problem.message }))
      return problems.length === 0
    })
    const picked = pickProcess(scopeOf(state), usable, versions)
    if (!picked) return true
    state.processVersionId = picked.version.id
    const step = landingStep(picked.version.definition, String(afterStatus))
    land(step, false)
    runActions(input, outcome, state, picked.version, step, addError)
    return true
  }

  const changed = (field: string) => field in change && !same(before[field], change[field])

  if (changed("processVersionId")) {
    if (!isOpenStatus(beforeStatus)) {
      throw new Rejected({ code: "closedRecord", message: "A closed record keeps its Process." })
    }
    const ownerManager = input.users?.[String(before.ownerId)]?.managerId
    if (!input.caller.isProcessBuilder && ownerManager !== input.caller.id) {
      throw new Rejected({
        code: "switchNotAllowed",
        message: "Only the Owner's manager or a Process builder can switch the Process.",
      })
    }
    if (isEmptyValue(change.processVersionId)) {
      state.processVersionId = null
      state.currentStepId = null
      state.stepEnteredOn = null
      return false
    }
    const target = versions.find((v) => v.id === change.processVersionId)
    if (!target) throw new Rejected({ code: "unknownVersion", message: "That Process version doesn't exist." })
    const current = versions.find((v) => v.id === before.processVersionId)
    const isMove = current?.processId === target.processId
    const step = landingStep(target.definition, String(beforeStatus), isMove ? (before.currentStepId as string) : null)
    land(step, step.id === before.currentStepId)
    return false
  }

  if (isEmptyValue(before.processVersionId)) return changed(statusField)
  const version = versions.find((v) => v.id === before.processVersionId)
  if (!version) {
    addError({ code: "versionMissing", message: `Process version ${String(before.processVersionId)} wasn't found.` })
    return changed(statusField)
  }
  const definition = version.definition
  const stepChanged = changed("currentStepId")
  const statusChanged = changed(statusField)

  if (!isOpenStatus(beforeStatus)) {
    if (isOpenStatus(afterStatus)) {
      // Reopen: carry on with the same version, on the Step that fits the Stage or status.
      const step = landingStep(definition, String(afterStatus), before.currentStepId as string)
      land(step, step.id === before.currentStepId)
      return false
    }
    if (stepChanged) throw new Rejected({ code: "closedRecord", message: "A closed record can't move Step." })
    return false
  }

  if (!isOpenStatus(afterStatus)) {
    // Closed Won and Qualify must pass the last Step's Gate; Closed Lost and Disqualify are never gated.
    if (afterStatus === "closedWon" || afterStatus === "qualified") {
      const last = lastStep(definition)
      if (afterStatus === "qualified" && before.currentStepId !== last.id) {
        throw new Rejected({
          code: "qualifyNotFromLastStep",
          message: `A Lead on this Process can only be qualified from its last Step, “${last.name}”.`,
          stepId: last.id,
        })
      }
      checkGate(input, version, last, state, scopeOf, addError)
    }
    state.currentStepId = before.currentStepId
    return statusChanged
  }

  let target: Step | undefined
  if (stepChanged) {
    target = definition.steps.find((s) => s.id === change.currentStepId)
    if (!target) throw new Rejected({ code: "unknownStep", message: "That Step isn't part of this Process." })
    if (statusChanged && target.mapsTo !== afterStatus) {
      throw new Rejected({
        code: "stepStatusMismatch",
        message: `The Step “${target.name}” maps to ${target.mapsTo}, not ${String(afterStatus)}.`,
      })
    }
  } else if (statusChanged) {
    // A Stage or Lead status written directly moves to the first Step mapped to it.
    target = definition.steps.find((s) => s.mapsTo === afterStatus)
    if (!target) {
      throw new Rejected({
        code: "noStepForStatus",
        message: `No Step of this Process maps to ${String(afterStatus)}.`,
      })
    }
  }
  if (!target) return false

  const from = stepIndex(definition, before.currentStepId as string)
  const to = stepIndex(definition, target.id)
  if (from >= 0 && to > from) {
    // Moving forward: every Step left behind must pass its Gate.
    for (const step of definition.steps.slice(from, to)) checkGate(input, version, step, state, scopeOf, addError)
    land(target, false)
    runActions(input, outcome, state, version, target, addError)
  } else {
    land(target, to === from)
  }
  return to !== from || statusChanged
}

function checkGate(
  input: SaveInput,
  version: ProcessVersionRow,
  step: Step,
  state: EngineRecord,
  scopeOf: (record: EngineRecord) => ConditionScope,
  addError: (error: EngineErrorReport) => void,
) {
  // The Gate is judged on the Step the record is leaving, so "since entering this Step" uses the stored date.
  const record = { ...state, stepEnteredOn: input.before?.stepEnteredOn ?? state.stepEnteredOn }
  const failed = gateChecklist(step, scopeOf(record))
    .filter((r) => !r.passed)
    .filter((r) => {
      // A check on a removed field or choice value fails open (#88 point 7).
      const problem = checkReferences(input.fields, input.table, [r.check])[0]
      if (problem) addError({ processId: version.processId, code: problem.code, message: problem.message })
      return !problem
    })
  if (failed.length > 0) {
    throw new Rejected({
      code: "gate",
      message: `${failed.length} open ${failed.length === 1 ? "check" : "checks"} on “${step.name}”.`,
      stepId: step.id,
      failedChecks: failed.map((r) => r.index),
    })
  }
}

/** Actions run when a record moves forward into a Step (#64 points 7 and 8). */
function runActions(
  input: SaveInput,
  outcome: SaveOutcome,
  state: EngineRecord,
  version: ProcessVersionRow,
  step: Step,
  addError: (error: EngineErrorReport) => void,
) {
  const fail = (actionId: string, code: string, message: string) =>
    addError({ processId: version.processId, actionId, code, message })
  for (const action of step.actions ?? []) {
    if (action.type === "setField") {
      const problem = checkFieldReference(input.fields, input.table, action.field, [action.value])
      if (problem) fail(action.id, problem.code, problem.message)
      else state[action.field] = action.value
      continue
    }
    const openTask = (input.related?.tasks ?? []).some((t) => t.actionId === action.id && t.completed !== true)
    if (openTask) continue
    const ownerId = String(state.ownerId ?? "")
    const owner = input.users?.[ownerId]
    const assigneeId = action.assignTo === "owner" ? ownerId : owner?.managerId
    if (!assigneeId) {
      fail(action.id, "noManager", `The Owner has no manager to give the Task “${action.subject}” to.`)
      continue
    }
    if (input.users?.[assigneeId]?.disabled) {
      fail(action.id, "taskOwnerDisabled", `The Task “${action.subject}” can't go to a disabled user.`)
      continue
    }
    outcome.tasks.push({
      actionId: action.id,
      stepId: step.id,
      subject: action.subject,
      ...(action.description ? { description: action.description } : {}),
      dueDate: addDays(input.now, action.dueInDays),
      ownerId: assigneeId,
    })
  }
}

/** Required, read-only and block save, with the #88 rules for when each one fires. */
function checkRules(
  input: SaveInput,
  rules: BusinessRuleRow[],
  state: EngineRecord,
  statusMoved: boolean,
  scopeOf: (record: EngineRecord) => ConditionScope,
) {
  const { before, change } = input
  const isCreate = before === null
  const reject = (code: RejectionCode, failures: { ruleId: string; message: string }[]) => {
    if (failures.length === 0) return
    throw new Rejected({ code, message: failures.map((f) => f.message).join(" "), ruleIds: failures.map((f) => f.ruleId) })
  }

  // Read-only holds while the condition holds on the stored record; it never applies on create.
  if (before) {
    const stored = ruleEffects(scopeOf(before), rules)
    reject(
      "readOnly",
      stored.readOnly
        .filter((e) => e.field in change && !same(before[e.field], change[e.field]))
        .map((e) => ({ ruleId: e.ruleId, message: readOnlyMessage(e.ruleName, e.field) })),
    )
  }

  const now = ruleEffects(scopeOf(state), rules)
  const cleared = (field: string) =>
    field in change && isEmptyValue(change[field]) && !isEmptyValue(before?.[field])
  reject(
    "required",
    now.required
      .filter((e) => isEmptyValue(state[e.field]) && (isCreate || statusMoved || cleared(e.field)))
      .map((e) => ({ ruleId: e.ruleId, message: requiredMessage(e.ruleName, e.field) })),
  )

  const changedFields = new Set(Object.keys(state).filter((f) => !before || !same(before[f], state[f])))
  reject(
    "blockSave",
    now.blocks
      .filter((e) => {
        if (isCreate) return true
        const rule = rules.find((r) => r.id === e.ruleId)!
        return [...fieldsRead(input.table, rule.definition.when)].some((f) => changedFields.has(f))
      })
      .map((e) => ({ ruleId: e.ruleId, message: blockMessage(e.ruleName, e.message) })),
  )
}
