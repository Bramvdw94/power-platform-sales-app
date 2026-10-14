/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): small pieces shared by the three AI assist variants.

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Info, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCurrentUser } from "@/hooks/use-current-user"
import { cn } from "@/lib/utils"
import { aiActions, getAiState, useAiState, type AiKind, type Lang } from "./store"

/** "AI draft, check before use": on every AI result. */
export function AiLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-900/60 dark:text-violet-100",
        className,
      )}
    >
      <Sparkles className="size-3" aria-hidden />
      AI draft, check before use
    </span>
  )
}

/** "Written with AI": on a Note saved from a summary. */
export function WrittenWithAi() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-900/60 dark:text-violet-100">
      <Sparkles className="size-3" aria-hidden />
      Written with AI
    </span>
  )
}

export function LangPick({ idPrefix, className }: { idPrefix: string; className?: string }) {
  const { lang } = useAiState()
  return (
    <div role="radiogroup" aria-label="Language" className={cn("inline-flex rounded-md border p-0.5", className)}>
      {(["en", "nl"] as Lang[]).map((l) => (
        <button
          key={l}
          id={`${idPrefix}-${l}`}
          type="button"
          role="radio"
          aria-checked={lang === l}
          onClick={() => aiActions.setLang(l)}
          className={cn(
            "rounded-sm px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            lang === l ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
          )}
        >
          {l === "en" ? "English" : "Nederlands"}
        </button>
      ))}
    </div>
  )
}

/** Why a button is disabled, in words next to it. */
export function Reason({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export function Generating({ seconds, label, onCancel }: { seconds: number; label: string; onCancel?: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 text-sm">
      <Loader2 className="size-4 animate-spin text-violet-700 dark:text-violet-300" aria-hidden />
      <span>
        {label} <span className="tabular-nums text-muted-foreground">{seconds} s</span>
      </span>
      <span className="text-xs text-muted-foreground">This can take up to 30 seconds.</span>
      {onCancel && (
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  )
}

export function RequestsLeft() {
  const s = useAiState()
  return (
    <span className="text-xs text-muted-foreground">
      {Math.max(0, s.dailyLimit - s.usedToday)} of {s.dailyLimit} requests left today
    </span>
  )
}

export type Phase = "idle" | "loading" | "error"

/**
 * One AI request: shows a spinner while the (canned) answer "arrives", fails once when the demo switch says so,
 * and on success counts against the daily limit and the team cap and is logged without the text.
 */
export function useAiRequest() {
  const me = useCurrentUser().data?.user.fullName ?? "Adele Vance"
  const [phase, setPhase] = useState<Phase>("idle")
  const [seconds, setSeconds] = useState(0)
  const timers = useRef<{ tick?: number; done?: number; reject?: () => void }>({})

  const clear = () => {
    window.clearInterval(timers.current.tick)
    window.clearTimeout(timers.current.done)
  }
  useEffect(() => clear, [])

  const run = (kind: AiKind, recordLabel: string) =>
    new Promise<boolean>((resolve) => {
      clear()
      setPhase("loading")
      setSeconds(0)
      timers.current.tick = window.setInterval(() => setSeconds((n) => n + 1), 1000)
      timers.current.reject = () => resolve(false)
      const fails = getAiState().failNext
      timers.current.done = window.setTimeout(
        () => {
          clear()
          if (fails) {
            aiActions.set({ failNext: false })
            setPhase("error")
            resolve(false)
            return
          }
          aiActions.record(kind, me, recordLabel)
          setPhase("idle")
          resolve(true)
        },
        fails ? 1500 : 2600,
      )
    })

  const cancel = () => {
    clear()
    timers.current.reject?.()
    setPhase("idle")
  }
  return { phase, seconds, run, cancel, reset: () => setPhase("idle") }
}
