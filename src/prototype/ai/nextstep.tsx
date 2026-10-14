// PROTOTYPE (throwaway, never merge): Suggest beside Next step on an open Opportunity (#166).
// A = a button beside the label, B = an icon inside the field, C = a link under the field and a Now / Suggested comparison.

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Check, Lock, RefreshCw, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useGateway } from "@/hooks/use-gateway"
import { cn } from "@/lib/utils"
import type { Activity } from "@/sales"
import { loadCtx, nextStepFor, type Suggestion } from "./canned"
import { blockReason, canEditViewer, shortReason, useAiState, type Lang } from "./store"
import { AiLabel, Generating, LangPick, Reason, RequestsLeft, useAiRequest } from "./ui"
import { useProtoVariant } from "./switcher"

function useSuggestFlow(opportunityId: string, onAccept: (text: string) => void) {
  const gateway = useGateway()
  const queryClient = useQueryClient()
  const ai = useAiState()
  const request = useAiRequest()
  const [suggestion, setSuggestion] = useState<(Suggestion & { lang: Lang }) | null>(null)
  const [accepted, setAccepted] = useState(false)

  const generate = async () => {
    setAccepted(false)
    const ref = { type: "opportunity" as const, id: opportunityId }
    const ctx = await loadCtx(gateway, ref)
    const activities = await queryClient.fetchQuery<Activity[]>({
      queryKey: ["activities", "opportunity", opportunityId],
      queryFn: () => gateway.listActivities(ref),
    })
    const ok = await request.run("Next step suggestion", ctx.label)
    if (ok) setSuggestion({ ...nextStepFor(ctx, activities.length, ai.lang), lang: ai.lang })
  }
  return {
    ai,
    request,
    suggestion,
    accepted,
    blocked: blockReason(ai),
    generate,
    accept: () => {
      if (!suggestion) return
      onAccept(suggestion.text)
      setSuggestion(null)
      setAccepted(true)
    },
    dismiss: () => {
      setSuggestion(null)
      setAccepted(false)
    },
  }
}
type Flow = ReturnType<typeof useSuggestFlow>

const regenerateLabel = (flow: Flow) =>
  flow.suggestion && flow.suggestion.lang !== flow.ai.lang ? `Regenerate in ${flow.ai.lang === "nl" ? "Dutch" : "English"}` : "Regenerate"

function AcceptedNote({ flow }: { flow: Flow }) {
  return (
    <p role="status" className="text-xs text-muted-foreground">
      {flow.accepted ? "Suggestion added to the field. Press Save to keep it." : ""}
    </p>
  )
}

function Status({ flow }: { flow: Flow }) {
  if (flow.request.phase === "loading")
    return <Generating seconds={flow.request.seconds} label="Thinking of a Next step…" onCancel={flow.request.cancel} />
  if (flow.request.phase === "error")
    return (
      <p role="alert" className="text-sm text-destructive">
        The suggestion could not be made. Nothing was counted against your limit. Try again.
      </p>
    )
  return null
}

