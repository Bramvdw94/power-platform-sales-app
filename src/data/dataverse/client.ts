// The narrow port the Dataverse gateway uses to reach Dataverse. The real
// implementation (generated-client.ts) wraps the services the `pa` CLI
// generates into src/generated; tests use a fake. Keeping the gateway behind
// this port lets it be tested without an environment.

import type { Id } from "@/sales"

/** The systemuser columns the app reads. */
export type SystemUserRow = {
  systemuserid: Id
  fullname?: string | null
  internalemailaddress?: string | null
  /** The user's Manager (the `parentsystemuserid` lookup). */
  _parentsystemuserid_value?: Id | null
}

export const SYSTEM_USER_COLUMNS = [
  "systemuserid",
  "fullname",
  "internalemailaddress",
  "_parentsystemuserid_value",
] as const

export interface DataverseClient {
  /** The signed-in user's systemuserid (the WhoAmI function). */
  whoAmI(): Promise<Id>
  getSystemUser(id: Id): Promise<SystemUserRow>
  /** Enabled users matching an OData filter. */
  listSystemUsers(filter: string): Promise<SystemUserRow[]>
}
