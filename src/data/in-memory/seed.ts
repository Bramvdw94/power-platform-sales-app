import starters from "../../../data/quote-templates.json"
import { lineAmount, quoteTotals, quotaMonths, toDateOnly, type DateOnly, type QuoteLine, type QuoteSettings, type QuoteStatus, type QuoteTemplate, type Timestamp, type User } from "@/sales"
import type { QuoteRow } from "./store"
import type { InMemoryData } from "./store"

// A small fixed data set for tests and local development, mirroring the
// sample-data users: Megan Bowen manages Adele Vance and Alex Wilber; Diego
// Siciliani is a salesperson outside her team.

export const SEED_USERS = {
  megan: { id: "user-megan", fullName: "Megan Bowen", email: "megan@contoso.example", managerId: null, isSalesperson: true, isCatalogueManager: true, isProcessBuilder: true },
  adele: { id: "user-adele", fullName: "Adele Vance", email: "adele@contoso.example", managerId: "user-megan", isSalesperson: true, isCatalogueManager: false, isProcessBuilder: false },
  alex: { id: "user-alex", fullName: "Alex Wilber", email: "alex@contoso.example", managerId: "user-megan", isSalesperson: true, isCatalogueManager: false, isProcessBuilder: false },
  diego: { id: "user-diego", fullName: "Diego Siciliani", email: "diego@contoso.example", managerId: null, isSalesperson: true, isCatalogueManager: false, isProcessBuilder: false },
  bram: { id: "user-bram", fullName: "Bram (admin)", email: "bram@contoso.example", managerId: null, isSalesperson: false, isCatalogueManager: false, isProcessBuilder: false },
} satisfies Record<string, User>

/** Fixed IDs of the seeded records, for tests. */
export const SEED_IDS = {
  accounts: { tailwind: "acc-tailwind", fabrikam: "acc-fabrikam", northwind: "acc-northwind" },
  contacts: { lotte: "con-lotte", pieter: "con-pieter", femke: "con-femke" },
  leads: { notContacted: "lead-sanne", working: "lead-thomas", qualified: "lead-lotte", disqualified: "lead-joris", diegos: "lead-lucas" },
  opportunities: {
    qualification: "opp-tailwind-workplace",
    proposal: "opp-fabrikam-security",
    negotiation: "opp-northwind-cloud",
    diegosProposal: "opp-northwind-backup",
    won: "opp-fabrikam-laptops",
    lost: "opp-tailwind-network",
  },
  tasks: { overdue: "task-call-back", dueLater: "task-send-proposal", done: "task-intro" },
  notes: { kickoff: "note-kickoff" },
  phoneCalls: { open: "call-planned", logged: "call-logged" },
  productLines: {
    proposalConsulting: "line-proposal-consulting",
    proposalWorkshop: "line-proposal-workshop",
    proposalLicences: "line-proposal-licences",
    wonWorkshop: "line-won-workshop",
    wonConsulting: "line-won-consulting",
  },
  quotes: {
    /** Fabrikam security audit (Alex's): Q-00001 revision 1, Sent. */
    sent: "quote-sent",
    /** Q-00001 revision 0, Revised by the one above. */
    revised: "quote-revised",
    /** Q-00002, Sent and past its Valid until. */
    expired: "quote-expired",
    /** Q-00003, a Draft with one line. */
    draft: "quote-draft",
    /** Fabrikam laptops (won). */
    accepted: "quote-accepted",
    /** Tailwind network refresh (lost). */
    rejected: "quote-rejected",
  },
  quoteLines: { sentConsulting: "qline-sent-consulting", sentLicences: "qline-sent-licences", draftWorkshop: "qline-draft-workshop" },
  templates: { businessLetter: "qtpl-1", proposal: "qtpl-2", orderForm: "qtpl-3" },
  products: { consultingHour: "prod-consulting-hour", workshopDay: "prod-workshop-day", licence: "prod-licence-month", retired: "prod-retired-support" },
} as const

/** The three starter templates and the settings, as the sample data and the setup script load them. */
export const SEED_TEMPLATES: QuoteTemplate[] = starters.templates.map((t, i) => ({
  id: `qtpl-${i + 1}`,
  name: t.name,
  isDefault: t.isDefault,
  definition: t.definition as QuoteTemplate["definition"],
}))
export const SEED_SETTINGS: QuoteSettings = { id: "quote-settings", logo: "", ...starters.settings }

