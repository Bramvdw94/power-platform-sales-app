// PROTOTYPE (throwaway, never merge): Quote discounts, Approvals and Orders (#165).
// An in-memory store laid over the in-memory seed data, so the real Quote, Opportunity,
// Account and Home pages can show discounts, an Approval panel and Orders.
// Rules come from the resolutions of #145 (Approvals) and #148 (discounts, Orders).

import { useSyncExternalStore } from "react"
import { SEED_IDS, SEED_USERS } from "@/data/in-memory"
import type { QuoteDetails } from "@/data/gateway"
import type { QuoteLine, VatRate } from "@/sales"

// ---------------------------------------------------------------- people

export type Person = { id: string; name: string }
export type ViewerKey = "alex" | "megan"

export const PEOPLE: Record<string, Person & { managerId: string | null }> = {
  "user-megan": { id: "user-megan", name: SEED_USERS.megan.fullName, managerId: null },
  "user-adele": { id: "user-adele", name: SEED_USERS.adele.fullName, managerId: "user-megan" },
  "user-alex": { id: "user-alex", name: SEED_USERS.alex.fullName, managerId: "user-megan" },
  "user-diego": { id: "user-diego", name: SEED_USERS.diego.fullName, managerId: null },
  "user-bram": { id: "user-bram", name: SEED_USERS.bram.fullName, managerId: null },
}
/** Set by a Process builder on the Automation page (#145). */
export const FALLBACK_APPROVER = PEOPLE["user-bram"]
export const VIEWERS: Record<ViewerKey, Person> = { alex: PEOPLE["user-alex"], megan: PEOPLE["user-megan"] }
export const personName = (id: string) => PEOPLE[id]?.name ?? "Unknown"

// ---------------------------------------------------------------- discount maths

/** Quote settings (edited by a Catalogue manager): up to `first` needs nothing, up to `second` the Owner's manager, above it their manager too. */
export const THRESHOLDS = { first: 10, second: 25 }

const round2 = (n: number) => Math.round(n * 100) / 100
export const fmtPct = (n: number) => `${Number.isInteger(n) ? n : String(round2(n))} %`

export type ProtoLine = {
  id: string
  name: string
  description?: string
  qty: number
  listPrice: number
  unitPrice: number
  discountPct: number
  vatRate: VatRate
}
export const lineAmount = (l: Pick<ProtoLine, "qty" | "unitPrice" | "discountPct">) => round2(l.qty * l.unitPrice * (1 - l.discountPct / 100))

export type Figures = {
  /** Σ quantity × List price. */
  listTotal: number
  subtotal: number
  quoteDiscountPct: number
  quoteDiscount: number
  net: number
  byRate: { rate: VatRate; net: number; vat: number }[]
  vat: number
  gross: number
  /** 1 − net ÷ Σ(quantity × List price), in percent, never below 0. */
  effective: number
}

export function figures(lines: readonly ProtoLine[], quoteDiscountPct: number): Figures {
  const listTotal = round2(lines.reduce((s, l) => s + l.qty * l.listPrice, 0))
  const subtotal = round2(lines.reduce((s, l) => s + lineAmount(l), 0))
  const quoteDiscount = round2((subtotal * quoteDiscountPct) / 100)
  const net = round2(subtotal - quoteDiscount)
  const rates = [...new Set(lines.map((l) => l.vatRate))].sort((a, b) => b - a)
  const byRate = rates.map((rate) => {
    const rateNet = round2(lines.filter((l) => l.vatRate === rate).reduce((s, l) => s + lineAmount(l), 0) * (1 - quoteDiscountPct / 100))
    return { rate, net: rateNet, vat: round2((rateNet * rate) / 100) }
  })
  const vat = round2(byRate.reduce((s, r) => s + r.vat, 0))
  const effective = listTotal > 0 ? Math.max(0, (1 - net / listTotal) * 100) : 0
  return { listTotal, subtotal, quoteDiscountPct, quoteDiscount, net, byRate, vat, gross: round2(net + vat), effective }
}

