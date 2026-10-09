// The sales data gateway over Dataverse. It grows ticket by ticket (spec
// #23): methods not built yet throw a "not available yet" error naming the
// ticket that brings them, so a page that calls one fails loudly.

import type { CurrentUser, SalesGateway } from "@/data/gateway"
import type { Id, User } from "@/sales"
import type { DataverseClient, SystemUserRow } from "./client"

/** Thrown by gateway methods that a later build ticket implements. */
export class NotAvailableYetError extends Error {
  constructor(method: string, ticket: string) {
    super(`${method} is not available yet (${ticket})`)
    this.name = "NotAvailableYetError"
  }
}

function notYet<K extends keyof SalesGateway>(method: K, ticket: string): SalesGateway[K] {
  const fail = (): Promise<never> => Promise.reject(new NotAvailableYetError(method, ticket))
  return fail as SalesGateway[K]
}

/** OData string literal for a GUID; rejects anything that isn't one. */
function guid(id: Id): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Not a Dataverse id: ${id}`)
  }
  return id.toLowerCase()
}

export function toUser(row: SystemUserRow): User {
  return {
    id: row.systemuserid,
    fullName: row.fullname ?? "",
    email: row.internalemailaddress ?? "",
    managerId: row._parentsystemuserid_value ?? null,
    // Role membership is read by listSalespeople (#34); users read elsewhere are not checked.
    isSalesperson: false,
  }
}

export class DataverseSalesGateway implements SalesGateway {
  private readonly client: DataverseClient
  private currentUser?: Promise<CurrentUser>

  constructor(client: DataverseClient) {
    this.client = client
  }

  // ---- People -------------------------------------------------------------

  /** Resolved once per session: the user doesn't change, and nor does their team in practice. */
  getCurrentUser(): Promise<CurrentUser> {
    this.currentUser ??= this.loadCurrentUser().catch((error: unknown) => {
      this.currentUser = undefined
      throw error
    })
    return this.currentUser
  }

  private async loadCurrentUser(): Promise<CurrentUser> {
    const userId = await this.client.whoAmI()
    const [user, reports] = await Promise.all([
      this.client.getSystemUser(userId),
      this.client.listSystemUsers(`_parentsystemuserid_value eq ${guid(userId)} and isdisabled eq false`),
    ])
    return {
      user: toUser(user),
      directReports: reports.map(toUser).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    }
  }

  listSalespeople = notYet("listSalespeople", "#34")

  // ---- Lists, search and Home ----------------------------------------------

  listLeads = notYet("listLeads", "#29")
  listOpportunities = notYet("listOpportunities", "#30")
  listAccounts = notYet("listAccounts", "#28")
  listContacts = notYet("listContacts", "#28")
  search = notYet("search", "#28")
  getHome = notYet("getHome", "#33")
  getPipeline = notYet("getPipeline", "#32")

  // ---- Record pages ---------------------------------------------------------

  getLead = notYet("getLead", "#29")
  getOpportunity = notYet("getOpportunity", "#30")
  getAccount = notYet("getAccount", "#28")
  getContact = notYet("getContact", "#28")

  // ---- Accounts and Contacts ------------------------------------------------

  createAccount = notYet("createAccount", "#28")
  updateAccount = notYet("updateAccount", "#28")
  createContact = notYet("createContact", "#28")
  updateContact = notYet("updateContact", "#28")

  // ---- Leads ----------------------------------------------------------------

  createLead = notYet("createLead", "#29")
  updateLead = notYet("updateLead", "#29")
  setLeadStatus = notYet("setLeadStatus", "#29")
  disqualifyLead = notYet("disqualifyLead", "#29")
  reopenLead = notYet("reopenLead", "#29")
  getQualifySuggestions = notYet("getQualifySuggestions", "#31")
  qualifyLead = notYet("qualifyLead", "#31")

  // ---- Opportunities --------------------------------------------------------

  createOpportunity = notYet("createOpportunity", "#30")
  updateOpportunity = notYet("updateOpportunity", "#30")
  changeStage = notYet("changeStage", "#30")
  closeOpportunity = notYet("closeOpportunity", "#30")
  reopenOpportunity = notYet("reopenOpportunity", "#30")

  // ---- Ownership and activities ---------------------------------------------

  reassign = notYet("reassign", "#34")
  listActivities = notYet("listActivities", "#33")
  addNote = notYet("addNote", "#33")
  addTask = notYet("addTask", "#33")
  addPhoneCall = notYet("addPhoneCall", "#33")
  completeTask = notYet("completeTask", "#33")
}
