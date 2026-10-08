// PROTOTYPE: floating variant switcher for throwaway UI prototypes. Never ships to users.
import { useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

const ENABLED = import.meta.env.DEV || import.meta.env.VITE_PROTOTYPE === "1"

export function useVariant(keys: string[]) {
  const param = new URLSearchParams(location.search).get("variant")
  return param && keys.includes(param) ? param : keys[0]
}

export function PrototypeSwitcher({ variants, current, onChange }: {
  variants: { key: string; name: string }[]
  current: string
  onChange: (key: string) => void
}) {
  const i = variants.findIndex((v) => v.key === current)
  const go = (step: number) => {
    const next = variants[(i + step + variants.length) % variants.length].key
    try {
      const url = new URL(location.href)
      url.searchParams.set("variant", next)
      history.replaceState(null, "", url)
    } catch { /* sandboxed page: keep the variant in memory only */ }
    onChange(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest("input, textarea, [contenteditable], [role=combobox], [role=listbox], [role=dialog]")) return
      if (e.key === "ArrowLeft") go(-1)
      if (e.key === "ArrowRight") go(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (!ENABLED) return null
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-full bg-zinc-900 text-zinc-50 px-2 py-1.5 shadow-lg ring-1 ring-white/10 text-sm"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant" className="rounded-full p-1 hover:bg-white/15"><ChevronLeft className="size-4" /></button>
      <span className="px-2 whitespace-nowrap"><b>{current}</b> <span className="opacity-75">({variants[i]?.name})</span></span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant" className="rounded-full p-1 hover:bg-white/15"><ChevronRight className="size-4" /></button>
    </div>
  )
}
