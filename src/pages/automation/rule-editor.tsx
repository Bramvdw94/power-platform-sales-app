import { useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { ConditionBuilder } from "@/components/conditions/condition-builder"
import { FormAlert, FormField } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useGateway } from "@/hooks/use-gateway"
import { checkRule, emptyRule, ruleProblemOf, RULE_TABLES, PublishRefused, type RuleAdmin, type RuleInput } from "@/sales"
import type { BusinessRuleRow, EngineTable } from "@/sales/engine"
import { formatDate } from "@/lib/format"
import { IssueList } from "./rule-issues"
import { EffectsEditor } from "./effects-editor"
import { TryItOnARecord } from "./try-it"
import { useRefreshRules } from "./use-rule-admin"

/**
 * Create, read or change one Business rule. Saving applies it at once to every record: rules have no versions.
 * Anyone may open a rule to read it; only a Process builder can change it.
 */
export function RuleEditor({
  table,
  rule,
  otherRules,
  canBuild,
  onClose,
}: {
  table: EngineTable
  /** The rule to change; missing for a new one. */
  rule?: RuleAdmin
  /** Every rule of the table, for the checks against the others. */
  otherRules: BusinessRuleRow[]
  canBuild: boolean
  onClose: () => void
}) {
  const gateway = useGateway()
  const refresh = useRefreshRules()
  const [draft, setDraft] = useState<RuleInput>(() => (rule ? { id: rule.id, name: rule.name, enabled: rule.enabled, definition: structuredClone(rule.definition) } : emptyRule(table)))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const readOnly = !canBuild
  const noun = RULE_TABLES.find((t) => t.value === table)?.noun ?? table

  const definitions = useQuery({
    queryKey: ["rule-admin", "processes", table],
    queryFn: async () => {
      if (table !== "lead" && table !== "opportunity") return []
      const { processes, versions } = await gateway.getProcessDefinitions(table)
      return processes.filter((p) => !p.retired).flatMap((p) => versions.filter((v) => v.id === p.latestVersionId).map((v) => v.definition))
    },
  })
  const errors = useQuery({
    queryKey: ["rule-admin", "errors", rule?.id],
    queryFn: () => gateway.listRuleEngineErrors(rule!.id),
    enabled: !!rule && canBuild,
    retry: false,
  })

  const checked = useMemo(() => checkRule({ rule: draft, otherRules, processes: definitions.data ?? [] }), [draft, otherRules, definitions.data])
  const brokenNow = rule ? ruleProblemOf(rule) : null

  const save = useMutation({
    mutationFn: () => gateway.saveBusinessRule({ ...draft, name: draft.name.trim() }),
    onSuccess: async () => {
      await refresh()
      onClose()
    },
  })
  const remove = useMutation({
    mutationFn: () => gateway.deleteBusinessRule(rule!.id),
    onSuccess: async () => {
      await refresh()
      onClose()
    },
  })

  const mutationError = save.error ?? remove.error
  const showErrors = !readOnly && checked.errors.length > 0 && (draft.name !== "" || draft.definition.effects.length > 0 || !!rule)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (!readOnly && checked.errors.length === 0) save.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>{rule ? (readOnly ? rule.name : `Edit rule “${rule.name}”`) : `New ${noun} rule`}</DialogTitle>
            <DialogDescription>
              {readOnly
                ? "Only a Process builder can change a rule."
                : "Saving applies the rule to every record at once. There are no versions: a fix takes effect immediately."}
            </DialogDescription>
          </DialogHeader>

          <fieldset disabled={readOnly} className="grid min-w-0 gap-5 border-0 p-0">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <FormField id="rule-name" label="Name" required>
                <Input id="rule-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus={!readOnly} />
              </FormField>
              <label className="flex items-center gap-2 pb-1.5 text-sm">
                <Switch aria-label="Switched on" checked={draft.enabled} disabled={readOnly} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
                {draft.enabled ? "Switched on" : "Switched off"}
              </label>
            </div>

            <section className="grid gap-2" aria-labelledby="rule-when">
              <h3 id="rule-when" className="text-sm font-medium">
                When
              </h3>
              <ConditionBuilder
                table={table}
                kind="rule"
                label="Rule conditions"
                readOnly={readOnly}
                value={draft.definition.when}
                onChange={(when) => setDraft({ ...draft, definition: { ...draft.definition, when } })}
              />
            </section>

            <section className="grid gap-2" aria-labelledby="rule-effects">
              <h3 id="rule-effects" className="text-sm font-medium">
                Then
              </h3>
              <EffectsEditor
                table={table}
                readOnly={readOnly}
                effects={draft.definition.effects}
                onChange={(effects) => setDraft({ ...draft, definition: { ...draft.definition, effects } })}
              />
            </section>
          </fieldset>

          {!readOnly && <TryItOnARecord definition={draft.definition} />}

          {showErrors && <IssueList issues={checked.errors} tone="error" />}
          {!readOnly && <IssueList issues={checked.warnings} tone="warning" />}
          {!readOnly && brokenNow && (
            <p role="status" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This rule can't run now: {brokenNow.message} It is skipped until you fix it.
            </p>
          )}
          {errors.data && errors.data.length > 0 && (
            <section aria-labelledby="rule-errors" className="space-y-2">
              <h3 id="rule-errors" className="text-sm font-medium text-destructive">
                Engine errors
              </h3>
              <ul aria-label="Engine errors" className="divide-y rounded-md border">
                {errors.data.map((e) => (
                  <li key={e.id} className="space-y-0.5 p-2.5 text-sm">
                    <p>{e.message}</p>
                    <p className="text-muted-foreground">
                      {e.code}
                      {e.occurredOn ? ` · ${formatDate(e.occurredOn)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mutationError &&
            (mutationError instanceof PublishRefused ? <IssueList issues={mutationError.issues} tone="error" /> : <FormAlert error={mutationError} />)}

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              {rule && !readOnly &&
                (confirmingDelete ? (
                  <>
                    <Button type="button" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
                      Yes, delete the rule
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                      Keep it
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirmingDelete(true)}>
                    Delete
                  </Button>
                ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {readOnly ? "Close" : "Cancel"}
              </Button>
              {!readOnly && (
                <Button type="submit" disabled={save.isPending || checked.errors.length > 0}>
                  Save
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
