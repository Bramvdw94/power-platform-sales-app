// PROTOTYPE (throwaway, never merge): variant B "Reading pane" (#154).
// Mail-client feel: the timeline is a dense one-line list grouped by day, an
// Email or Meeting opens in a side panel that holds its Regarding, Reply and
// Remove, the composer docks in the corner so the record stays readable, and
// Home gets a "Next up" strip and a one-at-a-time linking queue.

import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { CalendarPlus, ChevronDown, Link2, ListTodo, Mail, Minus, Phone, Plus, Reply, SkipForward, StickyNote, Trash2, Unlink, X } from "lucide-react"
import { AddActivityDialog } from "@/components/records/activity-timeline"
import { RecordSection } from "@/components/records/record-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate, recordHref } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Activity, RecordRef } from "@/sales"
import {
  dayText,
  nameOf,
  plannedMeetings,
  planMeeting,
  removeItem,
  sendEmail,
  setRegarding,
  showsOn,
  suggestionsFor,
  timeText,
  toLink,
  TYPE_NAMES,
  useMailItems,
  whenText,
  type MailItem,
} from "./model"
import {
  Body,
  EmailFields,
  Headers,
  Hint,
  MailBadges,
  MailIcon,
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
  type Entry,
} from "./shared"

type Composer = { kind: "email"; reply?: MailItem } | { kind: "meeting" }

