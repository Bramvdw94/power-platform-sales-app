import type { Id, User } from "./types"

type OrgChart = ReadonlyArray<Pick<User, "id" | "managerId">>

/**
 * Only the Owner and the Owner's direct manager may change a record
 * (edit, change status, Close, Reassign, add activities). Everyone reads.
 * Mirrors the SalesApp Salesperson role plus Manager hierarchy (depth 1).
 */
export function canEdit(userId: Id, ownerId: Id, users: OrgChart): boolean {
  if (userId === ownerId) return true
  const owner = users.find((u) => u.id === ownerId)
  return owner?.managerId === userId
}

export function directReportIds(userId: Id, users: OrgChart): Id[] {
  return users.filter((u) => u.managerId === userId).map((u) => u.id)
}

/** "My team": the user plus their direct reports. */
export function teamMemberIds(userId: Id, users: OrgChart): Id[] {
  return [userId, ...directReportIds(userId, users)]
}

/** The fixed list views. */
export type ListView = "my" | "myTeam" | "all"

export function isInView(view: ListView, ownerId: Id, userId: Id, users: OrgChart): boolean {
  switch (view) {
    case "my":
      return ownerId === userId
    case "myTeam":
      return teamMemberIds(userId, users).includes(ownerId)
    case "all":
      return true
  }
}
