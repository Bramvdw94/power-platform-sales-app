import type { SalesGateway } from "@/data/gateway"
import { activityRelated, fullName, opportunityParents, opportunityRelated, toEngineRecord, type Id } from "@/sales"
import type { EngineRecord, EngineTable, Parents, Related } from "@/sales/engine"

/** A real record as a rule sees it, for "Try it on a record". */
export type TrySubject = { record: EngineRecord; parents?: Parents; related?: Related }

export type TryCandidate = { id: Id; label: string }

const PAGE = { view: "all" as const, pageSize: 20 }

/** Records of a table to pick from, matching what was typed. */
export async function findCandidates(gateway: SalesGateway, table: EngineTable, search: string): Promise<TryCandidate[]> {
  const query = { ...PAGE, search: search.trim() || undefined }
  switch (table) {
    case "lead":
      return (await gateway.listLeads(query)).items.map((l) => ({ id: l.id, label: `${fullName(l)} · ${l.company}` }))
    case "opportunity":
      return (await gateway.listOpportunities(query)).items.map((o) => ({ id: o.id, label: o.name }))
    case "account":
      return (await gateway.listAccounts(query)).items.map((a) => ({ id: a.id, label: a.name }))
    case "contact":
      return (await gateway.listContacts(query)).items.map((c) => ({ id: c.id, label: fullName(c) }))
  }
}

/** The record with its parents one hop up and its related lists, as the plug-in would see them on a save. */
export async function loadSubject(gateway: SalesGateway, table: EngineTable, id: Id): Promise<TrySubject> {
  const activities = await gateway.listActivities({ type: table, id })
  switch (table) {
    case "lead": {
      const { lead } = await gateway.getLead(id)
      return { record: toEngineRecord(lead), related: activityRelated(activities) }
    }
    case "opportunity": {
      const data = await gateway.getOpportunity(id)
      return {
        record: toEngineRecord(data.opportunity),
        parents: opportunityParents({ account: data.account, primaryContact: data.primaryContact, originatingLead: data.originatingLead }),
        related: opportunityRelated(activities, data.productLines, data.quotes),
      }
    }
    case "account": {
      const data = await gateway.getAccount(id)
      return {
        record: toEngineRecord(data.account),
        related: { ...activityRelated(activities), contacts: data.contacts.map(toEngineRecord), opportunities: data.opportunities.map(toEngineRecord) },
      }
    }
    case "contact": {
      const data = await gateway.getContact(id)
      return {
        record: toEngineRecord(data.contact),
        parents: { account: data.account ? toEngineRecord(data.account) : null },
        related: activityRelated(activities),
      }
    }
  }
}
