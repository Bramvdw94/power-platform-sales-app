// PROTOTYPE (wayfinder #67): throwaway. Never merge to main.
// An in-memory stand-in for the Process definitions and Process state that
// ADR 0001 stores in Dataverse. Terms follow GLOSSARY.md.

import { useSyncExternalStore } from "react"
import type { Activity, Lead, LeadStatus, OpenStage, Opportunity } from "@/sales"

export type ProcessTable = "opportunity" | "lead"

export type FieldDef = { name: string; label: string; type: "text" | "number" | "date" | "choice" | "lookup" }

export const FIELDS: Record<ProcessTable, FieldDef[]> = {
  opportunity: [
    { name: "estimatedValue", label: "Estimated value", type: "number" },
    { name: "expectedCloseDate", label: "Expected close date", type: "date" },
    { name: "primaryContactId", label: "Primary Contact", type: "lookup" },
    { name: "nextStep", label: "Next step", type: "text" },
    { name: "description", label: "Description", type: "text" },
    { name: "leadSource", label: "Lead source", type: "choice" },
    { name: "probability", label: "Probability", type: "number" },
    { name: "account.accountType", label: "Account › Account type", type: "choice" },
    { name: "account.industry", label: "Account › Industry", type: "choice" },
  ],
  lead: [
    { name: "email", label: "Email", type: "text" },
    { name: "phone", label: "Phone", type: "text" },
    { name: "jobTitle", label: "Job title", type: "text" },
    { name: "website", label: "Website", type: "text" },
    { name: "leadSource", label: "Lead source", type: "choice" },
    { name: "description", label: "Description", type: "text" },
  ],
}

export function fieldLabel(table: ProcessTable, name: string): string {
  return FIELDS[table].find((f) => f.name === name)?.label ?? name
}

export type Operator = "equals" | "notEquals" | "greaterThan" | "lessThan" | "hasValue"
export const OPERATOR_LABELS: Record<Operator, string> = {
  equals: "is",
  notEquals: "is not",
  greaterThan: "is more than",
  lessThan: "is less than",
  hasValue: "has a value",
}

export type RelatedKind = "phoneCall" | "task" | "note"
export const RELATED_LABELS: Record<RelatedKind, string> = { phoneCall: "completed Phone Calls", task: "completed Tasks", note: "Notes" }

export type GateCheck =
  | { id: string; kind: "required"; field: string }
  | { id: string; kind: "condition"; field: string; operator: Operator; value: string }
  | { id: string; kind: "related"; related: RelatedKind; atLeast: number }

export type Action =
  | { id: string; kind: "createTask"; subject: string; dueInDays: number }
  | { id: string; kind: "setField"; field: string; value: string }

export type Step = {
  id: string
  name: string
  /** An open Stage on an Opportunity; Not Contacted or Working on a Lead. */
  maps: OpenStage | "notContacted" | "working"
  keyFields: string[]
  guidance: string
  gate: GateCheck[]
  actions: Action[]
}

export type ProcessDef = {
  id: string
  table: ProcessTable
  name: string
  /** Lower comes first; the first match wins. */
  priority: number
  /** Empty = the fallback Process. */
  entry: Extract<GateCheck, { kind: "condition" }>[]
  isFallback: boolean
  steps: Step[]
}

export type ProcessRecord = {
  draft: ProcessDef
  published?: { version: number; def: ProcessDef }
  status: "draft" | "published" | "retired"
}

export type RecordProgress = { processId: string; version: number; stepIndex: number }

let nextId = 100
export const newId = (prefix: string) => `${prefix}-${nextId++}`

