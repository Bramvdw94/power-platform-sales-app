/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): the floating variant switcher (copied from #150 / #154),
// plus "View as" (the requester or the approver) and Reset, because the Approval needs both people.

import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { resetDemo, setViewer, useViewer } from "./model"

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

export function PrototypeSwitcher({ variants, current }: { variants: { key: string; name: string }[]; current: string }) {
  const [, setParams] = useSearchParams()
  const viewer = useViewer()
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
    <div className="pointer-events-auto fixed bottom-20 left-1/2 z-[100] flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-1 gap-y-1 rounded-3xl bg-zinc-900 px-1.5 py-1 text-sm text-white shadow-lg ring-1 ring-white/20 md:bottom-4 md:rounded-full">
      <button type="button" aria-label="Previous variant" className="rounded-full p-1.5 hover:bg-white/15" onClick={() => go(-1)}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-1 whitespace-nowrap">
        {current} ({variants[index]?.name})
      </span>
      <button type="button" aria-label="Next variant" className="rounded-full p-1.5 hover:bg-white/15" onClick={() => go(1)}>
        <ChevronRight className="size-4" />
      </button>
      <span aria-hidden className="mx-1 hidden h-5 w-px bg-white/30 sm:block" />
      <span className="flex items-center gap-1 px-1">
        <span className="text-white/80">View as</span>
        {([["alex", "Alex (seller)"], ["megan", "Megan (manager)"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={viewer.key === key}
            onClick={() => setViewer(key)}
            className={cn("rounded-full px-2 py-1 whitespace-nowrap", viewer.key === key ? "bg-white text-zinc-900" : "hover:bg-white/15")}
          >
            {label}
          </button>
        ))}
        <button type="button" aria-label="Reset the demo data" title="Reset the demo data" className="rounded-full p-1.5 hover:bg-white/15" onClick={resetDemo}>
          <RotateCcw className="size-4" />
        </button>
      </span>
    </div>
  )
}