export type Band = "none" | "manager" | "chain"
export const bandOf = (effective: number): Band => (effective > THRESHOLDS.second ? "chain" : effective > THRESHOLDS.first ? "manager" : "none")

/** Approvers in turn: the Owner's manager, then their manager. Nobody left goes to the Fallback approver. */
export function approverChain(ownerId: string, effective: number): { who: Person; role: string }[] {
  const band = bandOf(effective)
  if (band === "none") return []
  const steps: { who: Person; role: string }[] = []
  const first = PEOPLE[ownerId]?.managerId
  steps.push(first ? { who: PEOPLE[first], role: "Owner's manager" } : { who: FALLBACK_APPROVER, role: "Fallback approver" })
  if (band === "chain") {
    const second = first ? PEOPLE[first]?.managerId : null
    const next = second ? { who: PEOPLE[second], role: "Their manager" } : { who: FALLBACK_APPROVER, role: "Fallback approver" }
    if (next.who.id !== steps[0].who.id) steps.push(next)
  }
  return steps
}

/** "Needs approval from Megan Bowen" and friends: the hint under a discount. */
export function approvalHint(ownerId: string, effective: number): string {
  const chain = approverChain(ownerId, effective)
  if (chain.length === 0) return `No approval needed: up to ${THRESHOLDS.first} % is free`
  return `Needs approval from ${chain.map((c) => c.who.name).join(", then ")}`
}

// ---------------------------------------------------------------- approvals

export type StepState = "waiting" | "current" | "approved" | "rejected"
export type Step = { who: Person; role: string; state: StepState; comment?: string; on?: string }
export type ApprovalStatus = "pending" | "approved" | "rejected" | "recalled" | "lapsed"
export type Approval = {
  id: string
  kind: "quote" | "opportunity"
  subjectId: string
  subjectLabel: string
  /** Absent for the seeded records the Prototype has no page for. */
  href?: string
  accountName: string
  /** What is being approved, in a line. */
  summary: string
  amount: number
  requester: Person
  requestedOn: string
  steps: Step[]
  status: ApprovalStatus
  /** Why it ended without a decision: "Recalled by …", "Lapsed: the discount changed". */
  note?: string
}

export const APPROVAL_STATUS_LABELS = { none: "None", pending: "Pending", approved: "Approved", rejected: "Rejected" } as const
export type ApprovalStatusLabel = keyof typeof APPROVAL_STATUS_LABELS
/** The Quote's Approval status (None, Pending, Approved, Rejected). Recalled and lapsed ones count as None. */
export function approvalStatusOf(a: Approval | undefined): ApprovalStatusLabel {
  if (!a) return "none"
  return a.status === "pending" || a.status === "approved" || a.status === "rejected" ? a.status : "none"
}
export const currentStep = (a: Approval) => a.steps.find((s) => s.state === "current")

// ---------------------------------------------------------------- orders

export type OrderStatus = "open" | "fulfilled" | "cancelled"
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = { open: "Open", fulfilled: "Fulfilled", cancelled: "Cancelled" }
export type OrderLine = Omit<ProtoLine, "id">
export type OrderEntry = { at: string; text: string; by: string }
export type Order = {
  id: string
  number: string
  quoteId?: string
  quoteLabel: string
  opportunityId?: string
  opportunityName: string
  accountId?: string
  accountName: string
  contactName?: string
  ownerId: string
  orderDate: string
  status: OrderStatus
  requestedDelivery?: string
  poNumber?: string
  note?: string
  cancelComment?: string
  /** Frozen copies: the lines and the Quote discount are never read from the Quote again. */
  quoteDiscountPct: number
  lines: OrderLine[]
  history: OrderEntry[]
}
export const orderFigures = (o: Order) => figures(o.lines.map((l, i) => ({ ...l, id: String(i) })), o.quoteDiscountPct)

// ---------------------------------------------------------------- store

type QuoteOverlay = { lineDiscounts: Record<string, number>; quoteDiscountPct: number }
type State = {
  viewer: ViewerKey
  quotes: Record<string, QuoteOverlay>
  approvals: Approval[]
  orders: Order[]
}