const OPPORTUNITY_STANDARD: ProcessDef = {
  id: "proc-standard",
  table: "opportunity",
  name: "Standard B2B sale",
  priority: 2,
  entry: [],
  isFallback: true,
  steps: [
    {
      id: "s-discover",
      name: "Discover",
      maps: "qualification",
      keyFields: ["primaryContactId", "estimatedValue", "leadSource"],
      guidance: "Find the pain behind the request. Who decides, and what happens if they do nothing?",
      gate: [
        { id: "g1", kind: "required", field: "primaryContactId" },
        { id: "g2", kind: "related", related: "phoneCall", atLeast: 1 },
      ],
      actions: [{ id: "a1", kind: "createTask", subject: "Book a discovery call", dueInDays: 2 }],
    },
    {
      id: "s-budget",
      name: "Confirm budget",
      maps: "needsAnalysis",
      keyFields: ["estimatedValue", "expectedCloseDate", "nextStep"],
      guidance: "Ask for a budget range and when they need it live. Put the agreed follow-up in Next step.",
      gate: [
        { id: "g3", kind: "condition", field: "estimatedValue", operator: "greaterThan", value: "0" },
        { id: "g4", kind: "required", field: "nextStep" },
      ],
      actions: [],
    },
    {
      id: "s-requirements",
      name: "Map requirements",
      maps: "needsAnalysis",
      keyFields: ["description"],
      guidance: "Write the requirements down in a Note so the proposal can be built from it.",
      gate: [{ id: "g5", kind: "related", related: "note", atLeast: 1 }],
      actions: [],
    },
    {
      id: "s-proposal",
      name: "Send proposal",
      maps: "proposal",
      keyFields: ["estimatedValue", "expectedCloseDate"],
      guidance: "Send the proposal within three working days and plan the follow-up call.",
      gate: [{ id: "g6", kind: "related", related: "task", atLeast: 2 }],
      actions: [
        { id: "a2", kind: "createTask", subject: "Send the proposal", dueInDays: 3 },
        { id: "a3", kind: "setField", field: "nextStep", value: "Follow up on the proposal" },
      ],
    },
    {
      id: "s-negotiate",
      name: "Negotiate",
      maps: "negotiation",
      keyFields: ["estimatedValue", "expectedCloseDate", "probability"],
      guidance: "Agree on price and terms. Closed Won must pass this Step's Gate.",
      gate: [
        { id: "g7", kind: "required", field: "expectedCloseDate" },
        { id: "g8", kind: "condition", field: "estimatedValue", operator: "greaterThan", value: "0" },
      ],
      actions: [],
    },
  ],
}

const OPPORTUNITY_PARTNER: ProcessDef = {
  id: "proc-partner",
  table: "opportunity",
  name: "Partner deal",
  priority: 1,
  entry: [{ id: "e1", kind: "condition", field: "leadSource", operator: "equals", value: "partner" }],
  isFallback: false,
  steps: [
    {
      id: "p-register",
      name: "Register with partner",
      maps: "qualification",
      keyFields: ["primaryContactId", "leadSource"],
      guidance: "Register the deal in the partner portal before the first customer meeting.",
      gate: [{ id: "pg1", kind: "required", field: "primaryContactId" }],
      actions: [{ id: "pa1", kind: "createTask", subject: "Register the deal with the partner", dueInDays: 1 }],
    },
    {
      id: "p-joint",
      name: "Joint proposal",
      maps: "proposal",
      keyFields: ["estimatedValue", "expectedCloseDate"],
      guidance: "Build the proposal together with the partner.",
      gate: [{ id: "pg2", kind: "condition", field: "estimatedValue", operator: "greaterThan", value: "0" }],
      actions: [],
    },
  ],
}

