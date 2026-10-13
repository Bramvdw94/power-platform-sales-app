// Building Processes: the draft a Process builder edits, and the pure edits on it.
// The gateways store the draft and publish it; nothing here touches data.

import type {
  Action,
  BusinessRuleRow,
  Check,
  ConditionGroup,
  ConditionScope,
  EntryCriteria,
  ProcessDefinition,
  ProcessRow,
  ProcessTable,
  PublishIssue,
  PublishResult,
  Step,
  StepStatus,
} from "./engine"
import { checkProcessForPublish, gateChecklist, LIMITS, STEP_STATUS_ORDER } from "./engine"
import { FIELD_CATALOGUE, KEY_FIELD_CHOICES, SET_FIELD_CHOICES, defaultScalar } from "./field-catalogue"
import type { Id } from "./types"

export type ProcessVersionInfo = {
  id: Id
  /** 1 for the first Publish, then 2, 3 ... */
  number: number
  /** Open Leads or Opportunities on this version right now. */
  openRecords: number
  publishedOn?: string
}

/** A Process as its builder sees it: the draft, the published versions and how many records sit on each. */
export type ProcessAdmin = ProcessRow & {
  /** The definition being edited. Publish copies it to a new Process version. */
  draft: ProcessDefinition
  /** Newest first. */
  versions: ProcessVersionInfo[]
  /** The number of the version new records get; null while the Process is a draft. */
  latestVersionNumber: number | null
  /** The draft differs from the latest published version. */
  hasUnpublishedChanges: boolean
  /** Engine errors recorded against this Process that are still open. */
  engineErrorCount: number
}

export type ProcessStatus = "draft" | "published" | "retired"

export function processStatus(process: Pick<ProcessAdmin, "retired" | "latestVersionId">): ProcessStatus {
  if (process.retired) return "retired"
  return process.latestVersionId ? "published" : "draft"
}

export type EngineErrorEntry = {
  id: Id
  processId?: Id
  ruleId?: Id
  actionId?: string
  code: string
  message: string
  recordTable?: string
  recordId?: Id
  occurredOn: string
}

/** What Publish would do to the open records, shown before the builder confirms. */
export type PublishImpact = {
  /** Open records on this Process that would be on the new version if moved. */
  openRecords: number
  /** Of those, records whose current Step has a Gate they do not pass today. */
  blocked: { id: Id; table: ProcessTable; name: string; stepName: string; openChecks: number }[]
}

export function emptyDraft(table: ProcessTable): ProcessDefinition {
  return { schemaVersion: 1, table, steps: [] }
}

/** Stable text of a definition, to tell whether a draft differs from what is published. */
export function definitionKey(definition: ProcessDefinition): string {
  return JSON.stringify(definition, (_key, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    }
    return value
  })
}

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "step"
  )
}

/** An id not used by any Step yet, from the name. Renaming a Step keeps its id, so records stay on it. */
export function newStepId(definition: ProcessDefinition, name: string): string {
  const taken = new Set(definition.steps.map((s) => s.id))
  const base = slug(name)
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

export function newId(prefix: string, taken: string[]): string {
  for (let n = taken.length + 1; ; n++) if (!taken.includes(`${prefix}-${n}`)) return `${prefix}-${n}`
}

export function firstStatus(table: ProcessTable): StepStatus {
  return table === "lead" ? "notContacted" : "qualification"
}

/** A new Step maps to the status of the Step it follows, so adding one never breaks the order. */
export function insertStep(definition: ProcessDefinition, at: number, name = "New Step"): ProcessDefinition {
  const index = Math.max(0, Math.min(at, definition.steps.length))
  const before = definition.steps[index - 1]
  const after = definition.steps[index]
  const step: Step = { id: newStepId(definition, name), name, mapsTo: before?.mapsTo ?? after?.mapsTo ?? firstStatus(definition.table) }
  return { ...definition, steps: [...definition.steps.slice(0, index), step, ...definition.steps.slice(index)] }
}

export function deleteStep(definition: ProcessDefinition, stepId: string): ProcessDefinition {
  return { ...definition, steps: definition.steps.filter((s) => s.id !== stepId) }
}

export function moveStepInDraft(definition: ProcessDefinition, stepId: string, direction: "up" | "down"): ProcessDefinition {
  const steps = [...definition.steps]
  const from = steps.findIndex((s) => s.id === stepId)
  const to = direction === "up" ? from - 1 : from + 1
  if (from < 0 || to < 0 || to >= steps.length) return definition
  ;[steps[from], steps[to]] = [steps[to], steps[from]]
  return { ...definition, steps }
}

export function updateStep(definition: ProcessDefinition, stepId: string, patch: Partial<Omit<Step, "id">>): ProcessDefinition {
  return { ...definition, steps: definition.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) }
}

