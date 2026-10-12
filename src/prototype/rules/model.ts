// PROTOTYPE (wayfinder #87): throwaway. Never merge to main.
// An in-memory stand-in for the Business rule definitions ADR 0001 stores in
// Dataverse, and the evaluation the app-side engine mirrors. Terms follow GLOSSARY.md.

import { useSyncExternalStore } from "react"
import { LEAD_SOURCE_LABELS } from "@/lib/format"
import { LEAD_SOURCES, toDateOnly } from "@/sales"

export type RuleTable = "lead" | "opportunity" | "account" | "contact"
export const TABLES: RuleTable[] = ["lead", "opportunity", "account", "contact"]
export const TABLE_LABELS: Record<RuleTable, string> = { lead: "Leads", opportunity: "Opportunities", account: "Accounts", contact: "Contacts" }
export const TABLE_SINGULAR: Record<RuleTable, string> = { lead: "Lead", opportunity: "Opportunity", account: "Account", contact: "Contact" }

export type FieldType = "text" | "textarea" | "number" | "date" | "choice" | "lookup"
export type FieldDef = { name: string; label: string; type: FieldType; options?: { value: string; label: string }[]; parent?: boolean; wide?: boolean }

export const ACCOUNT_TYPES = ["prospect", "customer", "partner", "reseller", "supplier", "competitor", "other"] as const
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  prospect: "Prospect",
  customer: "Customer",
  partner: "Partner",
  reseller: "Reseller",
  supplier: "Supplier",
  competitor: "Competitor",
  other: "Other",
}
export const INDUSTRIES: Record<string, string> = {
  itServices: "IT services",
  manufacturing: "Manufacturing",
  logistics: "Logistics",
  healthcare: "Healthcare",
  retail: "Retail",
  publicSector: "Public sector",
}

const opts = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }))
const LEAD_SOURCE_OPTIONS = LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] }))
const ACCOUNT_TYPE_OPTIONS = opts(ACCOUNT_TYPE_LABELS)
const INDUSTRY_OPTIONS = opts(INDUSTRIES)

/** The business fields a user edits on each record page, plus parent fields one hop up (conditions only). */
export const FIELDS: Record<RuleTable, FieldDef[]> = {
  lead: [
    { name: "firstName", label: "First name", type: "text" },
    { name: "lastName", label: "Last name", type: "text" },
    { name: "company", label: "Company", type: "text" },
    { name: "jobTitle", label: "Job title", type: "text" },
    { name: "email", label: "Email", type: "text" },
    { name: "phone", label: "Phone", type: "text" },
    { name: "website", label: "Website", type: "text" },
    { name: "leadSource", label: "Lead source", type: "choice", options: LEAD_SOURCE_OPTIONS },
    { name: "description", label: "Description", type: "textarea", wide: true },
  ],
  opportunity: [
    { name: "name", label: "Name", type: "text", wide: true },
    { name: "primaryContactId", label: "Primary Contact", type: "lookup" },
    { name: "estimatedValue", label: "Estimated value", type: "number" },
    { name: "expectedCloseDate", label: "Expected close date", type: "date" },
    { name: "probability", label: "Probability", type: "number" },
    { name: "leadSource", label: "Lead source", type: "choice", options: LEAD_SOURCE_OPTIONS },
    { name: "nextStep", label: "Next step", type: "text", wide: true },
    { name: "description", label: "Description", type: "textarea", wide: true },
    { name: "account.accountType", label: "Account › Account type", type: "choice", options: ACCOUNT_TYPE_OPTIONS, parent: true },
    { name: "account.industry", label: "Account › Industry", type: "choice", options: INDUSTRY_OPTIONS, parent: true },
  ],
  account: [
    { name: "name", label: "Account Name", type: "text", wide: true },
    { name: "accountType", label: "Account type", type: "choice", options: ACCOUNT_TYPE_OPTIONS },
    { name: "industry", label: "Industry", type: "choice", options: INDUSTRY_OPTIONS },
    { name: "website", label: "Website", type: "text" },
    { name: "phone", label: "Phone", type: "text" },
    { name: "city", label: "City", type: "text" },
    { name: "country", label: "Country", type: "text" },
    { name: "description", label: "Description", type: "textarea", wide: true },
  ],
  contact: [
    { name: "firstName", label: "First name", type: "text" },
    { name: "lastName", label: "Last name", type: "text" },
    { name: "jobTitle", label: "Job title", type: "text" },
    { name: "email", label: "Email", type: "text" },
    { name: "phone", label: "Phone", type: "text" },
    { name: "mobile", label: "Mobile", type: "text" },
    { name: "account.accountType", label: "Account › Account type", type: "choice", options: ACCOUNT_TYPE_OPTIONS, parent: true },
    { name: "account.industry", label: "Account › Industry", type: "choice", options: INDUSTRY_OPTIONS, parent: true },
  ],
}