const day = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * day).toISOString()
const dateIn = (days: number) => new Date(Date.now() + days * day).toISOString().slice(0, 10)
const Q = SEED_IDS.quotes
const O = SEED_IDS.opportunities

/** The accepted Quote of the seed has no lines of its own, so the Prototype gives it some. */
export const ACCEPTED_LINES: ProtoLine[] = [
  { id: "pl-acc-1", name: "Workshop day", description: "On-site workshop of one day, up to 12 people.", qty: 10, listPrice: 1450, unitPrice: 1450, discountPct: 0, vatRate: 21 },
  { id: "pl-acc-2", name: "Consulting", description: "Senior consultant, billed per hour.", qty: 124, listPrice: 125, unitPrice: 125, discountPct: 0, vatRate: 21 },
]
/** 30,000 list → 27,500 net, the Actual value of the won Opportunity. */
const ACCEPTED_DISCOUNT = 100 / 12

const LIST_PRICES: Record<string, number> = {
  [SEED_IDS.products.consultingHour]: 125,
  [SEED_IDS.products.workshopDay]: 1450,
  [SEED_IDS.products.licence]: 22.5,
}

function seed(): State {
  const line = (name: string, qty: number, listPrice: number, discountPct = 0, vatRate: VatRate = 21, unitPrice = listPrice): OrderLine => ({ name, qty, listPrice, unitPrice, discountPct, vatRate })
  const entry = (days: number, text: string, by: string): OrderEntry => ({ at: ago(days), text, by })
  return {
    viewer: "alex",
    quotes: {
      [Q.sent]: { lineDiscounts: {}, quoteDiscountPct: 12 },
      [Q.accepted]: { lineDiscounts: {}, quoteDiscountPct: ACCEPTED_DISCOUNT },
    },
    approvals: [
      {
        id: "appr-sent",
        kind: "quote",
        subjectId: Q.sent,
        subjectLabel: "Q-00001 (rev 1)",
        href: `/quotes/${Q.sent}`,
        accountName: "Fabrikam NV",
        summary: "Effective discount 12 %",
        amount: 11220,
        requester: PEOPLE["user-alex"],
        requestedOn: ago(9),
        steps: [{ who: PEOPLE["user-megan"], role: "Owner's manager", state: "approved", comment: "Fine for a security audit that size.", on: ago(9) }],
        status: "approved",
      },
      {
        id: "appr-opp",
        kind: "opportunity",
        subjectId: O.qualification,
        subjectLabel: "Tailwind Traders - Managed workplace",
        href: `/opportunities/${O.qualification}`,
        accountName: "Tailwind Traders",
        summary: "Gate: Approved since entering Qualification, before Needs Analysis",
        amount: 48000,
        requester: PEOPLE["user-adele"],
        requestedOn: ago(1),
        steps: [{ who: PEOPLE["user-megan"], role: "Owner's manager", state: "current" }],
        status: "pending",
      },
      {
        id: "appr-tailwind",
        kind: "quote",
        subjectId: "quote-tailwind-q10",
        subjectLabel: "Q-00010",
        accountName: "Tailwind Traders",
        summary: "Effective discount 31 %",
        amount: 33200,
        requester: PEOPLE["user-adele"],
        requestedOn: ago(2),
        steps: [
          { who: PEOPLE["user-megan"], role: "Owner's manager", state: "current" },
          { who: FALLBACK_APPROVER, role: "Fallback approver", state: "waiting" },
        ],
        status: "pending",
      },
    ],
    orders: [
      {
        id: "ord-1", number: "ORD-00001", quoteLabel: "Q-00006", opportunityName: "Northwind BV - Office network", accountId: SEED_IDS.accounts.northwind, accountName: "Northwind BV",
        contactName: "Femke Visser", ownerId: "user-diego", orderDate: dateIn(-52), status: "fulfilled", requestedDelivery: dateIn(-30), poNumber: "NW-8812", quoteDiscountPct: 5,
        lines: [line("Workshop day", 3, 1450), line("Consulting", 40, 125, 10)],
        history: [entry(52, "Order created from Q-00006", "Diego Siciliani"), entry(31, "Fulfilled", "Diego Siciliani")],
      },
      {
        id: "ord-2", number: "ORD-00002", quoteLabel: "Q-00007", opportunityName: "Tailwind Traders - Meeting rooms", accountId: SEED_IDS.accounts.tailwind, accountName: "Tailwind Traders",
        contactName: "Lotte de Groot", ownerId: "user-adele", orderDate: dateIn(-6), status: "open", requestedDelivery: dateIn(14), poNumber: "PO-2210", note: "Deliver to the Utrecht office, reception.", quoteDiscountPct: 0,
        lines: [line("Cloud licence", 60, 22.5, 0, 21, 22.5), line("Workshop day", 2, 1450, 8)],
        history: [entry(6, "Order created from Q-00007", "Adele Vance")],
      },
      {
        id: "ord-3", number: "ORD-00003", quoteLabel: "Q-00008", opportunityName: "Fabrikam NV - Support renewal", accountId: SEED_IDS.accounts.fabrikam, accountName: "Fabrikam NV",
        contactName: "Pieter Claes", ownerId: "user-alex", orderDate: dateIn(-21), status: "cancelled", quoteDiscountPct: 0, cancelComment: "Customer postponed the renewal to next year.",
        lines: [line("Consulting", 24, 125, 5)],
        history: [entry(21, "Order created from Q-00008", "Alex Wilber"), entry(14, "Cancelled: Customer postponed the renewal to next year.", "Alex Wilber")],
      },
      {
        id: "ord-4", number: "ORD-00004", quoteLabel: "Q-00009", opportunityName: "Fabrikam NV - Training days", accountId: SEED_IDS.accounts.fabrikam, accountName: "Fabrikam NV",
        contactName: "Pieter Claes", ownerId: "user-alex", orderDate: dateIn(-3), status: "open", requestedDelivery: dateIn(28), quoteDiscountPct: 10,
        lines: [line("Workshop day", 4, 1450, 5, 21, 1450)],
        history: [entry(3, "Order created from Q-00009", "Alex Wilber")],
      },
    ],
  }
}

