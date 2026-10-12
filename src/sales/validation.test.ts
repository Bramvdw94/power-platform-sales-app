import { describe, expect, it } from "vitest"
import { accountErrors, contactErrors, disqualifyErrors, leadErrors, opportunityErrors, productErrors } from "./validation"
import type { OpportunityInput } from "./types"

describe("required fields", () => {
  it.each([
    [{ lastName: "Bakker", company: "Tailspin" }, []],
    [{ lastName: " ", company: "Tailspin" }, ["lastName"]],
    [{ firstName: "Sanne" }, ["lastName", "company"]],
    [{ lastName: "Bakker", company: "Tailspin", leadSource: "tv" as never }, ["leadSource"]],
  ])("Lead %o is missing %j", (lead, fields) => {
    expect(Object.keys(leadErrors(lead))).toEqual(fields)
  })

  const valid: OpportunityInput = {
    name: "Contoso - Laptops",
    accountId: "a1",
    stage: "qualification",
    estimatedValue: 0,
    expectedCloseDate: "2026-12-31",
  }

  it.each([
    [valid, []],
    [{}, ["name", "accountId", "stage", "estimatedValue", "expectedCloseDate"]],
    [{ ...valid, stage: "closedWon" as never }, ["stage"]],
    [{ ...valid, estimatedValue: -5 }, ["estimatedValue"]],
    [{ ...valid, estimatedValue: Number.NaN }, ["estimatedValue"]],
    [{ ...valid, expectedCloseDate: "31-12-2026" }, ["expectedCloseDate"]],
    [{ ...valid, probability: 101 }, ["probability"]],
    [{ ...valid, probability: 12.5 }, ["probability"]],
    [{ ...valid, probability: 0 }, []],
  ])("Opportunity %o is missing %j", (opportunity, fields) => {
    expect(Object.keys(opportunityErrors(opportunity))).toEqual(fields)
  })

  it("Account needs a name, Contact a last name", () => {
    expect(accountErrors({ name: "" })).toHaveProperty("name")
    expect(accountErrors({ name: "Contoso" })).toEqual({})
    expect(contactErrors({ firstName: "Jan" })).toHaveProperty("lastName")
    expect(contactErrors({ lastName: "Jansen" })).toEqual({})
  })

  it("Disqualify needs a reason", () => {
    expect(disqualifyErrors({})).toHaveProperty("reason")
    expect(disqualifyErrors({ reason: "duplicate" })).toEqual({})
  })
})

describe("productErrors", () => {
  const valid = { name: "Consulting", code: "CONS-HR", unit: "hour", listPrice: 125, vatRate: 21 } as const

  it("accepts a complete Product, with a free List price of 0 and cents", () => {
    expect(productErrors(valid)).toEqual({})
    expect(productErrors({ ...valid, listPrice: 0, vatRate: 0 })).toEqual({})
    expect(productErrors({ ...valid, listPrice: 19.99 })).toEqual({})
  })

  it("asks for every required field", () => {
    expect(Object.keys(productErrors({})).sort()).toEqual(["code", "listPrice", "name", "unit", "vatRate"])
    expect(Object.keys(productErrors({ ...valid, name: " ", code: "" }))).toEqual(["name", "code"])
  })

  it("refuses a negative price, more than 2 decimals, and an unknown VAT rate", () => {
    expect(productErrors({ ...valid, listPrice: -1 }).listPrice).toBeDefined()
    expect(productErrors({ ...valid, listPrice: 1.005 }).listPrice).toBeDefined()
    expect(productErrors({ ...valid, vatRate: 6 as never }).vatRate).toBeDefined()
  })
})
