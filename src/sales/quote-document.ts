import { quoteTotals } from "./quotes"
import { BLOCK_TYPES, flag, text, type Block, type PageStyle, type PdfLanguage, type TemplateDefinition } from "./quote-template"
import type { QuoteSettings } from "./quote-settings"
import type { Account, Contact, DateOnly, Opportunity, Product, ProductUnit, Quote, QuoteLine, User } from "./types"

// The content of a Quote PDF as plain data. A pure function builds it from the Quote, its lines, the
// template, the settings and the Owner; a renderer only draws it. Tests read this model, never PDF bytes.

export type Align = "left" | "right"
export type LineColumn = { id: "code" | "description" | "quantity" | "unit" | "price" | "discount" | "vat" | "amount"; label: string; align: Align }
export type DocLabelValue = { label: string; value: string }
export type DocTotalRow = { label: string; value: string; strong?: boolean }

type DocBlockBody =
  | { type: "header"; band: boolean; showSender: boolean; companyName: string; senderLines: string[]; logo?: string; logoPosition: "left" | "right"; title: string }
  | { type: "address"; lines: string[] }
  | { type: "reference"; items: DocLabelValue[] }
  | { type: "title"; title: string; intro: string }
  | { type: "lines"; columns: LineColumn[]; rows: string[][] }
  | { type: "totals"; rows: DocTotalRow[] }
  | { type: "terms"; heading: string; text: string; url: string }
  | { type: "contact"; heading: string; lines: string[] }
  | { type: "signature"; heading: string; fields: string[] }
  | { type: "footer"; lines: string[] }

/** A Block of the document; `id` is the template Block's id, so a preview can tell which one a click was on. */
export type DocBlock = DocBlockBody & { id: string }

export type QuoteDocument = {
  language: PdfLanguage
  style: PageStyle
  /** CONCEPT or DRAFT across a Draft Quote's pages; absent once it is sent. */
  watermark?: string
  /** Everything except the Footer, in template order. */
  blocks: Exclude<DocBlock, { type: "footer" }>[]
  /** The Footer is drawn at the bottom of every page. */
  footer: string[]
}

export type QuoteDocumentInput = {
  quote: Quote
  lines: readonly QuoteLine[]
  definition: TemplateDefinition
  settings: QuoteSettings
  owner: Pick<User, "fullName" | "email" | "phone">
  account?: Pick<Account, "name" | "street" | "postcode" | "city" | "country">
  contact?: Pick<Contact, "firstName" | "lastName">
  opportunity: Pick<Opportunity, "name">
  /** The Products on the lines, for the code and Unit columns. */
  products: readonly Pick<Product, "id" | "code" | "unit">[]
  today: DateOnly
}

type Labels = {
  quote: string
  number: string
  revision: string
  date: string
  validUntil: string
  contact: string
  code: string
  description: string
  quantity: string
  unit: string
  price: string
  discount: string
  vat: string
  amount: string
  netTotal: string
  vatOn: (rate: number, base: string) => string
  grossTotal: string
  attn: string
  terms: string
  termsLink: string
  yourContact: string
  accept: string
  name: string
  signDate: string
  signature: string
  kvk: string
  btwId: string
  iban: string
  draft: string
  units: Record<ProductUnit, string>
}

const LABELS: Record<PdfLanguage, Labels> = {
  nl: {
    quote: "Offerte", number: "Offertenummer", revision: "Revisie", date: "Datum", validUntil: "Geldig tot en met", contact: "Contactpersoon",
    code: "Code", description: "Omschrijving", quantity: "Aantal", unit: "Eenheid", price: "Prijs", discount: "Korting", vat: "Btw", amount: "Bedrag",
    netTotal: "Totaal excl. btw", vatOn: (rate, base) => `Btw ${rate}% over ${base}`, grossTotal: "Totaal incl. btw",
    attn: "t.a.v.", terms: "Voorwaarden", termsLink: "Algemene voorwaarden", yourContact: "Uw contactpersoon",
    accept: "Akkoord voor opdracht", name: "Naam", signDate: "Datum", signature: "Handtekening",
    kvk: "KvK", btwId: "Btw-id", iban: "IBAN", draft: "CONCEPT",
    units: { piece: "stuk", hour: "uur", day: "dag", month: "maand", year: "jaar" },
  },
  en: {
    quote: "Quote", number: "Quote number", revision: "Revision", date: "Date", validUntil: "Valid until", contact: "Contact",
    code: "Code", description: "Description", quantity: "Qty", unit: "Unit", price: "Price", discount: "Discount", vat: "VAT", amount: "Amount",
    netTotal: "Total excl. VAT", vatOn: (rate, base) => `VAT ${rate}% on ${base}`, grossTotal: "Total incl. VAT",
    attn: "Attn.", terms: "Terms", termsLink: "General terms", yourContact: "Your contact",
    accept: "Accepted for order", name: "Name", signDate: "Date", signature: "Signature",
    kvk: "Chamber of Commerce", btwId: "VAT number", iban: "IBAN", draft: "DRAFT",
    units: { piece: "piece", hour: "hour", day: "day", month: "month", year: "year" },
  },
}

const LOCALES: Record<PdfLanguage, string> = { nl: "nl-NL", en: "en-IE" }

export function pdfFormatters(language: PdfLanguage) {
  const locale = LOCALES[language]
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" })
  return {
    money: (value: number) => money.format(value),
    number: (value: number) => number.format(value),
    date: (value: DateOnly) => {
      const [y, m, d] = value.split("-").map(Number)
      return date.format(new Date(y, m - 1, d))
    },
  }
}