let state: State = seed()
const listeners = new Set<() => void>()
const emit = (next: State) => {
  state = next
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}
export const getState = () => state
export const useProto = () => useSyncExternalStore(subscribe, getState)
const patch = (fn: (s: State) => Partial<State>) => emit({ ...state, ...fn(state) })

export function useViewer() {
  const { viewer } = useProto()
  return { key: viewer, person: VIEWERS[viewer] }
}
export const setViewer = (viewer: ViewerKey) => patch(() => ({ viewer }))
export const resetDemo = () => emit({ ...seed(), viewer: state.viewer })

// ---------------------------------------------------------------- quote helpers

export const overlayOf = (s: State, quoteId: string): QuoteOverlay => s.quotes[quoteId] ?? { lineDiscounts: {}, quoteDiscountPct: 0 }

/** The Quote's lines as the Prototype shows them: the real lines with the overlay's discounts. */
export function protoLines(s: State, details: Pick<QuoteDetails, "quote" | "lines">): ProtoLine[] {
  const overlay = overlayOf(s, details.quote.id)
  if (details.quote.id === Q.accepted && details.lines.length === 0) return ACCEPTED_LINES
  return details.lines.map((l: QuoteLine) => ({
    id: l.id,
    name: l.productName,
    description: l.description,
    qty: l.quantity,
    listPrice: LIST_PRICES[l.productId] ?? l.unitPrice,
    unitPrice: l.unitPrice,
    discountPct: overlay.lineDiscounts[l.id] ?? l.discountPercent,
    vatRate: l.vatRate,
  }))
}
export const quoteFigures = (s: State, details: Pick<QuoteDetails, "quote" | "lines">) =>
  figures(protoLines(s, details), overlayOf(s, details.quote.id).quoteDiscountPct)

