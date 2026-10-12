import { describe, expect, it } from "vitest"
import {
  defaultOpportunityName,
  newAccountFromLead,
  newContactFromLead,
  newOpportunityFromLead,
  suggestAccounts,
  suggestContacts,
} from "./qualify"
import type { Account, Contact, Lead } from "./types"

const owned = { ownerId: "adele", ownerName: "Adele Vance", createdOn: "2026-01-01T00:00:00Z" }
const account = (id: string, name: string): Account => ({ id, name, ...owned })
const contact = (id: string, firstName: string | undefined, lastName: string, email?: string): Contact => ({
  id,
  firstName,
  lastName,
  email,
  ...owned,
})

describe("suggestAccounts", () => {
  const accounts = [
    account("a1", "Contoso"),
    account("a2", "Contoso Benelux"),
    account("a3", "Fabrikam"),
    account("a4", "CONTOSO"),
    account("a5", "Northwind Traders"),
  ]

  it.each([
    ["Fabrikam", ["a3"], "a3"],
    ["fabrikam", ["a3"], "a3"],
    ["  Fabrikam  ", ["a3"], "a3"],
    ["Fab", ["a3"], null],
    ["Contoso", ["a1", "a4", "a2"], null],
    ["Contoso Benelux", ["a2"], "a2"],
    ["Northwind", ["a5"], null],
    ["Tailspin", [], null],
    ["", [], null],
  ])("Company %j suggests %j, preselects %s", (company, ids, preselected) => {
    const result = suggestAccounts({ company }, accounts)
    expect(result.matches.map((a) => a.id)).toEqual(ids)
    expect(result.preselectedId).toBe(preselected)
  })
})

describe("suggestContacts", () => {
  const contacts = [
    contact("c1", "Jan", "Jansen", "jan@contoso.nl"),
    contact("c2", "Jan", "Jansen", "j.jansen@fabrikam.be"),
    contact("c3", "Piet", "de Vries", "piet@contoso.nl"),
    contact("c4", "Piet", "de Vries", "PIET@contoso.nl"),
    contact("c5", undefined, "Peeters"),
  ]

  const cases: Array<[string, Partial<Lead>, string[], "email" | "name" | null, string | null]> = [
    ["one email match is preselected", { firstName: "Jan", lastName: "Jansen", email: "jan@contoso.nl" }, ["c1"], "email", "c1"],
    ["email match ignores case and spaces", { lastName: "X", email: " JAN@Contoso.NL " }, ["c1"], "email", "c1"],
    ["two email matches: none preselected", { lastName: "de Vries", email: "piet@contoso.nl" }, ["c3", "c4"], "email", null],
    ["email beats name", { firstName: "Jan", lastName: "Jansen", email: "j.jansen@fabrikam.be" }, ["c2"], "email", "c2"],
    ["no email match falls back to name", { firstName: "Jan", lastName: "Jansen", email: "new@x.nl" }, ["c1", "c2"], "name", null],
    ["name match without email", { firstName: "piet", lastName: "DE VRIES" }, ["c3", "c4"], "name", null],
    ["a single name match is not preselected", { firstName: "Jan", lastName: "Jansen", email: "" }, ["c1", "c2"], "name", null],
    ["first name must match too", { firstName: "Karel", lastName: "Jansen" }, [], null, null],
    ["no first name matches a Contact without one", { lastName: "Peeters" }, ["c5"], "name", null],
    ["nothing matches", { firstName: "Els", lastName: "Claes", email: "els@x.be" }, [], null, null],
  ]

  it.each(cases)("%s", (_label, lead, ids, matchedBy, preselected) => {
    const result = suggestContacts({ lastName: "", ...lead }, contacts)
    expect(result.matches.map((c) => c.id)).toEqual(ids)
    expect(result.matchedBy).toBe(matchedBy)
    expect(result.preselectedId).toBe(preselected)
  })
})

describe("Qualify carry-over", () => {
  const lead: Lead = {
    id: "l1",
    firstName: "Sanne",
    lastName: "Bakker",
    company: "Tailspin Toys ",
    jobTitle: "CIO",
    email: "sanne@tailspin.nl",
    phone: "+31 20 123 4567",
    website: "https://tailspin.nl",
    leadSource: "event",
    description: "Met at the IT Expo",
    status: "working",
    ownerId: "alex",
    ownerName: "Alex Wilber",
    createdOn: "2026-09-01T09:00:00Z",
  }

  it("prefills the Opportunity name from the Company", () => {
    expect(defaultOpportunityName(lead)).toBe("Tailspin Toys - ")
  })

  it("gives a new Account the Lead's Company and Website", () => {
    expect(newAccountFromLead(lead)).toEqual({ name: "Tailspin Toys", website: "https://tailspin.nl" })
  })

  it("gives a new Contact the Lead's person fields under the chosen Account", () => {
    expect(newContactFromLead(lead, "acc-1")).toEqual({
      firstName: "Sanne",
      lastName: "Bakker",
      jobTitle: "CIO",
      email: "sanne@tailspin.nl",
      phone: "+31 20 123 4567",
      accountId: "acc-1",
    })
  })

  it("gives the Opportunity the Lead's Owner, source and description at Stage Qualification", () => {
    expect(
      newOpportunityFromLead(
        lead,
        { accountId: "acc-1", primaryContactId: "con-1" },
        { name: " Tailspin Toys - Managed workplace ", estimatedValue: 48000, expectedCloseDate: "2026-12-15" },
      ),
    ).toEqual({
      name: "Tailspin Toys - Managed workplace",
      accountId: "acc-1",
      primaryContactId: "con-1",
      stage: "qualification",
      probability: 10,
      forecastCategory: "pipeline",
      estimatedValue: 48000,
      expectedCloseDate: "2026-12-15",
      ownerId: "alex",
      leadSource: "event",
      description: "Met at the IT Expo",
      originatingLeadId: "l1",
    })
  })
})
