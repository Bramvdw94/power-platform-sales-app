// The fields the Process and Business rule builders offer, per table. The same
// shape the engine checks definitions against at Publish (FieldCatalogue), so a
// builder can only pick a field that exists.

import type { EngineTable, FieldCatalogue, FieldInfo, ProcessTable } from "./engine"
import { PARENTS, RELATED_LISTS } from "./engine"
import { ACCOUNT_TYPES, FORECAST_CATEGORIES, INDUSTRIES, LEAD_SOURCES, QUOTE_STATUSES } from "./types"

const text: FieldInfo = { type: "text" }
const number: FieldInfo = { type: "number" }
const date: FieldInfo = { type: "date" }
const lookup: FieldInfo = { type: "lookup" }
const choice = (options: readonly string[]): FieldInfo => ({ type: "choice", options: [...options] })

export const FIELD_CATALOGUE: FieldCatalogue = {
  lead: {
    firstName: text,
    lastName: text,
    company: text,
    jobTitle: text,
    email: text,
    phone: text,
    website: text,
    leadSource: choice(LEAD_SOURCES),
    description: text,
  },
  opportunity: {
    name: text,
    accountId: lookup,
    primaryContactId: lookup,
    originatingLeadId: lookup,
    estimatedValue: number,
    expectedCloseDate: date,
    probability: number,
    nextStep: text,
    description: text,
    leadSource: choice(LEAD_SOURCES),
    forecastCategory: choice(FORECAST_CATEGORIES),
  },
  account: {
    name: text,
    website: text,
    phone: text,
    street: text,
    city: text,
    postcode: text,
    country: text,
    description: text,
    accountType: choice(ACCOUNT_TYPES),
    industry: choice(INDUSTRIES),
  },
  contact: {
    firstName: text,
    lastName: text,
    jobTitle: text,
    accountId: lookup,
    email: text,
    phone: text,
    mobile: text,
  },
  task: { subject: text, description: text, dueDate: date, completed: { type: "boolean" }, createdOn: date },
  phoneCall: { subject: text, direction: choice(["incoming", "outgoing"]), date, notes: text, completed: { type: "boolean" }, createdOn: date },
  note: { title: text, text, createdOn: date },
  productLine: { quantity: number, unitPrice: number, discountPercent: number, lineAmount: number, createdOn: date },
  quote: { status: choice(QUOTE_STATUSES), validUntil: date, netTotal: number, grossTotal: number, revision: number, createdOn: date },
}

/**
 * The fields of a Lead or Opportunity a user edits on the record page: what a
 * Step can show as a Key field. The same list the process bar can edit in place.
 */
export const KEY_FIELD_CHOICES: Record<ProcessTable, string[]> = {
  lead: ["firstName", "lastName", "company", "jobTitle", "email", "phone", "website", "leadSource", "description"],
  opportunity: ["name", "estimatedValue", "expectedCloseDate", "probability", "nextStep", "description", "leadSource", "forecastCategory", "primaryContactId"],
}

/** The fields a Set field Action may write: the Key fields a typed-in value fits (a lookup needs a record, so none). */
export const SET_FIELD_CHOICES: Record<ProcessTable, string[]> = {
  lead: ["jobTitle", "leadSource", "description"],
  opportunity: ["estimatedValue", "expectedCloseDate", "probability", "nextStep", "description", "leadSource", "forecastCategory"],
}

export type FieldOption = { ref: string; info: FieldInfo }

/** A table's own fields, then (when `parents`) its parents' fields one hop up as "account.accountType". */
export function conditionFields(table: EngineTable, parents: boolean): FieldOption[] {
  const own = Object.entries(FIELD_CATALOGUE[table] ?? {}).map(([name, info]) => ({ ref: name, info }))
  if (!parents) return own
  const up = Object.entries(PARENTS[table]).flatMap(([parent, { table: parentTable }]) =>
    Object.entries(FIELD_CATALOGUE[parentTable] ?? {}).map(([name, info]) => ({ ref: `${parent}.${name}`, info })),
  )
  return [...own, ...up]
}

/** The fields of the items in a related list, for "where …". */
export function relatedFields(table: EngineTable, list: keyof (typeof RELATED_LISTS)[EngineTable]): FieldOption[] {
  const itemTable = RELATED_LISTS[table][list]
  return itemTable ? Object.entries(FIELD_CATALOGUE[itemTable] ?? {}).map(([ref, info]) => ({ ref, info })) : []
}

export function fieldInfo(table: EngineTable, ref: string): FieldInfo | undefined {
  const dot = ref.indexOf(".")
  if (dot < 0) return FIELD_CATALOGUE[table]?.[ref]
  const parent = PARENTS[table][ref.slice(0, dot)]
  return parent && FIELD_CATALOGUE[parent.table]?.[ref.slice(dot + 1)]
}

/** A value that fits the field's type, to start from when a builder picks the field. */
export function defaultScalar(info: FieldInfo | undefined): string | number | boolean {
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
