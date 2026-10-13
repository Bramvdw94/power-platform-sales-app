import type { Check, FieldCondition, ProcessTable, RelatedCheck, RelatedList, StepStatus } from "@/sales/engine"
import { isRelatedCheck } from "@/sales/engine"
import { DISQUALIFY_REASON_LABELS, FORECAST_CATEGORY_LABELS, LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, STAGE_LABELS } from "./format"

// Plain-language names for what a Process asks of a record: its fields, Gate checks
// and the Stage or Lead status a Step maps to.

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  company: "Company",
  jobTitle: "Job title",
  email: "Email",
  phone: "Phone",
  website: "Website",
  leadSource: "Lead source",
  description: "Description",
  name: "Name",
  estimatedValue: "Estimated value",
  expectedCloseDate: "Expected close date",
  probability: "Probability",
  nextStep: "Next step",
  primaryContactId: "Primary Contact",
  accountId: "Account",
  forecastCategory: "Forecast category",
  accountType: "Account type",
  industry: "Industry",
  originatingLeadId: "Originating Lead",
}

function humanize(name: string): string {
  const words = name.replace(/([A-Z])/g, " $1").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const PARENT_LABELS: Record<string, string> = { account: "Account", primaryContact: "Primary Contact", originatingLead: "originating Lead" }

/** "Lead source", or "Account's Account type" for a parent field one hop up. */
export function fieldLabel(ref: string): string {
  const dot = ref.indexOf(".")
  if (dot < 0) return FIELD_LABELS[ref] ?? humanize(ref)
  const parent = ref.slice(0, dot)
  return `${PARENT_LABELS[parent] ?? humanize(parent)}'s ${(FIELD_LABELS[ref.slice(dot + 1)] ?? humanize(ref.slice(dot + 1))).toLowerCase()}`
}

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  qualification: STAGE_LABELS.qualification,
  needsAnalysis: STAGE_LABELS.needsAnalysis,
  proposal: STAGE_LABELS.proposal,
  negotiation: STAGE_LABELS.negotiation,
  notContacted: LEAD_STATUS_LABELS.notContacted,
  working: LEAD_STATUS_LABELS.working,
}

const VALUE_LABELS: Record<string, string> = {
  ...LEAD_SOURCE_LABELS,
  ...FORECAST_CATEGORY_LABELS,
  ...DISQUALIFY_REASON_LABELS,
  ...STAGE_LABELS,
  ...LEAD_STATUS_LABELS,
  sent: "Sent",
  accepted: "Accepted",
  draft: "Draft",
  rejected: "Rejected",
  revised: "Revised",
}

function valueLabel(value: unknown): string {
  if (typeof value === "string") return VALUE_LABELS[value] ?? value
  return String(value)
}

const RELATED_LABELS: Record<RelatedList, [string, string]> = {
  tasks: ["Task", "Tasks"],
  phoneCalls: ["Phone Call", "Phone Calls"],
  notes: ["Note", "Notes"],
  contacts: ["Contact", "Contacts"],
  opportunities: ["Opportunity", "Opportunities"],
  productLines: ["Product line", "Product lines"],
  quotes: ["Quote", "Quotes"],
}

function conditionPhrase(condition: FieldCondition): string {
  const value = condition.value
  switch (condition.op) {
    case "isNotEmpty":
      return "has a value"
    case "isEmpty":
      return "is empty"
    case "equals":
      return `is ${valueLabel(value)}`
    case "isNot":
      return `is not ${valueLabel(value)}`
    case "isOneOf":
      return `is ${(Array.isArray(value) ? value : [value]).map(valueLabel).join(" or ")}`
    case "greaterThan":
      return `is more than ${valueLabel(value)}`
    case "lessThan":
      return `is less than ${valueLabel(value)}`
  }
}

function relatedText(check: RelatedCheck): string {
  const [one, many] = RELATED_LABELS[check.related]
  const where = (check.where ?? []).map((c) => `${fieldLabel(c.field).toLowerCase()} ${conditionPhrase(c)}`)
  const joiner = check.match === "any" ? " or " : " and "
  const qualifier = where.length > 0 ? ` where ${where.join(joiner)}` : ""
  const since = check.sinceStepEntered ? " since this Step started" : ""
  return `At least ${check.atLeast} ${check.atLeast === 1 ? one : many}${qualifier}${since}`
}

/** One Gate check as a line of the "To move on" checklist. */
export function describeCheck(check: Check): string {
  if (isRelatedCheck(check)) return relatedText(check)
  return `${fieldLabel(check.field)} ${conditionPhrase(check)}`
}

export const PROCESS_TABLE_NOUN: Record<ProcessTable, string> = { lead: "Lead", opportunity: "Opportunity" }