export const approvalFor = (s: State, subjectId: string): Approval | undefined => s.approvals.find((a) => a.subjectId === subjectId)
export const isLocked = (a: Approval | undefined) => a?.status === "pending"
/** A Draft that still needs an Approval before it can be Sent. */
export function sendBlock(s: State, details: Pick<QuoteDetails, "quote" | "lines">): string | undefined {
  const f = quoteFigures(s, details)
  if (bandOf(f.effective) === "none") return undefined
  const a = approvalFor(s, details.quote.id)
  if (a?.status === "approved") return undefined
  return a?.status === "pending" ? "Waiting for the Approval" : "Needs an Approval first"
}
/** Whether this person may decide the current step: the Approver, or the Approver's manager. */
export function mayDecide(a: Approval, person: Person): boolean {
  const step = currentStep(a)
  if (!step || a.requester.id === person.id) return false
  return step.who.id === person.id || PEOPLE[step.who.id]?.managerId === person.id
}

// ---------------------------------------------------------------- actions

const withQuote = (s: State, id: string, fn: (o: QuoteOverlay) => QuoteOverlay): Partial<State> => ({
  quotes: { ...s.quotes, [id]: fn(overlayOf(s, id)) },
  // An Approved approval lapses when what it covered changes.
  approvals: s.approvals.map((a) => (a.subjectId === id && a.status === "approved" ? { ...a, status: "lapsed" as const, note: "Lapsed: the discount changed after it was approved." } : a)),
})
const clampPct = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0)

export function setLineDiscount(quoteId: string, lineId: string, pct: number) {
  if (isLocked(approvalFor(state, quoteId))) return
  patch((s) => withQuote(s, quoteId, (o) => ({ ...o, lineDiscounts: { ...o.lineDiscounts, [lineId]: clampPct(pct) } })))
}
export function setQuoteDiscount(quoteId: string, pct: number) {
  if (isLocked(approvalFor(state, quoteId))) return
  patch((s) => withQuote(s, quoteId, (o) => ({ ...o, quoteDiscountPct: clampPct(pct) })))
}
/** Both at once, for the variant that edits in a dialog. */
export function setDiscounts(quoteId: string, lineDiscounts: Record<string, number>, pct: number) {
  if (isLocked(approvalFor(state, quoteId))) return
  patch((s) => withQuote(s, quoteId, () => ({ lineDiscounts, quoteDiscountPct: clampPct(pct) })))
}

export function requestApproval(args: { quoteId: string; label: string; accountName: string; ownerId: string; effective: number; net: number }) {
  const chain = approverChain(args.ownerId, args.effective)
  if (chain.length === 0) return
  const approval: Approval = {
    id: `appr-${args.quoteId}-${Date.now()}`,
    kind: "quote",
    subjectId: args.quoteId,
    subjectLabel: args.label,
    href: `/quotes/${args.quoteId}`,
    accountName: args.accountName,
    summary: `Effective discount ${fmtPct(round2(args.effective))}`,
    amount: args.net,
    requester: PEOPLE[args.ownerId],
    requestedOn: new Date().toISOString(),
    steps: chain.map((c, i) => ({ ...c, state: i === 0 ? "current" : "waiting" })),
    status: "pending",
  }
  patch((s) => ({ approvals: [approval, ...s.approvals.filter((a) => a.subjectId !== args.quoteId)] }))
}

export function decide(approvalId: string, by: Person, approve: boolean, comment: string) {
  patch((s) => ({
    approvals: s.approvals.map((a) => {
      if (a.id !== approvalId || a.status !== "pending") return a
      const index = a.steps.findIndex((st) => st.state === "current")
      const steps = a.steps.map((st, i) => (i === index ? { ...st, state: approve ? ("approved" as const) : ("rejected" as const), comment: comment.trim() || undefined, on: new Date().toISOString(), who: st.who.id === by.id ? st.who : { ...by } } : st))
      if (!approve) return { ...a, steps, status: "rejected" }
      const next = steps.findIndex((st) => st.state === "waiting")
      if (next < 0) return { ...a, steps, status: "approved" }
      return { ...a, steps: steps.map((st, i) => (i === next ? { ...st, state: "current" as const } : st)) }
    }),
  }))
}
export function recall(approvalId: string, by: Person) {
  patch((s) => ({ approvals: s.approvals.map((a) => (a.id === approvalId && a.status === "pending" ? { ...a, status: "recalled", note: `Recalled by ${by.name}.` } : a)) }))
}

