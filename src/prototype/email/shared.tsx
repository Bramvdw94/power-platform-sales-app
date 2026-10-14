/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): pieces the three variants share (#154).
// Only small building blocks live here; each variant owns its own layout.

import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Ban, CalendarCheck, CalendarClock, CalendarX, Mail, MailOpen, Send, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormField } from "@/components/records/fields"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useGateway } from "@/hooks/use-gateway"
import { cn } from "@/lib/utils"
import { toDateOnly, type Activity, type RecordRef } from "@/sales"
import {
  addressBook,
  defaultRecipient,
  itemDate,
  mayManage,
  meetingState,
  nameOf,
  regardingCatalogue,
  suggestionsFor,
  TYPE_NAMES,
  type EmailDraft,
  type MailItem,
  type MeetingDraft,
  type MeetingItem,
} from "./model"
import "./prototype.css"

export const VARIANTS = [
  { key: "A", name: "Rows and dialogs" },
  { key: "B", name: "Reading pane" },
  { key: "C", name: "Composer and agenda" },
]

// ---------------------------------------------------------------- timeline data

export type Entry = { key: string; date: string; activity?: Activity; item?: MailItem }

function activityDate(a: Activity): string {
  if (a.kind === "task") return a.completed && a.completedOn ? a.completedOn : a.createdOn
  if (a.kind === "phoneCall") return `${a.date}T09:00:00.000Z`
  return a.createdOn
}

/** The record's own activities from the gateway, as the real timeline loads them. */
export function useRecordActivities(record: RecordRef) {
  const gateway = useGateway()
  const related = record.type === "account"
  return useQuery({
    queryKey: related ? ["account-timeline", record.id] : ["activities", record.type, record.id],
    queryFn: () => (related ? gateway.listAccountTimeline(record.id) : gateway.listActivities(record)),
  })
}

/** Activities and mail items in one list, newest first. */
export function mergeEntries(activities: readonly Activity[], items: readonly MailItem[]): Entry[] {
  return [
    ...activities.map((a) => ({ key: a.id, date: activityDate(a), activity: a })),
    ...items.map((i) => ({ key: i.id, date: itemDate(i), item: i })),
  ].sort((a, b) => b.date.localeCompare(a.date))
}

export function isUpcoming(e: Entry): boolean {
  if (e.activity) return (e.activity.kind === "task" || e.activity.kind === "phoneCall") && !e.activity.completed
  return e.item!.kind === "meeting" && meetingState(e.item!) === "planned"
}

export type KindFilter = "note" | "task" | "phoneCall" | "email" | "meeting"
export const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "note", label: "Notes" },
  { value: "task", label: "Tasks" },
  { value: "phoneCall", label: "Calls" },
  { value: "email", label: "Emails" },
  { value: "meeting", label: "Meetings" },
]
export function kindOf(e: Entry): KindFilter {
  return e.activity ? e.activity.kind : e.item!.kind
}

// ---------------------------------------------------------------- small pieces

export function MailIcon({ item, className }: { item: MailItem; className?: string }) {
  const cls = cn("size-4 shrink-0 text-muted-foreground", className)
  if (item.kind === "email") return item.direction === "incoming" ? <Mail aria-hidden className={cls} /> : <Send aria-hidden className={cls} />
  const s = meetingState(item)
  const Icon = s === "planned" ? CalendarClock : s === "held" ? CalendarCheck : CalendarX
  return <Icon aria-hidden className={cls} />
}

export function MailBadges({ item, showUnlinked = true }: { item: MailItem; showUnlinked?: boolean }) {
  return (
    <>
      {item.kind === "meeting" && meetingState(item) === "planned" && <Badge variant="outline">Planned</Badge>}
      {item.kind === "meeting" && meetingState(item) === "cancelled" && (
        <Badge variant="outline" className="text-muted-foreground line-through decoration-1">
          Cancelled
        </Badge>
      )}
      {showUnlinked && !item.regarding && (
        <Badge className="border-transparent bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">Unlinked</Badge>
      )}
    </>
  )
}

/** "Incoming email · Lotte de Groot" / "Meeting · 2 attendees". */
export function mailKindText(item: MailItem): string {
  if (item.kind === "email") return item.direction === "incoming" ? `Email from ${nameOf(item.from)}` : `Email to ${item.to.map(nameOf).join(", ")}`
  const s = meetingState(item)
  return `${s === "held" ? "Held meeting" : s === "cancelled" ? "Cancelled meeting" : "Meeting"} with ${item.attendees.map(nameOf).join(", ")}`
}

