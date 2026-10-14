// PROTOTYPE (throwaway, never merge): variant C "Composer and agenda" (#154).
// Write-first, like Salesforce's activity composer: tabs for Note, Task, Call,
// Email and Meeting sit open at the top of the timeline (no dialogs); Emails
// fold into conversations; each item carries a Regarding pill that changes it
// in a popover. Home swaps "My open Tasks" for an Agenda of Tasks and Meetings
// by day, and "To link" becomes a full-width list with bulk linking.

import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { CalendarPlus, ChevronDown, Link2, ListTodo, Mail, MessagesSquare, Phone, StickyNote, Trash2, Unlink } from "lucide-react"
import { CompleteTaskButton, TimelineItem } from "@/components/records/activity-timeline"
import { RecordSection } from "@/components/records/record-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { formatDate, recordHref } from "@/lib/format"
import { cn } from "@/lib/utils"
import { isTaskOverdue, toDateOnly, type RecordRef, type Task } from "@/sales"
import {
  dayText,
  nameOf,
  plannedMeetings,
  planMeeting,
  removeItem,
  sendEmail,
  setRegarding,
  showsOn,
  snippet,
  suggestionsFor,
  timeText,
  toLink,
  TYPE_NAMES,
  useMailItems,
  whenText,
  type EmailItem,
  type MailItem,
  type MeetingItem,
} from "./model"
import {
  Body,
  EmailFields,
  Headers,
  Hint,
  MailBadges,
  MailIcon,
  mailKindText,
  MEETING_NOTE,
  MeetingFields,
  RegardingCommand,
  RemoveDialog,
  SEND_NOTE,
  submitWith,
  useEmailForm,
  useMayManage,
  useMeetingForm,
  useRecordActivities,
} from "./shared"

type Tab = "note" | "task" | "phoneCall" | "email" | "meeting"

export function TimelineC({ record, canAdd }: { record: RecordRef; canAdd: boolean }) {
  const { data, error, isPending } = useRecordActivities(record)
  const items = useMailItems().filter((i) => showsOn(i, record))

  // Emails fold into one conversation per thread; Meetings and activities stay single.
  type Row = { key: string; date: string; node: ReactNode; upcoming?: boolean }
  const rows: Row[] = []
  const threads = new Map<string, EmailItem[]>()
  for (const i of items) if (i.kind === "email") threads.set(i.threadId, [...(threads.get(i.threadId) ?? []), i])
  for (const [id, mails] of threads) {
    const sorted = [...mails].sort((a, b) => a.on.localeCompare(b.on))
    rows.push({ key: id, date: sorted[sorted.length - 1].on, node: <ThreadC key={id} mails={sorted} record={record} /> })
  }
  for (const m of items.filter((i): i is MeetingItem => i.kind === "meeting"))
    rows.push({ key: m.id, date: m.start, node: <MeetingRowC key={m.id} item={m} record={record} />, upcoming: !m.cancelled && new Date(m.end) > new Date() })
  for (const a of data ?? [])
    rows.push({
      key: a.id,
      date: a.kind === "phoneCall" ? `${a.date}T09:00:00.000Z` : a.kind === "task" && a.completedOn ? a.completedOn : a.createdOn,
      node: <TimelineItem key={a.id} activity={a} showSource={record.type === "account" && !(a.regarding.type === record.type && a.regarding.id === record.id)} />,
      upcoming: (a.kind === "task" || a.kind === "phoneCall") && !a.completed,
    })
  const upcoming = rows.filter((r) => r.upcoming).sort((a, b) => a.date.localeCompare(b.date))
  const past = rows.filter((r) => !r.upcoming).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <RecordSection title="Activity">
      {canAdd && <ComposerC record={record} />}
      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load activities.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {upcoming.length > 0 && (
            <section aria-label="Next" className="rounded-md border border-dashed p-3">
              <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Next</h3>
              <ol className="divide-y">{upcoming.map((r) => r.node)}</ol>
            </section>
          )}
          {past.length === 0 && upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activities yet.</p>
          ) : (
            <ol aria-label="Activity timeline" className="divide-y">
              {past.map((r) => r.node)}
            </ol>
          )}
        </div>
      )}
    </RecordSection>
  )
}

// ---------------------------------------------------------------- composer

const TABS: { value: Tab; label: string; icon: typeof Mail }[] = [
  { value: "email", label: "Email", icon: Mail },
  { value: "meeting", label: "Meeting", icon: CalendarPlus },
  { value: "note", label: "Note", icon: StickyNote },
  { value: "task", label: "Task", icon: ListTodo },
  { value: "phoneCall", label: "Call", icon: Phone },
]

