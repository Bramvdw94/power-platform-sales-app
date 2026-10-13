import { AlertTriangle, Ban, Lock, Sparkles } from "lucide-react"
import type { ReactNode } from "react"
import type { FieldRuleView, RuleNotices } from "@/sales"
import { fieldLabel } from "@/lib/process-labels"
import { cn } from "@/lib/utils"

/** Under a field: why it is required, locked or filled in, and the rule's warnings. */
export function FieldRuleNotes({ id, view }: { id: string; view?: FieldRuleView }) {
  if (!view) return null
  const lines: ReactNode[] = []
  if (view.required) {
    lines.push(
      <p key="required" className={cn("flex items-start gap-1.5 text-xs", view.problem ? "text-destructive" : "text-muted-foreground")}>
        <span aria-hidden className="font-semibold text-destructive">*</span>
        <span>Required by the rule “{view.required.ruleName}”</span>
      </p>,
    )
  }
  if (view.readOnly) {
    lines.push(
      <p key="readOnly" className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Lock aria-hidden className="mt-0.5 size-3 shrink-0" />
        <span>Read-only because of the rule “{view.readOnly.ruleName}”</span>
      </p>,
    )
  }
  if (view.filledBy) {
    lines.push(
      <p key="filled" className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
        <Sparkles aria-hidden className="mt-0.5 size-3 shrink-0" />
        <span>Filled in by the rule “{view.filledBy.ruleName}”. You can change it.</span>
      </p>,
    )
  }
  for (const warning of view.warnings) {
    lines.push(
      <p key={`warn-${warning.ruleId}-${warning.message}`} className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle aria-hidden className="mt-0.5 size-3 shrink-0" />
        <span>
          {warning.message} <span className="text-muted-foreground">(rule “{warning.ruleName}”)</span>
        </span>
      </p>,
    )
  }
  if (lines.length === 0) return null
  return (
    <div id={`${id}-rules`} className="grid gap-0.5">
      {lines}
    </div>
  )
}

/** The red box of a block save rule while its condition holds: Save is disabled. */
export function RuleBlockBox({ blocks, className }: { blocks: { ruleId: string; ruleName: string; detail: string }[]; className?: string }) {
  if (blocks.length === 0) return null
  return (
    <div role="alert" className={cn("rounded-md border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive", className)}>
      {blocks.map((block) => (
        <p key={block.ruleId} className="flex items-start gap-2">
          <Ban aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Can't save:</strong> {block.detail} <span className="opacity-80">Blocked by the rule “{block.ruleName}”.</span>
          </span>
        </p>
      ))}
    </div>
  )
}

/** Warnings that are not about one field, in amber at the top of the details. */
export function RuleWarningBox({ warnings }: { warnings: { ruleId: string; ruleName: string; message: string }[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="rounded-md border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-200">
      {warnings.map((warning) => (
        <p key={`${warning.ruleId}-${warning.message}`} className="flex items-start gap-2">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {warning.message} <span className="opacity-80">(rule “{warning.ruleName}”)</span>
          </span>
        </p>
      ))}
    </div>
  )
}

/** Read mode on the Details card: warnings, required fields that are empty and blocked saves. */
export function RuleNoticeList({ notices }: { notices: RuleNotices }) {
  const { warnings, missing, blocks } = notices
  if (warnings.length === 0 && missing.length === 0 && blocks.length === 0) return null
  return (
    <div className="mb-4 grid gap-2" aria-label="Business rules">
      {blocks.length > 0 && (
        <RuleBlockBox blocks={blocks.map((b) => ({ ruleId: b.ruleId, ruleName: b.ruleName, detail: b.message }))} />
      )}
      {missing.length > 0 && (
        <RuleWarningBox
          warnings={missing.map((m) => ({ ruleId: `${m.ruleName}-${m.field}`, ruleName: m.ruleName, message: `${fieldLabel(m.field)} is empty, and this record needs it.` }))}
        />
      )}
      <RuleWarningBox warnings={warnings} />
    </div>
  )
}
