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
  customertypecode?: number | null
  industrycode?: number | null
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
  "customertypecode",
  "industrycode",
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

/** The vibe_lead columns the app reads. */
export type LeadRow = Row & {
  vibe_leadid: Id
  vibe_firstname?: string | null
  vibe_lastname?: string | null
  vibe_company?: string | null
  vibe_jobtitle?: string | null
  vibe_email?: string | null
  vibe_phone?: string | null
  vibe_website?: string | null
  vibe_leadsource?: number | null
  vibe_description?: string | null
  vibe_leadstatus?: number | null
  vibe_disqualifyreason?: number | null
  vibe_disqualifycomment?: string | null
  vibe_disqualifiedon?: string | null
  _vibe_disqualifiedby_value?: Id | null
  _ownerid_value?: Id | null
  createdon?: string | null
}

export const LEAD_COLUMNS = [
  "vibe_leadid",
  "vibe_firstname",
  "vibe_lastname",
  "vibe_company",
  "vibe_jobtitle",
  "vibe_email",
  "vibe_phone",
  "vibe_website",
  "vibe_leadsource",
  "vibe_description",
  "vibe_leadstatus",
  "vibe_disqualifyreason",
  "vibe_disqualifycomment",
  "vibe_disqualifiedon",
  "_vibe_disqualifiedby_value",
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

/** The annotation (Note) columns the app reads. */
export type NoteRow = Row & {
  annotationid: Id
  subject?: string | null
  notetext?: string | null
  /** The record the Note is about: polymorphic. */
  _objectid_value?: Id | null
  _ownerid_value?: Id | null
  createdon?: string | null
}

export const NOTE_COLUMNS = ["annotationid", "subject", "notetext", "_objectid_value", "_ownerid_value", "createdon"] as const

/** The task and phonecall columns the app reads. */
export type ActivityRow = Row & {
  activityid: Id
  subject?: string | null
  description?: string | null
  /** A Task's due date; an open Phone Call's planned date. */
  scheduledend?: string | null
  /** When a Task was completed; a logged Phone Call's date. */
  actualend?: string | null
  /** 0 open, 1 completed, 2 canceled. */
  statecode?: number | null
  /** The record the activity is about: polymorphic. */
  _regardingobjectid_value?: Id | null
  _ownerid_value?: Id | null
  createdon?: string | null
}

const ACTIVITY_COLUMNS = [
  "activityid",
  "subject",
  "description",
  "scheduledend",
  "actualend",
  "statecode",
  "_regardingobjectid_value",
  "_ownerid_value",
  "createdon",
] as const

export const TASK_COLUMNS = ACTIVITY_COLUMNS

export type PhoneCallRow = ActivityRow & {
  /** true: outgoing. */
  directioncode?: boolean | null
}

export const PHONE_CALL_COLUMNS = [...ACTIVITY_COLUMNS, "directioncode"] as const

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
  leads: TableClient<LeadRow>
  opportunities: TableClient<OpportunityRow>
  notes: TableClient<NoteRow>
  tasks: TableClient<ActivityRow>
  phoneCalls: TableClient<PhoneCallRow>
}

/** A Lead's Disqualified by lookup (to systemuser), as a navigation property. */
export const LEAD_DISQUALIFIED_BY_NAVIGATION = "vibe_DisqualifiedBy"

/** A Contact's company lookup as an Account: the per-target navigation property (#12). */
export const CONTACT_ACCOUNT_NAVIGATION = "parentcustomerid_account"

/** The vibe_opportunity lookups' navigation properties, for `@odata.bind` writes. */
export const OPPORTUNITY_NAVIGATION = {
  account: "vibe_AccountId",
  primaryContact: "vibe_PrimaryContactId",
  closedBy: "vibe_ClosedBy",
  originatingLead: "vibe_OriginatingLeadId",
} as const

/** The Dataverse tables behind the four record types, for polymorphic lookups. */
export const RECORD_TABLES = {
  lead: { logicalName: "vibe_lead", entitySet: "vibe_leads" },
  opportunity: { logicalName: "vibe_opportunity", entitySet: "vibe_opportunities" },
  account: { logicalName: "account", entitySet: "accounts" },
  contact: { logicalName: "contact", entitySet: "contacts" },
} as const

/**
 * The per-target navigation property of a Note's `objectid` or an activity's
 * `regardingobjectid` (#12), e.g. `regardingobjectid_vibe_lead_task`.
 */
export function regardingNavigation(table: "annotation" | "task" | "phonecall", logicalName: string): string {
  return table === "annotation" ? `objectid_${logicalName}` : `regardingobjectid_${logicalName}_${table}`
}
