import { isDateOnly } from "./dates"
import { SalesRuleError } from "./errors"
import type { DateOnly, User } from "./types"

/** The first day of the month a date falls in. */
export function quotaMonth(date: DateOnly): DateOnly {
  return `${date.slice(0, 7)}-01`
}

export function isQuotaMonth(value: string): boolean {
  return isDateOnly(value) && value.endsWith("-01")
}

/** The month of `today` and the ones after it: what the Quota grid shows (this month plus the next 5). */
export function quotaMonths(today: DateOnly, count = 6): DateOnly[] {
  const [y, m] = today.split("-").map(Number)
  return Array.from({ length: count }, (_, i) => {
    const total = y * 12 + (m - 1) + i
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`
  })
}

/** A quarter's Quota is the sum of its months. */
export function quarterOf(month: DateOnly): string {
  const [y, m] = month.split("-").map(Number)
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
}

export function quotaTotal(quotas: readonly { amount: number }[]): number {
  return Math.round(quotas.reduce((sum, q) => sum + q.amount, 0) * 100) / 100
}

/** Nobody sets their own Quota; a manager sets their direct reports'. */
export function canSetQuota(actor: Pick<User, "id">, salesperson: Pick<User, "id" | "managerId">): boolean {
  return salesperson.id !== actor.id && salesperson.managerId === actor.id
}

export function quotaErrors(input: { month: string; amount: number }): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!isQuotaMonth(input.month)) errors.month = "A Quota is for a whole month."
  if (!Number.isFinite(input.amount) || input.amount < 0) errors.amount = "Enter an amount of 0 or more."
  return errors
}

export function requireCanSetQuota(actor: Pick<User, "id">, salesperson: Pick<User, "id" | "managerId" | "fullName">): void {
  if (salesperson.id === actor.id) {
    throw new SalesRuleError("Nobody sets their own Quota. It is set by your manager, or by a system administrator if you have none.")
  }
  if (salesperson.managerId !== actor.id) {
    throw new SalesRuleError(`Only the manager of ${salesperson.fullName} can set their Quota.`)
  }
}
