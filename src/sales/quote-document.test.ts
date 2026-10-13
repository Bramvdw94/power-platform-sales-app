import { describe, expect, it } from "vitest"
import starters from "../../data/quote-templates.json"
import { buildQuoteDocument, parseDefinition, sampleQuoteInput, serializeDefinition, type QuoteSettings, type TemplateDefinition } from "."

const settings: QuoteSettings = { id: "s", logo: "", ...starters.settings }
const owner = { fullName: "Alex Wilber", email: "alex@contoso.example", phone: "06 12 34 56 78" }
const today = "2026-10-09"

/** Intl puts a no-break space after the euro sign; compare with a plain one. */
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value).replace(/\u00a0/g, " "))

const starter = (name: string): TemplateDefinition => parseDefinition(serializeDefinition(starters.templates.find((t) => t.name === name)!.definition as TemplateDefinition))

function documentOf(definition: TemplateDefinition, status: "draft" | "sent" = "sent") {
  const input = sampleQuoteInput(definition, settings, owner, today)
  return buildQuoteDocument({ ...input, quote: { ...input.quote, status } })
}

const typesOf = (definition: TemplateDefinition) => documentOf(definition).blocks.map((b) => b.type)
const columnsOf = (definition: TemplateDefinition) => {
  const lines = documentOf(definition).blocks.find((b) => b.type === "lines")
  return lines?.type === "lines" ? lines.columns.map((c) => c.id) : []
}

describe("the starter templates", () => {
  it("ship three templates with exactly one Default, the Business letter", () => {
    expect(starters.templates.map((t) => [t.name, t.isDefault])).toEqual([
      ["Business letter", true],
      ["Proposal", false],
      ["Order form", false],
    ])
  })

  it("are valid definitions", () => {
    for (const t of starters.templates) expect(() => parseDefinition(JSON.stringify(t.definition))).not.toThrow()
  })

  it("Business letter: header with sender, address, reference with revision, title, all four line columns, terms, contact, footer", () => {
    const definition = starter("Business letter")
    expect(typesOf(definition)).toEqual(["header", "address", "reference", "title", "lines", "totals", "terms", "contact"])
    expect(columnsOf(definition)).toEqual(["code", "description", "quantity", "unit", "price", "discount", "vat", "amount"])
    const doc = documentOf(definition)
    expect(doc.blocks[0]).toMatchObject({ type: "header", band: false, showSender: true })
    expect(doc.blocks[2]).toMatchObject({ type: "reference", items: expect.arrayContaining([expect.objectContaining({ label: "Revisie", value: "1" })]) })
    expect(doc.footer).toEqual(["Northwind Solutions B.V.", "KvK 87654321", "Btw-id NL864512398B01", "IBAN NL91 ABNA 0417 1643 00"])
    expect(doc.language).toBe("nl")
  })

  it("Proposal: a colour band, the intro first, no Product code and no VAT column, no revision in the reference", () => {
    const definition = starter("Proposal")
    expect(typesOf(definition)).toEqual(["header", "title", "address", "reference", "lines", "totals", "terms", "contact"])
    expect(columnsOf(definition)).toEqual(["description", "quantity", "unit", "price", "discount", "amount"])
    const doc = documentOf(definition)
    expect(doc.blocks[0]).toMatchObject({ type: "header", band: true, showSender: false })
    const reference = doc.blocks.find((b) => b.type === "reference")
    expect(reference?.type === "reference" && reference.items.map((i) => i.label)).toEqual(["Offertenummer", "Datum", "Geldig tot en met"])
  })

  it("Order form: an acceptance and signature block with three fields, and no contact block", () => {
    const definition = starter("Order form")
    expect(typesOf(definition)).toEqual(["header", "reference", "address", "lines", "totals", "terms", "signature"])
    expect(columnsOf(definition)).toEqual(["description", "quantity", "unit", "price", "discount", "vat", "amount"])
    const signature = documentOf(definition).blocks.find((b) => b.type === "signature")
    expect(signature).toMatchObject({ heading: "Akkoord voor opdracht", fields: ["Naam", "Datum", "Handtekening"] })
  })
})

