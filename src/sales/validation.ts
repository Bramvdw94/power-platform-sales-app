import type { FieldErrors } from "./errors"
import { isDateOnly } from "./dates"
import { isOpenStage, isValidProbability } from "./stages"
import {
  DISQUALIFY_REASONS,
  LEAD_SOURCES,
  type AccountInput,
  type ContactInput,
  type DisqualifyReason,
  type LeadInput,
  type OpportunityInput,
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

export function accountErrors(account: Partial<AccountInput>): FieldErrors {
  return isBlank(account.name) ? { name: "Account Name is required." } : {}
}

export function contactErrors(contact: Partial<ContactInput>): FieldErrors {
  return isBlank(contact.lastName) ? { lastName: "Last name is required." } : {}
}

export function disqualifyErrors(input: { reason?: DisqualifyReason }): FieldErrors {
  return input.reason && DISQUALIFY_REASONS.includes(input.reason) ? {} : { reason: "Pick a Disqualify reason." }
}
