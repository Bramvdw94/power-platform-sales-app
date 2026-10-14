// PROTOTYPE (throwaway, never merge): the Timeline summary in three places (#166).
// A = a panel at the top of the Activity card, B = a side drawer opened from the header, C = a card on top of the record.

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Check, Lock, RefreshCw, Sparkles, StickyNote, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { describeError } from "@/lib/errors"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { toDateOnly, type Activity, type RecordRef } from "@/sales"
import { loadCtx, summaryAsText, summaryFor, type Summary } from "./canned"
import { aiActions, blockReason, useAiState, type Lang } from "./store"
import { AiLabel, Generating, LangPick, Reason, RequestsLeft, useAiRequest } from "./ui"

type Result = { summary: Summary; lang: Lang; count: number }

function useSummaryFlow(record: RecordRef) {
  const gateway = useGateway()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateRecords()
  const ai = useAiState()
  const request = useAiRequest()
  const [result, setResult] = useState<Result | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>()

  const generate = async () => {
    setSaved(false)
    setSaveError(undefined)
    const related = record.type === "account"
    const ctx = await loadCtx(gateway, record)
    const activities = await queryClient.fetchQuery<Activity[]>({
      queryKey: related ? ["account-timeline", record.id] : ["activities", record.type, record.id],
      queryFn: () => (related ? gateway.listAccountTimeline(record.id) : gateway.listActivities(record)),
    })
    const ok = await request.run("Timeline summary", ctx.label)
    if (ok) setResult({ summary: summaryFor(ctx, activities, ai.lang), lang: ai.lang, count: Math.min(30, activities.length) })
  }

  const save = async () => {
    if (!result) return
    setSaving(true)
    setSaveError(undefined)
    try {
      const note = await gateway.addNote(record, {
        title: `Timeline summary, ${formatDate(toDateOnly(new Date()))}`,
        text: summaryAsText(result.summary, result.lang),
      })
      aiActions.markAiNote(note.id)
      await invalidate()
      setSaved(true)
    } catch (error) {
      setSaveError(error)
    } finally {
      setSaving(false)
    }
  }

  return {
    ai,
    request,
    result,
    saved,
    saving,
    saveError,
    blocked: blockReason(ai),
    generate,
    save,
    close: () => {
      request.cancel()
      setResult(null)
      setSaved(false)
    },
  }
}
type Flow = ReturnType<typeof useSummaryFlow>

const noun = (record: RecordRef) => (record.type === "account" ? "Account" : "Opportunity")

function SummaryText({ result, big }: { result: Result; big?: boolean }) {
  return (
    <div className="space-y-3">
      <p className={cn("break-words", big ? "text-base font-medium" : "text-sm")}>{result.summary.headline}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm marker:text-muted-foreground">
        {result.summary.bullets.map((b) => (
          <li key={b} className="break-words">
            {b}
          </li>
        ))}
      </ul>
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        <span className="font-medium">{result.lang === "nl" ? "Aandachtspunt" : "Suggested focus"}: </span>
        {result.summary.focus}
      </p>
    </div>
  )
}

