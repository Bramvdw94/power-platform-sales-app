import type { DateOnly } from "./types"

/** The local calendar date of a moment, as "YYYY-MM-DD". */
export function toDateOnly(moment: Date): DateOnly {
  const y = moment.getFullYear()
  const m = String(moment.getMonth() + 1).padStart(2, "0")
  const d = String(moment.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}