const LEAD_INBOUND: ProcessDef = {
  id: "proc-inbound",
  table: "lead",
  name: "Inbound lead",
  priority: 1,
  entry: [],
  isFallback: true,
  steps: [
    {
      id: "l-new",
      name: "New",
      maps: "notContacted",
      keyFields: ["email", "phone"],
      guidance: "Inbound Leads are called within one working day.",
      gate: [{ id: "lg1", kind: "required", field: "phone" }],
      actions: [],
    },
    {
      id: "l-contact",
      name: "First contact",
      maps: "working",
      keyFields: ["phone", "jobTitle"],
      guidance: "Call, introduce yourself and ask what made them get in touch.",
      gate: [{ id: "lg2", kind: "related", related: "phoneCall", atLeast: 1 }],
      actions: [{ id: "la1", kind: "createTask", subject: "Call the Lead", dueInDays: 1 }],
    },
    {
      id: "l-fit",
      name: "Check fit",
      maps: "working",
      keyFields: ["jobTitle", "leadSource", "description"],
      guidance: "Is there budget, a need and a timeline? Then Qualify; otherwise Disqualify.",
      gate: [{ id: "lg3", kind: "required", field: "leadSource" }],
      actions: [],
    },
  ],
}

type State = { processes: ProcessRecord[]; progress: Record<string, RecordProgress> }

let state: State = {
  processes: [OPPORTUNITY_PARTNER, OPPORTUNITY_STANDARD, LEAD_INBOUND].map((def) => ({
    draft: structuredClone(def),
    published: { version: 1, def: structuredClone(def) },
    status: "published",
  })),
  progress: {},
}

