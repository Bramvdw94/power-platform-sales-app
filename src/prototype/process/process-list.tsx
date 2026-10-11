// PROTOTYPE (wayfinder #67): throwaway. Never merge to main.
/* eslint-disable react-refresh/only-export-components -- prototype */
// The Processes list: per table, in priority order; the first Process whose
// Entry criteria match a new record wins, then the fallback.

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowDown, ArrowUp, Plus, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createProcess, describeCheck, movePriority, useProcessState, type ProcessRecord, type ProcessTable } from "./model"

export function statusBadge(p: ProcessRecord) {
  const changed = p.published && JSON.stringify(p.published.def) !== JSON.stringify(p.draft)
  return (
    <span className="inline-flex flex-wrap gap-1">
      {p.status === "draft" && <Badge variant="outline">Draft</Badge>}
      {p.status === "published" && <Badge className="bg-green-600 text-white">Published v{p.published?.version}</Badge>}
      {p.status === "retired" && <Badge variant="secondary">Retired</Badge>}
      {changed && p.status !== "draft" && <Badge variant="outline">Unpublished changes</Badge>}
    </span>
  )
}

export default function ProcessListPage() {
  const { processes } = useProcessState()
  const navigate = useNavigate()
  const [table, setTable] = useState<ProcessTable>("opportunity")
  const rows = processes.filter((p) => p.draft.table === table).sort((a, b) => a.draft.priority - b.draft.priority)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Workflow className="size-6" aria-hidden />
            Processes
          </h1>
          <p className="text-sm text-muted-foreground">A new record gets the first published Process whose Entry criteria match, else the fallback.</p>
        </div>
        <Button onClick={() => navigate(`/processes/${createProcess(table)}`)}>
          <Plus aria-hidden />
          New Process
        </Button>
      </div>

      <div className="inline-flex rounded-md border p-0.5" role="tablist">
        {(["opportunity", "lead"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={table === t}
            onClick={() => setTable(t)}
            className={cn("rounded px-3 py-1 text-sm", table === t ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            {t === "opportunity" ? "Opportunities" : "Leads"}
          </button>
        ))}
      </div>

      <ol className="divide-y rounded-md border">
        {rows.map((p, i) => (
          <li key={p.draft.id} className="flex flex-wrap items-center gap-3 p-3">
            <span className="w-6 text-center text-sm text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <Link to={`/processes/${p.draft.id}`} className="font-medium text-primary hover:underline">
                {p.draft.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {p.draft.isFallback
                  ? "Fallback: any record no other Process matches"
                  : p.draft.entry.length
                    ? `When ${p.draft.entry.map((c) => describeCheck(table, c)).join(" and ")}`
                    : "No Entry criteria yet"}
                {" · "}
                {p.draft.steps.length} Steps
              </p>
            </div>
            {statusBadge(p)}
            <div className="flex">
              <Button variant="ghost" size="icon" aria-label="Higher priority" disabled={i === 0} onClick={() => movePriority(p.draft.id, -1)}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Lower priority" disabled={i === rows.length - 1} onClick={() => movePriority(p.draft.id, 1)}>
                <ArrowDown />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">Prototype: changes live in this browser tab only and are lost on reload.</p>
    </div>
  )
}