export function Headers({ item }: { item: MailItem }) {
  const row = (label: string, value: ReactNode) => (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  )
  if (item.kind === "email")
    return (
      <dl className="grid gap-0.5 text-xs">
        {row("From", nameOf(item.from))}
        {row("To", item.to.map(nameOf).join(", "))}
        {item.cc.length > 0 && row("Cc", item.cc.map(nameOf).join(", "))}
      </dl>
    )
  return (
    <dl className="grid gap-0.5 text-xs">
      {row("When", `${new Date(item.start).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} to ${new Date(item.end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`)}
      {row("Who", item.attendees.map(nameOf).join(", "))}
      {item.location && row("Where", item.location)}
      {row("From", item.plannedInApp ? "Planned in the app" : "Tracked from Outlook")}
    </dl>
  )
}

export function Body({ item, className }: { item: MailItem; className?: string }) {
  if (!item.body) return null
  return <p className={cn("text-sm break-words whitespace-pre-line", className)}>{item.body}</p>
}

/** The signed-in user may relink or remove this item (Owner or their manager). */
export function useMayManage(item: MailItem): boolean {
  const { data: me } = useCurrentUser()
  return !!me && mayManage(item, me.user.id, me.directReports.map((r) => r.id))
}

// ---------------------------------------------------------------- Regarding search

