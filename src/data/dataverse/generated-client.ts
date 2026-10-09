// The DataverseClient over the services the `pa` CLI generates into
// src/generated. Regenerate those with the commands in README, Dataverse data
// sources; this file is the only place that knows their shape.

import type { IOperationResult } from "@microsoft/power-apps/data"
import { AccountsService, ContactsService, SystemusersService, Vibe_leadsService, Vibe_opportunitiesService, WhoAmIService } from "@/generated"
import type { IGetAllOptions } from "@/generated/models/CommonModels"
import type { Id } from "@/sales"
import {
  ACCOUNT_COLUMNS,
  CONTACT_COLUMNS,
  LEAD_COLUMNS,
  OPPORTUNITY_COLUMNS,
  SYSTEM_USER_COLUMNS,
  type DataverseClient,
  type Fields,
  type SystemUserRow,
  type TableClient,
} from "./client"

const select = [...SYSTEM_USER_COLUMNS]

/** The result's data, or an Error carrying the service's own message. */
function unwrap<T>(result: IOperationResult<T>, operation: string): T {
  if (!result.success) {
    throw new Error(result.error?.message || `Dataverse ${operation} failed`)
  }
  return result.data
}

/** The calls every generated table service has. */
type GeneratedService = {
  get(id: string, options?: { select?: string[] }): Promise<IOperationResult<unknown>>
  getAll(options?: IGetAllOptions): Promise<IOperationResult<unknown[]>>
  create(record: never): Promise<IOperationResult<unknown>>
  update(id: string, changedFields: never): Promise<IOperationResult<unknown>>
}

/** A TableClient over one generated service, reading only the given columns. */
function table<T>(service: GeneratedService, name: string, columns: readonly string[]): TableClient<T> {
  const select = [...columns]
  return {
    async get(id) {
      return unwrap(await service.get(id, { select }), `${name} read`) as T
    },
    async list({ filter, orderBy, pageSize, skipToken }) {
      const result = await service.getAll({ select, filter, orderBy, maxPageSize: pageSize, skipToken, count: true })
      return {
        rows: (unwrap(result, `${name} list`) ?? []) as T[],
        skipToken: result.skipToken,
        count: result.count,
      }
    },
    async create(fields: Fields) {
      return unwrap(await service.create(fields as never), `${name} create`) as T
    },
    async update(id, fields: Fields) {
      return unwrap(await service.update(id, fields as never), `${name} update`) as T
    },
  }
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

    accounts: table(AccountsService, "account", ACCOUNT_COLUMNS),
    contacts: table(ContactsService, "contact", CONTACT_COLUMNS),
    leads: table(Vibe_leadsService, "vibe_lead", LEAD_COLUMNS),
    opportunities: table(Vibe_opportunitiesService, "vibe_opportunity", OPPORTUNITY_COLUMNS),
  }
}