/** Fields an effect may target: the record's own fields. */
export const ownFields = (table: RuleTable) => FIELDS[table].filter((f) => !f.parent)

export function fieldDef(table: RuleTable, name: string): FieldDef | undefined {
  return FIELDS[table].find((f) => f.name === name)
}
export function fieldLabel(table: RuleTable, name: string): string {
  return fieldDef(table, name)?.label ?? name
}

export type Operator = "equals" | "notEquals" | "isOneOf" | "isEmpty" | "hasValue" | "greaterThan" | "lessThan"
export const OPERATOR_LABELS: Record<Operator, string> = {
  equals: "is",
  notEquals: "is not",
  isOneOf: "is one of",
  isEmpty: "is empty",
  hasValue: "has a value",
  greaterThan: "is more than",
  lessThan: "is less than",
}
export const DATE_OPERATOR_LABELS: Partial<Record<Operator, string>> = { greaterThan: "is after", lessThan: "is before" }

export type Condition = { id: string; field: string; operator: Operator; value: string }

export type Effect =
  | { id: string; kind: "required"; field: string }
  | { id: string; kind: "readOnly"; field: string }
  | { id: string; kind: "setValue"; field: string; value: string }
  | { id: string; kind: "warning"; message: string; field?: string }
  | { id: string; kind: "blockSave"; message: string }

export const EFFECT_LABELS: Record<Effect["kind"], string> = {
  required: "Make required",
  readOnly: "Make read-only",
  setValue: "Set value",
  warning: "Show warning",
  blockSave: "Block save",
}

export type BusinessRule = {
  id: string
  table: RuleTable
  name: string
  on: boolean
  match: "all" | "any"
  conditions: Condition[]
  effects: Effect[]
  changedBy: string
  changedOn: string
}

let nextId = 500
export const newId = (prefix: string) => `${prefix}-${nextId++}`

const today = () => toDateOnly(new Date())

