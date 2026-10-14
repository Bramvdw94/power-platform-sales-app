// PROTOTYPE (throwaway, never merge): Emails, Meetings and the "To link" list (#154).
// An in-memory store of logged Emails and Meetings in Adele's mailbox, laid
// over the in-memory seed data so the real record pages and Home can show them.

import { useSyncExternalStore } from "react"
import { createSeedData, SEED_IDS, SEED_USERS } from "@/data/in-memory"
import { fullName, toDateOnly, type RecordRef, type RecordType } from "@/sales"

export type Party = { ref: RecordRef; name: string; email: string }

type ItemBase = {
  id: string
  subject: string
  ownerId: string
  ownerName: string
  /** Absent: Unlinked. */
  regarding?: RecordRef & { name: string }
  /** People the mail or meeting was with, as sync matched them. */
  parties: Party[]
}

export type EmailItem = ItemBase & {
  kind: "email"
  direction: "incoming" | "outgoing"
  from: string
  to: string[]
  cc: string[]
  body: string
  on: string
  threadId: string
  sentFromApp?: boolean
}

export type MeetingItem = ItemBase & {
  kind: "meeting"
  start: string
  end: string
  location?: string
  body?: string
  attendees: string[]
  cancelled?: boolean
  plannedInApp?: boolean
}

export type MailItem = EmailItem | MeetingItem

export type MeetingState = "planned" | "held" | "cancelled"

export function meetingState(m: MeetingItem, now = new Date()): MeetingState {
  if (m.cancelled) return "cancelled"
  return new Date(m.end) > now ? "planned" : "held"
}

export const ME = SEED_USERS.adele

// ---------------------------------------------------------------- directory

const today = toDateOnly(new Date())
export const SEED = createSeedData(today)
const { accounts: A, contacts: C, leads: L, opportunities: O } = SEED_IDS

const contact = (id: string) => SEED.contacts.find((c) => c.id === id)!
const lead = (id: string) => SEED.leads.find((l) => l.id === id)!
const account = (id: string) => SEED.accounts.find((a) => a.id === id)!
const opportunity = (id: string) => SEED.opportunities.find((o) => o.id === id)!

export function isOpenOpportunity(id: string) {
  const o = opportunity(id)
  return o.stage !== "closedWon" && o.stage !== "closedLost"
}

export function recordName(ref: RecordRef): string {
  switch (ref.type) {
    case "contact":
      return fullName(contact(ref.id))
    case "lead":
      return fullName(lead(ref.id))
    case "account":
      return account(ref.id).name
    case "opportunity":
      return opportunity(ref.id).name
  }
}

export const TYPE_NAMES: Record<RecordType, string> = { account: "Account", contact: "Contact", opportunity: "Opportunity", lead: "Lead" }

const party = (ref: RecordRef, email?: string): Party => {
  const e =
    email ??
    (ref.type === "contact" ? contact(ref.id).email : ref.type === "lead" ? lead(ref.id).email : undefined) ??
    ""
  return { ref, name: recordName(ref), email: e }
}

/** Who a Send email from this record goes to by default: the Contact, the Lead or the Opportunity's Primary Contact. */
export function defaultRecipient(record: RecordRef): Party | undefined {
  if (record.type === "contact" || record.type === "lead") return party(record)
  if (record.type === "opportunity") {
    const pc = opportunity(record.id).primaryContactId
    return pc ? party({ type: "contact", id: pc }) : undefined
  }
  return undefined
}

/** Everyone the app knows with an email address, for the To, Cc and Attendees pickers. */
export function addressBook(): Party[] {
  return [
    ...SEED.contacts.filter((c) => c.email).map((c) => party({ type: "contact", id: c.id })),
    ...SEED.leads.filter((l) => l.email && (l.status === "notContacted" || l.status === "working")).map((l) => party({ type: "lead", id: l.id })),
  ]
}

