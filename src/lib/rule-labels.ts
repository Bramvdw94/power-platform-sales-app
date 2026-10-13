import type { Effect } from "@/sales/engine"
import { fieldLabel, valueLabel } from "./process-labels"

/** What an effect does, in a few words: the chip on a rule's row. */
export function effectChip(effect: Effect): string {
  switch (effect.type) {
    case "required":
      return `Require ${fieldLabel(effect.field)}`
    case "readOnly":
      return `Lock ${fieldLabel(effect.field)}`
    case "setValue":
      return `Set ${fieldLabel(effect.field)} to ${effect.value === null || effect.value === "" ? "empty" : valueLabel(effect.value)}`
    case "warning":
      return "Warning"
    case "blockSave":
      return "Block save"
  }
}

export const EFFECT_LABELS: Record<Effect["type"], string> = {
  required: "Required",
  readOnly: "Read-only",
  setValue: "Set value",
  warning: "Show warning",
  blockSave: "Block save",
}
