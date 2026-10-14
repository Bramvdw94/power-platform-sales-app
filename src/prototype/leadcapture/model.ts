/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): in-memory state for #162 (web form, Assignment rule, Away, Rating).
// Three variants of the same four screens, switchable with ?variant=A|B|C.

import { useSyncExternalStore } from "react"

export type Rating = "hot" | "warm" | "cold"
export const RATINGS: Rating[] = ["hot", "warm", "cold"]
export const RATING_LABELS: Record<Rating, string> = { hot: "Hot", warm: "Warm", cold: "Cold" }
/** The Score Decision rule's bands (sample): the rule turns a Score into a Rating. */
export const BANDS = { hot: 70, warm: 40 }
export const SCORE_RULE_NAME = "Lead score"

export function ratingFromScore(score: number): Rating {
  return score >= BANDS.hot ? "hot" : score >= BANDS.warm ? "warm" : "cold"
}

/** What the Rating on a Lead is and who set it. */
export type RatingInfo = {
  rating: Rating | null
  source: "rule" | "hand"
  /** The Score the Decision rule worked out, if it ran. */
  score?: number
  by?: string
  on?: string
}

export type CondField = "email" | "company" | "jobTitle" | "message" | "phone"
export type CondOp = "contains" | "equals" | "startsWith" | "endsWith" | "isBlank"
export const COND_FIELDS: { value: CondField; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "company", label: "Company" },
  { value: "jobTitle", label: "Job title" },
  { value: "message", label: "Message" },
  { value: "phone", label: "Phone" },
]
export const COND_OPS: { value: CondOp; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "is" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "isBlank", label: "is blank" },
]

export type Cond = { id: string; field: CondField; op: CondOp; value: string }
export type Target = { kind: "person"; userId: string } | { kind: "robin"; userIds: string[] }
export type Entry = { id: string; mode: "all" | "any"; conds: Cond[]; target: Target }
export type Rule = { entries: Entry[]; fallbackId: string }

export const PEOPLE = [
  { id: "user-megan", name: "Megan Bowen", managerId: null as string | null },
  { id: "user-adele", name: "Adele Vance", managerId: "user-megan" },
  { id: "user-alex", name: "Alex Wilber", managerId: "user-megan" },
  { id: "user-diego", name: "Diego Siciliani", managerId: null as string | null },
]
export const personName = (id: string) => PEOPLE.find((p) => p.id === id)?.name ?? "Unknown"
export const firstName = (id: string) => personName(id).split(" ")[0]

export type AwayState = { away: boolean; returnOn?: string; setBy?: string }
export type WebLead = {
  id: string
  at: string
  name: string
  company: string
  email: string
  ownerId: string
  how: string
  duplicate?: boolean
}

export type WebLeadValues = {
  firstName: string
  lastName: string
  email: string
  company: string
  phone: string
  jobTitle: string
  message: string
}

export const todayIso = () => new Date().toISOString().slice(0, 10)
export const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
export const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })

type State = {
  rule: Rule
  published: Rule
  publishedAt: string
  rr: Record<string, number>
  away: Record<string, AwayState>
  ratings: Record<string, RatingInfo>
  recent: WebLead[]
}

let n = 100
export const uid = (p: string) => `${p}-${++n}`

const seedRule = (): Rule => ({
  fallbackId: "user-megan",
  entries: [
    { id: "e1", mode: "any", conds: [{ id: "c1", field: "message", op: "contains", value: "enterprise" }, { id: "c2", field: "jobTitle", op: "contains", value: "director" }], target: { kind: "person", userId: "user-diego" } },
    { id: "e2", mode: "all", conds: [{ id: "c3", field: "email", op: "endsWith", value: ".nl" }], target: { kind: "robin", userIds: ["user-adele", "user-alex"] } },
    { id: "e3", mode: "all", conds: [{ id: "c4", field: "company", op: "contains", value: "bv" }], target: { kind: "robin", userIds: ["user-adele", "user-alex", "user-diego"] } },
  ],
})

const iso = (d: number) => new Date(Date.now() - d * 86400000).toISOString()