/** Everything an item can be Regarding, for the search box. */
export function regardingCatalogue(): (RecordRef & { name: string; detail: string })[] {
  return [
    ...SEED.opportunities.filter((o) => isOpenOpportunity(o.id)).map((o) => ({ type: "opportunity" as const, id: o.id, name: o.name, detail: "Open Opportunity" })),
    ...SEED.leads.filter((l) => l.status === "notContacted" || l.status === "working").map((l) => ({ type: "lead" as const, id: l.id, name: fullName(l), detail: `Lead · ${l.company}` })),
    ...SEED.accounts.map((a) => ({ type: "account" as const, id: a.id, name: a.name, detail: "Account" })),
    ...SEED.contacts.map((c) => ({ type: "contact" as const, id: c.id, name: fullName(c), detail: `Contact · ${account(c.accountId!).name}` })),
  ]
}

function accountOf(p: Party): string | undefined {
  if (p.ref.type === "account") return p.ref.id
  if (p.ref.type === "contact") return contact(p.ref.id).accountId
  return undefined
}

/**
 * Suggested Regarding for an Unlinked item: open Opportunities whose Primary
 * Contact was in it, open Leads in it, then open Opportunities of the Accounts
 * involved, then the Accounts themselves.
 */
export function suggestionsFor(item: MailItem): (RecordRef & { name: string; why: string })[] {
  const out: (RecordRef & { name: string; why: string })[] = []
  const add = (ref: RecordRef, why: string) => {
    if (!out.some((s) => s.type === ref.type && s.id === ref.id)) out.push({ ...ref, name: recordName(ref), why })
  }
  for (const p of item.parties) {
    if (p.ref.type === "contact")
      for (const o of SEED.opportunities) if (o.primaryContactId === p.ref.id && isOpenOpportunity(o.id)) add({ type: "opportunity", id: o.id }, `${p.name} is its Primary Contact`)
    if (p.ref.type === "lead") add(p.ref, "Open Lead in this conversation")
  }
  for (const p of item.parties) {
    const acc = accountOf(p)
    if (!acc) continue
    for (const o of SEED.opportunities) if (o.accountId === acc && isOpenOpportunity(o.id)) add({ type: "opportunity", id: o.id }, `Open Opportunity of ${account(acc).name}`)
  }
  for (const p of item.parties) {
    const acc = accountOf(p)
    if (acc) add({ type: "account", id: acc }, `${p.name} works there`)
  }
  return out
}

/** Does this item show on the record's timeline: by Regarding, or as a matched person, or (Account) through its Contacts and Opportunities. */
export function showsOn(item: MailItem, record: RecordRef): boolean {
  if (item.regarding && item.regarding.type === record.type && item.regarding.id === record.id) return true
  if (record.type === "opportunity") return false
  if (item.parties.some((p) => p.ref.type === record.type && p.ref.id === record.id)) return true
  if (record.type === "account") {
    if (item.parties.some((p) => accountOf(p) === record.id)) return true
    if (item.regarding?.type === "opportunity" && opportunity(item.regarding.id).accountId === record.id) return true
  }
  return false
}

/** For an Account: where an item came from, as the Source filter groups it. */
export function sourceOf(item: MailItem, record: RecordRef): RecordType {
  if (item.regarding && !(item.regarding.type === record.type && item.regarding.id === record.id)) return item.regarding.type
  if (item.parties.some((p) => p.ref.type === "contact")) return "contact"
  return record.type
}

export function itemDate(item: MailItem): string {
  return item.kind === "email" ? item.on : item.start
}

// ---------------------------------------------------------------- seed

function at(daysFromToday: number, hh: number, mm = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromToday)
  d.setHours(hh, mm, 0, 0)
  return d.toISOString()
}
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString()
}

const me = { ownerId: ME.id, ownerName: ME.fullName }
const meAddr = ME.email
const lotte = party({ type: "contact", id: C.lotte })
const femke = party({ type: "contact", id: C.femke })
const pieter = party({ type: "contact", id: C.pieter })
const sanne = party({ type: "lead", id: L.notContacted })
const tailwindInfo = party({ type: "account", id: A.tailwind }, "info@tailwind.example")
const workplace = { type: "opportunity" as const, id: O.qualification, name: recordName({ type: "opportunity", id: O.qualification }) }
const sanneLead = { type: "lead" as const, id: L.notContacted, name: recordName({ type: "lead", id: L.notContacted }) }

