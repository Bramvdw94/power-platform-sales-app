import { useState, type FormEvent } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
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
  isTaskOverdue,
  noteErrors,
  phoneCallErrors,
  taskErrors,
  toDateOnly,
  type Activity,
  type FieldErrors,
  type PhoneCallDirection,
  type RecordRef,
  type Task,
} from "@/sales"

type ActivityKind = Activity["kind"]

const ADD_LABELS: Record<ActivityKind, string> = { note: "New Note", task: "New Task", phoneCall: "Log Phone Call" }

/**
 * The activity timeline of a Lead, Opportunity, Account or Contact: its own
 * Notes, Tasks and Phone Calls, open Tasks pinned on top, then newest first.
 * The Owner and the Owner's manager get quick-add buttons.
 */
export function ActivityTimeline({ record, canAdd }: { record: RecordRef; canAdd: boolean }) {
  const gateway = useGateway()
  const [adding, setAdding] = useState<ActivityKind | undefined>()
  const { data, error, isPending } = useQuery({
    queryKey: ["activities", record.type, record.id],
    queryFn: () => gateway.listActivities(record),
  })

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
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activities yet.</p>
      ) : (
        <ol aria-label="Activity timeline" className="divide-y">
          {data.map((activity) => (
            <TimelineItem key={activity.id} activity={activity} />
          ))}
        </ol>
      )}
      {adding && <AddActivityDialog record={record} kind={adding} onClose={() => setAdding(undefined)} />}
    </RecordSection>
  )
}

function TimelineItem({ activity }: { activity: Activity }) {
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
