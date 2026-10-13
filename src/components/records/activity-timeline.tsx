import { useState, type FormEvent } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { CheckCircle2, CircleCheck, ListTodo, Phone, PhoneIncoming, PhoneOutgoing, StickyNote } from "lucide-react"
import { FormAlert, FormField } from "@/components/records/fields"
import { RecordSection } from "@/components/records/record-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { describeError, fieldErrorsOf } from "@/lib/errors"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  filterTimeline,
  isTaskOverdue,
  noteErrors,
  phoneCallErrors,
  taskErrors,
  TIMELINE_PAGE_SIZE,
  toDateOnly,
  type Activity,
  type FieldErrors,
  type PhoneCallDirection,
  type RecordRef,
  type RecordType,
  type TimelineSource,
  type Task,
} from "@/sales"

type ActivityKind = Activity["kind"]

const ADD_LABELS: Record<ActivityKind, string> = { note: "New Note", task: "New Task", phoneCall: "Log Phone Call" }

/**
 * The activity timeline of a Lead, Opportunity, Account or Contact: its own
 * Notes, Tasks and Phone Calls, open Tasks pinned on top, then newest first.
 * An Account's also gathers those of its Contacts, Opportunities and their
 * originating Leads, labelled by source and filterable. The Owner and the
 * Owner's manager get quick-add buttons, which always create on this record.
 */
export function ActivityTimeline({ record, canAdd }: { record: RecordRef; canAdd: boolean }) {
  const gateway = useGateway()
  const [adding, setAdding] = useState<ActivityKind | undefined>()
  const [filter, setFilter] = useState<{ kinds: ActivityKind[]; sources: TimelineSource[] }>({ kinds: [], sources: [] })
  const [shown, setShown] = useState(TIMELINE_PAGE_SIZE)
  const related = record.type === "account"
  const { data: all, error, isPending } = useQuery({
    queryKey: related ? ["account-timeline", record.id] : ["activities", record.type, record.id],
    queryFn: () => (related ? gateway.listAccountTimeline(record.id) : gateway.listActivities(record)),
  })
  const data = all && filterTimeline(all, filter)
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

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
          </div>
        )
      }
    >
      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {describeError(error)}
        </p>
      ) : all.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activities yet.</p>
      ) : (
        <>
          {related && (
            <div className="mb-3 space-y-2">
              <FilterChips
                label="Type"
                options={KIND_FILTERS}
                selected={filter.kinds}
                onToggle={(kind) => {
                  setFilter((f) => ({ ...f, kinds: toggle(f.kinds, kind) }))
                  setShown(TIMELINE_PAGE_SIZE)
                }}
              />
              <FilterChips
                label="Source"
                options={SOURCE_FILTERS}
                selected={filter.sources}
                onToggle={(source) => {
                  setFilter((f) => ({ ...f, sources: toggle(f.sources, source) }))
                  setShown(TIMELINE_PAGE_SIZE)
                }}
              />
            </div>
          )}
          {data!.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activities match these filters.</p>
          ) : (
            <ol aria-label="Activity timeline" className="divide-y">
              {data!.slice(0, shown).map((activity) => (
                <TimelineItem key={activity.id} activity={activity} showSource={related && !isOwnActivity(activity, record)} />
              ))}
            </ol>
          )}
          {data!.length > shown && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShown((n) => n + TIMELINE_PAGE_SIZE)}>
              Show more
            </Button>
          )}
        </>
      )}
      {adding && <AddActivityDialog record={record} kind={adding} onClose={() => setAdding(undefined)} />}
    </RecordSection>
  )
}

const KIND_FILTERS: { value: ActivityKind; label: string }[] = [
  { value: "note", label: "Notes" },
  { value: "task", label: "Tasks" },
  { value: "phoneCall", label: "Calls" },
]

const SOURCE_FILTERS: { value: TimelineSource; label: string }[] = [
  { value: "account", label: "This Account" },
  { value: "contact", label: "Contacts" },
  { value: "opportunity", label: "Opportunities" },
  { value: "lead", label: "Leads" },
]