function seedItems(): MailItem[] {
  return [
    {
      id: "em-1", kind: "email", direction: "outgoing", subject: "Pilot for 20 users", ...me, regarding: workplace, parties: [lotte],
      from: meAddr, to: [lotte.email], cc: [], on: at(-3, 10, 12), threadId: "t-pilot", sentFromApp: true,
      body: "Hi Lotte,\n\nThanks for the call. As promised, here is how we would run the pilot: 20 users from Finance and Sales, four weeks, one workshop day to start.\n\nCould you let me know which week suits you?\n\nKind regards,\nAdele",
    },
    {
      id: "em-2", kind: "email", direction: "incoming", subject: "RE: Pilot for 20 users", ...me, regarding: workplace, parties: [lotte],
      from: lotte.email, to: [meAddr], cc: [], on: at(-2, 8, 47), threadId: "t-pilot",
      body: "Hi Adele,\n\nWeek 46 works for us. Can you include the laptops for the pilot group in the proposal? Our CFO wants to see the full cost before we sign anything.\n\nRegards,\nLotte",
    },
    {
      id: "em-3", kind: "email", direction: "outgoing", subject: "RE: Pilot for 20 users", ...me, regarding: workplace, parties: [lotte],
      from: meAddr, to: [lotte.email], cc: [], on: at(-2, 11, 30), threadId: "t-pilot",
      body: "Hi Lotte,\n\nWeek 46 it is. I will add the laptops and send the full proposal by Friday.\n\nAdele",
    },
    {
      id: "mt-1", kind: "meeting", subject: "Pilot scoping session", ...me, regarding: workplace, parties: [lotte],
      start: at(2, 14), end: at(2, 15), location: "Tailwind office, Utrecht", attendees: [lotte.email], plannedInApp: true,
      body: "Agree the pilot group, the start date and who signs off.",
    },
    {
      id: "mt-2", kind: "meeting", subject: "Workplace demo", ...me, regarding: workplace, parties: [lotte],
      start: at(-9, 10), end: at(-9, 11), location: "Online", attendees: [lotte.email], plannedInApp: true,
      body: "Demo of the managed workplace portal and the self-service app store.",
    },
    {
      id: "mt-3", kind: "meeting", subject: "Site visit", ...me, regarding: workplace, parties: [lotte],
      start: at(4, 9), end: at(4, 10, 30), location: "Tailwind office, Utrecht", attendees: [lotte.email], cancelled: true, plannedInApp: true,
    },
    {
      id: "em-4", kind: "email", direction: "outgoing", subject: "Your question about managed devices", ...me, regarding: sanneLead, parties: [sanne],
      from: meAddr, to: [sanne.email], cc: [], on: at(-1, 9, 5), threadId: "t-sanne", sentFromApp: true,
      body: "Hi Sanne,\n\nThanks for filling in the form on our website. Happy to tell you more about managed devices. Do you have 20 minutes this week for a short call?\n\nAdele Vance",
    },
    {
      id: "em-5", kind: "email", direction: "incoming", subject: "RE: Your question about managed devices", ...me, regarding: sanneLead, parties: [sanne],
      from: sanne.email, to: [meAddr], cc: [], on: hoursAgo(3), threadId: "t-sanne",
      body: "Hi Adele,\n\nThursday after 14:00 works. We have about 60 devices, mostly laptops.\n\nSanne",
    },
    // Unlinked: two open Opportunities match (Lotte's and, through Femke, Northwind's).
    {
      id: "un-1", kind: "email", direction: "incoming", subject: "Network refresh, second chance?", ...me, parties: [lotte, femke],
      from: lotte.email, to: [meAddr], cc: [femke.email], on: at(-1, 16, 20), threadId: "t-network",
      body: "Hi Adele,\n\nFemke from Northwind told me their cloud migration with you went well. We might reopen our network refresh next year. Could the three of us talk about it?\n\nLotte",
    },
    // Unlinked: tracked from Outlook, with Contacts of two open Opportunities.
    {
      id: "un-2", kind: "meeting", subject: "Quarterly partner review", ...me, parties: [lotte, pieter],
      start: at(1, 10), end: at(1, 11), location: "Online", attendees: [lotte.email, pieter.email],
      body: "Tracked from Outlook.",
    },
    // Unlinked: only the Account matched.
    {
      id: "un-3", kind: "email", direction: "incoming", subject: "Invoice address change", ...me, parties: [tailwindInfo],
      from: tailwindInfo.email, to: [meAddr], cc: [], on: hoursAgo(5), threadId: "t-invoice",
      body: "Dear supplier,\n\nFrom 1 November please send all invoices to Postbus 1200, 3500 BE Utrecht.\n\nTailwind Traders, Finance",
    },
  ]
}