export function TimelineB({ record, canAdd }: { record: RecordRef; canAdd: boolean }) {
  const { data, error, isPending } = useRecordActivities(record)
  const all = useMailItems()
  const items = all.filter((i) => showsOn(i, record))
  const [openId, setOpenId] = useState<string>()
  const [adding, setAdding] = useState<"note" | "task" | "phoneCall">()
  const [composer, setComposer] = useState<Composer>()
  const open = all.find((i) => i.id === openId)

  const entries = data ? mergeEntries(data, items) : []
  const days: { day: string; entries: Entry[] }[] = []
  for (const e of entries) {
    const day = dayText(e.date)
    const last = days[days.length - 1]
    if (last?.day === day) last.entries.push(e)
    else days.push({ day, entries: [e] })
  }

  return (
    <RecordSection
      title="Activity"
      action={
        canAdd && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus aria-hidden />
                New
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {record.type !== "account" && (
                <DropdownMenuItem onSelect={() => setComposer({ kind: "email" })}>
                  <Mail aria-hidden />
                  Email
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setComposer({ kind: "meeting" })}>
                <CalendarPlus aria-hidden />
                Meeting
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setAdding("note")}>
                <StickyNote aria-hidden />
                Note
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAdding("task")}>
                <ListTodo aria-hidden />
                Task
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAdding("phoneCall")}>
                <Phone aria-hidden />
                Phone Call
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load activities.
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activities yet.</p>
      ) : (
        <div className="space-y-3">
          {days.map((d) => (
            <section key={d.day + d.entries[0].key} aria-label={d.day}>
              <h3 className="sticky top-0 bg-card py-1 text-xs font-medium text-muted-foreground">{d.day}</h3>
              <ul className="overflow-hidden rounded-md border">
                {d.entries.map((e) =>
                  e.item ? (
                    <li key={e.key} className="border-b last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setOpenId(e.item!.id)}
                        className={cn("flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-accent", openId === e.item.id && "bg-accent")}
                      >
                        <MailIcon item={e.item} />
                        <span className={cn("min-w-0 flex-1 truncate", !e.item.regarding && "font-medium")}>
                          <span className={cn(e.item.kind === "meeting" && e.item.cancelled && "line-through")}>{e.item.subject}</span>
                          <span className="text-foreground/70"> · {e.item.kind === "email" ? (e.item.direction === "incoming" ? nameOf(e.item.from) : `to ${e.item.to.map(nameOf).join(", ")}`) : e.item.attendees.map(nameOf).join(", ")}</span>
                        </span>
                        <span className="hidden shrink-0 sm:inline-flex sm:gap-1">
                          <MailBadges item={e.item} />
                        </span>
                        <span className="shrink-0 text-xs text-foreground/70 tabular-nums">{timeText(e.item.kind === "email" ? e.item.on : e.item.start)}</span>
                      </button>
                    </li>
                  ) : (
                    <ActivityLineB key={e.key} activity={e.activity!} />
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
      {open && (
        <ReadingPane
          item={open}
          onClose={() => setOpenId(undefined)}
          onReply={() => {
            setComposer({ kind: "email", reply: open })
            setOpenId(undefined)
          }}
        />
      )}
      {adding && <AddActivityDialog record={record} kind={adding} onClose={() => setAdding(undefined)} />}
      {composer && <DockedComposer key={composer.kind + (composer.kind === "email" ? composer.reply?.id ?? "" : "")} record={record} composer={composer} onClose={() => setComposer(undefined)} />}
    </RecordSection>
  )
}

function ActivityLineB({ activity }: { activity: Activity }) {
  const [open, setOpen] = useState(false)
  const Icon = activity.kind === "note" ? StickyNote : activity.kind === "task" ? ListTodo : Phone
  const title = activity.kind === "note" ? activity.title || "Note" : activity.subject
  const text = activity.kind === "note" ? activity.text : activity.kind === "task" ? activity.description : activity.notes
  return (
    <li className="border-b last:border-b-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-accent">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("min-w-0 flex-1 truncate", activity.kind === "task" && activity.completed && "text-muted-foreground line-through")}>
          {title}
          {text && <span className="text-muted-foreground"> · {text}</span>}
        </span>
        {activity.kind === "task" && !activity.completed && activity.dueDate && <span className="shrink-0 text-xs text-muted-foreground">Due {formatDate(activity.dueDate)}</span>}
        {activity.kind === "phoneCall" && !activity.completed && <Badge variant="outline">Planned</Badge>}
      </button>
      {open && text && <p className="px-8 pb-2 text-sm whitespace-pre-line">{text}</p>}
    </li>
  )
}

/** A panel sliding in from the right (full screen on a phone), holding one Email or Meeting. */
function SidePanel({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background text-foreground shadow-xl sm:max-w-lg">
          <div className="flex items-start gap-2 border-b p-4">
            <DialogPrimitive.Title className="min-w-0 flex-1 text-lg font-semibold break-words">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button size="icon" variant="ghost" className="size-8" aria-label="Close">
                <X aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">Details of the logged item</DialogPrimitive.Description>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t p-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function ReadingPane({ item, onClose, onReply }: { item: MailItem; onClose: () => void; onReply: () => void }) {
  const manage = useMayManage(item)
  const [choosing, setChoosing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const suggestions = suggestionsFor(item).slice(0, 3)
  return (
    <SidePanel
      title={item.subject}
      onClose={onClose}
      footer={
        <>
          {manage && (
            <Button variant="ghost" className="mr-auto text-destructive" onClick={() => setRemoving(true)}>
              <Trash2 aria-hidden />
              Remove from the app
            </Button>
          )}
          {item.kind === "email" && item.regarding && (
            <Button onClick={onReply}>
              <Reply aria-hidden />
              Reply
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-wrap gap-1">
        <MailBadges item={item} showUnlinked={false} />
      </div>
      <section aria-label="Regarding" className={cn("space-y-2 rounded-md border p-3", !item.regarding && "border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Regarding</span>
          {item.regarding ? (
            <Link to={recordHref(item.regarding)} className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline" onClick={onClose}>
              {TYPE_NAMES[item.regarding.type]} · {item.regarding.name}
            </Link>
          ) : (
            <span className="flex-1 text-sm font-medium">Unlinked</span>
          )}
          {manage && item.regarding && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setChoosing((c) => !c)}>
                Change
              </Button>
              <Button size="sm" variant="ghost" aria-label="Clear Regarding" onClick={() => setRegarding(item.id, undefined)}>
                <Unlink aria-hidden />
              </Button>
            </>
          )}
        </div>
        {manage && !item.regarding && !choosing && (
          <div className="grid gap-1">
            {suggestions.map((s) => (
              <Button key={s.type + s.id} variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" onClick={() => setRegarding(item.id, s)}>
                <Link2 aria-hidden />
                <span className="min-w-0">
                  <span className="block">{s.name}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {TYPE_NAMES[s.type]} · {s.why}
                  </span>
                </span>
              </Button>
            ))}
            <Button variant="link" className="justify-start px-0" onClick={() => setChoosing(true)}>
              Search another record
            </Button>
          </div>
        )}
        {choosing && (
          <RegardingCommand
            item={item}
            onPick={(ref) => {
              setRegarding(item.id, ref)
              setChoosing(false)
            }}
          />
        )}
      </section>
      <Headers item={item} />
      <Body item={item} className="border-t pt-4" />
      {removing && (
        <RemoveDialog
          item={item}
          onConfirm={() => {
            removeItem(item.id)
            onClose()
          }}
          onClose={() => setRemoving(false)}
        />
      )}
    </SidePanel>
  )
}

/** Bottom-right composer that leaves the record readable; full screen on a phone; can be minimised. */
function DockedComposer({ record, composer, onClose }: { record: RecordRef; composer: Composer; onClose: () => void }) {
  const [min, setMin] = useState(false)
  const reply = composer.kind === "email" ? composer.reply : undefined
  const email = useEmailForm(
    record,
    reply && reply.kind === "email"
      ? { to: [reply.direction === "incoming" ? reply.from : reply.to[0]], subject: reply.subject.startsWith("RE:") ? reply.subject : `RE: ${reply.subject}`, body: `\n\n---\n${reply.body}` }
      : undefined,
  )
  const meeting = useMeetingForm(record)
  const title = composer.kind === "email" ? (reply ? "Reply" : "New email") : "New meeting"
  return (
    <div
      role="dialog"
      aria-label={title}
      className={cn(
        "fixed z-50 flex flex-col border bg-background text-foreground shadow-2xl",
        min ? "right-4 bottom-20 w-64 rounded-md md:bottom-4" : "inset-0 md:inset-auto md:right-4 md:bottom-4 md:max-h-[85vh] md:w-[30rem] md:rounded-lg",
      )}
    >
      <div className="flex items-center gap-1 rounded-t-lg bg-zinc-900 px-3 py-2 text-sm text-white">
        <span className="flex-1 truncate font-medium">{title}</span>
        <button type="button" aria-label={min ? "Expand" : "Minimise"} className="rounded p-1 hover:bg-white/15" onClick={() => setMin((m) => !m)}>
          <Minus className="size-4" aria-hidden />
        </button>
        <button type="button" aria-label="Discard" className="rounded p-1 hover:bg-white/15" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {!min && (
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={
            composer.kind === "email"
              ? submitWith(email.validate, () => {
                  sendEmail(record, email.values)
                  onClose()
                })
              : submitWith(meeting.validate, () => {
                  planMeeting(record, meeting.values)
                  onClose()
                })
          }
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {composer.kind === "email" ? <EmailFields form={email} idPrefix="b-email" bodyRows={9} compact /> : <MeetingFields form={meeting} idPrefix="b-meeting" compact />}
            <Hint>{composer.kind === "email" ? SEND_NOTE : MEETING_NOTE}</Hint>
          </div>
          <div className="flex justify-end gap-2 border-t p-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Discard
            </Button>
            <Button type="submit">{composer.kind === "email" ? <Mail aria-hidden /> : <CalendarPlus aria-hidden />}{composer.kind === "email" ? "Send" : "Plan"}</Button>
          </div>
        </form>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Home

/** Above the cards: a "Next up" strip of Planned Meetings and a call to link the Unlinked items one at a time. */
export function HomeTopB() {
  const all = useMailItems()
  const unlinked = toLink(all)
  const meetings = plannedMeetings(all)
  const [triage, setTriage] = useState(false)
  return (
    <div className="space-y-3">
      {unlinked.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-400 bg-amber-50 p-3 dark:border-amber-500/50 dark:bg-amber-500/10">
          <Link2 aria-hidden className="size-5 shrink-0 text-amber-700 dark:text-amber-300" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">
              {unlinked.length} {unlinked.length === 1 ? "email or meeting needs" : "emails and meetings need"} a record.
            </span>{" "}
            They were logged from your mailbox, but the app could not tell which record they belong to.
          </p>
          <Button size="sm" onClick={() => setTriage(true)}>
            Link them
          </Button>
        </div>
      )}
      <section aria-label="Next up">
        <h2 className="mb-2 text-sm font-medium">Next up</h2>
        {meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meetings planned.</p>
        ) : (
          <ol className="flex snap-x gap-2 overflow-x-auto pb-1">
            {meetings.map((m) => (
              <li key={m.id} className="w-56 shrink-0 snap-start rounded-md border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {dayText(m.start)} · {timeText(m.start)}–{timeText(m.end)}
                </p>
                <p className="mt-1 font-medium break-words">{m.subject}</p>
                <p className="truncate text-xs text-muted-foreground">{m.attendees.map(nameOf).join(", ")}</p>
                <div className="mt-2">
                  {m.regarding ? (
                    <Link to={recordHref(m.regarding)} className="text-xs text-primary hover:underline">
                      {m.regarding.name}
                    </Link>
                  ) : (
                    <MailBadges item={m} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      {triage && <TriageDialog onClose={() => setTriage(false)} />}
    </div>
  )
}

function TriageDialog({ onClose }: { onClose: () => void }) {
  const unlinked = toLink(useMailItems())
  const [skipped, setSkipped] = useState<string[]>([])
  const [searching, setSearching] = useState(false)
  const [removing, setRemoving] = useState(false)
  const queue = unlinked.filter((i) => !skipped.includes(i.id))
  const item = queue[0]
  const total = unlinked.length
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Link emails and meetings</DialogTitle>
          <DialogDescription>{item ? `${total - queue.length + 1} of ${total}. Pick what it is about.` : "Done for now."}</DialogDescription>
        </DialogHeader>
        {!item ? (
          <div className="space-y-3 text-sm">
            <p>{total === 0 ? "Everything is linked." : `${total} skipped. They stay in your "To link" list.`}</p>
            <Button onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <MailIcon item={item} className="mt-1" />
                <div className="min-w-0">
                  <p className="font-medium break-words">{item.subject}</p>
                  <p className="text-xs text-muted-foreground">{whenText(item.kind === "email" ? item.on : item.start)}</p>
                </div>
              </div>
              <Headers item={item} />
              <Body item={item} className="max-h-32 overflow-y-auto text-muted-foreground" />
            </div>
            {searching ? (
              <RegardingCommand
                item={item}
                onPick={(ref) => {
                  setRegarding(item.id, ref)
                  setSearching(false)
                }}
              />
            ) : (
              <div className="grid gap-1">
                {suggestionsFor(item).slice(0, 3).map((s) => (
                  <Button key={s.type + s.id} variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" onClick={() => setRegarding(item.id, s)}>
                    <Link2 aria-hidden />
                    <span className="min-w-0">
                      <span className="block">{s.name}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {TYPE_NAMES[s.type]} · {s.why}
                      </span>
                    </span>
                  </Button>
                ))}
                <Button variant="link" className="justify-start px-0" onClick={() => setSearching(true)}>
                  Search another record
                </Button>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
              <Button variant="ghost" className="text-destructive" onClick={() => setRemoving(true)}>
                <Trash2 aria-hidden />
                Remove from the app
              </Button>
              <Button variant="outline" onClick={() => setSkipped((s) => [...s, item.id])}>
                <SkipForward aria-hidden />
                Skip
              </Button>
            </div>
            {removing && <RemoveDialog item={item} onConfirm={() => removeItem(item.id)} onClose={() => setRemoving(false)} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