function addDays(date: DateOnly, days: number): DateOnly {
  const [y, m, d] = date.split("-").map(Number)
  return toDateOnly(new Date(y, m - 1, d + days))
}

function at(date: DateOnly): Timestamp {
  return `${date}T09:00:00.000Z`
}

/** The seed data, with dates relative to today so Home and the Pipeline look current. */
export function createSeedData(today: DateOnly): InMemoryData {
  const { megan, adele, alex, diego } = SEED_USERS
  const { accounts: A, contacts: C, leads: L, opportunities: O, tasks: T, notes: N, phoneCalls: P, products: PR, productLines: PL, quotes: Q, quoteLines: QL } = SEED_IDS
  const daysAgo = (n: number) => at(addDays(today, -n))
  const inDays = (n: number) => addDays(today, n)

  const [thisMonth, nextMonth] = quotaMonths(today, 2)

  const quoteLine = (id: string, quoteId: string, productId: string, productName: string, quantity: number, unitPrice: number, vatRate: QuoteLine["vatRate"], created: number): QuoteLine => ({
    id, quoteId, productId, productName, quantity, unitPrice, discountPercent: 0, vatRate,
    lineAmount: lineAmount(quantity, unitPrice, 0), createdOn: daysAgo(created),
  })
  const quoteLines: QuoteLine[] = [
    quoteLine(QL.sentConsulting, Q.sent, PR.consultingHour, "Consulting", 100, 125, 21, 8),
    quoteLine(QL.sentLicences, Q.sent, PR.licence, "Cloud licence", 10, 25, 21, 8),
    quoteLine(QL.draftWorkshop, Q.draft, PR.workshopDay, "Workshop day", 5, 1450, 9, 1),
  ]
  const quote = (id: string, number: string, revision: number, status: QuoteStatus, opportunityId: string, accountId: string, contactId: string | undefined, ownerId: string, validUntil: DateOnly, created: number, extra: Partial<QuoteRow> = {}): QuoteRow => {
    const totals = quoteTotals(quoteLines.filter((l) => l.quoteId === id))
    const vat = (rate: number) => totals.byRate.find((l) => l.rate === rate)?.vat ?? 0
    return {
      id, opportunityId, number, revision, status, accountId, contactId, validUntil,
      netTotal: totals.net, vat21: vat(21), vat9: vat(9), grossTotal: totals.gross,
      ownerId, createdOn: daysAgo(created), ...extra,
    }
  }
  const sentAt = (days: number) => ({ sentOn: daysAgo(days), sentById: alex.id })
  return {
    quoteLines,
    quotes: [
      quote(Q.revised, "Q-00001", 0, "revised", O.proposal, A.fabrikam, C.pieter, alex.id, inDays(-20), 15, sentAt(14)),
      quote(Q.sent, "Q-00001", 1, "sent", O.proposal, A.fabrikam, C.pieter, alex.id, inDays(20), 8, sentAt(7)),
      quote(Q.expired, "Q-00002", 0, "sent", O.proposal, A.fabrikam, C.pieter, alex.id, inDays(-2), 33, sentAt(32)),
      quote(Q.draft, "Q-00003", 0, "draft", O.proposal, A.fabrikam, C.pieter, alex.id, inDays(29), 1),
      quote(Q.accepted, "Q-00004", 0, "accepted", O.won, A.fabrikam, undefined, alex.id, inDays(-18), 60, sentAt(58)),
      quote(Q.rejected, "Q-00005", 0, "rejected", O.lost, A.tailwind, undefined, adele.id, inDays(-27), 90, { sentOn: daysAgo(88), sentById: adele.id }),
    ],
    users: Object.values(SEED_USERS),
    quoteTemplates: SEED_TEMPLATES,
    quoteSettings: SEED_SETTINGS,
    quotas: [
      { id: "quota-adele-1", salespersonId: adele.id, month: thisMonth, amount: 40000 },
      { id: "quota-adele-2", salespersonId: adele.id, month: nextMonth, amount: 45000 },
      { id: "quota-alex-1", salespersonId: alex.id, month: thisMonth, amount: 30000 },
      { id: "quota-megan-1", salespersonId: megan.id, month: thisMonth, amount: 20000 },
    ],
    accounts: [
      { id: A.tailwind, name: "Tailwind Traders", website: "https://tailwind.example", city: "Utrecht", country: "Netherlands", ownerId: adele.id, createdOn: daysAgo(120) },
      { id: A.fabrikam, name: "Fabrikam NV", website: "https://fabrikam.example", city: "Antwerpen", country: "Belgium", ownerId: alex.id, createdOn: daysAgo(90) },
      { id: A.northwind, name: "Northwind BV", phone: "+31 10 555 0100", city: "Rotterdam", country: "Netherlands", ownerId: diego.id, createdOn: daysAgo(60) },
    ],
    contacts: [
      { id: C.lotte, firstName: "Lotte", lastName: "de Groot", jobTitle: "IT Manager", accountId: A.tailwind, email: "lotte@tailwind.example", ownerId: adele.id, createdOn: daysAgo(118) },
      { id: C.pieter, firstName: "Pieter", lastName: "Claes", jobTitle: "CFO", accountId: A.fabrikam, email: "pieter@fabrikam.example", ownerId: alex.id, createdOn: daysAgo(88) },
      { id: C.femke, firstName: "Femke", lastName: "Visser", jobTitle: "CTO", accountId: A.northwind, email: "femke@northwind.example", ownerId: diego.id, createdOn: daysAgo(58) },
    ],
    leads: [
      { id: L.notContacted, firstName: "Sanne", lastName: "Bakker", company: "Tailspin Toys", email: "sanne@tailspin.example", leadSource: "website", status: "notContacted", ownerId: adele.id, createdOn: daysAgo(2) },
      { id: L.working, firstName: "Thomas", lastName: "Peeters", company: "Fabrikam", jobTitle: "Head of IT", email: "thomas@fabrikam.example", leadSource: "event", description: "Wants a managed workplace offer", status: "working", ownerId: alex.id, createdOn: daysAgo(10) },
      { id: L.qualified, firstName: "Lotte", lastName: "de Groot", company: "Tailwind Traders", jobTitle: "IT Manager", email: "lotte@tailwind.example", leadSource: "referral", status: "qualified", ownerId: adele.id, createdOn: daysAgo(40) },
      { id: L.disqualified, firstName: "Joris", lastName: "Willems", company: "Proseware", leadSource: "coldOutreach", status: "disqualified", disqualifyReason: "noBudget", disqualifiedOn: daysAgo(5), disqualifiedById: megan.id, ownerId: adele.id, createdOn: daysAgo(30) },
      { id: L.diegos, firstName: "Lucas", lastName: "Maes", company: "Wide World Importers", leadSource: "partner", status: "working", ownerId: diego.id, createdOn: daysAgo(7) },
    ],
    opportunities: [
      { id: O.qualification, name: "Tailwind Traders - Managed workplace", accountId: A.tailwind, primaryContactId: C.lotte, stage: "qualification", probability: 10, estimatedValue: 48000, expectedCloseDate: inDays(45), leadSource: "referral", originatingLeadId: L.qualified, ownerId: adele.id, createdOn: daysAgo(39) },
      { id: O.proposal, name: "Fabrikam NV - Security audit", accountId: A.fabrikam, primaryContactId: C.pieter, stage: "proposal", probability: 50, estimatedValue: 20000, expectedCloseDate: inDays(-3), nextStep: "Present proposal", ownerId: alex.id, createdOn: daysAgo(50) },
      { id: O.negotiation, name: "Northwind BV - Cloud migration", accountId: A.northwind, primaryContactId: C.femke, stage: "negotiation", probability: 80, estimatedValue: 120000, expectedCloseDate: inDays(10), ownerId: megan.id, createdOn: daysAgo(70) },
      { id: O.diegosProposal, name: "Northwind BV - Backup service", accountId: A.northwind, stage: "proposal", probability: 50, estimatedValue: 15000, expectedCloseDate: inDays(20), ownerId: diego.id, createdOn: daysAgo(20) },
      { id: O.won, name: "Fabrikam NV - Laptops", accountId: A.fabrikam, stage: "closedWon", probability: 100, estimatedValue: 30000, actualValue: 27500, expectedCloseDate: inDays(-20), closeDate: inDays(-15), closedById: alex.id, ownerId: alex.id, createdOn: daysAgo(80) },
      { id: O.lost, name: "Tailwind Traders - Network refresh", accountId: A.tailwind, stage: "closedLost", probability: 0, estimatedValue: 60000, expectedCloseDate: inDays(-30), closeDate: inDays(-25), lostReason: "choseCompetitor", closedById: adele.id, ownerId: adele.id, createdOn: daysAgo(100) },
    ],
    products: [
      { id: PR.consultingHour, name: "Consulting", code: "CONS-HR", description: "Senior consultant, billed per hour.", unit: "hour", listPrice: 125, vatRate: 21, retired: false, createdOn: daysAgo(200) },
      { id: PR.workshopDay, name: "Workshop day", code: "WS-DAY", description: "On-site workshop of one day, up to 12 people.", unit: "day", listPrice: 1450, vatRate: 21, retired: false, createdOn: daysAgo(200) },
      { id: PR.licence, name: "Cloud licence", code: "LIC-M365", unit: "month", listPrice: 22.5, vatRate: 21, retired: false, createdOn: daysAgo(190) },
      { id: PR.retired, name: "Legacy support", code: "SUP-OLD", description: "Support contract we no longer sell.", unit: "year", listPrice: 4800, vatRate: 9, retired: true, createdOn: daysAgo(400) },
    ],
    // Lines add up to the Opportunity's Estimated value, as the plug-in keeps it.
    productLines: [
      { id: PL.proposalConsulting, opportunityId: O.proposal, productId: PR.consultingHour, productName: "Consulting", description: "Senior consultant, billed per hour.", quantity: 100, unitPrice: 125, listPriceAtAdd: 125, discountPercent: 0, lineAmount: 12500, createdOn: daysAgo(45) },
      { id: PL.proposalWorkshop, opportunityId: O.proposal, productId: PR.workshopDay, productName: "Workshop day", description: "On-site workshop of one day, up to 12 people.", quantity: 5, unitPrice: 1450, listPriceAtAdd: 1450, discountPercent: 0, lineAmount: 7250, createdOn: daysAgo(44) },
      { id: PL.proposalLicences, opportunityId: O.proposal, productId: PR.licence, productName: "Cloud licence", quantity: 10, unitPrice: 25, listPriceAtAdd: 22.5, discountPercent: 0, lineAmount: 250, createdOn: daysAgo(43) },
      { id: PL.wonWorkshop, opportunityId: O.won, productId: PR.workshopDay, productName: "Workshop day", description: "On-site workshop of one day, up to 12 people.", quantity: 10, unitPrice: 1450, listPriceAtAdd: 1450, discountPercent: 0, lineAmount: 14500, createdOn: daysAgo(75) },
      { id: PL.wonConsulting, opportunityId: O.won, productId: PR.consultingHour, productName: "Consulting", description: "Senior consultant, billed per hour.", quantity: 124, unitPrice: 125, listPriceAtAdd: 125, discountPercent: 0, lineAmount: 15500, createdOn: daysAgo(74) },
    ],
    activities: [
      { id: T.overdue, kind: "task", subject: "Call Thomas back", dueDate: inDays(-2), completed: false, regarding: { type: "lead", id: L.working }, ownerId: alex.id, createdOn: daysAgo(6) },
      { id: T.dueLater, kind: "task", subject: "Send proposal", dueDate: inDays(5), completed: false, regarding: { type: "opportunity", id: O.qualification }, ownerId: adele.id, createdOn: daysAgo(3) },
      { id: T.done, kind: "task", subject: "Intro meeting", dueDate: inDays(-30), completed: true, completedOn: daysAgo(30), regarding: { type: "opportunity", id: O.qualification }, ownerId: adele.id, createdOn: daysAgo(35) },
      { id: N.kickoff, kind: "note", title: "Kick-off", text: "Lotte wants a pilot for 20 users first.", regarding: { type: "opportunity", id: O.qualification }, ownerId: adele.id, createdOn: daysAgo(30) },
      { id: P.open, kind: "phoneCall", subject: "Follow-up call", direction: "outgoing", date: inDays(1), completed: false, regarding: { type: "opportunity", id: O.qualification }, ownerId: adele.id, createdOn: daysAgo(1) },
      { id: P.logged, kind: "phoneCall", subject: "First call", direction: "incoming", date: inDays(-36), notes: "Asked for a demo.", completed: true, regarding: { type: "opportunity", id: O.qualification }, ownerId: adele.id, createdOn: daysAgo(36) },
    ],
  }
}
