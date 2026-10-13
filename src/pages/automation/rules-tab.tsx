import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { AlertTriangle, Plus } from "lucide-react"
import { FormAlert } from "@/components/records/fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useGateway } from "@/hooks/use-gateway"
import { formatDate } from "@/lib/format"
import { describeConditions } from "@/lib/process-labels"
import { effectChip } from "@/lib/rule-labels"
import { PublishRefused, RULE_TABLES, ruleProblemOf, type RuleAdmin } from "@/sales"
import type { EngineTable } from "@/sales/engine"
import { RuleEditor } from "./rule-editor"
import { PublishIssuesAlert } from "./rule-issues"
import { useCanBuild } from "./use-process-admin"
import { useRefreshRules, useRuleList } from "./use-rule-admin"

function whenSummary(rule: RuleAdmin): string {
  const { conditions, match } = rule.definition.when
  return conditions.length === 0 ? "When: always" : `When ${describeConditions(conditions, match)}`
}

function CountLabel({ table }: { table: EngineTable }) {
  const list = useRuleList(table)
  const label = RULE_TABLES.find((t) => t.value === table)!.label
  return (
    <>
      {label}
      {list.data && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{list.data.length}</span>}
    </>
  )
}

/** The Business rules of each table: on/off, name, when, effects and who changed it last. Everyone reads; a Process builder edits. */
export function RulesTab() {
  const [params, setParams] = useSearchParams()
  const wanted = params.get("ruleTable")
  const table: EngineTable = RULE_TABLES.some((t) => t.value === wanted) ? (wanted as EngineTable) : "lead"
  const canBuild = useCanBuild()
  const list = useRuleList(table)
  const gateway = useGateway()
  const refresh = useRefreshRules()
  const [editing, setEditing] = useState<RuleAdmin | "new" | null>(null)
  const noun = RULE_TABLES.find((t) => t.value === table)!.noun

  const toggle = useMutation({
    mutationFn: (rule: RuleAdmin) => gateway.saveBusinessRule({ id: rule.id, name: rule.name, enabled: !rule.enabled, definition: rule.definition }),
    onSuccess: refresh,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Table" className="inline-flex flex-wrap rounded-lg bg-muted p-[3px]">
          {RULE_TABLES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={table === t.value}
              onClick={() => setParams((p) => { const next = new URLSearchParams(p); next.set("ruleTable", t.value); return next })}
              className="h-8 rounded-md px-3 text-sm font-medium text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm dark:aria-pressed:bg-input/30"
            >
              <CountLabel table={t.value} />
            </button>
          ))}
        </div>
        {canBuild && (
          <Button className="ml-auto" onClick={() => setEditing("new")}>
            <Plus aria-hidden /> New rule
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Rules apply to every {noun} as soon as they are saved, whichever way the data arrives. When two rules set the same field, the last change wins.
      </p>

      {list.isError ? (
        <FormAlert error={list.error} />
      ) : list.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : list.data.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">No rules for {RULE_TABLES.find((t) => t.value === table)!.label} yet.</p>
      ) : (
        <ul aria-label="Business rules" className="divide-y rounded-md border">
          {list.data.map((rule) => {
            const broken = ruleProblemOf(rule)
            const failing = rule.engineErrorCount > 0 || !!broken
            return (
              <li key={rule.id} className="flex items-start gap-3 p-3">
                <Switch
                  aria-label={`${rule.enabled ? "Switch off" : "Switch on"} ${rule.name}`}
                  className="mt-0.5"
                  checked={rule.enabled}
                  disabled={!canBuild || toggle.isPending}
                  onCheckedChange={() => toggle.mutate(rule)}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="text-left font-medium underline-offset-4 hover:underline" onClick={() => setEditing(rule)}>
                      {rule.name}
                    </button>
                    {!rule.enabled && <Badge variant="outline" className="text-muted-foreground">Off</Badge>}
                    {failing && (
                      <Badge variant="destructive" aria-label={broken && rule.engineErrorCount === 0 ? "Error: this rule can't run" : `Error: ${rule.engineErrorCount} Engine ${rule.engineErrorCount === 1 ? "error" : "errors"}`}>
                        <AlertTriangle aria-hidden /> Error
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{whenSummary(rule)}</p>
                  <ul aria-label={`Effects of ${rule.name}`} className="flex flex-wrap gap-1.5">
                    {rule.definition.effects.map((effect, index) => (
                      <li key={index}>
                        <Badge variant="secondary" className="font-normal">
                          {effectChip(effect)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    {rule.lastChangedBy ? `Last changed by ${rule.lastChangedBy}${rule.lastChangedOn ? ` on ${formatDate(rule.lastChangedOn)}` : ""}` : "Last changed by: not recorded"}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {toggle.isError && (toggle.error instanceof PublishRefused ? <PublishIssuesAlert issues={toggle.error.issues} /> : <FormAlert error={toggle.error} />)}
      {editing && (
        <RuleEditor
          key={editing === "new" ? "new" : editing.id}
          table={table}
          rule={editing === "new" ? undefined : editing}
          otherRules={list.data ?? []}
          canBuild={canBuild}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
