// PROTOTYPE (throwaway, never merge): variant A "Rows and dialogs" (#154).
// Closest to today's app: Emails and Meetings are rows in the timeline that
// expand in place, Send email and Plan Meeting are dialogs like New Task, a row
// menu changes or clears Regarding, and Home gets two more cards.

import { useState } from "react"
import { Link } from "react-router-dom"
import { CalendarPlus, ChevronDown, ChevronRight, Link2, ListTodo, Mail, MoreHorizontal, Phone, StickyNote, Unlink, Trash2 } from "lucide-react"
import { AddActivityDialog, FilterChips, TimelineItem } from "@/components/records/activity-timeline"
import { RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { recordHref } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RecordRef, TimelineSource } from "@/sales"
import {
  plannedMeetings,
  planMeeting,
  removeItem,
  sendEmail,
  setRegarding,
  snippet,
  sourceOf,
  suggestionsFor,
  toLink,
  TYPE_NAMES,
  useMailItems,
  whenText,
  showsOn,
  type MailItem,
} from "./model"
import {
  Body,
  EmailFields,
  Headers,

  isUpcoming,
  KIND_FILTERS,
  kindOf,
  MailBadges,
  MailIcon,
  mailKindText,
  MEETING_NOTE,
  MeetingFields,
  mergeEntries,
  RegardingCommand,
  RemoveDialog,
  SEND_NOTE,
  submitWith,
  useEmailForm,
  useMayManage,
  useMeetingForm,
  useRecordActivities,
  type KindFilter,
} from "./shared"

type Adding = "note" | "task" | "phoneCall" | "email" | "meeting"

const SOURCE_FILTERS: { value: TimelineSource; label: string }[] = [
  { value: "account", label: "This Account" },
  { value: "contact", label: "Contacts" },
  { value: "opportunity", label: "Opportunities" },
  { value: "lead", label: "Leads" },
]

export function TimelineA({ record, canAdd }: { record: RecordRef; canAdd: boolean }) {
  const { data, error, isPending } = useRecordActivities(record)
  const items = useMailItems().filter((i) => showsOn(i, record))
  const [adding, setAdding] = useState<Adding | undefined>()
  const [kinds, setKinds] = useState<KindFilter[]>([])
  const [sources, setSources] = useState<TimelineSource[]>([])
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const related = record.type === "account"

  const entries = data
    ? mergeEntries(data, items).filter(
        (e) =>
          (kinds.length === 0 || kinds.includes(kindOf(e))) &&
          (!related || sources.length === 0 || sources.includes(e.activity ? e.activity.regarding.type : sourceOf(e.item!, record))),
      )
    : []
  const upcoming = entries.filter(isUpcoming).reverse()
  const history = entries.filter((e) => !isUpcoming(e))

  const row = (e: (typeof entries)[number]) =>
    e.activity ? (
      <TimelineItem key={e.key} activity={e.activity} showSource={related && !(e.activity.regarding.type === record.type && e.activity.regarding.id === record.id)} />
    ) : (
      <RowA key={e.key} item={e.item!} record={record} />
    )

  return (
    <RecordSection
      title="Activity"
      action={
        canAdd && (
          <div className="flex flex-wrap justify-end gap-1">
            <Button size="sm" variant="outline" onClick={() => setAdding("note")}>
              <StickyNote aria-hidden />
              Note
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding("task")}>
              <ListTodo aria-hidden />
              Task
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding("phoneCall")}>
              <Phone aria-hidden />
              Call
            </Button>
            {record.type !== "account" && (
              <Button size="sm" variant="outline" onClick={() => setAdding("email")}>
                <Mail aria-hidden />
                Email
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setAdding("meeting")}>
              <CalendarPlus aria-hidden />
              Meeting
            </Button>
          </div>
        )
      }
    >
      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load activities.
        </p>
      ) : (
        <>
          <div className="mb-3 space-y-2">
            <FilterChips label="Type" options={KIND_FILTERS} selected={kinds} onToggle={(k) => setKinds((l) => toggle(l, k))} />
            {related && <FilterChips label="Source" options={SOURCE_FILTERS} selected={sources} onToggle={(s) => setSources((l) => toggle(l, s))} />}
          </div>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activities{kinds.length || sources.length ? " match these filters" : " yet"}.</p>
          ) : (
            <div className="space-y-4">
              {upcoming.length > 0 && (
                <section aria-label="Upcoming">
                  <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Upcoming</h3>
                  <ol className="divide-y">{upcoming.map(row)}</ol>
                </section>
              )}
              {history.length > 0 && (
                <section aria-label="History">
                  {upcoming.length > 0 && <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">History</h3>}
                  <ol className="divide-y">{history.map(row)}</ol>
                </section>
              )}
            </div>
          )}
        </>
      )}
      {(adding === "note" || adding === "task" || adding === "phoneCall") && <AddActivityDialog record={record} kind={adding} onClose={() => setAdding(undefined)} />}
      {adding === "email" && <SendEmailDialog record={record} onClose={() => setAdding(undefined)} />}
      {adding === "meeting" && <PlanMeetingDialog record={record} onClose={() => setAdding(undefined)} />}
    </RecordSection>
  )
}

