import { SalesRuleError } from "./errors"
import type { Lead, LeadStatus } from "./types"

/**
 * What can happen to a Lead (Lead lifecycle, decision #3):
 * - Not Contacted <-> Working by hand.
 * - Not Contacted or Working -> Qualified, only through Qualify. Final.
 * - Not Contacted or Working -> Disqualified, with a Disqualify reason.
 * - Disqualified -> Working by reopening.
 * Who may do it (Owner or Owner's manager) is checked separately by canEdit.
 */
export type LeadAction = "markWorking" | "markNotContacted" | "disqualify" | "reopen" | "qualify"

const ACTIONS_BY_STATUS: Record<LeadStatus, readonly LeadAction[]> = {
  notContacted: ["markWorking", "disqualify", "qualify"],
  working: ["markNotContacted", "disqualify", "qualify"],
  qualified: [],
  disqualified: ["reopen"],
}

const STATUS_AFTER: Record<LeadAction, LeadStatus> = {
  markWorking: "working",
  markNotContacted: "notContacted",
  disqualify: "disqualified",
  reopen: "working",
  qualify: "qualified",
}

export function allowedLeadActions(status: LeadStatus): readonly LeadAction[] {
  return ACTIONS_BY_STATUS[status]
}

export function canApplyLeadAction(status: LeadStatus, action: LeadAction): boolean {
  return ACTIONS_BY_STATUS[status].includes(action)
}

/** The Lead status after an action, or a SalesRuleError if the action is not allowed. */
export function leadStatusAfter(status: LeadStatus, action: LeadAction): LeadStatus {
  if (!canApplyLeadAction(status, action)) {
    throw new SalesRuleError(`A ${status} Lead cannot ${action}.`)
  }
  return STATUS_AFTER[action]
}

/** The action that sets a Lead status by hand, if there is one. */
export function manualLeadAction(to: LeadStatus): LeadAction | null {
  if (to === "working") return "markWorking"
  if (to === "notContacted") return "markNotContacted"
  return null
}

/** Qualified and Disqualified Leads are read-only (a Disqualified one can still be reopened). */
export function isLeadReadOnly(lead: Pick<Lead, "status">): boolean {
  return lead.status === "qualified" || lead.status === "disqualified"
}