let state: State = {
  rule: seedRule(),
  published: seedRule(),
  publishedAt: iso(3),
  rr: { e2: 1 },
  away: { "user-alex": { away: true, returnOn: plusDays(6), setBy: "user-megan" } },
  ratings: {},
  recent: [
    { id: "w1", at: iso(0.1), name: "Eva Jansen", company: "Jansen Logistiek BV", email: "eva@jansen-logistiek.nl", ownerId: "user-adele", how: "Entry 2: email ends with .nl, round robin" },
    { id: "w2", at: iso(0.6), name: "Mark Visser", company: "Visser Holding", email: "mark@visser.example", ownerId: "user-diego", how: "Entry 1: message contains enterprise" },
    { id: "w3", at: iso(1.4), name: "Priya Nair", company: "Nair Consulting", email: "priya@nair.example", ownerId: "user-megan", how: "Fallback Owner: no entry matched" },
  ],
}
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export function useProto(): State {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )
}

// ---- Rule editing (draft until Publish) ----
export const ruleDirty = (s: State) => JSON.stringify(s.rule) !== JSON.stringify(s.published)
export const setRule = (rule: Rule) => set({ rule })
export const publishRule = () => set({ published: JSON.parse(JSON.stringify(state.rule)), publishedAt: new Date().toISOString() })
export const discardRule = () => set({ rule: JSON.parse(JSON.stringify(state.published)) })
export function moveEntry(id: string, delta: number) {
  const list = [...state.rule.entries]
  const i = list.findIndex((e) => e.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  setRule({ ...state.rule, entries: list })
}
export const saveEntry = (entry: Entry) => {
  const has = state.rule.entries.some((e) => e.id === entry.id)
  setRule({ ...state.rule, entries: has ? state.rule.entries.map((e) => (e.id === entry.id ? entry : e)) : [...state.rule.entries, entry] })
}
export const removeEntry = (id: string) => setRule({ ...state.rule, entries: state.rule.entries.filter((e) => e.id !== id) })
export const newEntry = (): Entry => ({ id: uid("e"), mode: "all", conds: [{ id: uid("c"), field: "email", op: "endsWith", value: "" }], target: { kind: "person", userId: "user-adele" } })

// ---- Away ----
export function isAway(id: string, s: State = state): boolean {
  const a = s.away[id]
  return !!a?.away && (!a.returnOn || a.returnOn > todayIso())
}
export const setAway = (id: string, a: AwayState) => set({ away: { ...state.away, [id]: a } })
/** Who may change a person's Away: themselves or their manager. */
export const canSetAway = (meId: string, targetId: string) =>
  meId === targetId || PEOPLE.find((p) => p.id === targetId)?.managerId === meId

// ---- Conditions and assignment ----
const valueOf = (v: WebLeadValues, f: CondField) => v[f]?.toLowerCase().trim() ?? ""
export function condMatches(c: Cond, v: WebLeadValues): boolean {
  const have = valueOf(v, c.field)
  const want = c.value.toLowerCase().trim()
  switch (c.op) {
    case "contains": return want !== "" && have.includes(want)
    case "equals": return have === want
    case "startsWith": return want !== "" && have.startsWith(want)
    case "endsWith": return want !== "" && have.endsWith(want)
    case "isBlank": return have === ""
  }
}
export const entryMatches = (e: Entry, v: WebLeadValues) =>
  e.conds.length > 0 && (e.mode === "all" ? e.conds.every((c) => condMatches(c, v)) : e.conds.some((c) => condMatches(c, v)))

export type TraceLine = { entryId: string | null; index: number; status: "no-match" | "away" | "assigned" | "fallback"; text: string }
export type Assignment = { ownerId: string; trace: TraceLine[]; summary: string; entryId: string | null }

/** First match wins; Away people are skipped; if nobody is available the Fallback Owner gets it. */
export function assign(rule: Rule, v: WebLeadValues, s: State = state, commit = false): Assignment {
  const trace: TraceLine[] = []
  let result: Assignment | null = null
  rule.entries.forEach((e, i) => {
    if (result) return
    const idx = i + 1
    if (!entryMatches(e, v)) return void trace.push({ entryId: e.id, index: idx, status: "no-match", text: `Entry ${idx}: no match` })
    if (e.target.kind === "person") {
      if (isAway(e.target.userId, s)) return void trace.push({ entryId: e.id, index: idx, status: "away", text: `Entry ${idx}: matches, but ${firstName(e.target.userId)} is Away, skipped` })
      result = { ownerId: e.target.userId, entryId: e.id, summary: `Entry ${idx}`, trace }
      return void trace.push({ entryId: e.id, index: idx, status: "assigned", text: `Entry ${idx}: matches, ${firstName(e.target.userId)} gets it` })
    }
    const ids = e.target.userIds
    const start = (s.rr[e.id] ?? 0) % Math.max(ids.length, 1)
    const order = ids.map((_, k) => ids[(start + k) % ids.length])
    const pick = order.find((id) => !isAway(id, s))
    const skipped = order.slice(0, order.indexOf(pick ?? "")).filter((id) => isAway(id, s))
    if (!pick) return void trace.push({ entryId: e.id, index: idx, status: "away", text: `Entry ${idx}: matches, but everyone in the group is Away, skipped` })
    if (commit) set({ rr: { ...state.rr, [e.id]: ids.indexOf(pick) + 1 } })
    result = { ownerId: pick, entryId: e.id, summary: `Entry ${idx}`, trace }
    trace.push({ entryId: e.id, index: idx, status: "assigned", text: `Entry ${idx}: matches, round robin gives it to ${firstName(pick)}${skipped.length ? ` (${skipped.map(firstName).join(", ")} Away, skipped)` : ""}` })
  })
  if (result) return result
  trace.push({ entryId: null, index: 0, status: "fallback", text: `No entry assigned it, the Fallback Owner ${firstName(rule.fallbackId)} gets it` })
  return { ownerId: rule.fallbackId, entryId: null, summary: "Fallback Owner", trace }
}

/** The public form submitting: Turnstile and the honeypot already passed. */
export function submitWebLead(v: WebLeadValues): Assignment {
  const a = assign(state.published, v, state, true)
  const name = `${v.firstName} ${v.lastName}`.trim()
  const why = a.entryId ? `${a.summary}${a.trace.at(-1)?.text.includes("round robin") ? ", round robin" : ""}` : "Fallback Owner: no entry matched"
  set({ recent: [{ id: uid("w"), at: new Date().toISOString(), name, company: v.company, email: v.email, ownerId: a.ownerId, how: why }, ...state.recent] })
  return a
}

// ---- Rating ----
const SEED_RATINGS: Record<string, RatingInfo> = {
  Bakker: { rating: "hot", source: "rule", score: 84 },
  Peeters: { rating: "warm", source: "rule", score: 56 },
  "de Groot": { rating: "hot", source: "hand", score: 62, by: "Adele Vance", on: iso(12) },
  Willems: { rating: "cold", source: "rule", score: 18 },
  Maes: { rating: "cold", source: "hand", score: 66, by: "Diego Siciliani", on: iso(4) },
  Jansen: { rating: "hot", source: "rule", score: 91 },
  Visser: { rating: "warm", source: "rule", score: 47 },
  Nair: { rating: null, source: "rule" },
  Dekker: { rating: "warm", source: "hand", score: 25, by: "Megan Bowen", on: iso(1) },
  Smits: { rating: "cold", source: "rule", score: 33 },
  Hendriks: { rating: "hot", source: "rule", score: 73 },
}
export const ratingOf = (s: State, lead: { id: string; lastName: string }): RatingInfo =>
  s.ratings[lead.id] ?? SEED_RATINGS[lead.lastName] ?? { rating: null, source: "rule" }
export function setRating(lead: { id: string; lastName: string }, rating: Rating | null, byName: string) {
  const old = ratingOf(state, lead)
  set({ ratings: { ...state.ratings, [lead.id]: { rating, source: "hand", score: old.score, by: byName, on: new Date().toISOString() } } })
}
/** Back to what the Score Decision rule says. */
export function resetRating(lead: { id: string; lastName: string }) {
  const old = ratingOf(state, lead)
  set({ ratings: { ...state.ratings, [lead.id]: { rating: old.score == null ? null : ratingFromScore(old.score), source: "rule", score: old.score } } })
}

export const EXTRA_LEADS = [
  { firstName: "Eva", lastName: "Jansen", company: "Jansen Logistiek BV", email: "eva@jansen-logistiek.nl", jobTitle: "Operations Director", description: "We'd like a demo of the sales app." },
  { firstName: "Mark", lastName: "Visser", company: "Visser Holding", email: "mark@visser.example", jobTitle: "CFO", description: "Looking at an enterprise rollout." },
  { firstName: "Priya", lastName: "Nair", company: "Nair Consulting", email: "priya@nair.example", description: "Pricing question." },
  { firstName: "Sven", lastName: "Dekker", company: "Dekker Bouw BV", email: "sven@dekker.nl", jobTitle: "Owner", description: "Replacing our spreadsheets." },
  { firstName: "Noor", lastName: "Smits", company: "Smits Print", email: "noor@smits.example", description: "Just browsing." },
  { firstName: "Tim", lastName: "Hendriks", company: "Hendriks IT BV", email: "tim@hendriks-it.nl", jobTitle: "IT Manager", description: "Need 25 licences by Q1." },
] as const