function RowA({ item, record }: { item: MailItem; record?: RecordRef }) {
  const [open, setOpen] = useState(false)
  const [relinking, setRelinking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const manage = useMayManage(item)
  const otherRegarding = item.regarding && !(record && item.regarding.type === record.type && item.regarding.id === record.id)
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <MailIcon item={item} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <button type="button" className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronDown aria-hidden className="size-3.5 self-center" /> : <ChevronRight aria-hidden className="size-3.5 self-center" />}
          <span className={cn("font-medium break-words", item.kind === "meeting" && item.cancelled && "text-muted-foreground line-through")}>{item.subject}</span>
          <MailBadges item={item} />
        </button>
        <p className="text-xs text-muted-foreground">{[mailKindText(item), item.ownerName, whenText(item.kind === "email" ? item.on : item.start)].join(" · ")}</p>
        {otherRegarding && (
          <p className="text-xs">
            <Link to={recordHref(item.regarding!)} className="text-primary hover:underline">
              {TYPE_NAMES[item.regarding!.type]} · {item.regarding!.name}
            </Link>
          </p>
        )}
        {open ? (
          <div className="space-y-2 rounded-md bg-muted/50 p-3">
            <Headers item={item} />
            <Body item={item} />
          </div>
        ) : (
          item.body && <p className="text-sm text-muted-foreground">{snippet(item.body)}</p>
        )}
        {!item.regarding && manage && (
          <Button size="sm" variant="outline" className="mt-1" onClick={() => setRelinking(true)}>
            <Link2 aria-hidden />
            Link to a record
          </Button>
        )}
      </div>
      {manage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`More for ${item.subject}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRelinking(true)}>
              <Link2 aria-hidden />
              {item.regarding ? "Change Regarding…" : "Link to a record…"}
            </DropdownMenuItem>
            {item.regarding && (
              <DropdownMenuItem onSelect={() => setRegarding(item.id, undefined)}>
                <Unlink aria-hidden />
                Clear Regarding
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(true)}>
              <Trash2 aria-hidden />
              Remove from the app…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {relinking && <RegardingDialog item={item} onClose={() => setRelinking(false)} />}
      {removing && <RemoveDialog item={item} onConfirm={() => removeItem(item.id)} onClose={() => setRemoving(false)} />}
    </li>
  )
}

function RegardingDialog({ item, onClose }: { item: MailItem; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.regarding ? "Change Regarding" : "Link to a record"}</DialogTitle>
          <DialogDescription>
            {item.regarding ? (
              <>
                "{item.subject}" is now about {TYPE_NAMES[item.regarding.type]} {item.regarding.name}.
              </>
            ) : (
              <>Pick what "{item.subject}" is about. It already shows on the timelines of the people in it.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <RegardingCommand
          item={item}
          onPick={(ref) => {
            setRegarding(item.id, ref)
            onClose()
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SendEmailDialog({ record, onClose }: { record: RecordRef; onClose: () => void }) {
  const form = useEmailForm(record)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={submitWith(form.validate, () => {
            sendEmail(record, form.values)
            onClose()
          })}
        >
          <DialogHeader>
            <DialogTitle>Send email</DialogTitle>
            <DialogDescription>{SEND_NOTE}</DialogDescription>
          </DialogHeader>
          <EmailFields form={form} idPrefix="a-email" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              <Mail aria-hidden />
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PlanMeetingDialog({ record, onClose }: { record: RecordRef; onClose: () => void }) {
  const form = useMeetingForm(record)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={submitWith(form.validate, () => {
            planMeeting(record, form.values)
            onClose()
          })}
        >
          <DialogHeader>
            <DialogTitle>Plan Meeting</DialogTitle>
            <DialogDescription>{MEETING_NOTE}</DialogDescription>
          </DialogHeader>
          <MeetingFields form={form} idPrefix="a-meeting" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              <CalendarPlus aria-hidden />
              Plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Home

/** Two more cards in the My work grid: "To link" and "My Meetings". */
export function HomeCardsA({ Section }: { Section: (p: { title: string; children: React.ReactNode }) => React.ReactNode }) {
  const all = useMailItems()
  const unlinked = toLink(all)
  const meetings = plannedMeetings(all)
  return (
    <>
      <Section title={`To link (${unlinked.length})`}>
        {unlinked.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every logged email and meeting is linked.</p>
        ) : (
          <ul className="divide-y">
            {unlinked.map((i) => (
              <ToLinkRowA key={i.id} item={i} />
            ))}
          </ul>
        )}
      </Section>
      <Section title="My Meetings">
        {meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meetings planned.</p>
        ) : (
          <ul className="divide-y">
            {meetings.map((m) => (
              <li key={m.id} className="py-2 first:pt-0 last:pb-0">
                <p className="font-medium break-words">{m.subject}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  <span>{whenText(m.start)}</span>
                  {m.regarding ? (
                    <Link to={recordHref(m.regarding)} className="text-primary hover:underline">
                      {m.regarding.name}
                    </Link>
                  ) : (
                    <MailBadges item={m} />
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}

function ToLinkRowA({ item }: { item: MailItem }) {
  const [relinking, setRelinking] = useState(false)
  const top = suggestionsFor(item)[0]
  return (
    <li className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <MailIcon item={item} className="mt-1" />
        <div className="min-w-0">
          <p className="font-medium break-words">{item.subject}</p>
          <p className="text-xs text-muted-foreground">
            {mailKindText(item)} · {whenText(item.kind === "email" ? item.on : item.start)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 pl-6">
        {top && (
          <Button size="sm" variant="secondary" className="h-auto max-w-full py-1 text-left whitespace-normal" onClick={() => setRegarding(item.id, top)}>
            <Link2 aria-hidden />
            {top.name}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setRelinking(true)}>
          Other…
        </Button>
      </div>
      {relinking && <RegardingDialog item={item} onClose={() => setRelinking(false)} />}
    </li>
  )
}