describe("the document model", () => {
  const definition = starter("Business letter")

  it("lists each line with its formatted cells", () => {
    const lines = documentOf(definition).blocks.find((b) => b.type === "lines")
    expect(lines?.type === "lines" && plain(lines.rows[0])).toEqual(["CONS-IMP", "Implementation consulting\nSenior consultant, billed per hour.", "40", "uur", "€ 110,00", "10%", "21%", "€ 3.960,00"])
    expect(lines?.type === "lines" && lines.rows).toHaveLength(4)
  })

  it("shows net, VAT per rate on the net total of that rate, and gross", () => {
    const totals = documentOf(definition).blocks.find((b) => b.type === "totals")
    // 3960 + 2700 + 1900 at 21 %, 122.50 at 9 %.
    expect(totals?.type === "totals" && plain(totals.rows)).toEqual([
      { label: "Totaal excl. btw", value: "€ 8.682,50" },
      { label: "Btw 21% over € 8.560,00", value: "€ 1.797,60" },
      { label: "Btw 9% over € 122,50", value: "€ 11,03" },
      { label: "Totaal incl. btw", value: "€ 10.491,13", strong: true },
    ])
  })

  it("leaves out a VAT rate no line uses", () => {
    const input = sampleQuoteInput(definition, settings, owner, today)
    const doc = buildQuoteDocument({ ...input, lines: input.lines.filter((l) => l.vatRate === 21) })
    const totals = doc.blocks.find((b) => b.type === "totals")
    expect(totals?.type === "totals" && plain(totals.rows.map((r) => r.label))).toEqual(["Totaal excl. btw", "Btw 21% over € 8.560,00", "Totaal incl. btw"])
  })

  it("puts a CONCEPT watermark on a Draft and none on a Sent Quote", () => {
    expect(documentOf(definition, "draft").watermark).toBe("CONCEPT")
    expect(documentOf(definition, "sent").watermark).toBeUndefined()
    const english = { ...definition, style: { ...definition.style, language: "en" as const } }
    expect(documentOf(english, "draft").watermark).toBe("DRAFT")
  })

  it("writes labels and dates in the template's language", () => {
    const english = { ...definition, style: { ...definition.style, language: "en" as const } }
    const doc = documentOf(english)
    const reference = doc.blocks.find((b) => b.type === "reference")
    expect(reference?.type === "reference" && reference.items.map((i) => i.label)).toEqual(["Quote number", "Revision", "Date", "Valid until"])
    expect(reference?.type === "reference" && reference.items[2].value).toBe("9 October 2026")
    const totals = doc.blocks.find((b) => b.type === "totals")
    expect(totals?.type === "totals" && totals.rows.at(-1)?.label).toBe("Total incl. VAT")
  })

  it("takes terms from the settings, or from the template's own text", () => {
    const own = { ...definition, blocks: definition.blocks.map((b) => (b.type === "terms" ? { ...b, options: { useSettings: false, text: "Own terms" } } : b)) }
    const terms = (d: TemplateDefinition) => documentOf(d).blocks.find((b) => b.type === "terms")
    expect(terms(definition)).toMatchObject({ text: settings.termsText, url: settings.termsUrl })
    expect(terms(own)).toMatchObject({ text: "Own terms", url: "" })
  })

  it("names the Owner, with their phone when the Block asks for it and the company phone when they have none", () => {
    const contact = (phone: string | undefined, show = true) => {
      const d = { ...definition, blocks: definition.blocks.map((b) => (b.type === "contact" ? { ...b, options: { phone: show } } : b)) }
      const input = sampleQuoteInput(d, settings, { ...owner, phone }, today)
      const block = buildQuoteDocument(input).blocks.find((b) => b.type === "contact")
      return block?.type === "contact" ? block.lines : []
    }
    expect(contact("06 12 34 56 78")).toEqual(["Alex Wilber", "alex@contoso.example", "06 12 34 56 78"])
    expect(contact(undefined)).toEqual(["Alex Wilber", "alex@contoso.example", "030 123 45 67"])
    expect(contact("06 12 34 56 78", false)).toEqual(["Alex Wilber", "alex@contoso.example"])
  })

  it("addresses the Account, the Contact and the postcode with the city", () => {
    const address = documentOf(definition).blocks.find((b) => b.type === "address")
    expect(address?.type === "address" && address.lines).toEqual(["Fabrikam Logistiek B.V.", "t.a.v. Sanne de Vries", "Havenweg 48", "3044 AV Rotterdam", "Nederland"])
  })
})