export function orderForQuote(s: State, quoteId: string) {
  return s.orders.find((o) => o.quoteId === quoteId)
}
export function createOrder(args: {
  quoteId: string
  quoteLabel: string
  opportunityId: string
  opportunityName: string
  accountId: string
  accountName: string
  contactName?: string
  ownerId: string
  lines: ProtoLine[]
  quoteDiscountPct: number
  requestedDelivery?: string
  poNumber?: string
  note?: string
}): Order {
  const highest = Math.max(0, ...state.orders.map((o) => Number(o.number.replace(/\D/g, ""))))
  const order: Order = {
    id: `ord-${highest + 1}`,
    number: `ORD-${String(highest + 1).padStart(5, "0")}`,
    quoteId: args.quoteId,
    quoteLabel: args.quoteLabel,
    opportunityId: args.opportunityId,
    opportunityName: args.opportunityName,
    accountId: args.accountId,
    accountName: args.accountName,
    contactName: args.contactName,
    ownerId: args.ownerId,
    orderDate: new Date().toISOString().slice(0, 10),
    status: "open",
    requestedDelivery: args.requestedDelivery || undefined,
    poNumber: args.poNumber || undefined,
    note: args.note || undefined,
    quoteDiscountPct: args.quoteDiscountPct,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    lines: args.lines.map(({ id: _id, ...l }) => l),
    history: [{ at: new Date().toISOString(), text: `Order created from ${args.quoteLabel}`, by: personName(args.ownerId) }],
  }
  patch((s) => ({ orders: [order, ...s.orders] }))
  return order
}
export function setOrderStatus(orderId: string, status: "fulfilled" | "cancelled", by: Person, comment = "") {
  patch((s) => ({
    orders: s.orders.map((o) =>
      o.id === orderId && o.status === "open"
        ? {
            ...o,
            status,
            cancelComment: status === "cancelled" ? comment.trim() : undefined,
            history: [...o.history, { at: new Date().toISOString(), text: status === "fulfilled" ? "Fulfilled" : `Cancelled: ${comment.trim()}`, by: by.name }],
          }
        : o,
    ),
  }))
}
export function updateOrder(orderId: string, edit: Pick<Order, "requestedDelivery" | "poNumber" | "note">) {
  patch((s) => ({ orders: s.orders.map((o) => (o.id === orderId ? { ...o, ...edit } : o)) }))
}

/** Everyone reads; the Owner or the Owner's manager changes. */
export const mayChangeOrder = (o: Order, person: Person) => o.status === "open" && (o.ownerId === person.id || PEOPLE[o.ownerId]?.managerId === person.id)
export const inTeam = (o: Order, person: Person) => o.ownerId === person.id || PEOPLE[o.ownerId]?.managerId === person.id

// ---------------------------------------------------------------- links to the real app

export const KNOWN_QUOTES = new Set<string>(Object.values(SEED_IDS.quotes))
export const KNOWN_OPPORTUNITIES = new Set<string>(Object.values(SEED_IDS.opportunities))
export const KNOWN_ACCOUNTS = new Set<string>(Object.values(SEED_IDS.accounts))
export const orderQuoteHref = (o: Order) => (o.quoteId && KNOWN_QUOTES.has(o.quoteId) ? `/quotes/${o.quoteId}` : undefined)
export const orderOpportunityHref = (o: Order) => (o.opportunityId && KNOWN_OPPORTUNITIES.has(o.opportunityId) ? `/opportunities/${o.opportunityId}` : undefined)
export const orderAccountHref = (o: Order) => (o.accountId && KNOWN_ACCOUNTS.has(o.accountId) ? `/accounts/${o.accountId}` : undefined)
