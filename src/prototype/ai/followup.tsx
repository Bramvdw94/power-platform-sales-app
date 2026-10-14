// PROTOTYPE (throwaway, never merge): Draft follow-up on a logged Phone Call or a held Meeting, opening a prefilled Send email dialog (#166).
// A = a button under the row, B = a row menu, C = a chip under the row.

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarDays, Lock, MoreHorizontal, RefreshCw, Sparkles, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useGateway } from "@/hooks/use-gateway"
import { formatDate } from "@/lib/format"
import { addDays, toDateOnly, type Activity, type RecordRef } from "@/sales"
import { followUpFor, loadCtx, type FollowUp } from "./canned"
import { blockReason, canEditViewer, shortReason, useAiState, type Lang } from "./store"
import { AiLabel, Generating, LangPick, Reason, RequestsLeft, useAiRequest } from "./ui"

export type DraftTarget = { ref: RecordRef; subject: string; date: string; text?: string; meeting: boolean }

/** The sample held Meeting that every Account and Opportunity timeline shows in this prototype. */
export const heldMeeting = (ref: RecordRef): DraftTarget => ({
  ref,
  subject: "Pilot scope meeting",
  date: addDays(toDateOnly(new Date()), -3),
  text: "we walked through the pilot scope for 20 users. You will check the budget with finance and would like a proposal before the end of the month.",
  meeting: true,
})

export function targetOf(activity: Activity): DraftTarget | undefined {
  if (activity.kind !== "phoneCall" || !activity.completed) return undefined
  return { ref: activity.regarding, subject: activity.subject, date: activity.date, text: activity.notes, meeting: false }
}

type Variant = "A" | "B" | "C"

/** The control that starts a Draft follow-up. `slot` says where the variant wants it: under the row text, or at the row's right edge. */
export function DraftControl({ variant, target, slot }: { variant: Variant; target: DraftTarget; slot: "extras" | "trailing" }) {
  const ai = useAiState()
  const [open, setOpen] = useState(false)
  const blocked = blockReason(ai)
  const editor = canEditViewer(ai)
  const dialog = open && <SendEmailDialog target={target} onClose={() => setOpen(false)} />

  if (variant === "A" && slot === "extras") {
    if (!editor) return null
    return (
      <div className="pt-1">
        <Button size="sm" variant="outline" disabled={!!blocked} onClick={() => setOpen(true)}>
          <Sparkles aria-hidden />
          Draft follow-up
        </Button>
        {blocked && <Reason className="mt-1">{blocked}</Reason>}
        {dialog}
      </div>
    )
  }
  if (variant === "B" && slot === "trailing") {
    if (!editor) return null
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${target.subject}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem disabled={!!blocked} onSelect={() => setOpen(true)} className="flex-col items-start gap-0.5">
              <span className="flex items-center gap-2">
                <Sparkles aria-hidden />
                Draft follow-up
              </span>
              {blocked && <span className="text-xs whitespace-normal">{blocked}</span>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {dialog}
      </>
    )
  }
  if (variant === "C" && slot === "extras") {
    const reason = !editor ? "Only the Owner or manager can draft" : shortReason(ai)
    return (
      <div className="pt-1">
        <button
          type="button"
          disabled={!!reason}
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-900 outline-none hover:bg-violet-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:border-border disabled:bg-muted disabled:text-muted-foreground dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-100 dark:hover:bg-violet-900/50 dark:disabled:border-border dark:disabled:bg-muted dark:disabled:text-muted-foreground"
        >
          {reason ? <Lock className="size-3" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}
          {reason ?? "Draft follow-up"}
        </button>
        {dialog}
      </div>
    )
  }
  return null
}

/** The sample held Meeting, shaped like the other rows on the timeline. */
export function MeetingRow({ variant, record }: { variant: Variant; record: RecordRef }) {
  const gateway = useGateway()
  const target = heldMeeting(record)
  const { data: ctx } = useQuery({ queryKey: ["proto-ctx", record.type, record.id], queryFn: () => loadCtx(gateway, record) })
  const who = ctx?.contactName
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium break-words">{target.subject}</span>
          <Badge variant="outline">Held</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {["Meeting", who, formatDate(target.date)].filter(Boolean).join(" · ")}
        </p>
        <p className="text-sm break-words">
          Agenda: pilot scope and budget. Tracked from Outlook.
        </p>
        <DraftControl variant={variant} target={target} slot="extras" />
      </div>
      <DraftControl variant={variant} target={target} slot="trailing" />
    </li>
  )
}

