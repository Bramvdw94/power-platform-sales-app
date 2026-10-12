// Types for the process engine. They mirror
// process-engine/schema/definition.schema.json, the shape both engines read.
// Terms follow GLOSSARY.md (Processes section).

export type EngineTable = "lead" | "opportunity" | "account" | "contact"
export type ProcessTable = "lead" | "opportunity"

/** Text, choice key, lookup id, number, yes/no, or a date as YYYY-MM-DD. */
export type Scalar = string | number | boolean
export type FieldValue = Scalar | null | undefined

/** A record as the engine sees it: field name to value, as in src/sales/types.ts. */
export type EngineRecord = Record<string, FieldValue>

export type Op = "equals" | "isNot" | "isOneOf" | "isEmpty" | "isNotEmpty" | "greaterThan" | "lessThan"

export type FieldCondition = {
  id?: string
  /** "leadSource", or a parent field one hop up: "account.accountType". */
  field: string
  op: Op
  value?: Scalar | Scalar[]
}

export type RelatedList = "tasks" | "phoneCalls" | "notes" | "contacts" | "opportunities" | "productLines" | "quotes"

export type RelatedCheck = {
  id?: string
  related: RelatedList
  atLeast: number
  match?: "all" | "any"
  where?: FieldCondition[]
  sinceStepEntered?: boolean
}

export type Check = FieldCondition | RelatedCheck

export type ConditionGroup = {
  match: "all" | "any"
  conditions: Check[]
}

export type EntryCriteria = {
  match: "all" | "any"
  conditions: FieldCondition[]
}

export type Gate = { checks: Check[] }

export type CreateTaskAction = {
  id: string
  type: "createTask"
  subject: string
  description?: string
  dueInDays: number
  assignTo: "owner" | "ownersManager"
}

export type SetFieldAction = {
  id: string
  type: "setField"
  field: string
  value: Scalar | null
}

export type Action = CreateTaskAction | SetFieldAction

export type StepStatus = "qualification" | "needsAnalysis" | "proposal" | "negotiation" | "notContacted" | "working"

export type Step = {
  id: string
  name: string
  /** The open Stage (Opportunity) or open Lead status (Lead) the Step maps to. */
  mapsTo: StepStatus
  keyFields?: string[]
  guidance?: string
  gate?: Gate
  actions?: Action[]
}

export type ProcessDefinition = {
  schemaVersion: 1
  table: ProcessTable
  entryCriteria?: EntryCriteria
  steps: Step[]
}

export type Effect =
  | { type: "required" | "readOnly"; field: string }
  | { type: "setValue"; field: string; value: Scalar | null }
  | { type: "warning"; message: string; field?: string }
  | { type: "blockSave"; message: string }

export type BusinessRuleDefinition = {
  schemaVersion: 1
  table: EngineTable
  when: ConditionGroup
  effects: Effect[]
}

// Rows the hosts load from Dataverse (or the in-memory twin).

export type ProcessRow = {
  id: string
  name: string
  table: ProcessTable
  /** Lower comes first. */
  priority: number
  isFallback: boolean
  retired: boolean
  /** The Process version new records get; null while the Process is a draft. */
  latestVersionId: string | null
}

export type ProcessVersionRow = {
  id: string
  processId: string
  definition: ProcessDefinition
}

export type BusinessRuleRow = {
  id: string
  name: string
  enabled: boolean
  definition: BusinessRuleDefinition
}

export type FieldType = "text" | "number" | "date" | "choice" | "lookup" | "boolean"
export type FieldInfo = { type: FieldType; options?: string[] }
/**
 * The fields that exist per table, to catch definitions that use removed fields
 * or choice values. Keyed by table: lead, opportunity, account, contact, and the
 * related-list tables task, phoneCall, note, productLine, quote. A table that is
 * missing is not checked.
 */
export type FieldCatalogue = Partial<Record<string, Record<string, FieldInfo>>>

export type UserInfo = { managerId?: string | null; disabled?: boolean }

/** Parents one hop up, by parent name (account, primaryContact, originatingLead). */
export type Parents = Partial<Record<string, EngineRecord | null>>
/** The record's own related lists, as they are at the moment of the save or view. */
export type Related = Partial<Record<RelatedList, EngineRecord[]>>

export type EngineErrorReport = {
  ruleId?: string
  processId?: string
  actionId?: string
  code: string
  message: string
}
