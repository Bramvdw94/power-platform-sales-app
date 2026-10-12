import { defaultForecastCategory } from "./forecast"
import { STAGE_DEFAULT_PROBABILITY } from "./stages"
import type { Account, AccountInput, Contact, ContactInput, DateOnly, Id, Lead, Opportunity } from "./types"

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase()
}

export type AccountSuggestions = {
  /** Accounts whose name contains the Lead's Company, exact matches first. */
  matches: Account[]
  /** Exactly one Account named like the Company (ignoring case); otherwise "Create new" (null). */
  preselectedId: Id | null
}

export function suggestAccounts(lead: Pick<Lead, "company">, accounts: readonly Account[]): AccountSuggestions {
  const company = normalize(lead.company)
  if (!company) return { matches: [], preselectedId: null }
  const isExact = (a: Account) => normalize(a.name) === company
  const matches = accounts
    .filter((a) => normalize(a.name).includes(company))
    .sort((a, b) => Number(isExact(b)) - Number(isExact(a)) || a.name.localeCompare(b.name))
  const exact = matches.filter(isExact)
  return { matches, preselectedId: exact.length === 1 ? exact[0].id : null }
}

export type ContactSuggestions = {
  /** Contacts with the Lead's email; if none, Contacts with the same first and last name. */
  matches: Contact[]
  matchedBy: "email" | "name" | null
  /** Exactly one email match; otherwise "Create new" (null). */
  preselectedId: Id | null
}

export function suggestContacts(
  lead: Pick<Lead, "email" | "firstName" | "lastName">,
  contacts: readonly Contact[],
): ContactSuggestions {
  const email = normalize(lead.email)
  if (email) {
    const byEmail = contacts.filter((c) => normalize(c.email) === email)
    if (byEmail.length > 0) {
      return { matches: byEmail, matchedBy: "email", preselectedId: byEmail.length === 1 ? byEmail[0].id : null }
    }
  }
  const lastName = normalize(lead.lastName)
  const firstName = normalize(lead.firstName)
  const byName = lastName
    ? contacts.filter((c) => normalize(c.lastName) === lastName && normalize(c.firstName) === firstName)
    : []
  return { matches: byName, matchedBy: byName.length > 0 ? "name" : null, preselectedId: null }
}

/** The Opportunity name Qualify prefills, for the user to finish. */
export function defaultOpportunityName(lead: Pick<Lead, "company">): string {
  return `${lead.company.trim()} - `
}

/** A new Account takes its Name and Website from the Lead. */
export function newAccountFromLead(lead: Pick<Lead, "company" | "website">): AccountInput {
  return { name: lead.company.trim(), website: lead.website }
}

/** A new Contact takes the Lead's person fields and is placed under the chosen Account. */
export function newContactFromLead(
  lead: Pick<Lead, "firstName" | "lastName" | "jobTitle" | "email" | "phone">,
  accountId: Id,
): ContactInput {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    jobTitle: lead.jobTitle,
    email: lead.email,
    phone: lead.phone,
    accountId,
  }
}

export type QualifyOpportunityDetails = {
  name: string
  estimatedValue: number
  expectedCloseDate: DateOnly
}

export type QualifiedOpportunityDraft = Pick<
  Opportunity,
  | "name"
  | "accountId"
  | "primaryContactId"
  | "stage"
  | "probability"
  | "forecastCategory"
  | "estimatedValue"
  | "expectedCloseDate"
  | "ownerId"
  | "leadSource"
  | "description"
  | "originatingLeadId"
>

/**
 * The Opportunity Qualify creates: Stage Qualification, the Lead's Owner,
 * Lead source and Description, and a link back to the Lead.
 */
export function newOpportunityFromLead(
  lead: Pick<Lead, "id" | "ownerId" | "leadSource" | "description">,
  links: { accountId: Id; primaryContactId: Id },
  details: QualifyOpportunityDetails,
): QualifiedOpportunityDraft {
  return {
    name: details.name.trim(),
    accountId: links.accountId,
    primaryContactId: links.primaryContactId,
    stage: "qualification",
    probability: STAGE_DEFAULT_PROBABILITY.qualification,
    forecastCategory: defaultForecastCategory("qualification"),
    estimatedValue: details.estimatedValue,
    expectedCloseDate: details.expectedCloseDate,
    ownerId: lead.ownerId,
    leadSource: lead.leadSource,
    description: lead.description,
    originatingLeadId: lead.id,
  }
}
