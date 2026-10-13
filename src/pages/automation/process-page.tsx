import { useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { ConditionBuilder } from "@/components/conditions/condition-builder"
import { FormAlert } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { CommitInput } from "@/components/ui/commit-input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useGateway } from "@/hooks/use-gateway"
import type { ProcessDraftUpdate } from "@/data/gateway"
import { describeError } from "@/lib/errors"
import { formatDate } from "@/lib/format"
import { PROCESS_TABLE_NOUN } from "@/lib/process-labels"
import { asGroup, checkDraft, setEntryCriteria, type ProcessAdmin } from "@/sales"
import { isRelatedCheck, type EntryCriteria, type ProcessDefinition } from "@/sales/engine"
import { PublishDialog } from "./publish-dialog"
import { ProcessStatusBadges } from "./process-status"
import { StepsOutline } from "./steps-outline"
import { useCanBuild, useEngineErrors, useProcessAdmin, useProcessList, useRefreshProcesses } from "./use-process-admin"
import { VersionsPanel } from "./versions-panel"

export default function ProcessPage() {
  const { id = "" } = useParams()
  const process = useProcessAdmin(id)
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
      <Link to="/automation" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Automation
      </Link>
      {process.isError ? <FormAlert error={process.error} /> : process.isPending ? <Skeleton className="h-64 w-full" /> : <Loaded key={id} process={process.data} />}
    </div>
  )
}

/**
 * Edits go to a local draft that is saved as it changes; saves are sent one at a time, the latest
 * state last, so a quick run of edits never lands out of order.
 */
function useDraftSaver(processId: string) {
  const gateway = useGateway()
  const refresh = useRefreshProcesses()
  const pending = useRef<ProcessDraftUpdate | null>(null)
  const running = useRef<Promise<void> | null>(null)
  const [error, setError] = useState<unknown>()

  const drain = async () => {
    while (pending.current) {
      const update = pending.current
      pending.current = null
      try {
        await gateway.saveProcessDraft(processId, update)
        setError(undefined)
      } catch (e) {
        setError(e)
      }
    }
    await refresh()
  }
  const save = (update: ProcessDraftUpdate) => {
    pending.current = { ...pending.current, ...update }
    running.current ??= drain().finally(() => {
      running.current = null
    })
  }
  /** Resolves once every edit made so far has been saved. */
  const settled = async () => {
    while (running.current) await running.current
  }
  return { save, settled, error }
}