const SEED: BusinessRule[] = [
  {
    id: "r-web-phone",
    table: "lead",
    name: "Website Leads need a phone number",
    on: true,
    match: "all",
    conditions: [{ id: "c1", field: "leadSource", operator: "equals", value: "website" }],
    effects: [{ id: "e1", kind: "required", field: "phone" }],
    changedBy: "Megan Bowen",
    changedOn: "2026-10-02",
  },
  {
    id: "r-reach",
    table: "lead",
    name: "A Lead must be reachable",
    on: true,
    match: "all",
    conditions: [
      { id: "c2", field: "email", operator: "isEmpty", value: "" },
      { id: "c3", field: "phone", operator: "isEmpty", value: "" },
    ],
    effects: [{ id: "e2", kind: "blockSave", message: "Add an email address or a phone number before you save." }],
    changedBy: "Megan Bowen",
    changedOn: "2026-10-02",
  },
  {
    id: "r-partner-lead",
    table: "lead",
    name: "Partner Leads are registered",
    on: true,
    match: "all",
    conditions: [{ id: "c4", field: "leadSource", operator: "equals", value: "partner" }],
    effects: [{ id: "e3", kind: "warning", message: "Register partner Leads in the partner portal within two working days." }],
    changedBy: "Megan Bowen",
    changedOn: "2026-10-05",
  },
  {
    id: "r-event-description",
    table: "lead",
    name: "Event Leads say which event",
    on: false,
    match: "all",
    conditions: [{ id: "c5", field: "leadSource", operator: "equals", value: "event" }],
    effects: [{ id: "e4", kind: "required", field: "description" }],
    changedBy: "Megan Bowen",
    changedOn: "2026-09-28",
  },
  {
    id: "r-large-deal",
    table: "opportunity",
    name: "Large deals need a contact and a next step",
    on: true,
    match: "all",
    conditions: [{ id: "c6", field: "estimatedValue", operator: "greaterThan", value: "50000" }],
    effects: [
      { id: "e5", kind: "required", field: "primaryContactId" },
      { id: "e6", kind: "required", field: "nextStep" },
      { id: "e7", kind: "warning", message: "Large deal: plan a review with your manager before the proposal.", field: "estimatedValue" },
    ],
    changedBy: "Megan Bowen",
    changedOn: "2026-10-01",
  },
  {
    id: "r-close-date",
    table: "opportunity",
    name: "Expected close date has passed",
    on: true,
    match: "all",
    conditions: [{ id: "c7", field: "expectedCloseDate", operator: "lessThan", value: "today" }],
    effects: [{ id: "e8", kind: "warning", message: "The Expected close date has passed. Move it or close the deal.", field: "expectedCloseDate" }],
    changedBy: "Megan Bowen",
    changedOn: "2026-10-01",
  },
  {
    id: "r-partner-next",
    table: "opportunity",
    name: "Partner deals start with registration",
    on: true,
    match: "all",
    conditions: [{ id: "c8", field: "leadSource", operator: "equals", value: "partner" }],
    effects: [
      { id: "e9", kind: "setValue", field: "nextStep", value: "Register the deal in the partner portal" },
      { id: "e10", kind: "readOnly", field: "probability" },
    ],
    changedBy: "Megan Bowen",
    changedOn: "2026-10-03",
  },
  {
    id: "r-competitor",
    table: "opportunity",
    name: "No deals with competitors",
    on: true,
    match: "all",
    conditions: [{ id: "c9", field: "account.accountType", operator: "equals", value: "competitor" }],
    effects: [{ id: "e11", kind: "blockSave", message: "This Account is a competitor. Talk to your manager before you work this deal." }],
    changedBy: "Megan Bowen",
    changedOn: "2026-10-04",
  },
  {
    id: "r-customer-industry",
    table: "account",
    name: "Customers have an industry",
    on: true,
    match: "all",
    conditions: [{ id: "c10", field: "accountType", operator: "equals", value: "customer" }],
    effects: [
      { id: "e12", kind: "required", field: "industry" },
      { id: "e13", kind: "readOnly", field: "name" },
    ],
    changedBy: "Megan Bowen",
    changedOn: "2026-10-04",
  },
  {
    id: "r-supplier",
    table: "account",
    name: "Suppliers and competitors are not prospects",
    on: true,
    match: "any",
    conditions: [
      { id: "c11", field: "accountType", operator: "equals", value: "supplier" },
      { id: "c12", field: "accountType", operator: "equals", value: "competitor" },
    ],
    effects: [{ id: "e14", kind: "warning", message: "We don't sell to this Account. New Opportunities need your manager's go-ahead." }],
    changedBy: "Megan Bowen",
    changedOn: "2026-10-04",
  },
  {
    id: "r-customer-contact-phone",
    table: "contact",
    name: "Customer contacts have a phone number",
    on: true,
    match: "any",
    conditions: [{ id: "c13", field: "account.accountType", operator: "equals", value: "customer" }],
    effects: [{ id: "e15", kind: "required", field: "phone" }],
    changedBy: "Megan Bowen",
    changedOn: "2026-10-06",
  },
]

