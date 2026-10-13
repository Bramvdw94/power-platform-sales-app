import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Plus } from "lucide-react"
import { FormAlert, FormField } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useGateway } from "@/hooks/use-gateway"
import { describeError, fieldErrorsOf } from "@/lib/errors"
import { entrySummary } from "@/lib/process-labels"
import type { ProcessKind } from "@/sales"
import { useCanBuild, useProcessList, useRefreshProcesses } from "./use-process-admin"
import { ProcessStatusBadges } from "./process-status"

const TABLES: { value: ProcessKind; label: string }[] = [
  { value: "opportunity", label: "Opportunities" },
  { value: "lead", label: "Leads" },
]

/** The Processes of each table in priority order, with Entry criteria and status. */
export function ProcessesTab() {
  const [params, setParams] = useSearchParams()
  const table: ProcessKind = params.get("table") === "lead" ? "lead" : "opportunity"
  const canBuild = useCanBuild()
  const list = useProcessList(table)
  const gateway = useGateway()
  const refresh = useRefreshProcesses()
  const [creating, setCreating] = useState(false)

  const move = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: "up" | "down" }) => gateway.moveProcessPriority(id, direction),
    onSuccess: refresh,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Table" className="inline-flex rounded-lg bg-muted p-[3px]">
          {TABLES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={table === t.value}
              onClick={() => setParams({ table: t.value })}
              className="h-8 rounded-md px-3 text-sm font-medium text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm dark:aria-pressed:bg-input/30"
            >
              {t.label}
            </button>
          ))}
        </div>
        {canBuild && (
          <Button className="ml-auto" onClick={() => setCreating(true)}>
            <Plus aria-hidden /> New process
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        A new {table === "lead" ? "Lead" : "Opportunity"} follows the first Process, from the top, whose Entry criteria match it; the fallback gets the rest.
      </p>

      {list.isError ? (
        <FormAlert error={list.error} />
      ) : list.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : list.data.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">No Processes for {table === "lead" ? "Leads" : "Opportunities"} yet. New records behave as before.</p>
      ) : (
        <ol aria-label="Processes" className="divide-y rounded-md border">
          {list.data.map((process, index) => (
            <li key={process.id} className="flex items-start gap-3 p-3">
              <span className="mt-1 w-5 shrink-0 text-center text-sm text-muted-foreground" aria-hidden>
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/automation/processes/${process.id}`} className="font-medium underline-offset-4 hover:underline">
                    {process.name}
                  </Link>
                  <ProcessStatusBadges process={process} />
                </div>
                <p className="text-sm text-muted-foreground">{entrySummary(process)}</p>
              </div>
              {canBuild && (
                <div className="flex shrink-0">
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${process.name} up`} disabled={index === 0 || move.isPending} onClick={() => move.mutate({ id: process.id, direction: "up" })}>
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${process.name} down`}
                    disabled={index === list.data.length - 1 || move.isPending}
                    onClick={() => move.mutate({ id: process.id, direction: "down" })}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {move.isError && <FormAlert error={move.error} />}
      {creating && <NewProcessDialog table={table} onClose={() => setCreating(false)} />}
    </div>
  )
}

function NewProcessDialog({ table, onClose }: { table: ProcessKind; onClose: () => void }) {
  const gateway = useGateway()
  const navigate = useNavigate()
  const refresh = useRefreshProcesses()
  const [name, setName] = useState("")
  const create = useMutation({
    mutationFn: () => gateway.createProcess(table, name),
    onSuccess: async (process) => {
      await refresh()
      navigate(`/automation/processes/${process.id}`)
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate()
  }
  const problem = fieldErrorsOf(create.error).name
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New {table === "lead" ? "Lead" : "Opportunity"} process</DialogTitle>
            <DialogDescription>It starts as a draft with no Steps. Nobody gets it until you Publish.</DialogDescription>
          </DialogHeader>
          <FormField id="new-process-name" label="Name" required error={problem}>
            <Input id="new-process-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-invalid={problem ? true : undefined} />
          </FormField>
          {create.isError && !problem && <p role="alert" className="text-sm text-destructive">{describeError(create.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
