import type { FieldErrors } from "./errors"
import { isDateOnly } from "./dates"
import { isOpenStage, isValidProbability } from "./stages"
import {
  DISQUALIFY_REASONS,
  LEAD_SOURCES,
  PRODUCT_UNITS,
  VAT_RATES,
  type ContactInput,
  type DisqualifyReason,
  type LeadInput,
  type OpportunityInput,
  type ProductInput,
} from "./types"

function isBlank(value: string | undefined): boolean {
  return !value || value.trim() === ""
}

function isMoney(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

// Each function returns the field errors for a record's required fields, keyed
// by field name; an empty object means the record may be saved.

export function leadErrors(lead: Partial<LeadInput>): FieldErrors {
  const errors: FieldErrors = {}
  if (isBlank(lead.lastName)) errors.lastName = "Last name is required."
  if (isBlank(lead.company)) errors.company = "Company is required."
  if (lead.leadSource !== undefined && !LEAD_SOURCES.includes(lead.leadSource)) errors.leadSource = "Pick a Lead source."
  return errors
}

export function opportunityErrors(opportunity: Partial<OpportunityInput>): FieldErrors {
  const errors: FieldErrors = {}
  if (isBlank(opportunity.name)) errors.name = "Name is required."
  if (isBlank(opportunity.accountId)) errors.accountId = "Account is required."
  if (!opportunity.stage) errors.stage = "Stage is required."
  else if (!isOpenStage(opportunity.stage)) errors.stage = "Pick an open Stage; use Close to win or lose."
  if (!isMoney(opportunity.estimatedValue)) errors.estimatedValue = "Estimated value is required (0 or more)."
  if (isBlank(opportunity.expectedCloseDate)) errors.expectedCloseDate = "Expected close date is required."
  else if (!isDateOnly(opportunity.expectedCloseDate!)) errors.expectedCloseDate = "Enter a valid date."
  if (opportunity.probability !== undefined && !isValidProbability(opportunity.probability)) {
    errors.probability = "Probability is a whole number from 0 to 100."
  }
  return errors
}

export function productErrors(product: Partial<ProductInput>): FieldErrors {
  const errors: FieldErrors = {}
  if (isBlank(product.name)) errors.name = "Name is required."
  if (isBlank(product.code)) errors.code = "Product code is required."
  if (!product.unit || !PRODUCT_UNITS.includes(product.unit)) errors.unit = "Pick a Unit."
  if (!isMoney(product.listPrice)) errors.listPrice = "List price is required (0 or more)."
  else if (Math.abs(product.listPrice! * 100 - Math.round(product.listPrice! * 100)) > 1e-6) {
    errors.listPrice = "List price has at most 2 decimals."
  }
  if (product.vatRate === undefined || !VAT_RATES.includes(product.vatRate)) errors.vatRate = "Pick a VAT rate."
  return errors
}

export function accountErrors(account: { name?: string }): FieldErrors {
  return isBlank(account.name) ? { name: "Account Name is required." } : {}
}

export function contactErrors(contact: Partial<ContactInput>): FieldErrors {
  return isBlank(contact.lastName) ? { lastName: "Last name is required." } : {}
}

export function noteErrors(note: { title: string; text: string }): FieldErrors {
  return isBlank(note.title) && isBlank(note.text) ? { text: "Write a title or some text." } : {}
}

export function taskErrors(task: { subject: string; dueDate?: string }): FieldErrors {
  const errors: FieldErrors = {}
  if (isBlank(task.subject)) errors.subject = "Subject is required."
  if (task.dueDate && !isDateOnly(task.dueDate)) errors.dueDate = "Enter a valid date."
  return errors
}

export function phoneCallErrors(call: { subject: string; direction?: string; date?: string }): FieldErrors {
  const errors: FieldErrors = {}
  if (isBlank(call.subject)) errors.subject = "Subject is required."
  if (call.direction !== "incoming" && call.direction !== "outgoing") errors.direction = "Pick incoming or outgoing."
  if (isBlank(call.date)) errors.date = "Date is required."
  else if (!isDateOnly(call.date!)) errors.date = "Enter a valid date."
  return errors
}

export function disqualifyErrors(input: { reason?: DisqualifyReason }): FieldErrors {
  return input.reason && DISQUALIFY_REASONS.includes(input.reason) ? {} : { reason: "Pick a Disqualify reason." }
}