/** Everything under the title: the button, the spinner, the result and what you can do with it. */
function SummaryBody({ flow, record, idPrefix, big }: { flow: Flow; record: RecordRef; idPrefix: string; big?: boolean }) {
  const { request, result, ai } = flow
  const regenerateIn = result && result.lang !== ai.lang ? (ai.lang === "nl" ? "Dutch" : "English") : undefined

  if (request.phase === "loading")
    return <Generating seconds={request.seconds} label="Reading the key fields and the latest Activities…" onCancel={request.cancel} />

  if (!result) {
    return (
      <div className="space-y-2">
        {request.phase === "error" && (
          <p role="alert" className="text-sm text-destructive">
            The summary could not be made. Nothing was counted against your limit. Try again.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Reads the key fields and the last 30 Activities of the past 90 days. Nothing is saved unless you press Save as Note.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={flow.generate} disabled={!!flow.blocked}>
            <Sparkles aria-hidden />
            {request.phase === "error" ? "Try again" : "Summarise"}
          </Button>
          <LangPick idPrefix={`${idPrefix}-lang`} />
          <RequestsLeft />
        </div>
        {flow.blocked && <Reason>{flow.blocked}</Reason>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <AiLabel />
        <span className="text-xs text-muted-foreground">
          From the key fields and {result.count} Activities · {result.lang === "nl" ? "Nederlands" : "English"}
        </span>
      </div>
      <SummaryText result={result} big={big} />
      <p className="text-xs text-muted-foreground">
        {flow.saved ? `Saved as a Note on this ${noun(record)}.` : "This summary is not saved. Save as Note keeps it on the timeline."}
      </p>
      {flow.saveError != null && (
        <p role="alert" className="text-sm text-destructive">
          {describeError(flow.saveError)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {flow.saved ? (
          <Button variant="outline" size="sm" disabled>
            <Check aria-hidden />
            Saved as Note
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={flow.save} disabled={flow.saving}>
            <StickyNote aria-hidden />
            Save as Note
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={flow.generate} disabled={!!flow.blocked}>
          <RefreshCw aria-hidden />
          {regenerateIn ? `Regenerate in ${regenerateIn}` : "Regenerate"}
        </Button>
        <LangPick idPrefix={`${idPrefix}-lang`} />
        <Button variant="ghost" size="sm" onClick={flow.close}>
          <X aria-hidden />
          Close
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RequestsLeft />
        <span className="text-xs text-muted-foreground">Regenerate counts as a request.</span>
      </div>
      {flow.blocked && <Reason>{flow.blocked}</Reason>}
    </div>
  )
}

/** A: a panel at the top of the Activity card. */
export function SummaryPanelA({ record }: { record: RecordRef }) {
  const flow = useSummaryFlow(record)
  const open = flow.result || flow.request.phase !== "idle"
  return (
    <section
      aria-label="Timeline summary"
      className="ai-tint mb-4 space-y-3 rounded-md border p-3 "
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-violet-700 dark:text-violet-300" aria-hidden />
        <h3 className="text-sm font-semibold">Timeline summary</h3>
        {!open && <span className="text-xs text-muted-foreground">on demand</span>}
      </div>
      <SummaryBody flow={flow} record={record} idPrefix="sum-a" />
    </section>
  )
}

/** B: a header button that opens a drawer. When AI is blocked the button looks disabled but still opens the drawer, which says why. */
export function SummaryDrawerB({ record }: { record: RecordRef }) {
  const flow = useSummaryFlow(record)
  const [open, setOpen] = useState(false)
  const blocked = !!flow.blocked
  const openDrawer = () => {
    setOpen(true)
    if (!blocked && !flow.result && flow.request.phase !== "loading") void flow.generate()
  }
  return (
    <>
      <Button variant="outline" aria-disabled={blocked || undefined} className={cn(blocked && "opacity-60")} onClick={openDrawer}>
        {blocked ? <Lock aria-hidden /> : <Sparkles aria-hidden />}
        Summarise
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) flow.close()
        }}
      >
        <DialogContent className="top-0 right-0 left-auto h-dvh max-w-md translate-x-0 translate-y-0 content-start gap-4 overflow-y-auto rounded-none border-l sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-violet-700 dark:text-violet-300" aria-hidden />
              Timeline summary
            </DialogTitle>
            <DialogDescription>
              {record.type === "account" ? "This Account and its open Opportunities." : "This Opportunity and its latest Activities."}
            </DialogDescription>
          </DialogHeader>
          {flow.blocked && !flow.result ? (
            <div className="space-y-2">
              <Button disabled>
                <Lock aria-hidden />
                Summarise
              </Button>
              <Reason>{flow.blocked}</Reason>
            </div>
          ) : (
            <SummaryBody flow={flow} record={record} idPrefix="sum-b" />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** C: a card on top of the record, above Details. */
export function SummaryCardC({ record }: { record: RecordRef }) {
  const flow = useSummaryFlow(record)
  return (
    <Card role="region" aria-label="Timeline summary" className="ai-tint gap-3 py-4 ">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-violet-700 dark:text-violet-300" aria-hidden />
          Timeline summary
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <SummaryBody flow={flow} record={record} idPrefix="sum-c" big />
      </CardContent>
    </Card>
  )
}
