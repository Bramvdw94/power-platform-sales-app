import { quotaMonths, toDateOnly, type DateOnly, type Timestamp, type User } from "@/sales"
import type { InMemoryData } from "./store"

// A small fixed data set for tests and local development, mirroring the
// sample-data users: Megan Bowen manages Adele Vance and Alex Wilber; Diego
// Siciliani is a salesperson outside her team.

export const SEED_USERS = {
  megan: { id: "user-megan", fullName: "Megan Bowen", email: "megan@contoso.example", managerId: null, isSalesperson: true, isCatalogueManager: true },
  adele: { id: "user-adele", fullName: "Adele Vance", email: "adele@contoso.example", managerId: "user-megan", isSalesperson: true, isCatalogueManager: false },
  alex: { id: "user-alex", fullName: "Alex Wilber", email: "alex@contoso.example", managerId: "user-megan", isSalesperson: true, isCatalogueManager: false },
  diego: { id: "user-diego", fullName: "Diego Siciliani", email: "diego@contoso.example", managerId: null, isSalesperson: true, isCatalogueManager: false },
  bram: { id: "user-bram", fullName: "Bram (admin)", email: "bram@contoso.example", managerId: null, isSalesperson: false, isCatalogueManager: false },
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
  products: { consultingHour: "prod-consulting-hour", workshopDay: "prod-workshop-day", licence: "prod-licence-month", retired: "prod-retired-support" },
} as const

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
  const { accounts: A, contacts: C, leads: L, opportunities: O, tasks: T, notes: N, phoneCalls: P, products: PR } = SEED_IDS
  const daysAgo = (n: number) => at(addDays(today, -n))
  const inDays = (n: number) => addDays(today, n)

  const [thisMonth, nextMonth] = quotaMonths(today, 2)
  return {
    users: Object.values(SEED_USERS),
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
