import type { FieldRuleView } from "@/sales"

/** The classes that mark a field a rule filled in. Inputs get their own tint so light and dark both read. */
export const FILLED_INPUT_CLASS =
  "border-amber-500/70 bg-amber-50 dark:border-amber-400/60 dark:bg-amber-400/10 focus-visible:border-amber-500"

/** Classes for a field a rule locks: dimmed, but readable in both themes. */
export const LOCKED_INPUT_CLASS = "bg-muted/60 text-muted-foreground opacity-100 disabled:cursor-not-allowed disabled:opacity-100"

/** The classes an input gets from the Business rules about it. */
export function ruleInputClass(view?: FieldRuleView): string | undefined {
  if (view?.readOnly) return LOCKED_INPUT_CLASS
  return view?.filledBy ? FILLED_INPUT_CLASS : undefined
}
