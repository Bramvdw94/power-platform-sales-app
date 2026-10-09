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

/**
 * A row as Dataverse returns it. Lookup display names arrive as formatted
 * values: `<lookup>name` from the generated services, or the OData
 * annotation on `_<lookup>_value`; see lookupName in dataverse-gateway.ts.
 */
type Row = Record<string, unknown>

/** The account columns the app reads. */
export type AccountRow = Row & {
  accountid: Id
  name?: string | null
  websiteurl?: string | null
  telephone1?: string | null
  address1_line1?: string | null
  address1_city?: string | null
  address1_postalcode?: string | null
  address1_country?: string | null
  description?: string | null
  _ownerid_value?: Id | null
  createdon?: string | null
}

export const ACCOUNT_COLUMNS = [
  "accountid",
  "name",
  "websiteurl",
  "telephone1",
  "address1_line1",
  "address1_city",
  "address1_postalcode",
  "address1_country",
  "description",
  "_ownerid_value",
  "createdon",
] as const

/** The contact columns the app reads. */
export type ContactRow = Row & {
  contactid: Id
  firstname?: string | null
  lastname?: string | null
  jobtitle?: string | null
  /** The company lookup: polymorphic, an account or a contact. */
  _parentcustomerid_value?: Id | null
  emailaddress1?: string | null
  telephone1?: string | null
  mobilephone?: string | null
  _ownerid_value?: Id | null
  createdon?: string | null
}

export const CONTACT_COLUMNS = [
  "contactid",
  "firstname",
  "lastname",
  "jobtitle",
  "_parentcustomerid_value",
  "emailaddress1",
  "telephone1",
  "mobilephone",
  "_ownerid_value",
  "createdon",
] as const

/** The vibe_opportunity columns the app reads. */
export type OpportunityRow = Row & {
  vibe_opportunityid: Id
  vibe_name?: string | null
  _vibe_accountid_value?: Id | null
  _vibe_primarycontactid_value?: Id | null
  vibe_stage?: number | null
  vibe_probability?: number | null
  vibe_estimatedvalue?: number | null
  vibe_expectedclosedate?: string | null
  vibe_nextstep?: string | null
  vibe_description?: string | null
  vibe_leadsource?: number | null
  _vibe_originatingleadid_value?: Id | null
  vibe_actualvalue?: number | null
  vibe_closedate?: string | null
  vibe_lostreason?: number | null
  vibe_lostcomment?: string | null
  _vibe_closedby_value?: Id | null
  _ownerid_value?: Id | null
  createdon?: string | null
}

export const OPPORTUNITY_COLUMNS = [
  "vibe_opportunityid",
  "vibe_name",
  "_vibe_accountid_value",
  "_vibe_primarycontactid_value",
  "vibe_stage",
  "vibe_probability",
  "vibe_estimatedvalue",
  "vibe_expectedclosedate",
  "vibe_nextstep",
  "vibe_description",
  "vibe_leadsource",
  "_vibe_originatingleadid_value",
  "vibe_actualvalue",
  "vibe_closedate",
  "vibe_lostreason",
  "vibe_lostcomment",
  "_vibe_closedby_value",
  "_ownerid_value",
  "createdon",
] as const

export type ListOptions = {
  filter?: string
  orderBy?: string[]
  /** Rows per page (Dataverse's maxpagesize). */
  pageSize: number
  /** Continues after the page that returned it; Dataverse has no $skip. */
  skipToken?: string
}

export type RowPage<T> = {
  rows: T[]
  /** Set when there is a next page. */
  skipToken?: string
  /** The total matching rows, capped by Dataverse at 5000. */
  count?: number
}

/** Column values for a create or update. Lookups are written as `<navigation>@odata.bind`. */
export type Fields = Record<string, string | number | boolean | null>

/** A Dataverse table the gateway reads and writes. */
export interface TableClient<T> {
  get(id: Id): Promise<T>
  list(options: ListOptions): Promise<RowPage<T>>
  create(fields: Fields): Promise<T>
  update(id: Id, fields: Fields): Promise<T>
}

export interface DataverseClient {
  /** The signed-in user's systemuserid (the WhoAmI function). */
  whoAmI(): Promise<Id>
  getSystemUser(id: Id): Promise<SystemUserRow>
  /** Enabled users matching an OData filter. */
  listSystemUsers(filter: string): Promise<SystemUserRow[]>
  accounts: TableClient<AccountRow>
  contacts: TableClient<ContactRow>
  opportunities: TableClient<OpportunityRow>
}

/** Writes a Contact's company lookup as an Account: per-target navigation binding (#12). */
export const CONTACT_ACCOUNT_BIND = "parentcustomerid_account@odata.bind"
