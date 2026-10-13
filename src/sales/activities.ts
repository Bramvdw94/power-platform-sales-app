import type { Activity, Task } from "./types"

function isOpenTask(activity: Activity): activity is Task {
  return activity.kind === "task" && !activity.completed
}

/** The activity timeline: open Tasks pinned on top (earliest due first), then everything else newest first. */
export function orderTimeline(activities: readonly Activity[]): Activity[] {
  const openTasks = sortOpenTasks(activities.filter(isOpenTask))
  const rest = activities
    .filter((a) => !isOpenTask(a))
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
  return [...openTasks, ...rest]
}

/**
 * Open Tasks for Home: earliest due date first, so overdue Tasks come before
 * anything due today or later; Tasks without a due date go last.
 */
export function sortOpenTasks<T extends Pick<Task, "dueDate" | "createdOn">>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate === b.dueDate) return a.createdOn.localeCompare(b.createdOn)
    if (a.dueDate === undefined) return 1
    if (b.dueDate === undefined) return -1
    return a.dueDate.localeCompare(b.dueDate)
  })
}

/** The kinds of record an Account's timeline gathers from, as the filter groups them. */
export type TimelineSource = "account" | "contact" | "opportunity" | "lead"

export const TIMELINE_PAGE_SIZE = 50

export type TimelineFilter = {
  kinds: readonly Activity["kind"][]
  sources: readonly TimelineSource[]
}

/** Keeps the activities of the checked types and sources; an empty list on either side means "all". */
export function filterTimeline(activities: readonly Activity[], filter: TimelineFilter): Activity[] {
  return activities.filter(
    (a) =>
      (filter.kinds.length === 0 || filter.kinds.includes(a.kind)) &&
      (filter.sources.length === 0 || filter.sources.includes(a.regarding.type)),
  )
}
