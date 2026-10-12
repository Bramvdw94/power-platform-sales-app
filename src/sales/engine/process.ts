import { checkHolds, conditionsHold, isRelatedCheck, type ConditionScope } from "./conditions"
import type { Check, ProcessDefinition, ProcessRow, ProcessVersionRow, Step, StepStatus } from "./types"

/** The open Stages and Lead statuses in the order a record moves through them. */
export const STEP_STATUS_ORDER: Record<StepStatus, number> = {
  notContacted: 0,
  working: 1,
  qualification: 0,
  needsAnalysis: 1,
  proposal: 2,
  negotiation: 3,
}

/**
 * The Process a new record gets (#65 point 1): published, not retired
 * Processes of its table in priority order, the first whose Entry criteria
 * match; otherwise the fallback; otherwise none. Entry criteria see the
 * record's own fields and its parents, never related records.
 */
export function pickProcess(
  scope: Omit<ConditionScope, "related">,
  processes: ProcessRow[],
  versions: ProcessVersionRow[],
): { process: ProcessRow; version: ProcessVersionRow } | null {
  const candidates = processes
    .filter((p) => p.table === scope.table && !p.retired && p.latestVersionId)
    .sort((a, b) => a.priority - b.priority)
  const versionOf = (p: ProcessRow) => versions.find((v) => v.id === p.latestVersionId)
  const withoutRelated = { ...scope, related: undefined }
  for (const process of candidates) {
    if (process.isFallback) continue
    const version = versionOf(process)
    const criteria = version?.definition.entryCriteria
    if (version && criteria && conditionsHold(withoutRelated, criteria)) return { process, version }
  }
  const fallback = candidates.find((p) => p.isFallback)
  const version = fallback && versionOf(fallback)
  return fallback && version ? { process: fallback, version } : null
}

/**
 * Where a record lands when it gets a Process without walking its Steps
 * (Switch Process, Move to latest version, create, reopen): the first Step
 * mapped to its current Stage or Lead status, otherwise the last Step mapped to
 * an earlier one, otherwise the first Step. With keepStepId, the record stays on
 * that Step when it still exists and maps to the same Stage or status (#76 point 2).
 */
export function landingStep(definition: ProcessDefinition, status: string, keepStepId?: string | null): Step {
  const steps = definition.steps
  if (keepStepId) {
    const kept = steps.find((s) => s.id === keepStepId && s.mapsTo === status)
    if (kept) return kept
  }
  const exact = steps.find((s) => s.mapsTo === status)
  if (exact) return exact
  const order = STEP_STATUS_ORDER[status as StepStatus]
  if (order !== undefined) {
    const earlier = steps.filter((s) => STEP_STATUS_ORDER[s.mapsTo] < order)
    if (earlier.length > 0) return earlier[earlier.length - 1]
  }
  return steps[0]
}

export function stepIndex(definition: ProcessDefinition, stepId: string | null | undefined): number {
  return stepId ? definition.steps.findIndex((s) => s.id === stepId) : -1
}

export function lastStep(definition: ProcessDefinition): Step {
  return definition.steps[definition.steps.length - 1]
}

export type GateCheckResult = { check: Check; index: number; passed: boolean }

/** The "To move on" checklist of a Step's Gate for a record as it is now. */
export function gateChecklist(step: Step, scope: ConditionScope): GateCheckResult[] {
  return (step.gate?.checks ?? []).map((check, index) => ({ check, index, passed: checkHolds(scope, check) }))
}

export function gatePasses(step: Step, scope: ConditionScope): boolean {
  return gateChecklist(step, scope).every((r) => r.passed)
}

/**
 * The fields a Step shows: its own Key fields, then the record's own fields its
 * Gate needs, so a salesperson can always fill in what blocks them (#64 point 11).
 */
export function keyFieldsOf(step: Step): string[] {
  const fields = [...(step.keyFields ?? [])]
  for (const check of step.gate?.checks ?? []) {
    if (isRelatedCheck(check) || check.field.includes(".")) continue
    if (!fields.includes(check.field)) fields.push(check.field)
  }
  return fields
}
