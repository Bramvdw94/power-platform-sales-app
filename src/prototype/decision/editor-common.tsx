// PROTOTYPE (throwaway, never merge): the draft state and the Save / Publish bar every variant shares.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { problemsOf, type DecisionRule } from "./model"
import { PublishWarning, type Edit } from "./sections"

export type EditorProps = {
  rule: DecisionRule
  isNew: boolean
  onSave: (rule: DecisionRule) => void
  onDelete: () => void
  onClose: () => void
}

export function useDraft(rule: DecisionRule) {
  const [draft, setDraft] = useState<DecisionRule>(() => structuredClone(rule))
  const edit: Edit = (patch) =>
    setDraft((d) => ({ ...d, ...patch, ...("lastTried" in patch ? {} : { changedSinceTry: true }) }))
  return { draft, edit }
}

export function NameField({ draft, edit }: { draft: DecisionRule; edit: Edit }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor="dr-name" className="text-sm font-medium">
        Name<span className="text-destructive" aria-hidden>*</span>
      </label>
      <Input id="dr-name" placeholder="e.g. Score web Leads" value={draft.name} onChange={(e) => edit({ name: e.target.value })} />
    </div>
  )
}

/** Save draft keeps it off; Publish makes it run (switched on). */
export function SaveBar({ draft, props, compact = false }: { draft: DecisionRule; props: EditorProps; compact?: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const problems = problemsOf(draft)
  return (
    <div className="grid gap-2">
      {problems.length > 0 && (
        <ul aria-label="Before you can publish" className="list-disc rounded-md border border-destructive/40 bg-destructive/10 py-2 pr-3 pl-7 text-sm text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <PublishWarning rule={draft} />
      <div className={compact ? "flex flex-wrap gap-2" : "flex flex-wrap items-center justify-between gap-2"}>
        <div className="flex gap-2">
          {!props.isNew &&
            (confirmDelete ? (
              <>
                <Button type="button" variant="destructive" onClick={props.onDelete}>
                  Yes, delete
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="button" variant="outline" disabled={!draft.name.trim()} onClick={() => props.onSave({ ...draft, status: draft.status === "published" ? "published" : "draft" })}>
            {draft.status === "published" ? "Save" : "Save draft"}
          </Button>
          {draft.status !== "published" && (
            <Button type="button" disabled={problems.length > 0} onClick={() => props.onSave({ ...draft, status: "published", enabled: true })}>
              Publish
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
