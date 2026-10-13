import { describe, expect, it } from "vitest"
import { SalesRuleError } from "./errors"
import {
  addDays,
  canMoveQuote,
  defaultValidUntil,
  isQuoteEditable,
  isQuoteExpired,
  quoteErrors,
  quoteLabel,
  quoteTotals,
  requireQuoteMove,
} from "./quotes"
import { QUOTE_STATUSES, type QuoteStatus, type VatRate } from "./types"

const line = (lineAmount: number, vatRate: VatRate) => ({ lineAmount, vatRate })

// The same cases as plugins/SalesApp.Plugins.Tests/QuoteRulesTests.cs.
describe("quoteTotals: VAT per rate on the net total of that rate", () => {
  const cases: Array<{ name: string; lines: ReturnType<typeof line>[]; net: number; vat21: number; vat9: number; gross: number }> = [
    { name: "rounds per rate, not per line", lines: [line(0.14, 21), line(0.14, 21), line(0.14, 21)], net: 0.42, vat21: 0.09, vat9: 0, gross: 0.51 },
    { name: "each rate has its own VAT and 0 % adds none", lines: [line(1000, 21), line(250.55, 21), line(100, 9), line(75, 0)], net: 1425.55, vat21: 262.62, vat9: 9, gross: 1697.17 },
    { name: "a half cent rounds up", lines: [line(0.5, 9)], net: 0.5, vat21: 0, vat9: 0.05, gross: 0.55 },
    { name: "no lines", lines: [], net: 0, vat21: 0, vat9: 0, gross: 0 },
    { name: "only 0 % lines", lines: [line(120, 0), line(30.5, 0)], net: 150.5, vat21: 0, vat9: 0, gross: 150.5 },
    { name: "a large amount keeps its cents", lines: [line(9999999.99, 21)], net: 9999999.99, vat21: 2100000, vat9: 0, gross: 12099999.99 },
    { name: "21 % of 0.02 is under half a cent", lines: [line(0.02, 21)], net: 0.02, vat21: 0, vat9: 0, gross: 0.02 },
    { name: "21 % of 0.03 is just over half a cent", lines: [line(0.03, 21)], net: 0.03, vat21: 0.01, vat9: 0, gross: 0.04 },
  ]

  it.each(cases)("$name", ({ lines, net, vat21, vat9, gross }) => {
    const totals = quoteTotals(lines)
    expect(totals.net).toBe(net)
    expect(totals.byRate.find((l) => l.rate === 21)?.vat ?? 0).toBe(vat21)
    expect(totals.byRate.find((l) => l.rate === 9)?.vat ?? 0).toBe(vat9)
    expect(totals.vat).toBe(Math.round((vat21 + vat9) * 100) / 100)
    expect(totals.gross).toBe(gross)
  })

  it("lists only the rates in use, highest first, each with its net", () => {
    const totals = quoteTotals([line(10, 0), line(20, 9), line(30, 21), line(5, 9)])
    expect(totals.byRate).toEqual([
      { rate: 21, net: 30, vat: 6.3 },
      { rate: 9, net: 25, vat: 2.25 },
      { rate: 0, net: 10, vat: 0 },
    ])
  })
})

describe("Quote status moves", () => {
  const moves: Array<[QuoteStatus, QuoteStatus, boolean]> = [
    ["draft", "sent", true],
    ["sent", "accepted", true],
    ["sent", "rejected", true],
    ["sent", "revised", true],
    ["draft", "accepted", false],
    ["draft", "revised", false],
    ["sent", "draft", false],
    ["accepted", "rejected", false],
    ["rejected", "sent", false],
    ["revised", "draft", false],
  ]
  it.each(moves)("%s to %s is %s", (from, to, allowed) => {
    expect(canMoveQuote(from, to)).toBe(allowed)
    if (allowed) expect(() => requireQuoteMove(from, to)).not.toThrow()
    else expect(() => requireQuoteMove(from, to)).toThrow(SalesRuleError)
  })

  it("nothing moves to itself", () => {
    for (const status of QUOTE_STATUSES) expect(canMoveQuote(status, status)).toBe(false)
  })

  it("only a Draft is editable", () => {
    expect(QUOTE_STATUSES.filter((status) => isQuoteEditable({ status }))).toEqual(["draft"])
  })
})

describe("expiry", () => {
  it("a Sent Quote past its Valid until is expired; on the day it is not", () => {
    expect(isQuoteExpired({ status: "sent", validUntil: "2026-10-12" }, "2026-10-13")).toBe(true)
    expect(isQuoteExpired({ status: "sent", validUntil: "2026-10-13" }, "2026-10-13")).toBe(false)
  })

  it("only a Sent Quote expires", () => {
    for (const status of QUOTE_STATUSES.filter((s) => s !== "sent")) {
      expect(isQuoteExpired({ status, validUntil: "2020-01-01" }, "2026-10-13")).toBe(false)
    }
  })

  it("a Quote without Valid until never expires", () => {
    expect(isQuoteExpired({ status: "sent" }, "2026-10-13")).toBe(false)
  })
})

describe("dates and labels", () => {
  it("Valid until defaults to 30 days after today, across month and year ends", () => {
    expect(defaultValidUntil("2026-10-13")).toBe("2026-11-12")
    expect(defaultValidUntil("2026-12-20")).toBe("2027-01-19")
    expect(defaultValidUntil("2028-02-01")).toBe("2028-03-02")
  })

  it("addDays can go back", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("the label shows the Revision only after the first", () => {
    expect(quoteLabel({ number: "Q-00001", revision: 0 })).toBe("Q-00001")
    expect(quoteLabel({ number: "Q-00001", revision: 2 })).toBe("Q-00001 (rev 2)")
  })

  it("Valid until must be a real date", () => {
    expect(quoteErrors({ validUntil: "2026-02-30" })).toHaveProperty("validUntil")
    expect(quoteErrors({ validUntil: "2026-02-28" })).toEqual({})
    expect(quoteErrors({})).toEqual({})
  })
})