const listeners = new Set<() => void>()
function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}
export function useProcessState(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export function saveDraft(def: ProcessDef) {
  set({ ...state, processes: state.processes.map((p) => (p.draft.id === def.id ? { ...p, draft: def } : p)) })
}

export function publish(id: string) {
  set({
    ...state,
    processes: state.processes.map((p) =>
      p.draft.id === id
        ? { ...p, status: "published", published: { version: (p.published?.version ?? 0) + 1, def: structuredClone(p.draft) } }
        : p,
    ),
  })
}

export function retire(id: string) {
  set({ ...state, processes: state.processes.map((p) => (p.draft.id === id ? { ...p, status: "retired" } : p)) })
}

export function createProcess(table: ProcessTable): string {
  const id = newId("proc")
  const priority = Math.max(0, ...state.processes.filter((p) => p.draft.table === table).map((p) => p.draft.priority)) + 1
  const def: ProcessDef = {
    id,
    table,
    name: table === "opportunity" ? "New Opportunity Process" : "New Lead Process",
    priority,
    entry: [],
    isFallback: false,
    steps: [
      {
        id: newId("step"),
        name: "First Step",
        maps: table === "opportunity" ? "qualification" : "notContacted",
        keyFields: [],
        guidance: "",
        gate: [],
        actions: [],
      },
    ],
  }
  set({ ...state, processes: [...state.processes, { draft: def, status: "draft" }] })
  return id
}

export function movePriority(id: string, direction: -1 | 1) {
  const target = state.processes.find((p) => p.draft.id === id)
  if (!target) return
  const sameTable = state.processes
    .filter((p) => p.draft.table === target.draft.table)
    .sort((a, b) => a.draft.priority - b.draft.priority)
  const index = sameTable.indexOf(target)
  const other = sameTable[index + direction]
  if (!other) return
  const [pa, pb] = [target.draft.priority, other.draft.priority]
  set({
    ...state,
    processes: state.processes.map((p) => {
      if (p === target) return { ...p, draft: { ...p.draft, priority: pb }, published: p.published && { ...p.published, def: { ...p.published.def, priority: pb } } }
      if (p === other) return { ...p, draft: { ...p.draft, priority: pa }, published: p.published && { ...p.published, def: { ...p.published.def, priority: pa } } }
      return p
    }),
  })
}

export function setProgress(recordId: string, progress: RecordProgress | undefined) {
  const next = { ...state.progress }
  if (progress) next[recordId] = progress
  else delete next[recordId]
  set({ ...state, progress: next })
}

// --- Evaluating against a record ---------------------------------------------

export type AnyRecord = { table: "opportunity"; record: Opportunity } | { table: "lead"; record: Lead }

export function fieldValue(r: AnyRecord, field: string): unknown {
  if (field.startsWith("account.")) {
    // The prototype's Accounts have no Account type or Industry yet.
    return field === "account.accountType" ? "customer" : "itServices"
  }
  return (r.record as Record<string, unknown>)[field]
}

function hasValue(v: unknown) {
  return v !== undefined && v !== null && v !== ""
}

export type CheckResult = { check: GateCheck; passed: boolean; label: string; detail?: string }

export function describeCheck(table: ProcessTable, check: GateCheck): string {
  switch (check.kind) {
    case "required":
      return `${fieldLabel(table, check.field)} is filled in`
    case "condition":
      return check.operator === "hasValue"
        ? `${fieldLabel(table, check.field)} has a value`
        : `${fieldLabel(table, check.field)} ${OPERATOR_LABELS[check.operator]} ${check.value}`
    case "related":
      return `At least ${check.atLeast} ${check.atLeast === 1 ? RELATED_LABELS[check.related].replace(/s$/, "") : RELATED_LABELS[check.related]}`
  }
}

export function describeAction(table: ProcessTable, action: Action): string {
  return action.kind === "createTask"
    ? `Create Task “${action.subject}”, due in ${action.dueInDays} day${action.dueInDays === 1 ? "" : "s"}`
    : `Set ${fieldLabel(table, action.field)} to “${action.value}”`
}

export function relatedCount(activities: Activity[], kind: RelatedKind): number {
  return activities.filter((a) => a.kind === kind && (a.kind === "note" || a.completed)).length
}

export function evaluateCheck(r: AnyRecord, check: GateCheck, activities: Activity[]): CheckResult {
  const label = describeCheck(r.table, check)
  switch (check.kind) {
    case "required":
      return { check, label, passed: hasValue(fieldValue(r, check.field)) }
    case "condition": {
      const v = fieldValue(r, check.field)
      let passed = false
      if (check.operator === "hasValue") passed = hasValue(v)
      else if (check.operator === "equals") passed = String(v ?? "") === check.value
      else if (check.operator === "notEquals") passed = String(v ?? "") !== check.value
      else if (check.operator === "greaterThan") passed = Number(v) > Number(check.value)
      else passed = Number(v) < Number(check.value)
      return { check, label, passed }
    }
    case "related": {
      const count = relatedCount(activities, check.related)
      return { check, label, passed: count >= check.atLeast, detail: `${count} so far` }
    }
  }
}

export function matchesEntry(r: AnyRecord, def: ProcessDef): boolean {
  return def.entry.every((c) => evaluateCheck(r, c, []).passed)
}

/** The published Process a record gets: Entry criteria in priority order, then the fallback. */
export function pickProcess(r: AnyRecord, processes: ProcessRecord[]): ProcessRecord | undefined {
  const live = processes
    .filter((p) => p.draft.table === r.table && p.status === "published" && p.published)
    .sort((a, b) => a.published!.def.priority - b.published!.def.priority)
  return (
    live.find((p) => !p.published!.def.isFallback && p.published!.def.entry.length > 0 && matchesEntry(r, p.published!.def)) ??
    live.find((p) => p.published!.def.isFallback)
  )
}

export function currentMapping(r: AnyRecord): string {
  return r.table === "opportunity" ? r.record.stage : r.record.status
}

/** The first Step that maps to the record's Stage or Lead status (as Switch Process lands it). */
export function landingStep(def: ProcessDef, mapping: string): number {
  const i = def.steps.findIndex((s) => s.maps === mapping)
  return i === -1 ? 0 : i
}

export const MAP_LABELS: Record<Step["maps"], string> = {
  qualification: "Qualification",
  needsAnalysis: "Needs Analysis",
  proposal: "Proposal",
  negotiation: "Negotiation",
  notContacted: "Not Contacted",
  working: "Working",
}

export function isLeadStatusMapping(m: string): m is Extract<LeadStatus, "notContacted" | "working"> {
  return m === "notContacted" || m === "working"
}
