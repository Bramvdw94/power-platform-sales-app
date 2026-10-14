// PROTOTYPE (throwaway, never merge): the Decision rules tab on the Automation page (#150).
// Three editor variants, switched with ?variant=A|B|C and the floating bar at the bottom.

import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AlertTriangle, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { DECISION_TABLES, answersOf, emptyDecisionRule, seedDecisionRules, type DecisionRule, type DecisionTable } from "./model"
import { triggerSentence } from "./sections"
import { PrototypeSwitcher, useVariant } from "./prototype-switcher"
import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"
import type { EditorProps } from "./editor-common"
import "./prototype.css"

export const VARIANTS = [
  { key: "A", name: "Dialog, like Business rules" },
  { key: "B", name: "Step by step" },
  { key: "C", name: "Flow + Try" },
]

let store: DecisionRule[] | null = null

export function DecisionRulesTab() {
  const [rules, setRulesState] = useState<DecisionRule[]>(() => (store ??= seedDecisionRules()))
  const setRules = (next: DecisionRule[]) => {
    store = next
    setRulesState(next)
  }
  const [params, setParams] = useSearchParams()
  const wanted = params.get("drTable") as DecisionTable | null
  const table: DecisionTable = DECISION_TABLES.some((t) => t.value === wanted) ? wanted! : "lead"
  const [editing, setEditing] = useState<{ rule: DecisionRule; isNew: boolean } | null>(null)
  const variant = useVariant(VARIANTS.map((v) => v.key))
  const list = rules.filter((r) => r.table === table)
  const monthTotal = rules.reduce((n, r) => n + r.stats.decisionsThisMonth, 0)

  const editorProps: EditorProps | null = editing && {
    rule: editing.rule,
    isNew: editing.isNew,
    onClose: () => setEditing(null),
    onSave: (rule) => {
      setRules(editing.isNew ? [...rules, rule] : rules.map((r) => (r.id === rule.id ? rule : r)))
      setEditing(null)
    },
    onDelete: () => {
      setRules(rules.filter((r) => r.id !== editing.rule.id))
      setEditing(null)
    },
  }

  // Variants B and C take over the tab as a page; A opens a dialog over the list.
  if (editorProps && variant !== "A") {
    return (
      <>
        {variant === "B" ? <VariantB key={editing!.rule.id} {...editorProps} /> : <VariantC key={editing!.rule.id} {...editorProps} />}
        <PrototypeSwitcher variants={VARIANTS} current={variant} />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Table" className="inline-flex flex-wrap rounded-lg bg-muted p-[3px]">
          {DECISION_TABLES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={table === t.value}
              onClick={() => setParams((p) => { const next = new URLSearchParams(p); next.set("drTable", t.value); return next })}
              className="h-8 rounded-md px-3 text-sm font-medium text-foreground/75 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm dark:aria-pressed:bg-input/30"
            >
              {t.label}
              <span className="ml-1.5 text-xs tabular-nums opacity-80">{rules.filter((r) => r.table === t.value).length}</span>
            </button>
          ))}
        </div>
        <Button className="ml-auto" onClick={() => setEditing({ rule: emptyDecisionRule(table), isNew: true })}>
          <Plus aria-hidden /> New Decision rule
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>Jev answers one question per rule after the save; the Actions for its answer follow. Unsure answers go to Needs review.</p>
        <p className="tabular-nums">
          This month: {monthTotal.toLocaleString("en-GB")} of 5,000 Decisions · <button type="button" className="underline underline-offset-4">Decision log</button>
        </p>
      </div>

      {list.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">No Decision rules for {DECISION_TABLES.find((t) => t.value === table)!.label} yet.</p>
      ) : (
        <ul aria-label="Decision rules" className="divide-y rounded-md border">
          {list.map((rule) => (
            <li key={rule.id} className="flex items-start gap-3 p-3">
              <Switch
                aria-label={`${rule.enabled ? "Switch off" : "Switch on"} ${rule.name}`}
                className="mt-0.5"
                checked={rule.enabled}
                disabled={rule.status === "draft"}
                onCheckedChange={() => setRules(rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)))}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="text-left font-medium underline-offset-4 hover:underline" onClick={() => setEditing({ rule, isNew: false })}>
                    {rule.name}
                  </button>
                  {rule.status === "draft" && <Badge variant="outline">Draft</Badge>}
                  {rule.status === "published" && !rule.enabled && <Badge variant="outline" className="text-muted-foreground">Off</Badge>}
                  {rule.stats.engineErrors > 0 && (
                    <Badge variant="destructive">
                      <AlertTriangle aria-hidden /> {rule.stats.engineErrors} Engine error
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{triggerSentence(rule)}</p>
                <p className="line-clamp-2 text-sm">Asks: “{rule.question.text}”</p>
                <ul aria-label={`Answers of ${rule.name}`} className="flex flex-wrap gap-1.5">
                  {answersOf(rule.question).map((a) => (
                    <li key={a.key}>
                      <Badge variant="secondary" className="font-normal">
                        {a.label} → {(rule.branches[a.key] ?? []).length} {(rule.branches[a.key] ?? []).length === 1 ? "Action" : "Actions"}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {rule.stats.decisionsThisMonth} Decisions this month · {rule.stats.needsReview} Needs review · threshold {rule.threshold}% · {rule.lastTried ? `tried ${rule.lastTried}` : "never tried"}
                  {rule.changedSinceTry && rule.lastTried ? " (changed since)" : ""} · last changed by {rule.lastChangedBy} on {rule.lastChangedOn}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editorProps && variant === "A" && <VariantA key={editing!.rule.id} {...editorProps} />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </div>
  )
}
