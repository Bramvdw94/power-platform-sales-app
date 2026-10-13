import type { DateOnly, Id } from "./types"
import type { Quote, User } from "./types"

/** The single row of company details, terms and email templates behind every Quote PDF. */
export type QuoteSettings = {
  id: Id
  companyName: string
  /** One line per row. */
  address: string
  phone: string
  email: string
  website: string
  kvk: string
  btwId: string
  iban: string
  /** A PNG or JPEG as a data URL; empty for no logo. */
  logo: string
  defaultValidityDays: number
  termsUrl: string
  termsText: string
  /** With placeholders such as {{quote_number}}; see EMAIL_PLACEHOLDERS. */
  emailSubject: string
  emailMessage: string
}

export type QuoteSettingsUpdate = Partial<Omit<QuoteSettings, "id">>

/** The largest logo accepted, as the data URL's length. */
export const MAX_LOGO_LENGTH = 400_000

export const EMAIL_PLACEHOLDERS = ["quote_number", "company", "contact_name", "valid_until", "owner_name"] as const

export const FALLBACK_VALIDITY_DAYS = 30

export function quoteSettingsErrors(update: QuoteSettingsUpdate): Record<string, string> {
  const errors: Record<string, string> = {}
  if (update.defaultValidityDays !== undefined && (!Number.isInteger(update.defaultValidityDays) || update.defaultValidityDays < 1 || update.defaultValidityDays > 3650)) {
    errors.defaultValidityDays = "Enter a whole number of days, 1 or more."
  }
  if (update.logo && !/^data:image\/(png|jpeg);base64,/.test(update.logo)) errors.logo = "The logo must be a PNG or JPEG image."
  if (update.logo && update.logo.length > MAX_LOGO_LENGTH) errors.logo = "The logo is too large. Use an image under 300 KB."
  return errors
}

/** Replaces {{placeholder}} with its value; an unknown placeholder is left as written so it shows. */
export function fillPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, name: string) => (name in values ? values[name] : whole))
}

export type EmailContext = {
  quote: Pick<Quote, "number" | "validUntil">
  contactName: string
  owner: Pick<User, "fullName">
  settings: Pick<QuoteSettings, "companyName">
  formatDate: (date: DateOnly) => string
}

export function emailPlaceholderValues(ctx: EmailContext): Record<string, string> {
  return {
    quote_number: ctx.quote.number,
    company: ctx.settings.companyName,
    contact_name: ctx.contactName,
    valid_until: ctx.quote.validUntil ? ctx.formatDate(ctx.quote.validUntil) : "",
    owner_name: ctx.owner.fullName,
  }
}

export function defaultEmail(settings: Pick<QuoteSettings, "emailSubject" | "emailMessage">, ctx: EmailContext): { subject: string; message: string } {
  const values = emailPlaceholderValues(ctx)
  return { subject: fillPlaceholders(settings.emailSubject, values), message: fillPlaceholders(settings.emailMessage, values) }
}

export function isEmailAddress(value: string): boolean {
  return /^[^\s@;]+@[^\s@;]+\.[^\s@;]+$/.test(value.trim())
}

/** Addresses typed with commas or semicolons, as the connector wants them: separated by semicolons. */
export function splitAddresses(value: string): string[] {
  return value.split(/[;,]/).map((a) => a.trim()).filter(Boolean)
}

/** The file name of a Quote's PDF: "Q-00001-rev1.pdf" or "Q-00001.pdf". */
export function quotePdfFileName(quote: Pick<Quote, "number" | "revision">): string {
  return quote.revision > 0 ? `${quote.number}-rev${quote.revision}.pdf` : `${quote.number}.pdf`
}

/** A plain-text message as the HTML body of an email: escaped, with line breaks kept. */
export function messageToHtml(message: string): string {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px">${escaped.replace(/\r?\n/g, "<br>")}</div>`
}

/** "Sent on 9 Oct 2026 by Alex Wilber via Outlook to pieter@fabrikam.example." or "... via download." */
export function sentDescription(quote: Pick<Quote, "sentOn" | "sentByName" | "sentVia" | "sentTo">, formatDate: (date: string) => string): string {
  if (!quote.sentOn) return ""
  const how = quote.sentVia === "email" ? `via Outlook${quote.sentTo ? ` to ${quote.sentTo}` : ""}` : quote.sentVia === "download" ? "via download" : ""
  return `Sent on ${formatDate(quote.sentOn)}${quote.sentByName ? ` by ${quote.sentByName}` : ""}${how ? ` ${how}` : ""}.`
}
