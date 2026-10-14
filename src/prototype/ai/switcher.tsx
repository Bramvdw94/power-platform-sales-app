/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): the floating variant switcher (copied from #150) plus a Demo panel
// to flip AI assist on and off, reach the limits, change who is looking, and make the next request fail.

import { useEffect } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { aiActions, useAiState, type UsageMode, type Viewer } from "./store"

export const VARIANTS = [
  { key: "A", name: "Inline panels" },
  { key: "B", name: "Drawer and menus" },
  { key: "C", name: "Cards and chips" },
] as const
export type VariantKey = (typeof VARIANTS)[number]["key"]
const KEYS: string[] = VARIANTS.map((v) => v.key)

export function useProtoVariant(): VariantKey {
  const [params] = useSearchParams()
  // The variant sticks while you click around the app (links drop ?variant=).
  let v = params.get("variant")
  try {
    if (v && KEYS.includes(v)) sessionStorage.setItem("proto-variant", v)
    else v = sessionStorage.getItem("proto-variant")
  } catch {
    /* storage blocked: fall back to the URL only */
  }
  return (v && KEYS.includes(v) ? v : KEYS[0]) as VariantKey
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              value === o.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function DemoPanel() {
  const s = useAiState()
  const usage: UsageMode = s.usedToday >= s.dailyLimit ? "daily" : s.spent >= s.monthlyCap ? "cap" : "normal"
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Demo controls</p>
      <Segmented<Viewer>
        label="Who is looking"
        value={s.viewer}
        onChange={(viewer) => aiActions.set({ viewer })}
        options={[
          { value: "admin", label: "System Administrator" },
          { value: "owner", label: "Owner or manager" },
          { value: "readonly", label: "Read-only" },
        ]}
      />
      <Segmented<"on" | "off">
        label="AI assist"
        value={s.enabled ? "on" : "off"}
        onChange={(v) => aiActions.set({ enabled: v === "on" })}
        options={[
          { value: "on", label: "On" },
          { value: "off", label: "Off" },
        ]}
      />
      <Segmented<UsageMode>
        label="Usage"
        value={usage}
        onChange={aiActions.setUsage}
        options={[
          { value: "normal", label: "Normal" },
          { value: "daily", label: "Daily limit reached" },
          { value: "cap", label: "Team cap reached" },
        ]}
      />
      <Segmented<"no" | "yes">
        label="Next request"
        value={s.failNext ? "yes" : "no"}
        onChange={(v) => aiActions.set({ failNext: v === "yes" })}
        options={[
          { value: "no", label: "Works" },
          { value: "yes", label: "Fails once" },
        ]}
      />
      <Link to="/ai-assist" className="block text-sm text-primary underline-offset-4 hover:underline">
        Open the AI assist settings
      </Link>
    </div>
  )
}

export function ProtoSwitcher() {
  const current = useProtoVariant()
  const [, setParams] = useSearchParams()
  const index = VARIANTS.findIndex((v) => v.key === current)
  const go = (delta: number) => {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length]
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        n.set("variant", next.key)
        return n
      },
      { replace: true },
    )
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.closest("input, textarea, select, [contenteditable], [role=dialog]") || el.isContentEditable)) return
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
      <span className="px-1 whitespace-nowrap">
        {current} ({VARIANTS[index]?.name})
      </span>
      <button type="button" aria-label="Next variant" className="rounded-full p-1.5 hover:bg-white/15" onClick={() => go(1)}>
        <ChevronRight className="size-4" />
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Demo controls" className="ml-1 rounded-full border-l border-white/30 p-1.5 pl-2.5 hover:bg-white/15">
            <SlidersHorizontal className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="center" className="w-80 max-w-[calc(100vw-2rem)]">
          <DemoPanel />
        </PopoverContent>
      </Popover>
    </div>
  )
}
