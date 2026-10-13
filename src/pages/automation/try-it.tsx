import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { FormAlert } from "@/components/records/fields"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { useGateway } from "@/hooks/use-gateway"
import { fieldLabel, valueLabel } from "@/lib/process-labels"
import { tryRule } from "@/sales"
import type { BusinessRuleDefinition, Effect } from "@/sales/engine"
import { findCandidates, loadSubject } from "./try-subject"

function effectSentence(effect: Effect): string {
  switch (effect.type) {
    case "required":
      return `${fieldLabel(effect.field)} would be required.`
    case "readOnly":
      return `${fieldLabel(effect.field)} would be read-only.`
    case "setValue":
      return `${fieldLabel(effect.field)} would be filled in with ${effect.value === null || effect.value === "" ? "an empty value" : valueLabel(effect.value)}.`
    case "warning":
      return `A warning would show${effect.field ? ` under ${fieldLabel(effect.field)}` : ""}: “${effect.message}”`
    case "blockSave":
      return `Save would be blocked: “${effect.message}”`
  }
}

/** Pick a real record and see whether the rule, as it is in the editor now, applies to it and what it would do. */
export function TryItOnARecord({ definition }: { definition: BusinessRuleDefinition }) {
  const gateway = useGateway()
  const table = definition.table
  const [search, setSearch] = useState("")
  const [recordId, setRecordId] = useState("")
  const candidates = useQuery({ queryKey: ["rule-admin", "try", "candidates", table, search], queryFn: () => findCandidates(gateway, table, search) })
  const subject = useQuery({
    queryKey: ["rule-admin", "try", "subject", table, recordId],
    queryFn: () => loadSubject(gateway, table, recordId),
    enabled: !!recordId,
  })
  const outcome = subject.data ? tryRule(definition, subject.data) : undefined

  return (
    <section aria-labelledby="try-it-heading" className="grid gap-3 rounded-md border bg-muted/30 p-3">
      <div>
        <h3 id="try-it-heading" className="text-sm font-medium">
          Try it on a record
        </h3>
        <p className="text-sm text-muted-foreground">Nothing is saved. The rule is tried as it stands in this editor, switched on.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label="Find a record" placeholder="Find a record by name" value={search} onChange={(e) => setSearch(e.target.value)} />
        <NativeSelect aria-label="Record to try" value={recordId} onChange={(e) => setRecordId(e.target.value)}>
          <option value="">{candidates.isPending ? "Loading…" : "Choose a record"}</option>
          {(candidates.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {candidates.isError && <FormAlert error={candidates.error} />}
      {subject.isError && <FormAlert error={subject.error} />}
      {recordId && subject.isPending && <Skeleton className="h-10 w-full" />}
      {outcome && (
        <div role="status" className="space-y-1 text-sm">
          {outcome.applies ? (
            <>
              <p className="font-medium">The rule applies to this record.</p>
              {outcome.effects.length === 0 ? (
                <p className="text-muted-foreground">It has no effects yet.</p>
              ) : (
                <ul className="list-disc space-y-0.5 pl-5">
                  {outcome.effects.map((effect, index) => (
                    <li key={index}>{effectSentence(effect)}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="font-medium">The rule does not apply to this record: its conditions don't hold.</p>
          )}
        </div>
      )}
    </section>
  )
}