function ComposerC({ record }: { record: RecordRef }) {
  const tabs = TABS.filter((t) => !(t.value === "email" && record.type === "account"))
  const [tab, setTab] = useState<Tab>(tabs[0].value)
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-md border">
      <div role="tablist" aria-label="Add activity" className="flex overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={tab === t.value}
            onClick={() => {
              setTab(t.value)
              setExpanded(true)
            }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              tab === t.value ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon aria-hidden className="size-4" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-3">
        {!expanded ? (
          <button type="button" onClick={() => setExpanded(true)} className="w-full rounded-md border border-input px-3 py-2 text-left text-sm text-muted-foreground dark:bg-input/30">
            {tab === "email" ? "Write an email…" : tab === "meeting" ? "Plan a meeting…" : tab === "note" ? "Write a note…" : tab === "task" ? "Add a task…" : "Log a call…"}
          </button>
        ) : tab === "email" ? (
          <EmailComposerC key="email" record={record} onDone={() => setExpanded(false)} />
        ) : tab === "meeting" ? (
          <MeetingComposerC key="meeting" record={record} onDone={() => setExpanded(false)} />
        ) : (
          <SimpleComposerC key={tab} record={record} kind={tab} onDone={() => setExpanded(false)} />
        )}
      </div>
    </div>
  )
}

function EmailComposerC({ record, onDone }: { record: RecordRef; onDone: () => void }) {
  const form = useEmailForm(record)
  return (
    <form
      noValidate
      className="grid gap-2"
      onSubmit={submitWith(form.validate, () => {
        sendEmail(record, form.values)
        onDone()
      })}
    >
      <EmailFields form={form} idPrefix="c-email" bodyRows={5} compact />
      <Hint>{SEND_NOTE}</Hint>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          <Mail aria-hidden />
          Send
        </Button>
      </div>
    </form>
  )
}

function MeetingComposerC({ record, onDone }: { record: RecordRef; onDone: () => void }) {
  const form = useMeetingForm(record)
  return (
    <form
      noValidate
      className="grid gap-2"
      onSubmit={submitWith(form.validate, () => {
        planMeeting(record, form.values)
        onDone()
      })}
    >
      <MeetingFields form={form} idPrefix="c-meeting" compact />
      <Hint>{MEETING_NOTE}</Hint>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          <CalendarPlus aria-hidden />
          Plan
        </Button>
      </div>
    </form>
  )
}

/** Note, Task and Call inline, saved through the real gateway. */
function SimpleComposerC({ record, kind, onDone }: { record: RecordRef; kind: "note" | "task" | "phoneCall"; onDone: () => void }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [subject, setSubject] = useState("")
  const [text, setText] = useState("")
  const [date, setDate] = useState(toDateOnly(new Date()))
  const save = useMutation({
    mutationFn: async (): Promise<unknown> =>
      kind === "note"
        ? gateway.addNote(record, { title: subject.trim(), text: text.trim() })
        : kind === "task"
          ? gateway.addTask(record, { subject: subject.trim(), description: text.trim() || undefined, dueDate: date || undefined })
          : gateway.addPhoneCall(record, { subject: subject.trim(), direction: "outgoing", date, notes: text.trim() || undefined }),
    onSuccess: async () => {
      await invalidate()
      onDone()
    },
  })
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (kind === "note" ? text.trim() : subject.trim()) save.mutate()
      }}
    >
      <Input aria-label={kind === "note" ? "Title" : "Subject"} placeholder={kind === "note" ? "Title (optional)" : "Subject"} value={subject} onChange={(e) => setSubject(e.target.value)} />
      {kind !== "note" && <Input aria-label={kind === "task" ? "Due date" : "Date"} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
      <Textarea aria-label={kind === "note" ? "Text" : "Notes"} rows={3} placeholder={kind === "note" ? "What did you learn?" : "Notes"} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------- rows

/** The Regarding pill: where an item belongs, changed in place. Amber "Link to…" when Unlinked. */
function RegardingPill({ item, record }: { item: MailItem; record: RecordRef }) {
  const manage = useMayManage(item)
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const here = item.regarding && item.regarding.type === record.type && item.regarding.id === record.id
  const label = item.regarding ? (here ? `This ${TYPE_NAMES[record.type]}` : item.regarding.name) : "Unlinked · Link to…"
  const pill = cn(
    "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
    item.regarding ? "text-muted-foreground" : "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-200",
  )
  if (!manage)
    return item.regarding && !here ? (
      <Link to={recordHref(item.regarding)} className={cn(pill, "text-primary hover:underline")}>
        <Link2 aria-hidden className="size-3" />
        <span className="truncate">{label}</span>
      </Link>
    ) : (
      <span className={pill}>{label}</span>
    )
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={cn(pill, "hover:bg-accent")} aria-label={`Regarding: ${label}. Change`}>
            <Link2 aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{label}</span>
            <ChevronDown aria-hidden className="size-3 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-2">
          <RegardingCommand
            item={item}
            className="border-0"
            onPick={(ref) => {
              setRegarding(item.id, ref)
              setOpen(false)
            }}
          />
          <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
            {item.regarding && !here && (
              <Button asChild size="sm" variant="ghost">
                <Link to={recordHref(item.regarding)}>Open</Link>
              </Button>
            )}
            {item.regarding && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRegarding(item.id, undefined)
                  setOpen(false)
                }}
              >
                <Unlink aria-hidden />
                Clear
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-destructive"
              onClick={() => {
                setOpen(false)
                setRemoving(true)
              }}
            >
              <Trash2 aria-hidden />
              Remove from the app
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {removing && <RemoveDialog item={item} onConfirm={() => removeItem(item.id)} onClose={() => setRemoving(false)} />}
    </>
  )
}