/** Account type and Industry are new v2 columns; the prototype keeps them here, per Account id. */
const SEED_ACCOUNT_EXTRAS: Record<string, { accountType?: string; industry?: string }> = {
  "acc-tailwind": { accountType: "customer" },
  "acc-fabrikam": { accountType: "customer", industry: "manufacturing" },
  "acc-northwind": { accountType: "prospect", industry: "logistics" },
}

type State = { rules: BusinessRule[]; accountExtras: Record<string, { accountType?: string; industry?: string }> }
let state: State = { rules: SEED, accountExtras: SEED_ACCOUNT_EXTRAS }

const listeners = new Set<() => void>()
function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}
export function useRulesState(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export function saveRule(rule: BusinessRule) {
  const stamped = { ...rule, changedBy: "Megan Bowen", changedOn: today() }
  const exists = state.rules.some((r) => r.id === rule.id)
  set({ ...state, rules: exists ? state.rules.map((r) => (r.id === rule.id ? stamped : r)) : [...state.rules, stamped] })
}
export function deleteRule(id: string) {
  set({ ...state, rules: state.rules.filter((r) => r.id !== id) })
}
export function setAccountExtras(id: string, extras: { accountType?: string; industry?: string }) {
  set({ ...state, accountExtras: { ...state.accountExtras, [id]: extras } })
}

export function blankRule(table: RuleTable, effect?: Effect): BusinessRule {
  const first = FIELDS[table].find((f) => f.type === "choice") ?? FIELDS[table][0]
  return {
    id: newId("rule"),
    table,
    name: "",
    on: true,
    match: "all",
    conditions: [{ id: newId("c"), field: first.name, operator: "equals", value: first.options?.[0]?.value ?? "" }],
    effects: effect ? [effect] : [{ id: newId("e"), kind: "required", field: ownFields(table)[0].name }],
    changedBy: "Megan Bowen",
    changedOn: today(),
  }
}

export function blankEffect(table: RuleTable, kind: Effect["kind"], field?: string): Effect {
  const f = field ?? ownFields(table)[0].name
  switch (kind) {
    case "required":
    case "readOnly":
      return { id: newId("e"), kind, field: f }
    case "setValue":
      return { id: newId("e"), kind, field: f, value: "" }
    case "warning":
      return { id: newId("e"), kind, message: "" }
    case "blockSave":
      return { id: newId("e"), kind, message: "" }
  }
}

// --- Describing ----------------------------------------------------------------

export function valueLabel(table: RuleTable, field: string, value: string): string {
  if (value === "today") return "today"
  const def = fieldDef(table, field)
  if (def?.options) return value.split(",").map((v) => def.options!.find((o) => o.value === v.trim())?.label ?? v).join(", ")
  if (def?.type === "number" && value && !Number.isNaN(Number(value)) && field === "estimatedValue") return `€${Number(value).toLocaleString("nl-NL")}`
  return value
}

export function operatorLabel(table: RuleTable, field: string, op: Operator) {
  return (fieldDef(table, field)?.type === "date" && DATE_OPERATOR_LABELS[op]) || OPERATOR_LABELS[op]
}

export function describeCondition(table: RuleTable, c: Condition): string {
  const op = operatorLabel(table, c.field, c.operator)
  if (c.operator === "isEmpty" || c.operator === "hasValue") return `${fieldLabel(table, c.field)} ${op}`
  return `${fieldLabel(table, c.field)} ${op} ${valueLabel(table, c.field, c.value) || "…"}`
}

export function describeWhen(rule: BusinessRule): string {
  if (rule.conditions.length === 0) return "Always"
  return "When " + rule.conditions.map((c) => describeCondition(rule.table, c)).join(rule.match === "all" ? " and " : " or ")
}

export function describeEffect(table: RuleTable, e: Effect): string {
  switch (e.kind) {
    case "required":
      return `${fieldLabel(table, e.field)} is required`
    case "readOnly":
      return `${fieldLabel(table, e.field)} is read-only`
    case "setValue":
      return `set ${fieldLabel(table, e.field)} to “${valueLabel(table, e.field, e.value)}”`
    case "warning":
      return `warn “${e.message}”`
    case "blockSave":
      return `block saving: “${e.message}”`
  }
}

/** Two rules that set the same field, or one makes it read-only while another sets it. */
export function conflictsFor(rule: BusinessRule, all: BusinessRule[]): string[] {
  const out: string[] = []
  const others = all.filter((r) => r.id !== rule.id && r.table === rule.table && r.on)
  for (const e of rule.effects) {
    if (e.kind !== "setValue") continue
    for (const o of others) {
      if (o.effects.some((x) => x.kind === "setValue" && x.field === e.field))
        out.push(`“${o.name}” also sets ${fieldLabel(rule.table, e.field)}. When both apply, the last change wins.`)
    }
  }
  return out
}

// --- Evaluating ------------------------------------------------------------------

/** A record as the rules see it: field name to text, parent fields as "account.x". */
export type Values = Record<string, string>

function isEmpty(v: string | undefined) {
  return v === undefined || v.trim() === ""
}

export function conditionHolds(table: RuleTable, c: Condition, values: Values): boolean {
  const v = values[c.field] ?? ""
  const type = fieldDef(table, c.field)?.type
  const target = c.value === "today" ? today() : c.value
  switch (c.operator) {
    case "isEmpty":
      return isEmpty(v)
    case "hasValue":
      return !isEmpty(v)
    case "equals":
      return v === target
    case "notEquals":
      return v !== target
    case "isOneOf":
      return target.split(",").map((s) => s.trim()).includes(v)
    case "greaterThan":
      if (isEmpty(v)) return false
      return type === "date" ? v > target : Number(v) > Number(target)
    case "lessThan":
      if (isEmpty(v)) return false
      return type === "date" ? v < target : Number(v) < Number(target)
  }
}

export function ruleApplies(rule: BusinessRule, values: Values): boolean {
  if (!rule.on) return false
  if (rule.conditions.length === 0) return true
  const results = rule.conditions.map((c) => conditionHolds(rule.table, c, values))
  return rule.match === "all" ? results.every(Boolean) : results.some(Boolean)
}

export type FieldState = { required?: BusinessRule; readOnly?: BusinessRule; warnings: { rule: BusinessRule; message: string }[] }

export type RuleOutcome = {
  active: BusinessRule[]
  fields: Record<string, FieldState>
  /** Warnings not tied to a field. */
  recordWarnings: { rule: BusinessRule; message: string }[]
  blocks: { rule: BusinessRule; message: string }[]
  /** Required fields that are empty. */
  missing: { field: string; rule: BusinessRule }[]
  setValues: { field: string; value: string; rule: BusinessRule }[]
}

export function evaluate(table: RuleTable, rules: BusinessRule[], values: Values): RuleOutcome {
  const active = rules.filter((r) => r.table === table && ruleApplies(r, values))
  const fields: Record<string, FieldState> = {}
  const field = (name: string) => (fields[name] ??= { warnings: [] })
  const out: RuleOutcome = { active, fields, recordWarnings: [], blocks: [], missing: [], setValues: [] }
  for (const rule of active) {
    for (const e of rule.effects) {
      if (e.kind === "required") {
        field(e.field).required ??= rule
        if (isEmpty(values[e.field])) out.missing.push({ field: e.field, rule })
      } else if (e.kind === "readOnly") field(e.field).readOnly ??= rule
      else if (e.kind === "warning") {
        if (e.field) field(e.field).warnings.push({ rule, message: e.message })
        else out.recordWarnings.push({ rule, message: e.message })
      } else if (e.kind === "blockSave") out.blocks.push({ rule, message: e.message })
      else out.setValues.push({ field: e.field, value: e.value, rule })
    }
  }
  return out
}

/** Every warning, field-bound or not. */
export function allWarnings(o: RuleOutcome) {
  return [...o.recordWarnings, ...Object.values(o.fields).flatMap((f) => f.warnings)]
}
