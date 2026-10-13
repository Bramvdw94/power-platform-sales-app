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
  address1_telephone1?: string | null
}

export const SYSTEM_USER_COLUMNS = [
  "systemuserid",
  "fullname",
  "internalemailaddress",
  "_parentsystemuserid_value",
  "address1_telephone1",
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
  vibe_forecastcategory?: number | null
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
  "vibe_forecastcategory",
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

/** The vibe_product columns the app reads. */
export type ProductRow = Row & {
  vibe_productid: Id
  vibe_name?: string | null
  vibe_productcode?: string | null
  vibe_description?: string | null
  vibe_unit?: number | null
  vibe_listprice?: number | null
  vibe_vatrate?: number | null
  /** 0 active, 1 retired. */
  statecode?: number | null
  createdon?: string | null
}

export const PRODUCT_COLUMNS = [
  "vibe_productid",
  "vibe_name",
  "vibe_productcode",
  "vibe_description",
  "vibe_unit",
  "vibe_listprice",
  "vibe_vatrate",
  "statecode",
  "createdon",
] as const
/** The vibe_productline columns the app reads. */
export type ProductLineRow = Row & {
  vibe_productlineid: Id
  _vibe_opportunityid_value?: Id | null
  _vibe_productid_value?: Id | null
  vibe_name?: string | null
  vibe_description?: string | null
  vibe_quantity?: number | null
  vibe_unitprice?: number | null
  vibe_listpriceatadd?: number | null
  vibe_discountpercent?: number | null
  vibe_lineamount?: number | null
  createdon?: string | null
}

export const PRODUCT_LINE_COLUMNS = [
  "vibe_productlineid",
  "_vibe_opportunityid_value",
  "_vibe_productid_value",
  "vibe_name",
  "vibe_description",
  "vibe_quantity",
  "vibe_unitprice",
  "vibe_listpriceatadd",
  "vibe_discountpercent",
  "vibe_lineamount",
  "createdon",
] as const

/** A Product line's lookups, as navigation properties for `@odata.bind` writes. */
export const PRODUCT_LINE_NAVIGATION = { opportunity: "vibe_OpportunityId", product: "vibe_ProductId" } as const

/** The vibe_quote columns the app reads. */
export type QuoteRow = Row & {
  vibe_quoteid: Id
  /** The Quote number, Q-00001 (an autonumber). */
  vibe_name?: string | null
  vibe_revision?: number | null
  /** Status: 1 Draft (the Active state), 2 Sent, 3 Accepted, 4 Rejected, 5 Revised (Inactive state). */
  statuscode?: number | null
  _vibe_opportunityid_value?: Id | null
  _vibe_accountid_value?: Id | null
  _vibe_contactid_value?: Id | null
  vibe_validuntil?: string | null
  vibe_nettotal?: number | null
  vibe_vat21?: number | null
  vibe_vat9?: number | null
  vibe_grosstotal?: number | null
  vibe_senton?: string | null
  _vibe_sentby_value?: Id | null
  vibe_sentvia?: string | null
  vibe_sentto?: string | null
  _vibe_quotetemplateid_value?: Id | null
  /** The stored PDF's file name; set once the Quote was sent with its PDF. */
  vibe_storedpdf_name?: string | null
  _ownerid_value?: Id | null
  createdon?: string | null
}

export const QUOTE_COLUMNS = [
  "vibe_quoteid",
  "vibe_name",
  "vibe_revision",
  "statuscode",
  "_vibe_opportunityid_value",
  "_vibe_accountid_value",
  "_vibe_contactid_value",
  "vibe_validuntil",
  "vibe_nettotal",
  "vibe_vat21",
  "vibe_vat9",
  "vibe_grosstotal",
  "vibe_senton",
  "_vibe_sentby_value",
  "vibe_sentvia",
  "vibe_sentto",
  "_vibe_quotetemplateid_value",
  "vibe_storedpdf_name",
  "_ownerid_value",
  "createdon",
] as const

/** A Quote's lookups, as navigation properties for `@odata.bind` writes. */
export const QUOTE_NAVIGATION = {
  opportunity: "vibe_OpportunityId",
  account: "vibe_AccountId",
  contact: "vibe_ContactId",
  sentBy: "vibe_SentBy",
  template: "vibe_QuoteTemplateId",
} as const

/** The file column that keeps the exact PDF a Sent Quote went out with. */
export const QUOTE_PDF_COLUMN = "vibe_storedpdf"

/** The vibe_quotetemplate columns the app reads. */
export type QuoteTemplateRow = Row & {
  vibe_quotetemplateid: Id
  vibe_name?: string | null
  vibe_isdefault?: boolean | null
  vibe_definition?: string | null
}

export const QUOTE_TEMPLATE_COLUMNS = ["vibe_quotetemplateid", "vibe_name", "vibe_isdefault", "vibe_definition"] as const

/** The vibe_quotesettings columns the app reads: one row. */
export type QuoteSettingsRow = Row & {
  vibe_quotesettingsid: Id
  vibe_companyname?: string | null
  vibe_address?: string | null
  vibe_phone?: string | null
  vibe_email?: string | null
  vibe_website?: string | null
  vibe_kvk?: string | null
  vibe_btwid?: string | null
  vibe_iban?: string | null
  vibe_logo?: string | null
  vibe_defaultvaliditydays?: number | null
  vibe_termsurl?: string | null
  vibe_termstext?: string | null
  vibe_emailsubject?: string | null
  vibe_emailmessage?: string | null
}

export const QUOTE_SETTINGS_COLUMNS = [
  "vibe_quotesettingsid",
  "vibe_companyname",
  "vibe_address",
  "vibe_phone",
  "vibe_email",
  "vibe_website",
  "vibe_kvk",
  "vibe_btwid",
  "vibe_iban",
  "vibe_logo",
  "vibe_defaultvaliditydays",
  "vibe_termsurl",
  "vibe_termstext",
  "vibe_emailsubject",
  "vibe_emailmessage",
] as const

/** An email sent from the signed-in user's own Outlook mailbox through the Office 365 Outlook connector. */
export type OutgoingEmail = {
  to: string
  cc?: string
  subject: string
  /** HTML. */
  body: string
  attachment: { name: string; bytes: Uint8Array }
}

/** The vibe_quoteline columns the app reads. */
export type QuoteLineRow = Row & {
  vibe_quotelineid: Id
  _vibe_quoteid_value?: Id | null
  _vibe_productid_value?: Id | null
  vibe_name?: string | null
  vibe_description?: string | null
  vibe_quantity?: number | null
  vibe_unitprice?: number | null
  vibe_discountpercent?: number | null
  vibe_vatrate?: number | null
  vibe_lineamount?: number | null
  createdon?: string | null
}

export const QUOTE_LINE_COLUMNS = [
  "vibe_quotelineid",
  "_vibe_quoteid_value",
  "_vibe_productid_value",
  "vibe_name",
  "vibe_description",
  "vibe_quantity",
  "vibe_unitprice",
  "vibe_discountpercent",
  "vibe_vatrate",
  "vibe_lineamount",
  "createdon",
] as const

/** A Quote line's lookups, as navigation properties for `@odata.bind` writes. */
export const QUOTE_LINE_NAVIGATION = { quote: "vibe_QuoteId", product: "vibe_ProductId" } as const

/** The vibe_quota columns the app reads. */
export type QuotaRow = Row & {
  vibe_quotaid: Id
  _vibe_salespersonid_value?: Id | null
  /** Date only: the first day of the month. */
  vibe_month?: string | null
  vibe_amount?: number | null
}

export const QUOTA_COLUMNS = ["vibe_quotaid", "_vibe_salespersonid_value", "vibe_month", "vibe_amount"] as const

/** A Quota's Salesperson lookup (to systemuser), as a navigation property. */
export const QUOTA_SALESPERSON_NAVIGATION = "vibe_SalespersonId"

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
  /** Only Product lines, Quote lines and Draft Quotes are removed; every other table is deactivated instead. */
  delete(id: Id): Promise<void>
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
  products: TableClient<ProductRow>
  productLines: TableClient<ProductLineRow>
  quotas: TableClient<QuotaRow>
  quotes: TableClient<QuoteRow>
  quoteLines: TableClient<QuoteLineRow>
  quoteTemplates: TableClient<QuoteTemplateRow>
  quoteSettings: TableClient<QuoteSettingsRow>
  /** Puts a file in a Quote's file column. */
  uploadQuotePdf(quoteId: Id, fileName: string, bytes: Uint8Array): Promise<void>
  downloadQuotePdf(quoteId: Id): Promise<Uint8Array>
  sendEmail(email: OutgoingEmail): Promise<void>
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