/** The Send email dialog, prefilled by AI assist. Nothing is sent until the user presses Send. */
function SendEmailDialog({ target, onClose }: { target: DraftTarget; onClose: () => void }) {
  const gateway = useGateway()
  const ai = useAiState()
  const me = useCurrentUser().data?.user.fullName ?? "Adele Vance"
  const request = useAiRequest()
  const [draft, setDraft] = useState<(FollowUp & { lang: Lang }) | null>(null)
  const [edited, setEdited] = useState(false)
  const [recipient, setRecipient] = useState("")
  const blocked = blockReason(ai)
  const started = useRef(false)

  const generate = async () => {
    const ctx = await loadCtx(gateway, target.ref)
    const ok = await request.run("Draft follow-up", ctx.label)
    if (ok) {
      setDraft({ ...followUpFor(ctx, target, me, ai.lang), lang: ai.lang })
      setEdited(false)
    }
  }
  useEffect(() => {
    if (started.current) return
    started.current = true
    void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const change = (patch: Partial<FollowUp>) => {
    setDraft((d) => d && { ...d, ...patch })
    setEdited(true)
  }
  const addRecipient = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !recipient.trim()) return
    event.preventDefault()
    change({ to: [...(draft?.to ?? []), { name: recipient.trim(), email: recipient.trim() }] })
    setRecipient("")
  }
  const regenerateIn = draft && draft.lang !== ai.lang ? (ai.lang === "nl" ? "Dutch" : "English") : undefined
  const loading = request.phase === "loading"

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            Follow-up on {target.meeting ? "the Meeting" : "the Phone Call"} “{target.subject}” of {formatDate(target.date)}.
          </DialogDescription>
        </DialogHeader>

        <div className="ai-tint space-y-2 rounded-md border p-3 ">
          <div className="flex flex-wrap items-center gap-2">
            <AiLabel />
            <LangPick idPrefix="draft-lang" />
            {draft && !loading && (
              <Button type="button" size="sm" variant="outline" onClick={generate} disabled={!!blocked}>
                <RefreshCw aria-hidden />
                {regenerateIn ? `Regenerate in ${regenerateIn}` : "Regenerate"}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Drafted from this {target.meeting ? "Meeting" : "Phone Call"}’s text, the record’s key fields and your name. Nothing is sent until you press Send,
            and the email carries no AI marker.
          </p>
          {edited && <p className="text-xs text-muted-foreground">You edited the draft. Regenerate replaces your changes.</p>}
          <RequestsLeft />
          {blocked && <Reason>{blocked}</Reason>}
        </div>

        {loading ? (
          <Generating seconds={request.seconds} label="Drafting the email…" onCancel={() => { request.cancel(); onClose() }} />
        ) : request.phase === "error" && !draft ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              The draft could not be made. Nothing was counted against your limit.
            </p>
            <Button size="sm" onClick={generate} disabled={!!blocked}>
              Try again
            </Button>
          </div>
        ) : (
          draft && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="draft-to">To</Label>
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-1.5">
                  {draft.to.map((r) => (
                    <span key={r.email} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm">
                      {r.name}
                      <button type="button" aria-label={`Remove ${r.name}`} className="rounded-full p-0.5 hover:bg-background" onClick={() => change({ to: draft.to.filter((x) => x !== r) })}>
                        <X className="size-3" aria-hidden />
                      </button>
                    </span>
                  ))}
                  <input
                    id="draft-to"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    onKeyDown={addRecipient}
                    placeholder={draft.to.length ? "Add a recipient" : "Type an address and press Enter"}
                    className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="draft-subject">Subject</Label>
                <Input id="draft-subject" value={draft.subject} onChange={(e) => change({ subject: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="draft-body">Message</Label>
                <Textarea id="draft-body" rows={10} value={draft.body} onChange={(e) => change({ body: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground">Sent from your Outlook mailbox and logged on this record.</p>
            </div>
          )
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!draft || loading || draft.to.length === 0 || !draft.subject.trim()} onClick={onClose}>
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
