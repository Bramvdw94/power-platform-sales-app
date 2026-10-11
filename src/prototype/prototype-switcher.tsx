// PROTOTYPE (wayfinder #67): throwaway. Never merge to main.
/* eslint-disable react-refresh/only-export-components -- prototype */
// The floating bar that flips between prototype variants via ?variant=.

import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { ChevronLeft, ChevronRight } from "lucide-react"

export type VariantOption = { key: string; name: string }

export function useVariant(variants: VariantOption[]): string {
  const [params] = useSearchParams()
  const key = params.get("variant")
  return variants.some((v) => v.key === key) ? key! : variants[0].key
}

export function PrototypeSwitcher({ variants, label }: { variants: VariantOption[]; label: string }) {
  const [params, setParams] = useSearchParams()
  const current = useVariant(variants)
  const index = variants.findIndex((v) => v.key === current)
  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length]
    const p = new URLSearchParams(params)
    p.set("variant", next.key)
    setParams(p, { replace: true })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest("input, textarea, select, [contenteditable]")) return
      if (e.key === "ArrowLeft") go(-1)
      if (e.key === "ArrowRight") go(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (import.meta.env.PROD && import.meta.env.VITE_SALES_GATEWAY !== "memory") return null
  return (
    <div className="fixed bottom-36 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-700 px-2 py-1 text-sm text-white shadow-lg md:bottom-4">
      <button type="button" aria-label="Previous variant" className="rounded-full p-1 hover:bg-white/20" onClick={() => go(-1)}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-1 whitespace-nowrap">
        {label} {current} · {variants[index].name}
      </span>
      <button type="button" aria-label="Next variant" className="rounded-full p-1 hover:bg-white/20" onClick={() => go(1)}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