const SOURCE_NAMES: Record<RecordType, string> = { account: "Account", contact: "Contact", opportunity: "Opportunity", lead: "Lead" }
const SOURCE_PATHS: Record<RecordType, string> = { account: "accounts", contact: "contacts", opportunity: "opportunities", lead: "leads" }

function isOwnActivity(activity: Activity, record: RecordRef) {
  return activity.regarding.type === record.type && activity.regarding.id === record.id
}

function FilterChips<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: { value: T; label: string }[]
  selected: readonly T[]
  onToggle: (value: T) => void
}) {
  return (
    <div role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-muted-foreground">{label}</span>
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={selected.includes(option.value) ? "secondary" : "outline"}
          aria-pressed={selected.includes(option.value)}
          onClick={() => onToggle(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

function TimelineItem({ activity, showSource = false }: { activity: Activity; showSource?: boolean }) {
  const today = toDateOnly(new Date())
  const title = activity.kind === "note" ? activity.title || "Note" : activity.subject
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <ActivityIcon activity={activity} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cn("font-medium break-words", activity.kind === "task" && activity.completed && "text-muted-foreground line-through")}>
            {title}
          </span>
          {activity.kind === "task" && !activity.completed && activity.dueDate && (
            <span className={cn("text-xs", isTaskOverdue(activity, today) ? "text-destructive" : "text-muted-foreground")}>
              Due {formatDate(activity.dueDate)}
            </span>
          )}
          {activity.kind === "task" && isTaskOverdue(activity, today) && <Badge variant="destructive">Overdue</Badge>}
          {activity.kind === "phoneCall" && !activity.completed && <Badge variant="outline">Planned</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{describeMeta(activity)}</p>
        {showSource && (
          <p className="text-xs">
            <Link
              to={`/${SOURCE_PATHS[activity.regarding.type]}/${activity.regarding.id}`}
              className="text-primary hover:underline"
            >
              {SOURCE_NAMES[activity.regarding.type]} · {activity.regardingName}
            </Link>
          </p>
        )}
        {activityText(activity) && <p className="text-sm break-words whitespace-pre-line">{activityText(activity)}</p>}
      </div>
      {activity.kind === "task" && !activity.completed && <CompleteTaskButton task={activity} />}
    </li>
  )
}

function ActivityIcon({ activity }: { activity: Activity }) {
  const Icon =
    activity.kind === "note"
      ? StickyNote
      : activity.kind === "task"
        ? activity.completed
          ? CheckCircle2
          : ListTodo
        : activity.direction === "incoming"
          ? PhoneIncoming
          : PhoneOutgoing
  return <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
}

/** "Task · Adele Vance · 9 Oct 2026": what it is, who owns it and when. */
function describeMeta(activity: Activity): string {
  switch (activity.kind) {
    case "note":
      return ["Note", activity.ownerName, formatDate(activity.createdOn)].filter(Boolean).join(" · ")
    case "task":
      return [
        activity.completed ? "Completed Task" : "Task",
        activity.ownerName,
        formatDate(activity.completed && activity.completedOn ? activity.completedOn : activity.createdOn),
      ]
        .filter(Boolean)
        .join(" · ")
    case "phoneCall":
      return [
        activity.direction === "incoming" ? "Incoming call" : "Outgoing call",
        activity.ownerName,
        formatDate(activity.date),
      ]
        .filter(Boolean)
        .join(" · ")
  }
}

function activityText(activity: Activity): string | undefined {
  switch (activity.kind) {
    case "note":
      return activity.text || undefined
    case "task":
      return activity.description
    case "phoneCall":
      return activity.notes
  }
}

/** Shown on every open Task; Dataverse refuses users who are neither its Owner nor their manager. */
export function CompleteTaskButton({ task }: { task: Task }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const { data: me } = useCurrentUser()
  const complete = useMutation({ mutationFn: () => gateway.completeTask(task.id), onSuccess: () => invalidate() })
  const mayComplete = me && (task.ownerId === me.user.id || me.directReports.some((r) => r.id === task.ownerId))
  if (!mayComplete) return null
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Complete ${task.subject}`}
        disabled={complete.isPending}
        onClick={() => complete.mutate()}
      >
        <CircleCheck aria-hidden />
        Complete
      </Button>
      {complete.isError && <FormAlert error={complete.error} className="max-w-48 text-xs" />}
    </div>
  )
}

type DialogValues = {
  title: string
  text: string
  subject: string
  description: string
  dueDate: string
  direction: PhoneCallDirection | ""
  date: string
}

function emptyValues(): DialogValues {
  return { title: "", text: "", subject: "", description: "", dueDate: "", direction: "outgoing", date: toDateOnly(new Date()) }
}

/** Quick-add: a Note (title, text), a Task (subject, description, due date) or a Phone Call (subject, direction, date, notes). */
function AddActivityDialog({ record, kind, onClose }: { record: RecordRef; kind: ActivityKind; onClose: () => void }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState(emptyValues)
  const [errors, setErrors] = useState<FieldErrors>({})
  const set = (name: keyof DialogValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value }))

  const add = useMutation({
    mutationFn: async () => {
      switch (kind) {
        case "note":
          return gateway.addNote(record, { title: values.title.trim(), text: values.text.trim() })
        case "task":
          return gateway.addTask(record, {
            subject: values.subject.trim(),
            description: values.description.trim() || undefined,
            dueDate: values.dueDate || undefined,
          })
        case "phoneCall":
          return gateway.addPhoneCall(record, {
            subject: values.subject.trim(),
            direction: values.direction as PhoneCallDirection,
            date: values.date,
            notes: values.description.trim() || undefined,
          })
      }
    },
    onSuccess: async () => {
      await invalidate()
      onClose()
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found =
      kind === "note"
        ? noteErrors(values)
        : kind === "task"
          ? taskErrors({ subject: values.subject, dueDate: values.dueDate || undefined })
          : phoneCallErrors(values)
    setErrors(found)
    if (Object.keys(found).length === 0) add.mutate()
  }

  const field = (name: keyof DialogValues) => ({
    id: `activity-${name}`,
    value: values[name],
    onChange: set(name),
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `activity-${name}-error` : undefined,
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{ADD_LABELS[kind]}</DialogTitle>
            <DialogDescription>
              {kind === "note"
                ? "Capture what you learned."
                : kind === "task"
                  ? "Plan a follow-up. It shows on your Home until you complete it."
                  : "Record a call that happened."}
            </DialogDescription>
          </DialogHeader>
          {kind === "note" ? (
            <>
              <FormField id="activity-title" label="Title" error={errors.title}>
                <Input {...field("title")} />
              </FormField>
              <FormField id="activity-text" label="Text" error={errors.text}>
                <Textarea {...field("text")} rows={4} />
              </FormField>
            </>
          ) : (
            <>
              <FormField id="activity-subject" label="Subject" required error={errors.subject}>
                <Input {...field("subject")} required />
              </FormField>
              {kind === "task" ? (
                <FormField id="activity-dueDate" label="Due date" error={errors.dueDate}>
                  <Input {...field("dueDate")} type="date" />
                </FormField>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id="activity-direction" label="Direction" required error={errors.direction}>
                    <select
                      {...field("direction")}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none md:text-sm dark:bg-input/30"
                    >
                      <option value="outgoing">Outgoing</option>
                      <option value="incoming">Incoming</option>
                    </select>
                  </FormField>
                  <FormField id="activity-date" label="Date" required error={errors.date}>
                    <Input {...field("date")} type="date" required />
                  </FormField>
                </div>
              )}
              <FormField id="activity-description" label={kind === "task" ? "Description" : "Notes"} error={errors.description}>
                <Textarea {...field("description")} rows={3} />
              </FormField>
            </>
          )}
          {add.isError && <FormAlert error={add.error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
