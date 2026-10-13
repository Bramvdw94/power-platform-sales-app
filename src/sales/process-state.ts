// How the app shows a Lead or Opportunity to the process engine: its fields,
// the parents one hop up and the related lists a Gate may count. The gateways
// and the process bar build the same scope, so a Gate reads the same everywhere.

import type { EngineRecord, Parents, ProcessDefinition, ProcessRow, ProcessVersionRow, Related, Step } from "./engine"
import { stepIndex } from "./engine"
import type { Activity, Contact, Account, Lead, ProductLine, Quote } from "./types"

/** A record's fields as the engine reads them: defined values only. */
export function toEngineRecord(record: object): EngineRecord {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as EngineRecord
}

/** The Tasks, Phone Calls and Notes among the activities, as related lists. */
export function activityRelated(activities: Activity[]): Related {
  const related: Required<Pick<Related, "tasks" | "phoneCalls" | "notes">> = { tasks: [], phoneCalls: [], notes: [] }
  for (const a of activities) {
    if (a.kind === "task") related.tasks.push(toEngineRecord({ subject: a.subject, description: a.description, dueDate: a.dueDate, completed: a.completed, createdOn: a.createdOn, actionId: a.actionId }))
    else if (a.kind === "phoneCall") related.phoneCalls.push(toEngineRecord({ subject: a.subject, direction: a.direction, date: a.date, notes: a.notes, completed: a.completed, createdOn: a.createdOn }))
    else related.notes.push(toEngineRecord({ title: a.title, text: a.text, createdOn: a.createdOn }))
  }
  return related
}

export function opportunityRelated(activities: Activity[], productLines: ProductLine[], quotes: Quote[]): Related {
  return {
    ...activityRelated(activities),
    productLines: productLines.map((l) => toEngineRecord({ quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, lineAmount: l.lineAmount, createdOn: l.createdOn })),
    quotes: quotes.map((q) => toEngineRecord({ status: q.status, validUntil: q.validUntil, netTotal: q.netTotal, grossTotal: q.grossTotal, revision: q.revision, createdOn: q.createdOn })),
  }
}

export function opportunityParents(parents: { account?: Account; primaryContact?: Contact; originatingLead?: Lead }): Parents {
  return {
    account: parents.account ? toEngineRecord(parents.account) : null,
    primaryContact: parents.primaryContact ? toEngineRecord(parents.primaryContact) : null,
    originatingLead: parents.originatingLead ? toEngineRecord(parents.originatingLead) : null,
  }
}

export type ProcessKind = "lead" | "opportunity"

export function statusField(table: ProcessKind): "status" | "stage" {
  return table === "lead" ? "status" : "stage"
}

/** The Process version a record follows, if any. */
export function versionOf(record: { processVersionId?: string }, versions: ProcessVersionRow[]): ProcessVersionRow | undefined {
  return record.processVersionId ? versions.find((v) => v.id === record.processVersionId) : undefined
}

/** Whether the Process has been retired, so no new record gets it. */
export function isRetired(version: ProcessVersionRow | undefined, processes: ProcessRow[]): boolean {
  return !!version && !!processes.find((p) => p.id === version.processId)?.retired
}

/** The Steps of the Process after the current one are "ahead"; before it "done". */
export function stepPosition(definition: ProcessDefinition, stepId: string | undefined, step: Step): "done" | "current" | "ahead" {
  const current = stepIndex(definition, stepId)
  const index = definition.steps.indexOf(step)
  return index < current ? "done" : index === current ? "current" : "ahead"
}
