import { describe, expect, it } from "vitest"
import { filterTimeline, orderTimeline, sortOpenTasks } from "./activities"
import type { Activity } from "./types"

const base = { regarding: { type: "lead" as const, id: "l1" }, regardingName: "Sanne Bakker", ownerId: "adele", ownerName: "Adele Vance" }

const note = (id: string, createdOn: string): Activity => ({ ...base, id, kind: "note", title: id, text: "", createdOn })
const task = (id: string, createdOn: string, dueDate?: string, completed = false): Activity => ({
  ...base,
  id,
  kind: "task",
  subject: id,
  createdOn,
  dueDate,
  completed,
})

describe("orderTimeline", () => {
  it("pins open Tasks on top, then shows the rest newest first", () => {
    const timeline = orderTimeline([
      note("old note", "2026-10-01T10:00:00Z"),
      task("done task", "2026-10-05T10:00:00Z", "2026-10-06", true),
      task("open later", "2026-10-02T10:00:00Z", "2026-10-20"),
      note("new note", "2026-10-08T10:00:00Z"),
      task("open overdue", "2026-10-03T10:00:00Z", "2026-10-01"),
      task("open undated", "2026-10-04T10:00:00Z"),
    ])
    expect(timeline.map((a) => a.id)).toEqual([
      "open overdue",
      "open later",
      "open undated",
      "new note",
      "done task",
      "old note",
    ])
  })
})

describe("sortOpenTasks", () => {
  it("puts overdue first and undated last", () => {
    const tasks = [
      { id: "undated", createdOn: "2026-10-01T00:00:00Z" },
      { id: "today", dueDate: "2026-10-09", createdOn: "2026-10-01T00:00:00Z" },
      { id: "overdue", dueDate: "2026-10-02", createdOn: "2026-10-01T00:00:00Z" },
      { id: "today-older", dueDate: "2026-10-09", createdOn: "2026-09-01T00:00:00Z" },
    ]
    expect(sortOpenTasks(tasks).map((t) => t.id)).toEqual(["overdue", "today-older", "today", "undated"])
  })
})

describe("filterTimeline", () => {
  const extra = { ownerId: "u", ownerName: "U", createdOn: "2026-10-01T00:00:00Z", regardingName: "R" }
  const aNote: Activity = { ...extra, id: "n", kind: "note", title: "", text: "", regarding: { type: "contact", id: "c" } }
  const aCall: Activity = { ...extra, id: "p", kind: "phoneCall", subject: "", direction: "outgoing", date: "2026-10-01", completed: true, regarding: { type: "lead", id: "l" } }
  const aTask: Activity = { ...extra, id: "t", kind: "task", subject: "", completed: false, regarding: { type: "account", id: "a" } }

  it("keeps everything when nothing is checked", () => {
    expect(filterTimeline([aNote, aCall, aTask], { kinds: [], sources: [] })).toHaveLength(3)
  })

  it("filters by source and by type, both at once", () => {
    expect(filterTimeline([aNote, aCall, aTask], { kinds: [], sources: ["contact"] })).toEqual([aNote])
    expect(filterTimeline([aNote, aCall, aTask], { kinds: ["phoneCall", "task"], sources: ["lead", "contact"] })).toEqual([aCall])
  })
})
