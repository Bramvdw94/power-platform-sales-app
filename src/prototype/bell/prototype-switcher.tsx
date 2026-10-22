/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): the floating variant switcher (copied from #150), with a button that simulates a new Notification.

import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { BellPlus, ChevronLeft, ChevronRight } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"

export function useVariant(keys: string[]): string {
  const [params] = useSearchParams()
  // The variant sticks while you click around the app (links drop ?variant=).
  let v = params.get("variant")
  try {
    if (v && keys.includes(v)) sessionStorage.setItem("proto-variant", v)
    else v = sessionStorage.getItem("proto-variant")
  } catch {
    /* storage blocked: fall back to the URL only */
  }
  return v && keys.includes(v) ? v : keys[0]
}

const SAMPLES = [
  ["Alex Wilber assigned you the Lead Priya Nair.", "lead", "lead-sanne"],
  ["Megan Bowen assigned you the Opportunity Fabrikam security audit.", "opportunity", "opp-fabrikam-security"],
  ["Diego Siciliani assigned you the Account Tailwind Traders.", "account", "acc-tailwind"],
] as const
let sample = 0

/** The in-memory store is parked on window by the prototype build (see create-gateway). */
function simulateNotification() {
  const store = (window as unknown as { __store?: { addNotification(n: object): void } }).__store
  const [text, type, id] = SAMPLES[sample++ % SAMPLES.length]
  store?.addNotification({ recipientId: "user-adele", kind: "reassign", text, regarding: { type, id }, createdOn: new Date().toISOString() })
}

export function PrototypeSwitcher({ variants, current }: { variants: { key: string; name: string }[]; current: string }) {
  const [, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const index = variants.findIndex((v) => v.key === current)
  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length]
    setParams((p) => { const n = new URLSearchParams(p); n.set("variant", next.key); return n }, { replace: true })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.closest("input, textarea, select, [contenteditable]") || el.isContentEditable)) return
      if (e.key === "ArrowLeft") go(-1)
      if (e.key === "ArrowRight") go(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
  if (import.meta.env.PROD && import.meta.env.VITE_SALES_GATEWAY !== "memory") return null
  return (
    <div className="pointer-events-auto fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-1.5 py-1 text-sm text-white shadow-lg ring-1 ring-white/20 md:bottom-4">
      <button type="button" aria-label="Previous variant" className="rounded-full p-1.5 hover:bg-white/15" onClick={() => go(-1)}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-2 whitespace-nowrap">
        {current} ({variants[index]?.name})
      </span>
      <button type="button" aria-label="Next variant" className="rounded-full p-1.5 hover:bg-white/15" onClick={() => go(1)}>
        <ChevronRight className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Simulate a new Notification"
        title="Simulate: someone reassigns a record to Adele"
        className="ml-1 flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1.5 hover:bg-white/25"
        onClick={() => {
          simulateNotification()
          void queryClient.invalidateQueries({ queryKey: ["notifications"] })
        }}
      >
        <BellPlus className="size-4" />
        <span className="hidden sm:inline">New Notification</span>
      </button>
    </div>
  )
}
