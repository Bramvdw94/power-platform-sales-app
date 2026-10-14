/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): the floating variant switcher (copied from #154).

import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { ChevronLeft, ChevronRight } from "lucide-react"

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
    </div>
  )
}