function Loaded({ process }: { process: ProcessAdmin }) {
  const canBuild = useCanBuild()
  const gateway = useGateway()
  const refresh = useRefreshProcesses()
  const list = useProcessList(process.table)
  const errors = useEngineErrors(process.id)
  const { save, settled, error: saveError } = useDraftSaver(process.id)
  const [draft, setDraft] = useState<ProcessDefinition>(process.draft)
  const [isFallback, setFallback] = useState(process.isFallback)
  const [publishing, setPublishing] = useState(false)
  const [retiring, setRetiring] = useState(false)
  const [notice, setNotice] = useState<string>()
  const editable = canBuild && !process.retired
  const noun = PROCESS_TABLE_NOUN[process.table]

  const issues = useMemo(() => checkDraft(draft).errors, [draft])
  const edit = (next: ProcessDefinition) => {
    setDraft(next)
    save({ definition: next })
  }

  const publish = useMutation({
    mutationFn: async () => {
      await settled()
      return gateway.publishProcess(process.id)
    },
    onSuccess: async (published) => {
      setPublishing(false)
      setNotice(`Published version ${published.latestVersionNumber}. Open records stay on the version they started on.`)
      await refresh()
    },
  })
  const retire = useMutation({
    mutationFn: async () => {
      await settled()
      return gateway.retireProcess(process.id)
    },
    onSuccess: async () => {
      setRetiring(false)
      setNotice("Retired. No new record gets this Process; records on it finish on it.")
      await refresh()
    },
  })

  const canPublish = editable && (!process.latestVersionId || process.hasUnpublishedChanges)

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 basis-full space-y-2 sm:flex-1 sm:basis-0">
            <p className="text-sm text-muted-foreground">{noun} process</p>
            {canBuild && !process.retired ? (
              <CommitInput
                aria-label="Process name"
                className="h-11 text-xl font-semibold"
                value={process.name}
                onCommit={(name) => name.trim() && save({ name: name.trim() })}
              />
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">{process.name}</h1>
            )}
            <ProcessStatusBadges process={process} />
          </div>
          {canBuild && !process.retired && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!canPublish} onClick={() => setPublishing(true)}>
                Publish
              </Button>
              {process.latestVersionId && (
                <Button type="button" variant="outline" onClick={() => setRetiring(true)}>
                  Retire
                </Button>
              )}
            </div>
          )}
        </div>
        {!canBuild && <p className="text-sm text-muted-foreground">You can read this Process. Only a Process builder can change it.</p>}
        {process.retired && <p className="text-sm text-muted-foreground">Retired: no new record gets this Process. Records already on it finish on it.</p>}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {saveError != null && <FormAlert error={saveError} />}
      </header>

      <section aria-labelledby="who" className="space-y-3">
        <h2 id="who" className="text-lg font-medium">
          Who gets it
        </h2>
        <fieldset disabled={!editable} className="grid min-w-0 gap-3 border-0 p-0 [&_:disabled]:opacity-100! [&_:disabled]:cursor-default">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={isFallback}
              onChange={(e) => {
                setFallback(e.target.checked)
                if (e.target.checked) setDraft(setEntryCriteria(draft, undefined))
                save({ isFallback: e.target.checked })
              }}
            />
            Use as the fallback for {noun === "Lead" ? "Leads" : "Opportunities"}
          </label>
          {isFallback ? (
            <p className="text-sm text-muted-foreground">Gets every new {noun} that no other Process matches. A fallback has no Entry criteria, and a table has only one.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                A new {noun} gets this Process when it matches these Entry criteria, unless a Process higher in the list matches first. It looks at the record's own fields and its parents one hop up, not at related records.
              </p>
              <ConditionBuilder
                table={process.table}
                kind="entry"
                label="Entry criteria"
                readOnly={!editable}
                value={asGroup(draft.entryCriteria)}
                onChange={(group) => {
                  const next: EntryCriteria = { match: group.match, conditions: group.conditions.filter((c) => !isRelatedCheck(c)) as EntryCriteria["conditions"] }
                  edit(setEntryCriteria(draft, next))
                }}
              />
            </>
          )}
        </fieldset>
      </section>

      <section aria-labelledby="steps" className="space-y-3">
        <h2 id="steps" className="text-lg font-medium">
          Steps
        </h2>
        {editable && issues.length > 0 && draft.steps.length > 0 && (
          <div role="status" aria-label="Before you can Publish" className="rounded-md border border-amber-600/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">Before you can Publish</p>
            <ul className="list-disc space-y-1 pl-5">
              {issues.map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
        <StepsOutline table={process.table} draft={draft} editable={editable} onChange={edit} issues={issues} />
      </section>

      <section aria-labelledby="versions" className="space-y-3">
        <h2 id="versions" className="text-lg font-medium">
          Versions
        </h2>
        <VersionsPanel process={process} others={list.data ?? []} canBuild={canBuild} />
      </section>

      {errors.data && errors.data.length > 0 && (
        <section aria-labelledby="errors" className="space-y-3">
          <h2 id="errors" className="text-lg font-medium text-destructive">
            Engine errors
          </h2>
          <p className="text-sm text-muted-foreground">An Action or Entry criteria of this Process could not run. The records were saved without it.</p>
          <ul aria-label="Engine errors" className="divide-y rounded-md border">
            {errors.data.map((e) => (
              <li key={e.id} className="space-y-0.5 p-2.5 text-sm">
                <p>{e.message}</p>
                <p className="text-muted-foreground">
                  {e.code}
                  {e.actionId ? ` · Action ${e.actionId}` : ""}
                  {e.occurredOn ? ` · ${formatDate(e.occurredOn)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {publishing && (
        <PublishDialog process={process} publishing={publish.isPending} error={publish.error} onConfirm={() => publish.mutate()} onClose={() => setPublishing(false)} />
      )}
      {retiring && (
        <Dialog open onOpenChange={(open) => !open && setRetiring(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Retire “{process.name}”?</DialogTitle>
              <DialogDescription>
                No new {noun} gets it. Records already on it keep following it to the end, and you can Switch Process for all of them at once afterwards.
              </DialogDescription>
            </DialogHeader>
            {retire.isError && (
              <p role="alert" className="text-sm text-destructive">
                {describeError(retire.error)}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRetiring(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={retire.isPending} onClick={() => retire.mutate()}>
                Retire
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
