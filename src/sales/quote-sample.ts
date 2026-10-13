import type { QuoteDocumentInput } from "./quote-document"
import type { QuoteSettings } from "./quote-settings"
import type { TemplateDefinition } from "./quote-template"
import type { DateOnly, QuoteLine, User } from "./types"
import { addDays } from "./quotes"

/** A made-up Quote, so a template can be previewed without picking a real one. */
export function sampleQuoteInput(definition: TemplateDefinition, settings: QuoteSettings, user: Pick<User, "fullName" | "email" | "phone">, today: DateOnly): QuoteDocumentInput {
  const line = (n: number, name: string, description: string | undefined, quantity: number, unitPrice: number, discountPercent: number, vatRate: 21 | 9 | 0): QuoteLine => ({
    id: `sample-${n}`,
    quoteId: "sample",
    productId: `sample-product-${n}`,
    productName: name,
    description,
    quantity,
    unitPrice,
    discountPercent,
    vatRate,
    lineAmount: Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100,
    createdOn: today,
  })
  return {
    quote: {
      id: "sample",
      opportunityId: "sample-opportunity",
      number: "Q-00012",
      revision: 1,
      status: "sent",
      accountId: "sample-account",
      accountName: "Fabrikam Logistiek B.V.",
      validUntil: addDays(today, settings.defaultValidityDays),
      netTotal: 0,
      vat21: 0,
      vat9: 0,
      grossTotal: 0,
      hasStoredPdf: false,
      ownerId: "sample-owner",
      ownerName: user.fullName,
      createdOn: today,
    },
    lines: [
      line(1, "Implementation consulting", "Senior consultant, billed per hour.", 40, 110, 10, 21),
      line(2, "SalesApp licence", undefined, 60, 45, 0, 21),
      line(3, "On-site training", "One day, up to 12 people.", 2, 950, 0, 21),
      line(4, "Printed user manual", undefined, 5, 24.5, 0, 9),
    ],
    definition,
    settings,
    owner: user,
    account: { name: "Fabrikam Logistiek B.V.", street: "Havenweg 48", postcode: "3044 AV", city: "Rotterdam", country: "Nederland" },
    contact: { firstName: "Sanne", lastName: "de Vries" },
    opportunity: { name: "CRM rollout Fabrikam" },
    products: [
      { id: "sample-product-1", code: "CONS-IMP", unit: "hour" },
      { id: "sample-product-2", code: "LIC-USR", unit: "month" },
      { id: "sample-product-3", code: "TRN-DAY", unit: "day" },
      { id: "sample-product-4", code: "DOC-MAN", unit: "piece" },
    ],
    today,
  }
}
