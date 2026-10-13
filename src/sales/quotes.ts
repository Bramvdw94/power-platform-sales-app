import { isDateOnly, toDateOnly } from "./dates"
import { SalesRuleError, throwIfFieldErrors, type FieldErrors } from "./errors"
import { productLinesTotal } from "./product-lines"
import type { DateOnly, Quote, QuoteLine, QuoteStatus, VatRate } from "./types"

/** A new Quote is valid this many days from the day it is made (Quote settings can change it). */
export const QUOTE_VALIDITY_DAYS = 30

/** What each status can move to: a Draft is Sent; a Sent Quote is Accepted, Rejected or Revised; nothing leaves those. */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "revised"],
  accepted: [],
  rejected: [],
  revised: [],
}

export function canMoveQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to)
}

/** Throws the refusal for a move the Quote's status does not allow. */
export function requireQuoteMove(from: QuoteStatus, to: QuoteStatus): void {
  if (canMoveQuote(from, to)) return
  if (from === "draft") throw new SalesRuleError("Only a Draft Quote can be sent.")
  if (from !== "sent") throw new SalesRuleError(`A ${from} Quote is final.`)
  throw new SalesRuleError(`A Sent Quote can't become ${to}.`)
}

/** Only a Draft Quote can be edited or deleted; anything else stays as it was sent. */
export function isQuoteEditable(quote: Pick<Quote, "status">): boolean {
  return quote.status === "draft"
}

/** A Sent Quote past its Valid until is shown as expired; its status does not change. */
export function isQuoteExpired(quote: Pick<Quote, "status" | "validUntil">, today: DateOnly): boolean {
  return quote.status === "sent" && !!quote.validUntil && quote.validUntil < today
}

export function addDays(date: DateOnly, days: number): DateOnly {
  const [y, m, d] = date.split("-").map(Number)
  return toDateOnly(new Date(y, m - 1, d + days))
}

export function defaultValidUntil(today: DateOnly, days: number = QUOTE_VALIDITY_DAYS): DateOnly {
  return addDays(today, days)
}

/** "Q-00001" or "Q-00001 (rev 2)": the number, with the Revision when it is not the first. */
export function quoteLabel(quote: Pick<Quote, "number" | "revision">): string {
  return quote.revision > 0 ? `${quote.number} (rev ${quote.revision})` : quote.number
}

export type VatLine = { rate: VatRate; net: number; vat: number }

export type QuoteTotals = {
  net: number
  /** Only the rates the lines use, highest first. 0 % lines have VAT 0. */
  byRate: VatLine[]
  vat: number
  gross: number
}

const cents = (euros: number) => Math.round(euros * 100)

/**
 * Net total: the lines' amounts added up. VAT per rate: the net total of the lines at that
 * rate times the rate, rounded to cents (half away from zero). Gross: net plus VAT.
 * The C# rule in plugins/SalesApp.Plugins/QuoteRules.cs does the same sum.
 */
export function quoteTotals(lines: readonly Pick<QuoteLine, "lineAmount" | "vatRate">[]): QuoteTotals {
  const netByRate = new Map<VatRate, number>()
  for (const line of lines) netByRate.set(line.vatRate, (netByRate.get(line.vatRate) ?? 0) + cents(line.lineAmount))
  const byRate = [...netByRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rate, netCents]): VatLine => ({ rate, net: netCents / 100, vat: Math.floor((netCents * rate + 50) / 100) / 100 }))
  const net = productLinesTotal(lines)
  const vat = byRate.reduce((sum, l) => sum + cents(l.vat), 0) / 100
  return { net, byRate, vat, gross: (cents(net) + cents(vat)) / 100 }
}

/** The editable header values of a Draft Quote. */
export function quoteErrors(quote: { validUntil?: DateOnly }): FieldErrors {
  const errors: FieldErrors = {}
  if (quote.validUntil !== undefined && quote.validUntil !== "" && !isDateOnly(quote.validUntil)) {
    errors.validUntil = "Enter a valid date."
  }
  return errors
}

export function throwIfQuoteInvalid(quote: { validUntil?: DateOnly }): void {
  throwIfFieldErrors("The Quote cannot be saved.", quoteErrors(quote))
}
