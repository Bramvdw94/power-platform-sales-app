// The DataverseClient over the services the `pa` CLI generates into
// src/generated. Regenerate those with the commands in README, Dataverse data
// sources; this file is the only place that knows their shape.

import type { IOperationResult } from "@microsoft/power-apps/data"
import { SystemusersService, WhoAmIService } from "@/generated"
import type { Id } from "@/sales"
import { SYSTEM_USER_COLUMNS, type DataverseClient, type SystemUserRow } from "./client"

const select = [...SYSTEM_USER_COLUMNS]

/** The result's data, or an Error carrying the service's own message. */
function unwrap<T>(result: IOperationResult<T>, operation: string): T {
  if (!result.success) {
    throw new Error(result.error?.message || `Dataverse ${operation} failed`)
  }
  return result.data
}

export function createGeneratedClient(): DataverseClient {
  return {
    async whoAmI() {
      const data = unwrap(await WhoAmIService.WhoAmI(), "WhoAmI")
      const userId = data?.UserId
      if (typeof userId !== "string" || !userId) {
        throw new Error("Dataverse WhoAmI returned no UserId")
      }
      return userId as Id
    },

    async getSystemUser(id) {
      const row = unwrap(await SystemusersService.get(id, { select }), "systemuser read")
      return row as unknown as SystemUserRow
    },

    async listSystemUsers(filter) {
      // Dataverse has no $skip; follow the skip tokens until the last page.
      const rows: SystemUserRow[] = []
      let skipToken: string | undefined
      do {
        const result = await SystemusersService.getAll({ select, filter, skipToken })
        rows.push(...((unwrap(result, "systemuser list") ?? []) as unknown as SystemUserRow[]))
        skipToken = result.skipToken
      } while (skipToken)
      return rows
    },
  }
}
