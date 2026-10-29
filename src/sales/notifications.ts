// Notifications: short messages telling one person that something happened that
// needs their attention. Plain TypeScript, shared by the gateways and the bell.

import type { Id, RecordRef } from "./types"

/** In the order of the Dataverse choice vibe_notificationkind. */
export const NOTIFICATION_KINDS = [
  "reassign",
  "notifyAction",
  "approvalRequested",
  "approvalDecided",
  "engineError",
  "needsReview",
  "newWebLead",
] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export type Notification = {
  id: Id
  /** Who it is for; only they see it. */
  recipientId: Id
  kind: NotificationKind
  text: string
  /** The record it is about; opening the Notification goes there. Missing when the record is not one the app opens. */
  regarding?: RecordRef
  read: boolean
  /** ISO timestamp. */
  createdOn: string
}

/** The latest Notifications the bell lists; the 30 day clean-up keeps the rest short anyway. */
export const NOTIFICATION_LIMIT = 50

/** The bell shows "9+" rather than a long number. */
export function unreadBadge(count: number): string {
  return count > 9 ? "9+" : String(count)
}

/** "Alex Wilber assigned you the Lead Sanne de Vries." */
export function reassignText(byName: string, record: RecordRef, recordName: string): string {
  const kind = { lead: "Lead", opportunity: "Opportunity", account: "Account", contact: "Contact" }[record.type]
  return `${byName} assigned you the ${kind} ${recordName}.`
}