function nonBlank(values: readonly (string | undefined)[]): string[] {
  return values.map((v) => (v ?? "").trim()).filter(Boolean)
}

function splitLines(value: string): string[] {
  return nonBlank(value.split("\n"))
}

function buildBlock(block: Block, input: QuoteDocumentInput, t: Labels, f: ReturnType<typeof pdfFormatters>, style: PageStyle): DocBlockBody | undefined {
  const { quote, settings } = input
  switch (block.type) {
    case "header":
      return {
        type: "header",
        band: flag(block, "band"),
        showSender: flag(block, "sender"),
        companyName: settings.companyName,
        senderLines: nonBlank([...splitLines(settings.address), settings.phone, settings.email]),
        logo: settings.logo || undefined,
        logoPosition: style.logoPosition,
        title: `${t.quote} ${quote.number}`,
      }
    case "address": {
      const place = nonBlank([input.account?.postcode, input.account?.city]).join(" ")
      const contactName = input.contact ? nonBlank([input.contact.firstName, input.contact.lastName]).join(" ") : ""
      return {
        type: "address",
        lines: nonBlank([input.account?.name ?? quote.accountName, contactName ? `${t.attn} ${contactName}` : "", input.account?.street, place, input.account?.country]),
      }
    }
    case "reference": {
      const items: DocLabelValue[] = [{ label: t.number, value: quote.number }]
      if (flag(block, "revision")) items.push({ label: t.revision, value: String(quote.revision) })
      items.push({ label: t.date, value: f.date(input.today) })
      if (quote.validUntil) items.push({ label: t.validUntil, value: f.date(quote.validUntil) })
      return { type: "reference", items }
    }
    case "title":
      return { type: "title", title: `${t.quote}: ${input.opportunity.name}`, intro: text(block, "intro") }
    case "lines": {
      const columns: LineColumn[] = []
      if (flag(block, "code")) columns.push({ id: "code", label: t.code, align: "left" })
      columns.push({ id: "description", label: t.description, align: "left" })
      columns.push({ id: "quantity", label: t.quantity, align: "right" })
      if (flag(block, "unit")) columns.push({ id: "unit", label: t.unit, align: "left" })
      columns.push({ id: "price", label: t.price, align: "right" })
      if (flag(block, "discount")) columns.push({ id: "discount", label: t.discount, align: "right" })
      if (flag(block, "vat")) columns.push({ id: "vat", label: t.vat, align: "right" })
      columns.push({ id: "amount", label: t.amount, align: "right" })
      const rows = input.lines.map((line) => {
        const product = input.products.find((p) => p.id === line.productId)
        const cell = (id: LineColumn["id"]): string => {
          switch (id) {
            case "code":
              return product?.code ?? ""
            case "description":
              return line.description ? `${line.productName}\n${line.description}` : line.productName
            case "quantity":
              return f.number(line.quantity)
            case "unit":
              return product ? t.units[product.unit] : ""
            case "price":
              return f.money(line.unitPrice)
            case "discount":
              return line.discountPercent ? `${f.number(line.discountPercent)}%` : ""
            case "vat":
              return `${line.vatRate}%`
            case "amount":
              return f.money(line.lineAmount)
          }
        }
        return columns.map((c) => cell(c.id))
      })
      return { type: "lines", columns, rows }
    }
    case "totals": {
      const totals = quoteTotals(input.lines)
      return {
        type: "totals",
        rows: [
          { label: t.netTotal, value: f.money(totals.net) },
          ...totals.byRate.map((r) => ({ label: t.vatOn(r.rate, f.money(r.net)), value: f.money(r.vat) })),
          { label: t.grossTotal, value: f.money(totals.gross), strong: true },
        ],
      }
    }
    case "terms": {
      const own = text(block, "text").trim()
      const body = flag(block, "useSettings") || own === "" ? settings.termsText.trim() : own
      return { type: "terms", heading: t.terms, text: body, url: flag(block, "useSettings") ? settings.termsUrl.trim() : "" }
    }
    case "contact": {
      const phone = flag(block, "phone") ? input.owner.phone || settings.phone : ""
      return { type: "contact", heading: t.yourContact, lines: nonBlank([input.owner.fullName, input.owner.email, phone]) }
    }
    case "signature":
      return { type: "signature", heading: text(block, "heading").trim() || t.accept, fields: [t.name, t.signDate, t.signature] }
    case "footer":
      return {
        type: "footer",
        lines: nonBlank([
          settings.companyName,
          settings.kvk && `${t.kvk} ${settings.kvk}`,
          settings.btwId && `${t.btwId} ${settings.btwId}`,
          settings.iban && `${t.iban} ${settings.iban}`,
        ]),
      }
  }
}

/** What the PDF says, Block by Block. A Draft Quote gets a watermark; nothing else differs. */
export function buildQuoteDocument(input: QuoteDocumentInput): QuoteDocument {
  const { style } = input.definition
  const t = LABELS[style.language]
  const f = pdfFormatters(style.language)
  const known = input.definition.blocks.filter((b) => BLOCK_TYPES.includes(b.type))
  const built = known.flatMap((b): DocBlock[] => {
    const body = buildBlock(b, input, t, f, style)
    return body ? [{ ...body, id: b.id }] : []
  })
  const footer = built.find((b): b is Extract<DocBlock, { type: "footer" }> => b.type === "footer")
  return {
    language: style.language,
    style,
    watermark: input.quote.status === "draft" ? t.draft : undefined,
    blocks: built.filter((b): b is QuoteDocument["blocks"][number] => b.type !== "footer"),
    footer: footer?.lines ?? [],
  }
}
