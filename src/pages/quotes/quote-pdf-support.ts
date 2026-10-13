import { useQuery } from "@tanstack/react-query"
import type { QuoteDetails } from "@/data/gateway"
import { useGateway } from "@/hooks/use-gateway"
import { renderQuotePdf } from "@/lib/quote-pdf"
import { buildQuoteDocument, toDateOnly, type QuoteDocument, type QuoteSettings, type QuoteTemplate } from "@/sales"

/** The Quote's own template, or the Default one when it has none (or its template is gone). */
export function templateFor(details: Pick<QuoteDetails, "quote">, templates: readonly QuoteTemplate[]): QuoteTemplate | undefined {
  return templates.find((t) => t.id === details.quote.templateId) ?? templates.find((t) => t.isDefault) ?? templates[0]
}

/** The settings and templates the PDF is drawn from; every user reads both. */
export function useQuotePdfSources() {
  const gateway = useGateway()
  const settings = useQuery({ queryKey: ["QuoteSettings"], queryFn: () => gateway.getQuoteSettings() })
  const templates = useQuery({ queryKey: ["QuoteTemplates"], queryFn: () => gateway.listQuoteTemplates() })
  return { settings: settings.data, templates: templates.data, isPending: settings.isPending || templates.isPending, error: settings.error ?? templates.error }
}

/** What the PDF of this Quote says. `asSent` leaves out the Draft watermark: it is the copy that goes out. */
export function documentOf(details: QuoteDetails, settings: QuoteSettings, template: QuoteTemplate, options: { asSent?: boolean } = {}): QuoteDocument {
  return buildQuoteDocument({
    quote: options.asSent ? { ...details.quote, status: "sent" } : details.quote,
    lines: details.lines,
    definition: template.definition,
    settings,
    owner: details.owner,
    account: details.account,
    contact: details.contact,
    opportunity: details.opportunity,
    products: details.products,
    today: toDateOnly(new Date()),
  })
}

export function renderQuote(details: QuoteDetails, settings: QuoteSettings, template: QuoteTemplate, options: { asSent?: boolean } = {}): Promise<Uint8Array> {
  return renderQuotePdf(documentOf(details, settings, template, options))
}

/** Hands the bytes to the browser as a file download. */
export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  try {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }))
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch {
    // The file is stored on the Quote either way; a browser without downloads just does not save a copy.
  }
}
