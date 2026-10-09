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
