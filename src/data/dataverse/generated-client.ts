// The DataverseClient over the services the `pa` CLI generates into
// src/generated. Regenerate those with the commands in README, Dataverse data
// sources; this file is the only place that knows their shape.

import { getClient } from "@microsoft/power-apps/data"
import type { IOperationResult } from "@microsoft/power-apps/data"
import { dataSourcesInfo } from "../../../.power/schemas/appschemas/dataSourcesInfo"
import {
  Office365OutlookService,
  AccountsService,
  AnnotationsService,
  ContactsService,
  PhonecallsService,
  SystemusersService,
  TasksService,
  EnvironmentvariabledefinitionsService,
  EnvironmentvariablevaluesService,
  Vibe_leadsService,
  Vibe_opportunitiesService,
  Vibe_processesService,
  Vibe_processversionsService,
  Vibe_productlinesService,
  Vibe_productsService,
  Vibe_quotasService,
  Vibe_quotelinesService,
  Vibe_quotesService,
  Vibe_quotesettingsesService,
  Vibe_quotetemplatesService,
  WhoAmIService,
} from "@/generated"
import type { IGetAllOptions } from "@/generated/models/CommonModels"
import type { Id } from "@/sales"
import {
  ACCOUNT_COLUMNS,
  ENVIRONMENT_VARIABLE_DEFINITION_COLUMNS,
  ENVIRONMENT_VARIABLE_VALUE_COLUMNS,
  PROCESS_COLUMNS,
  PROCESS_VERSION_COLUMNS,
  CONTACT_COLUMNS,
  LEAD_COLUMNS,
  NOTE_COLUMNS,
  OPPORTUNITY_COLUMNS,
  PHONE_CALL_COLUMNS,
  PRODUCT_COLUMNS,
  PRODUCT_LINE_COLUMNS,
  QUOTA_COLUMNS,
  QUOTE_COLUMNS,
  QUOTE_LINE_COLUMNS,
  QUOTE_PDF_COLUMN,
  QUOTE_SETTINGS_COLUMNS,
  QUOTE_TEMPLATE_COLUMNS,
  SYSTEM_USER_COLUMNS,
  TASK_COLUMNS,
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
  delete(id: string): Promise<void>
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
    async delete(id) {
      await service.delete(id)
    },
  }
}

const QUOTES_SOURCE = "vibe_quotes"

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
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
    products: table(Vibe_productsService, "vibe_product", PRODUCT_COLUMNS),
    productLines: table(Vibe_productlinesService, "vibe_productline", PRODUCT_LINE_COLUMNS),
    quotas: table(Vibe_quotasService, "vibe_quota", QUOTA_COLUMNS),
    quotes: table(Vibe_quotesService, "vibe_quote", QUOTE_COLUMNS),
    quoteLines: table(Vibe_quotelinesService, "vibe_quoteline", QUOTE_LINE_COLUMNS),
    quoteTemplates: table(Vibe_quotetemplatesService, "vibe_quotetemplate", QUOTE_TEMPLATE_COLUMNS),
    quoteSettings: table(Vibe_quotesettingsesService, "vibe_quotesettings", QUOTE_SETTINGS_COLUMNS),
    processes: table(Vibe_processesService, "vibe_process", PROCESS_COLUMNS),
    processVersions: table(Vibe_processversionsService, "vibe_processversion", PROCESS_VERSION_COLUMNS),
    environmentVariableDefinitions: table(EnvironmentvariabledefinitionsService, "environmentvariabledefinition", ENVIRONMENT_VARIABLE_DEFINITION_COLUMNS),
    environmentVariableValues: table(EnvironmentvariablevaluesService, "environmentvariablevalue", ENVIRONMENT_VARIABLE_VALUE_COLUMNS),

    async uploadQuotePdf(quoteId, fileName, bytes) {
      unwrap(await getClient(dataSourcesInfo).uploadFileToRecord(QUOTES_SOURCE, quoteId, QUOTE_PDF_COLUMN, fileName, bytes), "Quote PDF upload")
    },

    async downloadQuotePdf(quoteId) {
      return unwrap(await getClient(dataSourcesInfo).downloadFileFromRecord(QUOTES_SOURCE, quoteId, QUOTE_PDF_COLUMN), "Quote PDF download")
    },

    async sendEmail(email) {
      unwrap(
        await Office365OutlookService.SendEmailV2({
          To: email.to,
          Cc: email.cc || undefined,
          Subject: email.subject,
          Body: email.body,
          Attachments: [{ Name: email.attachment.name, ContentBytes: toBase64(email.attachment.bytes) }],
        }),
        "Outlook send",
      )
    },

    notes: table(AnnotationsService, "annotation", NOTE_COLUMNS),
    tasks: table(TasksService, "task", TASK_COLUMNS),
    phoneCalls: table(PhonecallsService, "phonecall", PHONE_CALL_COLUMNS),
  }
}