/** Suggestions first, then everything an item can be about. Shared by the variants' own Regarding controls. */
export function RegardingCommand({ item, onPick, className }: { item: MailItem; onPick: (ref: RecordRef) => void; className?: string }) {
  const suggestions = suggestionsFor(item)
  const all = useMemo(regardingCatalogue, [])
  return (
    <Command className={cn("rounded-md border", className)}>
      <CommandInput placeholder="Search Opportunities, Leads, Accounts, Contacts" />
      <CommandList className="max-h-64">
        <CommandEmpty>Nothing found.</CommandEmpty>
        {suggestions.length > 0 && (
          <CommandGroup heading="Suggested">
            {suggestions.map((s) => (
              <CommandItem key={`s-${s.type}-${s.id}`} value={`suggested ${s.name} ${s.type}`} onSelect={() => onPick(s)}>
                <div className="min-w-0">
                  <p className="truncate">{s.name}</p>
                  <p className="truncate text-xs text-foreground/70">
                    {TYPE_NAMES[s.type]} · {s.why}
                  </p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="All records">
          {all.map((r) => (
            <CommandItem key={`a-${r.type}-${r.id}`} value={`${r.name} ${r.detail}`} onSelect={() => onPick(r)}>
              <div className="min-w-0">
                <p className="truncate">{r.name}</p>
                <p className="truncate text-xs text-foreground/70">{r.detail}</p>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

// ---------------------------------------------------------------- Remove confirm

export function RemoveDialog({ item, onConfirm, onClose }: { item: MailItem; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove from the app?</DialogTitle>
          <DialogDescription>
            "{item.subject}" disappears from every timeline here. The {item.kind === "email" ? "mail stays in Outlook" : "meeting stays in your Outlook calendar"}, and it is not logged again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            <Ban aria-hidden />
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- address input

/** Chips plus a text box that suggests known Contacts and Leads; any address may be typed. */
export function AddressInput({ id, value, onChange, invalid }: { id: string; value: string[]; onChange: (v: string[]) => void; invalid?: boolean }) {
  const [text, setText] = useState("")
  const book = addressBook()
  const add = (raw: string) => {
    const v = raw.trim().replace(/[,;]$/, "")
    if (!v) return
    const hit = book.find((p) => p.email === v || p.name.toLowerCase() === v.toLowerCase())
    const email = hit?.email ?? v
    if (!value.includes(email)) onChange([...value, email])
    setText("")
  }
  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "border-destructive",
      )}
    >
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
          {nameOf(v)}
          <button type="button" aria-label={`Remove ${nameOf(v)}`} className="rounded-sm hover:bg-foreground/10" onClick={() => onChange(value.filter((x) => x !== v))}>
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={`${id}-book`}
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const v = e.target.value
          if (book.some((p) => p.email === v)) add(v)
          else setText(v)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "," || e.key === ";") {
            e.preventDefault()
            add(text)
          }
          if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => add(text)}
        className="min-w-32 flex-1 bg-transparent py-1 text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
        placeholder={value.length ? "" : "Name or email"}
      />
      <datalist id={`${id}-book`}>
        {book.map((p) => (
          <option key={p.email} value={p.email}>
            {p.name}
          </option>
        ))}
      </datalist>
    </div>
  )
}

// ---------------------------------------------------------------- forms

export function useEmailForm(record: RecordRef, initial?: Partial<EmailDraft>) {
  const to = defaultRecipient(record)
  const [values, setValues] = useState<EmailDraft>({ to: to?.email ? [to.email] : [], cc: [], subject: "", body: "", ...initial })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const validate = () => {
    const e: Record<string, string> = {}
    if (values.to.length === 0) e.to = "Add at least one recipient."
    if (!values.subject.trim()) e.subject = "Enter a subject."
    setErrors(e)
    return Object.keys(e).length === 0
  }
  return { values, setValues, errors, validate }
}

export function EmailFields({ form, idPrefix, bodyRows = 7, compact }: { form: ReturnType<typeof useEmailForm>; idPrefix: string; bodyRows?: number; compact?: boolean }) {
  const { values, setValues, errors } = form
  const [showCc, setShowCc] = useState(values.cc.length > 0)
  return (
    <div className={cn("grid", compact ? "gap-2" : "gap-4")}>
      <FormField id={`${idPrefix}-to`} label="To" required error={errors.to}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <AddressInput id={`${idPrefix}-to`} value={values.to} onChange={(to) => setValues((v) => ({ ...v, to }))} invalid={!!errors.to} />
          </div>
          {!showCc && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowCc(true)}>
              Cc
            </Button>
          )}
        </div>
      </FormField>
      {showCc && (
        <FormField id={`${idPrefix}-cc`} label="Cc">
          <AddressInput id={`${idPrefix}-cc`} value={values.cc} onChange={(cc) => setValues((v) => ({ ...v, cc }))} />
        </FormField>
      )}
      <FormField id={`${idPrefix}-subject`} label="Subject" required error={errors.subject}>
        <Input id={`${idPrefix}-subject`} value={values.subject} aria-invalid={!!errors.subject || undefined} onChange={(e) => setValues((v) => ({ ...v, subject: e.target.value }))} />
      </FormField>
      <FormField id={`${idPrefix}-body`} label="Message">
        <Textarea id={`${idPrefix}-body`} rows={bodyRows} value={values.body} onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))} />
      </FormField>
    </div>
  )
}

function nextHour(): { date: string; start: string; end: string } {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return { date: toDateOnly(d), start: "10:00", end: "11:00" }
}

export function useMeetingForm(record: RecordRef) {
  const to = defaultRecipient(record)
  const slot = nextHour()
  const [values, setValues] = useState<MeetingDraft>({ subject: "", date: slot.date, startTime: slot.start, endTime: slot.end, attendees: to?.email ? [to.email] : [], location: "", body: "" })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const validate = () => {
    const e: Record<string, string> = {}
    if (!values.subject.trim()) e.subject = "Enter a subject."
    if (!values.date) e.date = "Pick a date."
    if (values.endTime <= values.startTime) e.endTime = "End after the start."
    if (values.attendees.length === 0) e.attendees = "Invite at least one person."
    setErrors(e)
    return Object.keys(e).length === 0
  }
  return { values, setValues, errors, validate }
}

export function MeetingFields({ form, idPrefix, compact }: { form: ReturnType<typeof useMeetingForm>; idPrefix: string; compact?: boolean }) {
  const { values, setValues, errors } = form
  const set = (k: keyof MeetingDraft) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }))
  return (
    <div className={cn("grid", compact ? "gap-2" : "gap-4")}>
      <FormField id={`${idPrefix}-subject`} label="Subject" required error={errors.subject}>
        <Input id={`${idPrefix}-subject`} value={values.subject} onChange={set("subject")} aria-invalid={!!errors.subject || undefined} />
      </FormField>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <FormField id={`${idPrefix}-date`} label="Date" required error={errors.date} className="col-span-2 sm:col-span-1">
          <Input id={`${idPrefix}-date`} type="date" value={values.date} onChange={set("date")} />
        </FormField>
        <FormField id={`${idPrefix}-start`} label="Start" required>
          <Input id={`${idPrefix}-start`} type="time" step={900} value={values.startTime} onChange={set("startTime")} />
        </FormField>
        <FormField id={`${idPrefix}-end`} label="End" required error={errors.endTime}>
          <Input id={`${idPrefix}-end`} type="time" step={900} value={values.endTime} onChange={set("endTime")} aria-invalid={!!errors.endTime || undefined} />
        </FormField>
      </div>
      <FormField id={`${idPrefix}-attendees`} label="Attendees" required error={errors.attendees}>
        <AddressInput id={`${idPrefix}-attendees`} value={values.attendees} onChange={(attendees) => setValues((v) => ({ ...v, attendees }))} invalid={!!errors.attendees} />
      </FormField>
      <FormField id={`${idPrefix}-location`} label="Location">
        <Input id={`${idPrefix}-location`} value={values.location} onChange={set("location")} placeholder="Address, or Online" />
      </FormField>
      <FormField id={`${idPrefix}-body`} label="Agenda">
        <Textarea id={`${idPrefix}-body`} rows={compact ? 2 : 3} value={values.body} onChange={set("body")} />
      </FormField>
    </div>
  )
}

export const SEND_NOTE = "Sent from your Outlook mailbox and logged here. Replies are logged on this record too."
export const MEETING_NOTE = "Added to your Outlook calendar; the attendees get an invitation."

/** A small explanatory line under a composer. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <MailOpen aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </p>
  )
}

export function submitWith(validate: () => boolean, run: () => void) {
  return (e: FormEvent) => {
    e.preventDefault()
    if (validate()) run()
  }
}

export type { MeetingItem }