function ThreadC({ mails, record }: { mails: EmailItem[]; record: RecordRef }) {
  const [open, setOpen] = useState(false)
  const last = mails[mails.length - 1]
  const people = [...new Set(mails.flatMap((m) => [m.from, ...m.to, ...m.cc]).map(nameOf))].filter((n) => n !== "You")
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      {mails.length > 1 ? <MessagesSquare aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <MailIcon item={last} className="mt-0.5" />}
      <div className="min-w-0 flex-1 space-y-1">
        <button type="button" className="flex w-full flex-wrap items-baseline gap-x-2 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="font-medium break-words">{mails[0].subject.replace(/^RE:\s*/i, "")}</span>
          {mails.length > 1 && <Badge variant="secondary">{mails.length}</Badge>}
        </button>
        <p className="text-xs text-muted-foreground">
          {mails.length > 1 ? "Conversation" : mailKindText(last)} with {people.join(", ")} · {whenText(last.on)}
        </p>
        <RegardingPill item={last} record={record} />
        {!open ? (
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground">{last.direction === "incoming" ? nameOf(last.from) : "You"}:</span> {snippet(last.body)}
          </p>
        ) : (
          <ol className="space-y-2 border-l-2 pl-3">
            {mails.map((m) => (
              <li key={m.id} className="space-y-1">
                <p className="text-xs font-medium">
                  {m.direction === "incoming" ? nameOf(m.from) : "You"} <span className="font-normal text-muted-foreground">· {whenText(m.on)}</span>
                </p>
                <Body item={m} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </li>
  )
}

function MeetingRowC({ item, record }: { item: MeetingItem; record: RecordRef }) {
  const [open, setOpen] = useState(false)
  const d = new Date(item.start)
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <div className={cn("flex w-11 shrink-0 flex-col items-center rounded-md border py-1 text-center leading-tight", item.cancelled && "border-dashed text-muted-foreground")}>
        <span className="text-[10px] text-muted-foreground uppercase">{d.toLocaleDateString("en-GB", { month: "short" })}</span>
        <span className="text-base font-semibold">{d.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <button type="button" className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className={cn("font-medium break-words", item.cancelled && "text-muted-foreground line-through")}>{item.subject}</span>
          <MailBadges item={item} showUnlinked={false} />
        </button>
        <p className="text-xs text-muted-foreground">
          {timeText(item.start)}–{timeText(item.end)} · {item.attendees.map(nameOf).join(", ")}
          {item.location && ` · ${item.location}`}
        </p>
        <RegardingPill item={item} record={record} />
        {open && (
          <div className="space-y-2 rounded-md bg-muted/50 p-3">
            <Headers item={item} />
            <Body item={item} />
          </div>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------- Home

/** Replaces "My open Tasks": Tasks and Planned Meetings by day. */
export function AgendaCardC({ tasks, Section }: { tasks: Task[]; Section: (p: { title: string; children: ReactNode }) => ReactNode }) {
  const meetings = plannedMeetings(useMailItems())
  const today = toDateOnly(new Date())
  type Item = { key: string; day: string; sort: string; node: ReactNode }
  const list: Item[] = [
    ...tasks.map((t) => {
      const overdue = isTaskOverdue(t, today)
      return {
        key: t.id,
        day: overdue ? "Overdue" : t.dueDate ? dayText(`${t.dueDate}T12:00:00`) : "No due date",
        sort: overdue ? "0" : t.dueDate ? `${t.dueDate}T23:59` : "9",
        node: (
          <li key={t.id} className="flex items-start gap-2 py-2">
            <ListTodo aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">{t.subject}</p>
              <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                <Link to={recordHref(t.regarding)} className="text-primary hover:underline">
                  {t.regardingName}
                </Link>
                {overdue && t.dueDate && <span className="text-destructive">Due {formatDate(t.dueDate)}</span>}
              </p>
            </div>
            <CompleteTaskButton task={t} />
          </li>
        ),
      }
    }),
    ...meetings.map((m) => ({
      key: m.id,
      day: dayText(m.start),
      sort: m.start,
      node: (
        <li key={m.id} className="flex items-start gap-2 py-2">
          <MailIcon item={m} className="mt-1" />
          <div className="min-w-0 flex-1">
            <p className="font-medium break-words">
              <span className="mr-2 text-sm text-muted-foreground tabular-nums">{timeText(m.start)}</span>
              {m.subject}
            </p>
            <p className="text-sm text-muted-foreground">
              {m.regarding ? (
                <Link to={recordHref(m.regarding)} className="text-primary hover:underline">
                  {m.regarding.name}
                </Link>
              ) : (
                <MailBadges item={m} />
              )}
            </p>
          </div>
        </li>
      ),
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort))
  const groups: { day: string; items: Item[] }[] = []
  for (const i of list) {
    const g = groups.find((x) => x.day === i.day)
    if (g) g.items.push(i)
    else groups.push({ day: i.day, items: [i] })
  }
  return (
    <Section title="Agenda">
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing planned. Nice work.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.day} aria-label={g.day}>
              <h3 className={cn("text-xs font-medium tracking-wide uppercase", g.day === "Overdue" ? "text-destructive" : "text-muted-foreground")}>{g.day}</h3>
              <ul className="divide-y">{g.items.map((i) => i.node)}</ul>
            </section>
          ))}
        </div>
      )}
    </Section>
  )
}

/** Full width under the cards: every Unlinked item with its best suggestion preselected, and bulk linking. */
export function ToLinkTableC() {
  const unlinked = toLink(useMailItems())
  const [checked, setChecked] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const sel = unlinked.filter((i) => checked.includes(i.id))
  if (unlinked.length === 0) return null
  return (
    <RecordSection
      title={`To link (${unlinked.length})`}
      action={
        sel.length > 0 && (
          <Popover open={bulkOpen} onOpenChange={setBulkOpen}>
            <PopoverTrigger asChild>
              <Button size="sm">
                <Link2 aria-hidden />
                Link {sel.length} to…
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-2">
              <RegardingCommand
                item={sel[0]}
                className="border-0"
                onPick={(ref) => {
                  sel.forEach((i) => setRegarding(i.id, ref))
                  setChecked([])
                  setBulkOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
        )
      }
    >
      <p className="mb-2 text-sm text-muted-foreground">Logged from your mailbox, but more than one record could fit. They show on the people's timelines meanwhile.</p>
      <ul className="divide-y">
        {unlinked.map((i) => {
          const sugg = suggestionsFor(i)
          const value = choice[i.id] ?? (sugg[0] ? `${sugg[0].type}:${sugg[0].id}` : "")
          return (
            <li key={i.id} className="grid gap-2 py-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,18rem)_auto] md:items-center">
              <Checkbox
                aria-label={`Select ${i.subject}`}
                checked={checked.includes(i.id)}
                onCheckedChange={(c) => setChecked((l) => (c ? [...l, i.id] : l.filter((x) => x !== i.id)))}
                className="hidden md:inline-flex"
              />
              <div className="flex min-w-0 items-start gap-2">
                <MailIcon item={i} className="mt-1" />
                <div className="min-w-0">
                  <p className="font-medium break-words">{i.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {mailKindText(i)} · {whenText(i.kind === "email" ? i.on : i.start)}
                  </p>
                </div>
              </div>
              <NativeSelect aria-label={`Regarding for ${i.subject}`} value={value} onChange={(e) => setChoice((c) => ({ ...c, [i.id]: e.target.value }))}>
                {sugg.map((s) => (
                  <option key={s.type + s.id} value={`${s.type}:${s.id}`}>
                    {TYPE_NAMES[s.type]}: {s.name}
                  </option>
                ))}
              </NativeSelect>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  disabled={!value}
                  onClick={() => {
                    const [type, id] = value.split(":") as [RecordRef["type"], string]
                    setRegarding(i.id, { type, id })
                  }}
                >
                  Link
                </Button>
                <RemoveButtonC item={i} />
              </div>
            </li>
          )
        })}
      </ul>
    </RecordSection>
  )
}

function RemoveButtonC({ item }: { item: MailItem }) {
  const [removing, setRemoving] = useState(false)
  return (
    <>
      <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label={`Remove ${item.subject} from the app`} onClick={() => setRemoving(true)}>
        <Trash2 aria-hidden />
      </Button>
      {removing && <RemoveDialog item={item} onConfirm={() => removeItem(item.id)} onClose={() => setRemoving(false)} />}
    </>
  )
}

