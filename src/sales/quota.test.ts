import { describe, expect, it } from "vitest"
import { SalesRuleError } from "./errors"
import { canSetQuota, quarterOf, quotaErrors, quotaMonth, quotaMonths, quotaTotal, requireCanSetQuota } from "./quota"

const megan = { id: "megan", managerId: null, fullName: "Megan Bowen" }
const adele = { id: "adele", managerId: "megan", fullName: "Adele Vance" }
const diego = { id: "diego", managerId: null, fullName: "Diego Siciliani" }

describe("Quota months", () => {
  it("is the first day of the month", () => {
    expect(quotaMonth("2026-10-17")).toBe("2026-10-01")
  })

  it("lists this month and the next five, across a year end", () => {
    expect(quotaMonths("2026-10-17")).toEqual([
      "2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01",
    ])
  })

  it("groups months into quarters and sums them", () => {
    expect(quarterOf("2026-12-01")).toBe("2026-Q4")
    expect(quarterOf("2027-01-01")).toBe("2027-Q1")
    expect(quotaTotal([{ amount: 10000.1 }, { amount: 20000.2 }])).toBe(30000.3)
  })
})

describe("who sets a Quota", () => {
  it("is the salesperson's manager, never the salesperson", () => {
    expect(canSetQuota(megan, adele)).toBe(true)
    expect(canSetQuota(adele, adele)).toBe(false)
    expect(canSetQuota(megan, megan)).toBe(false)
    expect(canSetQuota(megan, diego)).toBe(false)
  })

  it("explains the refusal", () => {
    expect(() => requireCanSetQuota(megan, megan)).toThrow(/own Quota/)
    expect(() => requireCanSetQuota(megan, diego)).toThrow(SalesRuleError)
    expect(() => requireCanSetQuota(megan, adele)).not.toThrow()
  })
})

describe("quotaErrors", () => {
  it("wants a first-of-month date and an amount of 0 or more", () => {
    expect(quotaErrors({ month: "2026-10-01", amount: 0 })).toEqual({})
    expect(quotaErrors({ month: "2026-10-15", amount: 5 }).month).toBeDefined()
    expect(quotaErrors({ month: "2026-10-01", amount: -1 }).amount).toBeDefined()
    expect(quotaErrors({ month: "2026-10-01", amount: Number.NaN }).amount).toBeDefined()
  })
})