export function ProtoNextStep({
  id,
  opportunityId,
  value,
  error,
  onChange,
}: {
  id: string
  opportunityId: string
  value: string
  error?: string
  onChange: (value: string) => void
}) {
  const variant = useProtoVariant()
  const flow = useSuggestFlow(opportunityId, onChange)
  const editor = canEditViewer(flow.ai)
  const input = (extra?: string) => (
    <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} className={extra} />
  )
  const errorText = error && <p className="text-sm text-destructive">{error}</p>

  if (variant === "A") {
    return (
      <div className="grid gap-1.5 sm:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id}>Next step</Label>
          {editor && (
            <Button type="button" size="sm" variant="outline" onClick={flow.generate} disabled={!!flow.blocked || flow.request.phase === "loading"}>
              <Sparkles aria-hidden />
              Suggest
            </Button>
          )}
        </div>
        {input()}
        {errorText}
        {editor && flow.blocked && <Reason>{flow.blocked}</Reason>}
        <Status flow={flow} />
        {flow.suggestion && (
          <div className="ai-tint space-y-2 rounded-md border p-3 ">
            <div className="flex flex-wrap items-center gap-2">
              <AiLabel />
              <LangPick idPrefix="next-a-lang" />
            </div>
            <p className="text-sm break-words">{flow.suggestion.text}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={flow.accept}>
                <Check aria-hidden />
                Accept
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={flow.dismiss}>
                <X aria-hidden />
                Dismiss
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={flow.generate} disabled={!!flow.blocked}>
                <RefreshCw aria-hidden />
                {regenerateLabel(flow)}
              </Button>
              <RequestsLeft />
            </div>
          </div>
        )}
        <AcceptedNote flow={flow} />
      </div>
    )
  }

  if (variant === "B") {
    const reason = flow.blocked
    return (
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={id}>Next step</Label>
        <div className="relative">
          {input(editor ? "pr-10" : undefined)}
          {editor && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Suggest a Next step"
              className="absolute top-1/2 right-1 -translate-y-1/2 text-violet-700 dark:text-violet-300"
              onClick={flow.generate}
              disabled={!!reason || flow.request.phase === "loading"}
            >
              <Sparkles aria-hidden />
            </Button>
          )}
        </div>
        {errorText}
        {editor && reason && <Reason>{reason}</Reason>}
        <Status flow={flow} />
        {flow.suggestion && (
          <div className="ai-tint flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2 ">
            <Sparkles className="size-4 shrink-0 text-violet-700 dark:text-violet-300" aria-hidden />
            <div className="min-w-0 flex-1 basis-56 space-y-0.5">
              <p className="text-sm break-words">{flow.suggestion.text}</p>
              <p className="text-xs text-muted-foreground">AI draft, check before use</p>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" onClick={flow.accept}>
                Accept
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={flow.dismiss}>
                Dismiss
              </Button>
              <LangPick idPrefix="next-b-lang" />
            </div>
          </div>
        )}
        <AcceptedNote flow={flow} />
      </div>
    )
  }

  // C: a link under the field; the suggestion is shown next to what is there now.
  const reason = !editor ? "Only the Owner or manager can use this" : shortReason(flow.ai)
  return (
    <div className="grid gap-1.5 sm:col-span-2">
      <Label htmlFor={id}>Next step</Label>
      {input()}
      {errorText}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={flow.generate}
          disabled={!!reason || flow.request.phase === "loading"}
          className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-violet-800 underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:text-muted-foreground disabled:no-underline dark:text-violet-300 dark:disabled:text-muted-foreground"
        >
          {reason ? <Lock className="size-3.5" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
          {reason ?? "Suggest a Next step"}
        </button>
        {!reason && <RequestsLeft />}
      </div>
      {editor && flow.blocked && <Reason>{flow.blocked}</Reason>}
      <Status flow={flow} />
      {flow.suggestion && (
        <div className="ai-tint space-y-3 rounded-md border p-3 ">
          <div className="flex flex-wrap items-center gap-2">
            <AiLabel />
            <LangPick idPrefix="next-c-lang" />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Now</p>
              <p className={cn("text-sm break-words", !value && "text-muted-foreground")}>{value || "Empty"}</p>
            </div>
            <ArrowRight className="mt-4 hidden size-4 text-muted-foreground sm:block" aria-hidden />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Suggested</p>
              <p className="text-sm font-medium break-words">{flow.suggestion.text}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{flow.suggestion.why}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={flow.accept}>
              <Check aria-hidden />
              Accept
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={flow.dismiss}>
              <X aria-hidden />
              Dismiss
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={flow.generate} disabled={!!flow.blocked}>
              <RefreshCw aria-hidden />
              {regenerateLabel(flow)}
            </Button>
          </div>
        </div>
      )}
      <AcceptedNote flow={flow} />
    </div>
  )
}