/** Optional Step parts are dropped when empty so the stored definition stays small and valid. */
export function tidyStep(step: Step): Step {
  const { keyFields, guidance, gate, actions, ...rest } = step
  return {
    ...rest,
    ...(keyFields && keyFields.length > 0 ? { keyFields } : {}),
    ...(guidance && guidance.trim() ? { guidance } : {}),
    ...(gate && gate.checks.length > 0 ? { gate } : {}),
    ...(actions && actions.length > 0 ? { actions } : {}),
  }
}

export function setEntryCriteria(definition: ProcessDefinition, criteria: EntryCriteria | undefined): ProcessDefinition {
  const { entryCriteria: _removed, ...rest } = definition
  void _removed
  return criteria && criteria.conditions.length > 0 ? { ...rest, entryCriteria: criteria } : rest
}

/** The condition group of the builder for Entry criteria: field conditions only. */
export function asGroup(criteria: EntryCriteria | undefined): ConditionGroup {
  return { match: criteria?.match ?? "all", conditions: criteria?.conditions ?? [] }
}

/** The Step status choices for a table, in the order a record moves through them. */
export function stepStatusChoices(table: ProcessTable): StepStatus[] {
  const all = Object.keys(STEP_STATUS_ORDER) as StepStatus[]
  const wanted = table === "lead" ? ["notContacted", "working"] : ["qualification", "needsAnalysis", "proposal", "negotiation"]
  return all.filter((s) => wanted.includes(s))
}

/** A Key field a Step can take, not yet chosen and within the limit of five. */
export function keyFieldCandidates(table: ProcessTable, step: Step): string[] {
  const chosen = step.keyFields ?? []
  if (chosen.length >= LIMITS.keyFieldsPerStep) return []
  return KEY_FIELD_CHOICES[table].filter((f) => !chosen.includes(f))
}

export function newGateCheck(table: ProcessTable, checks: Check[]): Check {
  const first = KEY_FIELD_CHOICES[table][0]
  return { id: newId("check", checks.map((c) => c.id ?? "")), field: first, op: "isNotEmpty" }
}

export function newAction(actions: Action[], kind: Action["type"], table: ProcessTable): Action {
  const id = newId(kind === "createTask" ? "task" : "set", actions.map((a) => a.id))
  if (kind === "createTask") return { id, type: "createTask", subject: "Follow up", dueInDays: 2, assignTo: "owner" }
  const field = SET_FIELD_CHOICES[table][0]
  return { id, type: "setField", field, value: defaultScalar(FIELD_CATALOGUE[table]?.[field]) }
}

/** Everything Publish refuses or warns about for a draft: the engine's checks against the real field catalogue. */
export function checkDraft(draft: ProcessDefinition, rules: BusinessRuleRow[] = []): PublishResult {
  return checkProcessForPublish({ definition: draft, rules, fields: FIELD_CATALOGUE })
}

export type ImpactRecord = {
  id: Id
  table: ProcessTable
  name: string
  stepId?: string
  scope: ConditionScope
}

/**
 * What the draft would do to open records that move to it: those on a Step that still exists,
 * whose Gate (as the draft has it) they do not pass today.
 */
export function impactOf(draft: ProcessDefinition, records: ImpactRecord[]): PublishImpact {
  const blocked: PublishImpact["blocked"] = []
  for (const record of records) {
    const step = draft.steps.find((s) => s.id === record.stepId)
    if (!step) continue
    const open = gateChecklist(step, record.scope).filter((r) => !r.passed).length
    if (open > 0) blocked.push({ id: record.id, table: record.table, name: record.name, stepName: step.name, openChecks: open })
  }
  return { openRecords: records.length, blocked }
}

export class PublishRefused extends Error {
  readonly issues: PublishIssue[]
  constructor(issues: PublishIssue[]) {
    super(issues[0]?.message ?? "This Process can't be published.")
    this.name = "PublishRefused"
    this.issues = issues
  }
}

/** Moves a Process one place in the table's priority order; returns the new order of ids, or null at the edge. */
export function reorderedIds(ordered: { id: Id }[], id: Id, direction: "up" | "down"): Id[] | null {
  const ids = ordered.map((p) => p.id)
  const from = ids.indexOf(id)
  const to = direction === "up" ? from - 1 : from + 1
  if (from < 0 || to < 0 || to >= ids.length) return null
  ;[ids[from], ids[to]] = [ids[to], ids[from]]
  return ids
}
