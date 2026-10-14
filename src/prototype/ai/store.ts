// PROTOTYPE (throwaway, never merge): the demo state behind the AI assist look of #166.
// Nothing here calls a model; the text is canned (see canned.ts).

import { useSyncExternalStore } from "react"

export type Lang = "en" | "nl"
export type Viewer = "admin" | "owner" | "readonly"
export type UsageMode = "normal" | "daily" | "cap"
export type AiKind = "Timeline summary" | "Draft follow-up" | "Next step suggestion"

export type LogEntry = { id: number; when: string; who: string; kind: AiKind; record: string; tokens: number; cost: number }

export type AiState = {
  enabled: boolean
  dailyLimit: number
  monthlyCap: number
  /** Requests I made today. */
  usedToday: number
  /** What the team spent this month, in euro. */
  spent: number
  viewer: Viewer
  lang: Lang
  /** The next request fails (to show the error state). */
  failNext: boolean
  /** Notes made with "Save as Note" from a summary. */
  aiNotes: string[]
  log: LogEntry[]
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

function readLang(): Lang {
  try {
    return localStorage.getItem("proto-ai-lang") === "nl" ? "nl" : "en"
  } catch {
    return "en"
  }
}

let state: AiState = {
  enabled: true,
  dailyLimit: 50,
  monthlyCap: 5,
  usedToday: 12,
  spent: 3.18,
  viewer: "admin",
  lang: readLang(),
  failNext: false,
  aiNotes: [],
  log: [
    { id: 8, when: ago(14), who: "Adele Vance", kind: "Timeline summary", record: "Opportunity · Pilot rollout", tokens: 2310, cost: 0.0046 },
    { id: 7, when: ago(48), who: "Alex Wilber", kind: "Draft follow-up", record: "Account · Northwind Traders", tokens: 1180, cost: 0.0031 },
    { id: 6, when: ago(95), who: "Adele Vance", kind: "Next step suggestion", record: "Opportunity · Pilot rollout", tokens: 1620, cost: 0.0029 },
    { id: 5, when: ago(180), who: "Megan Bowen", kind: "Timeline summary", record: "Account · Contoso", tokens: 3040, cost: 0.0061 },
    { id: 4, when: ago(60 * 22), who: "Adele Vance", kind: "Draft follow-up", record: "Opportunity · Pilot rollout", tokens: 1240, cost: 0.0033 },
    { id: 3, when: ago(60 * 26), who: "Alex Wilber", kind: "Timeline summary", record: "Opportunity · Annual licence", tokens: 2680, cost: 0.0054 },
    { id: 2, when: ago(60 * 30), who: "Megan Bowen", kind: "Next step suggestion", record: "Opportunity · Annual licence", tokens: 1490, cost: 0.0027 },
    { id: 1, when: ago(60 * 50), who: "Adele Vance", kind: "Timeline summary", record: "Account · Fabrikam", tokens: 2870, cost: 0.0058 },
  ],
}
const listeners = new Set<() => void>()
const set = (patch: Partial<AiState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const aiActions = {
  set,
  setLang(lang: Lang) {
    try {
      localStorage.setItem("proto-ai-lang", lang)
    } catch {
      /* storage blocked */
    }
    set({ lang })
  },
  setUsage(mode: UsageMode) {
    if (mode === "normal") set({ usedToday: 12, spent: 3.18 })
    if (mode === "daily") set({ usedToday: state.dailyLimit })
    if (mode === "cap") set({ spent: state.monthlyCap })
  },
  markAiNote(id: string) {
    set({ aiNotes: [...state.aiNotes, id] })
  },
  /** One request used: counts against my daily limit and the team cap, and is logged without the text. */
  record(kind: AiKind, who: string, record: string) {
    const tokens = 1100 + Math.round(Math.random() * 1800)
    const cost = Math.round(tokens * 0.000002 * 10000) / 10000
    set({
      usedToday: state.usedToday + 1,
      spent: Math.round((state.spent + cost) * 10000) / 10000,
      log: [{ id: state.log[0].id + 1, when: new Date().toISOString(), who, kind, record, tokens, cost }, ...state.log],
    })
  },
}

/** A plain read for event handlers, where hooks cannot be called. */
export const getAiState = () => state

export function useAiState(): AiState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Why AI buttons are disabled right now, or undefined when they work. */
export function blockReason(s: AiState): string | undefined {
  if (!s.enabled) return "AI assist is switched off. A System Administrator can switch it on."
  if (s.usedToday >= s.dailyLimit) return `You have used your ${s.dailyLimit} AI requests for today. It resets at midnight.`
  if (s.spent >= s.monthlyCap) return `The team's AI budget for this month (€${s.monthlyCap.toFixed(2)}) is used up. It resets on 1 November.`
  return undefined
}

/** Short form for tight places. */
export function shortReason(s: AiState): string | undefined {
  if (!s.enabled) return "AI assist is off"
  if (s.usedToday >= s.dailyLimit) return "Daily limit reached"
  if (s.spent >= s.monthlyCap) return "Team cap reached"
  return undefined
}

export const canEditViewer = (s: AiState) => s.viewer !== "readonly"
export const isAdminViewer = (s: AiState) => s.viewer === "admin"