// ---------------------------------------------------------------- store

let items: MailItem[] = seedItems()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useMailItems(): MailItem[] {
  return useSyncExternalStore(subscribe, () => items)
}

let counter = 100

export function setRegarding(id: string, ref: RecordRef | undefined) {
  items = items.map((i) => (i.id === id ? { ...i, regarding: ref && { ...ref, name: recordName(ref) } } : i))
  emit()
}

export function removeItem(id: string) {
  items = items.filter((i) => i.id !== id)
  emit()
}

function partiesFor(addresses: string[]): Party[] {
  const book = [...addressBook(), tailwindInfo]
  return addresses.map((a) => book.find((p) => p.email === a)).filter((p): p is Party => !!p)
}

export type EmailDraft = { to: string[]; cc: string[]; subject: string; body: string }

export function sendEmail(record: RecordRef, draft: EmailDraft) {
  counter += 1
  const item: EmailItem = {
    id: `em-${counter}`, kind: "email", direction: "outgoing", ...me, subject: draft.subject, body: draft.body,
    regarding: { ...record, name: recordName(record) }, parties: partiesFor([...draft.to, ...draft.cc]),
    from: meAddr, to: draft.to, cc: draft.cc, on: new Date().toISOString(), threadId: `t-${counter}`, sentFromApp: true,
  }
  items = [item, ...items]
  emit()
}

export type MeetingDraft = { subject: string; date: string; startTime: string; endTime: string; attendees: string[]; location: string; body: string }

export function planMeeting(record: RecordRef, draft: MeetingDraft) {
  counter += 1
  const item: MeetingItem = {
    id: `mt-${counter}`, kind: "meeting", ...me, subject: draft.subject, body: draft.body || undefined,
    regarding: { ...record, name: recordName(record) }, parties: partiesFor(draft.attendees),
    start: new Date(`${draft.date}T${draft.startTime}`).toISOString(), end: new Date(`${draft.date}T${draft.endTime}`).toISOString(),
    location: draft.location || undefined, attendees: draft.attendees, plannedInApp: true,
  }
  items = [item, ...items]
  emit()
}

/** Adele's "To link" list: her Unlinked items, newest first. */
export function toLink(all: MailItem[]): MailItem[] {
  return all.filter((i) => !i.regarding && i.ownerId === ME.id).sort((a, b) => itemDate(b).localeCompare(itemDate(a)))
}

/** Her Planned Meetings, soonest first. */
export function plannedMeetings(all: MailItem[]): MeetingItem[] {
  return all
    .filter((i): i is MeetingItem => i.kind === "meeting" && i.ownerId === ME.id && meetingState(i) === "planned")
    .sort((a, b) => a.start.localeCompare(b.start))
}

/** The Owner and the Owner's manager may relink or remove. */
export function mayManage(item: MailItem, userId: string, reports: string[]) {
  return item.ownerId === userId || reports.includes(item.ownerId)
}

// ---------------------------------------------------------------- formatting

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" })
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" })

export function whenText(iso: string): string {
  const d = new Date(iso)
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000)
  const day = days === 0 ? "Today" : days === -1 ? "Yesterday" : days === 1 ? "Tomorrow" : dayFmt.format(d)
  return `${day} ${timeFmt.format(d)}`
}
export function timeText(iso: string): string {
  return timeFmt.format(new Date(iso))
}
export function dayText(iso: string): string {
  const d = new Date(iso)
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000)
  return days === 0 ? "Today" : days === -1 ? "Yesterday" : days === 1 ? "Tomorrow" : dayFmt.format(d)
}
function startOfDay(d: Date) {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c.getTime()
}

export function snippet(text: string | undefined, n = 110): string {
  if (!text) return ""
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat
}

/** "Lotte de Groot" for a known address, else the address. */
export function nameOf(email: string): string {
  if (email === meAddr) return "You"
  return [...addressBook(), tailwindInfo].find((p) => p.email === email)?.name ?? email
}
