import { beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_PIPELINE_FILTER, stageTotals, type Id } from "@/sales"
import { GatewayError, QualifyError, type SalesGateway } from "../gateway"
import { SEED_IDS, SEED_USERS, createSeededStore, InMemorySalesGateway, type InMemorySalesStore } from "."

// Thursday 9 October 2026, mid-morning.
const NOW = new Date(2026, 9, 9, 10, 30)
const TODAY = "2026-10-09"

const { megan, adele, alex, diego, bram } = SEED_USERS
const { accounts: A, contacts: C, leads: L, opportunities: O, tasks: T, notes: N, phoneCalls: P, products: PR, productLines: PL, quotes: Q, quoteLines: QL } = SEED_IDS

const DOWNLOAD_PDF = { route: "download", pdf: new Uint8Array([37, 80, 68, 70]) } as const

let store: InMemorySalesStore
const as = (userId: Id): SalesGateway => new InMemorySalesGateway(store, { userId, now: () => NOW })

beforeEach(() => {
  store = createSeededStore(NOW)
})

async function errorOf(promise: Promise<unknown>): Promise<GatewayError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof GatewayError) return error
    throw error
  }
  throw new Error("Expected a GatewayError")
}

describe("current user and team", () => {
  it("gives a manager her direct reports", async () => {
    const me = await as(megan.id).getCurrentUser()
    expect(me.user.fullName).toBe("Megan Bowen")
    expect(me.directReports.map((u) => u.id).sort()).toEqual([adele.id, alex.id].sort())
  })

  it("gives a salesperson no reports", async () => {
    expect((await as(diego.id).getCurrentUser()).directReports).toEqual([])
  })

  it("lists only salespeople as Reassign targets", async () => {
    const people = await as(adele.id).listSalespeople()
    expect(people.map((u) => u.fullName)).toEqual(["Adele Vance", "Alex Wilber", "Diego Siciliani", "Megan Bowen"])
  })
})

describe("the edit rule: Owner or the Owner's manager", () => {
  it.each([
    ["the Owner", adele.id, true],
    ["the Owner's manager", megan.id, true],
    ["a peer in the same team", alex.id, false],
    ["a salesperson outside the team", diego.id, false],
  ])("%s may edit: %s", async (_label, userId, allowed) => {
    const gateway = as(userId)
    expect((await gateway.getLead(L.notContacted)).canEdit).toBe(allowed)
    const update = gateway.updateLead(L.notContacted, { jobTitle: "CEO" })
    if (allowed) {
      expect((await update).jobTitle).toBe("CEO")
    } else {
      expect((await errorOf(update)).code).toBe("forbidden")
      expect((await as(adele.id).getLead(L.notContacted)).lead.jobTitle).toBeUndefined()
    }
  })

  it.each([
    ["update an Opportunity", (g: SalesGateway) => g.updateOpportunity(O.proposal, { nextStep: "x" })],
    ["change its Stage", (g: SalesGateway) => g.changeStage(O.proposal, "negotiation")],
    ["close it", (g: SalesGateway) => g.closeOpportunity(O.proposal, { outcome: "won" })],
    ["reopen a closed one", (g: SalesGateway) => g.reopenOpportunity(O.won, "proposal")],
    ["reassign it", (g: SalesGateway) => g.reassign({ type: "opportunity", id: O.proposal }, adele.id)],
    ["add a Note", (g: SalesGateway) => g.addNote({ type: "opportunity", id: O.proposal }, { title: "x", text: "" })],
    ["complete a Task", (g: SalesGateway) => g.completeTask(T.overdue)],
    ["update an Account", (g: SalesGateway) => g.updateAccount(A.fabrikam, { phone: "1" })],
    ["update a Contact", (g: SalesGateway) => g.updateContact(C.pieter, { phone: "1" })],
    ["disqualify a Lead", (g: SalesGateway) => g.disqualifyLead(L.working, { reason: "noNeed" })],
    ["qualify a Lead", (g: SalesGateway) =>
      g.qualifyLead(L.working, {
        account: { existingId: A.fabrikam },
        contact: { existingId: C.pieter },
        opportunity: { name: "Fabrikam - x", estimatedValue: 1, expectedCloseDate: TODAY },
      })],
  ])("refuses a peer who tries to %s", async (_label, act) => {
    // Everything above belongs to Alex; Adele is his peer, Diego is outside the team.
    expect((await errorOf(act(as(adele.id)))).code).toBe("forbidden")
    expect((await errorOf(act(as(diego.id)))).code).toBe("forbidden")
  })

  it("lets anyone link their record to an Account someone else owns", async () => {
    const opportunity = await as(diego.id).createOpportunity({
      name: "Fabrikam NV - Backup",
      accountId: A.fabrikam,
      primaryContactId: C.pieter,
      stage: "qualification",
      estimatedValue: 5000,
      expectedCloseDate: "2026-12-01",
    })
    expect(opportunity).toMatchObject({ ownerId: diego.id, accountName: "Fabrikam NV", primaryContactName: "Pieter Claes" })
  })
})

describe("creating records", () => {
  it("makes the current user the Owner and starts a Lead as Not Contacted", async () => {
    const lead = await as(alex.id).createLead({ lastName: "Smit", company: "Litware", leadSource: "website" })
    expect(lead).toMatchObject({ ownerId: alex.id, ownerName: "Alex Wilber", status: "notContacted" })
    expect((await as(alex.id).getLead(lead.id)).lead.company).toBe("Litware")
  })

  it("refuses a record with missing required fields", async () => {
    const error = await errorOf(as(alex.id).createLead({ lastName: "", company: "" }))
    expect(error.code).toBe("invalid")
    expect(Object.keys(error.fieldErrors)).toEqual(["lastName", "company"])
  })

  it("defaults the Probability from the Stage, unless given", async () => {
    const base = { name: "X", accountId: A.tailwind, estimatedValue: 1, expectedCloseDate: TODAY }
    expect((await as(adele.id).createOpportunity({ ...base, stage: "proposal" })).probability).toBe(50)
    expect((await as(adele.id).createOpportunity({ ...base, stage: "proposal", probability: 65 })).probability).toBe(65)
  })

  it("refuses an Opportunity created closed or on a missing Account", async () => {
    const base = { name: "X", estimatedValue: 1, expectedCloseDate: TODAY }
    expect(
      (await errorOf(as(adele.id).createOpportunity({ ...base, accountId: A.tailwind, stage: "closedWon" as never }))).code,
    ).toBe("invalid")
    expect((await errorOf(as(adele.id).createOpportunity({ ...base, accountId: "nope", stage: "proposal" }))).code).toBe(
      "notFound",
    )
  })

  it("returns copies, so callers can't change stored data by accident", async () => {
    const { lead } = await as(adele.id).getLead(L.notContacted)
    lead.company = "Changed"
    expect((await as(adele.id).getLead(L.notContacted)).lead.company).toBe("Tailspin Toys")
  })
})

describe("Lead lifecycle", () => {
  it("moves between Not Contacted and Working by hand", async () => {
    const adeleGateway = as(adele.id)
    expect((await adeleGateway.setLeadStatus(L.notContacted, "working")).status).toBe("working")
    expect((await adeleGateway.setLeadStatus(L.notContacted, "notContacted")).status).toBe("notContacted")
  })

  it("needs a Disqualify reason", async () => {
    const error = await errorOf(as(alex.id).disqualifyLead(L.working, {}))
    expect(error.code).toBe("invalid")
    expect(error.fieldErrors).toHaveProperty("reason")
    expect((await as(alex.id).getLead(L.working)).lead.status).toBe("working")
  })

  it("records when and by whom a Lead was disqualified", async () => {
    const lead = await as(megan.id).disqualifyLead(L.working, { reason: "duplicate", comment: " Same as Thomas P. " })
    expect(lead).toMatchObject({
      status: "disqualified",
      disqualifyReason: "duplicate",
      disqualifyComment: "Same as Thomas P.",
      disqualifiedById: megan.id,
      disqualifiedOn: NOW.toISOString(),
    })
  })

  it("reopens a Disqualified Lead to Working", async () => {
    const lead = await as(adele.id).reopenLead(L.disqualified)
    expect(lead.status).toBe("working")
    expect(lead.disqualifyReason).toBeUndefined()
  })

  it.each([
    ["set a Qualified Lead to Working", (g: SalesGateway) => g.setLeadStatus(L.qualified, "working")],
    ["edit a Qualified Lead", (g: SalesGateway) => g.updateLead(L.qualified, { phone: "1" })],
    ["edit a Disqualified Lead", (g: SalesGateway) => g.updateLead(L.disqualified, { phone: "1" })],
    ["disqualify a Qualified Lead", (g: SalesGateway) => g.disqualifyLead(L.qualified, { reason: "other" })],
    ["reopen a Working Lead", (g: SalesGateway) => g.reopenLead(L.notContacted)],
  ])("refuses to %s", async (_label, act) => {
    expect((await errorOf(act(as(adele.id)))).code).toBe("invalid")
  })
})

describe("Qualify", () => {
  const details = { name: "Fabrikam NV - Managed workplace", estimatedValue: 36000, expectedCloseDate: "2026-12-15" }

  it("suggests Accounts and Contacts without preselecting a weak match", async () => {
    const suggestions = await as(alex.id).getQualifySuggestions(L.working)
    expect(suggestions.opportunityName).toBe("Fabrikam - ")
    expect(suggestions.accounts.matches.map((a) => a.id)).toEqual([A.fabrikam])
    expect(suggestions.accounts.preselectedId).toBeNull()
    expect(suggestions.contacts.matches).toEqual([])
    expect(suggestions.contacts.preselectedId).toBeNull()
  })

  it("links an existing Account, creates the Contact and Opportunity, and qualifies the Lead", async () => {
    const gateway = as(alex.id)
    const accountBefore = (await gateway.getAccount(A.fabrikam)).account

    const result = await gateway.qualifyLead(L.working, {
      account: { existingId: A.fabrikam },
      contact: { createNew: true },
      opportunity: details,
    })

    expect(result.accountId).toBe(A.fabrikam)
    expect((await gateway.getAccount(A.fabrikam)).account).toEqual(accountBefore)

    const { contact } = await gateway.getContact(result.contactId)
    expect(contact).toMatchObject({
      firstName: "Thomas",
      lastName: "Peeters",
      jobTitle: "Head of IT",
      email: "thomas@fabrikam.example",
      accountId: A.fabrikam,
    })

    const { opportunity, originatingLead } = await gateway.getOpportunity(result.opportunityId)
    expect(opportunity).toMatchObject({
      name: details.name,
      accountId: A.fabrikam,
      primaryContactId: result.contactId,
      stage: "qualification",
      probability: 10,
      estimatedValue: 36000,
      expectedCloseDate: "2026-12-15",
      ownerId: alex.id,
      leadSource: "event",
      description: "Wants a managed workplace offer",
    })
    expect(originatingLead?.id).toBe(L.working)

    const lead = await gateway.getLead(L.working)
    expect(lead.lead.status).toBe("qualified")
    expect(lead.opportunity?.id).toBe(result.opportunityId)
  })

  it("gives the Opportunity the Lead's Owner when a manager qualifies", async () => {
    const result = await as(megan.id).qualifyLead(L.notContacted, {
      account: { createNew: true },
      contact: { createNew: true },
      opportunity: { name: "Tailspin Toys - Laptops", estimatedValue: 10000, expectedCloseDate: "2026-11-30" },
    })
    const { opportunity, account } = await as(megan.id).getOpportunity(result.opportunityId)
    expect(opportunity.ownerId).toBe(adele.id)
    expect(account).toMatchObject({ name: "Tailspin Toys" })
  })

  it("never moves an existing Contact at another Account", async () => {
    const result = await as(alex.id).qualifyLead(L.working, {
      account: { existingId: A.fabrikam },
      contact: { existingId: C.femke },
      opportunity: details,
    })
    expect((await as(alex.id).getContact(C.femke)).contact.accountId).toBe(A.northwind)
    expect(result.contactId).toBe(C.femke)
  })

  it("needs the Opportunity details", async () => {
    const error = await errorOf(
      as(alex.id).qualifyLead(L.working, {
        account: { createNew: true },
        contact: { createNew: true },
        opportunity: { name: "", estimatedValue: Number.NaN, expectedCloseDate: "" },
      }),
    )
    expect(Object.keys(error.fieldErrors).sort()).toEqual(["estimatedValue", "expectedCloseDate", "name"])
    expect((await as(alex.id).getLead(L.working)).lead.status).toBe("working")
  })

  it("reports the failed step and leaves the Lead open, so a retry can reuse what was created", async () => {
    const gateway = as(alex.id)
    const error = await errorOf(
      gateway.qualifyLead(L.working, {
        account: { createNew: true },
        contact: { existingId: "deleted-contact" },
        opportunity: details,
      }),
    )
    expect(error).toBeInstanceOf(QualifyError)
    const { step, created } = error as QualifyError
    expect(step).toBe("contact")
    expect(created.accountId).toBeDefined()
    expect((await gateway.getLead(L.working)).lead.status).toBe("working")

    const retry = await gateway.qualifyLead(L.working, {
      account: { existingId: created.accountId! },
      contact: { createNew: true },
      opportunity: details,
    })
    expect(retry.accountId).toBe(created.accountId)
    const accounts = await gateway.listAccounts({ view: "all", search: "Fabrikam" })
    expect(accounts.items.map((a) => a.name).sort()).toEqual(["Fabrikam", "Fabrikam NV"])
  })

  it("refuses to qualify a Lead twice", async () => {
    const error = await errorOf(
      as(adele.id).qualifyLead(L.qualified, {
        account: { existingId: A.tailwind },
        contact: { existingId: C.lotte },
        opportunity: details,
      }),
    )
    expect(error.code).toBe("invalid")
  })
})

describe("Opportunities", () => {
  it("resets the Probability on a Stage change, and keeps an override until the next one", async () => {
    const gateway = as(alex.id)
    expect((await gateway.changeStage(O.proposal, "qualification")).probability).toBe(10)
    expect((await gateway.updateOpportunity(O.proposal, { probability: 35 })).probability).toBe(35)
    expect((await gateway.changeStage(O.proposal, "negotiation")).probability).toBe(75)
  })

  it("closes as won with the actual value and records who closed it", async () => {
    const opportunity = await as(megan.id).closeOpportunity(O.proposal, { outcome: "won", actualValue: 18500 })
    expect(opportunity).toMatchObject({
      stage: "closedWon",
      probability: 100,
      actualValue: 18500,
      closeDate: TODAY,
      closedById: megan.id,
    })
  })

  it("asks for a Lost reason when closing as lost", async () => {
    const error = await errorOf(as(alex.id).closeOpportunity(O.proposal, { outcome: "lost" }))
    expect(error.fieldErrors).toHaveProperty("lostReason")
    expect((await as(alex.id).getOpportunity(O.proposal)).opportunity.stage).toBe("proposal")
  })

  it("keeps a closed Opportunity read-only until it is reopened", async () => {
    const gateway = as(alex.id)
    expect((await errorOf(gateway.updateOpportunity(O.won, { nextStep: "x" }))).code).toBe("invalid")
    expect((await errorOf(gateway.changeStage(O.won, "proposal"))).code).toBe("invalid")
    const reopened = await gateway.reopenOpportunity(O.won, "negotiation")
    expect(reopened).toMatchObject({ stage: "negotiation", probability: 75, actualValue: undefined, closeDate: undefined })
    expect((await gateway.updateOpportunity(O.won, { nextStep: "Renegotiate" })).nextStep).toBe("Renegotiate")
  })

  it("defaults the Forecast category from the Stage, on create and on Stage change", async () => {
    const gateway = as(alex.id)
    expect((await gateway.getOpportunity(O.proposal)).opportunity.forecastCategory).toBe("bestCase")
    const created = await gateway.createOpportunity({
      name: "Fabrikam NV - Support",
      accountId: A.fabrikam,
      stage: "negotiation",
      estimatedValue: 1000,
      expectedCloseDate: "2026-12-01",
    })
    expect(created.forecastCategory).toBe("commit")
    expect((await gateway.changeStage(created.id, "needsAnalysis")).forecastCategory).toBe("pipeline")
  })

  it("keeps a Forecast category override until the Stage changes, and resets it on reopen", async () => {
    const gateway = as(alex.id)
    expect((await gateway.updateOpportunity(O.proposal, { forecastCategory: "omitted" })).forecastCategory).toBe("omitted")
    expect((await gateway.updateOpportunity(O.proposal, { nextStep: "Call" })).forecastCategory).toBe("omitted")
    expect((await gateway.changeStage(O.proposal, "negotiation")).forecastCategory).toBe("commit")
    expect((await gateway.updateOpportunity(O.proposal, { forecastCategory: "omitted" })).forecastCategory).toBe("omitted")
    const closed = await gateway.closeOpportunity(O.proposal, { outcome: "won" })
    expect(closed.forecastCategory).toBeUndefined()
    expect((await gateway.reopenOpportunity(O.proposal, "proposal")).forecastCategory).toBe("bestCase")
  })

  it("refuses a Forecast category on a closed Opportunity", async () => {
    expect((await errorOf(as(alex.id).updateOpportunity(O.won, { forecastCategory: "commit" }))).code).toBe("invalid")
  })

  it("does not let an update change the Stage", async () => {
    const update = { nextStep: "Call", stage: "closedWon" } as never
    expect((await as(alex.id).updateOpportunity(O.proposal, update)).stage).toBe("proposal")
  })
})

describe("Reassign", () => {
  it("moves open Tasks and Phone Calls with the record, not completed ones or Notes", async () => {
    await as(adele.id).reassign({ type: "opportunity", id: O.qualification }, alex.id)

    const activities = await as(alex.id).listActivities({ type: "opportunity", id: O.qualification })
    const ownerOf = (id: string) => activities.find((a) => a.id === id)?.ownerId
    expect(ownerOf(T.dueLater)).toBe(alex.id)
    expect(ownerOf(P.open)).toBe(alex.id)
    expect(ownerOf(T.done)).toBe(adele.id)
    expect(ownerOf(P.logged)).toBe(adele.id)
    expect(ownerOf(N.kickoff)).toBe(adele.id)
    expect((await as(alex.id).getOpportunity(O.qualification)).opportunity.ownerName).toBe("Alex Wilber")
  })

  it("leaves an Account's Contacts and Opportunities with their Owners", async () => {
    await as(adele.id).reassign({ type: "account", id: A.tailwind }, diego.id)
    const { account, contacts, opportunities } = await as(adele.id).getAccount(A.tailwind)
    expect(account.ownerId).toBe(diego.id)
    expect(contacts.every((c) => c.ownerId === adele.id)).toBe(true)
    expect(opportunities.every((o) => o.ownerId === adele.id)).toBe(true)
  })

  it("lets a manager reassign a report's closed Opportunity and Qualified Lead", async () => {
    await as(megan.id).reassign({ type: "opportunity", id: O.won }, adele.id)
    await as(megan.id).reassign({ type: "lead", id: L.qualified }, alex.id)
    expect((await as(megan.id).getOpportunity(O.won)).opportunity.ownerId).toBe(adele.id)
    expect((await as(megan.id).getLead(L.qualified)).lead.ownerId).toBe(alex.id)
  })

  it("only hands records to salespeople", async () => {
    const error = await errorOf(as(adele.id).reassign({ type: "lead", id: L.notContacted }, bram.id))
    expect(error.code).toBe("invalid")
  })
})

describe("activities", () => {
  const record = { type: "opportunity" as const, id: O.qualification }

  it("shows open Tasks first, then the rest newest first", async () => {
    const timeline = await as(diego.id).listActivities(record)
    expect(timeline.map((a) => a.id)).toEqual([T.dueLater, P.open, N.kickoff, T.done, P.logged])
    expect(timeline[0]).toMatchObject({ regardingName: "Tailwind Traders - Managed workplace", ownerName: "Adele Vance" })
  })

  it("shows a call on a qualified Lead on its Account, labelled by its source", async () => {
    const gateway = as(adele.id)
    const call = await gateway.addPhoneCall({ type: "lead", id: L.qualified }, { subject: "Intro call", direction: "outgoing", date: TODAY })
    await gateway.addNote({ type: "contact", id: C.lotte }, { title: "Prefers email", text: "" })

    const timeline = await gateway.listAccountTimeline(A.tailwind)
    expect(timeline.find((a) => a.id === call.id)?.regarding).toEqual({ type: "lead", id: L.qualified })
    expect(timeline.find((a) => a.id === call.id)?.regardingName).toBe("Lotte de Groot")
    expect(timeline.map((a) => a.regarding.type)).toEqual(expect.arrayContaining(["lead", "contact", "opportunity"]))
    expect(timeline[0].id).toBe(T.dueLater)
  })

  it("keeps other Accounts' activities out of an Account's timeline", async () => {
    const timeline = await as(adele.id).listAccountTimeline(A.fabrikam)
    expect(timeline.map((a) => a.id)).not.toContain(T.dueLater)
    expect((await errorOf(as(adele.id).listAccountTimeline("missing"))).code).toBe("notFound")
  })

  it("adds a Note, a Task and a logged Phone Call, and completes the Task", async () => {
    const gateway = as(adele.id)
    await gateway.addNote(record, { title: "Budget", text: "Approved for Q1" })
    const task = await gateway.addTask(record, { subject: "Book demo", dueDate: "2026-10-12" })
    const call = await gateway.addPhoneCall(record, { subject: "Demo call", direction: "outgoing", date: TODAY })
    expect(call.completed).toBe(true)
    expect(task).toMatchObject({ ownerId: adele.id, completed: false })

    const done = await gateway.completeTask(task.id)
    expect(done).toMatchObject({ completed: true, completedOn: NOW.toISOString() })
    expect((await errorOf(gateway.completeTask(task.id))).code).toBe("invalid")
  })

  it("lets only the Owner or manager add activities", async () => {
    expect((await errorOf(as(alex.id).addTask(record, { subject: "Sneaky" }))).code).toBe("forbidden")
    expect((await as(megan.id).addTask(record, { subject: "Coach Adele" })).ownerId).toBe(megan.id)
  })
})

describe("lists and search", () => {
  it.each([
    [megan.id, "my", [O.negotiation]],
    [megan.id, "myTeam", [O.qualification, O.proposal, O.negotiation, O.won, O.lost]],
    [diego.id, "myTeam", [O.diegosProposal]],
    [diego.id, "all", Object.values(O)],
  ] as const)("%s sees view %s", async (userId, view, ids) => {
    const page = await as(userId).listOpportunities({ view })
    expect(page.items.map((o) => o.id).sort()).toEqual([...ids].sort())
    expect(page.totalCount).toBe(ids.length)
  })

  it("filters Leads by status and searches by name or email", async () => {
    const gateway = as(megan.id)
    expect((await gateway.listLeads({ view: "all", status: "working" })).items.map((l) => l.id).sort()).toEqual(
      [L.working, L.diegos].sort(),
    )
    expect((await gateway.listLeads({ view: "all", search: "sanne bak" })).items.map((l) => l.id)).toEqual([
      L.notContacted,
    ])
    expect((await gateway.listLeads({ view: "all", search: "@fabrikam" })).items.map((l) => l.id)).toEqual([
      L.working,
    ])
  })

  it("sorts and pages", async () => {
    const gateway = as(megan.id)
    const query = { view: "all" as const, sort: { field: "estimatedValue" as const, direction: "desc" as const }, pageSize: 2 }
    const first = await gateway.listOpportunities({ ...query, page: 1 })
    const second = await gateway.listOpportunities({ ...query, page: 2 })
    expect(first.items.map((o) => o.estimatedValue)).toEqual([120000, 60000])
    expect(second.items.map((o) => o.estimatedValue)).toEqual([48000, 30000])
    expect(first.totalCount).toBe(6)
  })

  it("searches every record type", async () => {
    const results = await as(diego.id).search("tail")
    expect(results.accounts.map((a) => a.name)).toEqual(["Tailwind Traders"])
    expect(results.opportunities).toHaveLength(2)
    expect(results.leads.map((l) => l.company).sort()).toEqual(["Tailspin Toys", "Tailwind Traders"])
    expect(results.contacts.map((c) => c.email)).toEqual(["lotte@tailwind.example"])
    expect(await as(diego.id).search("  ")).toEqual({ leads: [], opportunities: [], accounts: [], contacts: [] })
  })
})

describe("Pipeline and Home", () => {
  it("opens on My team with closed deals hidden", async () => {
    const opportunities = await as(megan.id).getPipeline(DEFAULT_PIPELINE_FILTER)
    expect(opportunities.map((o) => o.id)).toEqual([O.proposal, O.negotiation, O.qualification])
    const totals = stageTotals(opportunities)
    expect(totals.negotiation).toEqual({ count: 1, total: 120000, weighted: 96000 })
    expect(totals.proposal).toEqual({ count: 1, total: 20000, weighted: 10000 })
  })

  it("shows closed deals and everyone's on request", async () => {
    const opportunities = await as(megan.id).getPipeline({ owner: "everyone", closeDate: "any", showClosed: true })
    expect(opportunities).toHaveLength(6)
    expect(stageTotals(opportunities).closedWon.total).toBe(27500)
  })

  it("gives each salesperson their own work", async () => {
    const alexHome = await as(alex.id).getHome()
    expect(alexHome.openTasks.map((t) => t.id)).toEqual([T.overdue])
    expect(alexHome.opportunitiesClosingThisMonth.map((o) => o.id)).toEqual([O.proposal])
    expect(alexHome.leadsNotContacted).toEqual([])

    const adeleHome = await as(adele.id).getHome()
    expect(adeleHome.openTasks.map((t) => t.id)).toEqual([T.dueLater])
    expect(adeleHome.leadsNotContacted.map((l) => l.id)).toEqual([L.notContacted])
    expect(adeleHome.opportunitiesClosingThisMonth).toEqual([])
  })
})

describe("Products", () => {
  const { products } = SEED_IDS
  const input = { name: "Support", code: "SUP-M", unit: "month", listPrice: 99, vatRate: 21 } as const

  it("lets everyone read the catalogue", async () => {
    for (const user of [megan, adele, alex, diego]) {
      expect((await as(user.id).listProducts({})).totalCount).toBe(4)
    }
    expect((await as(adele.id).listProducts({ status: "retired" })).items.map((p) => p.id)).toEqual([products.retired])
  })

  it("lets only a Catalogue manager create, change and retire", async () => {
    for (const user of [adele, alex, diego]) {
      expect((await errorOf(as(user.id).createProduct(input))).code).toBe("forbidden")
      expect((await errorOf(as(user.id).updateProduct(products.licence, { listPrice: 1 }))).code).toBe("forbidden")
      expect((await errorOf(as(user.id).retireProduct(products.licence))).code).toBe("forbidden")
    }
    expect(store.products.get(products.licence)).toMatchObject({ listPrice: 22.5, retired: false })
  })

  it("lets a System Administrator manage the catalogue too", async () => {
    await expect(as(bram.id).updateProduct(products.licence, { listPrice: 30 })).resolves.toBeDefined()
  })

  it("refuses a duplicate Product code, whatever its case", async () => {
    const error = await errorOf(as(megan.id).createProduct({ ...input, code: " cons-hr " }))
    expect(error).toMatchObject({ code: "invalid", fieldErrors: { code: "This Product code is already used." } })
    const edit = await errorOf(as(megan.id).updateProduct(products.licence, { code: "WS-DAY" }))
    expect(edit.fieldErrors.code).toBeDefined()
    await expect(as(megan.id).updateProduct(products.licence, { code: "lic-m365" })).resolves.toMatchObject({ code: "lic-m365" })
  })

  it("keeps a Retired Product and clears a blank description", async () => {
    const product = await as(megan.id).updateProduct(products.consultingHour, { description: "" })
    expect(product.description).toBeUndefined()
    expect(await as(megan.id).retireProduct(products.consultingHour)).toMatchObject({ retired: true })
    expect((await as(adele.id).listProducts({ status: "active" })).items.map((p) => p.id)).not.toContain(products.consultingHour)
    expect(await as(adele.id).getProduct(products.consultingHour)).toMatchObject({ retired: true })
  })
})

describe("Quotas", () => {
  const from = "2026-10-01"

  it("shows a salesperson only their own Quota", async () => {
    const quotas = await as(adele.id).listQuotas({ scope: "myTeam", from, months: 6 })
    expect(quotas.map((q) => [q.salespersonName, q.month, q.amount])).toEqual([
      ["Adele Vance", "2026-10-01", 40000],
      ["Adele Vance", "2026-11-01", 45000],
    ])
    expect(await as(diego.id).listQuotas({ scope: "me", from, months: 6 })).toEqual([])
  })

  it("shows a manager her own and her direct reports' Quotas, or just her own", async () => {
    const team = await as(megan.id).listQuotas({ scope: "myTeam", from, months: 6 })
    expect(new Set(team.map((q) => q.salespersonName))).toEqual(new Set(["Adele Vance", "Alex Wilber", "Megan Bowen"]))
    const mine = await as(megan.id).listQuotas({ scope: "me", from, months: 6 })
    expect(mine.map((q) => q.salespersonName)).toEqual(["Megan Bowen"])
  })

  it("limits the months shown", async () => {
    expect(await as(adele.id).listQuotas({ scope: "me", from, months: 1 })).toHaveLength(1)
    expect(await as(adele.id).listQuotas({ scope: "me", from: "2026-11-01", months: 6 })).toHaveLength(1)
  })

  it("lets a manager set a direct report's Quota, creating or changing the row", async () => {
    const gateway = as(megan.id)
    expect((await gateway.setQuota(adele.id, "2026-12-01", 50000)).amount).toBe(50000)
    expect((await gateway.setQuota(adele.id, "2026-10-01", 41000)).amount).toBe(41000)
    const adeles = await as(adele.id).listQuotas({ scope: "me", from, months: 6 })
    expect(adeles.map((q) => [q.month, q.amount])).toEqual([["2026-10-01", 41000], ["2026-11-01", 45000], ["2026-12-01", 50000]])
  })

  it("refuses to set your own Quota, a peer's, or an outsider's", async () => {
    expect((await errorOf(as(megan.id).setQuota(megan.id, "2026-10-01", 1))).code).toBe("forbidden")
    expect((await errorOf(as(adele.id).setQuota(adele.id, "2026-10-01", 1))).code).toBe("forbidden")
    expect((await errorOf(as(alex.id).setQuota(adele.id, "2026-10-01", 1))).code).toBe("forbidden")
    expect((await errorOf(as(megan.id).setQuota(diego.id, "2026-10-01", 1))).code).toBe("forbidden")
  })

  it("refuses a month that is not the first, and a negative amount", async () => {
    expect((await errorOf(as(megan.id).setQuota(adele.id, "2026-10-15", 1))).fieldErrors.month).toBeDefined()
    expect((await errorOf(as(megan.id).setQuota(adele.id, "2026-10-01", -5))).fieldErrors.amount).toBeDefined()
  })
})

describe("Product lines", () => {
  it("come with the Opportunity, oldest first, and add up to its Estimated value", async () => {
    const details = await as(alex.id).getOpportunity(O.proposal)
    expect(details.productLines.map((l) => l.id)).toEqual([PL.proposalConsulting, PL.proposalWorkshop, PL.proposalLicences])
    expect(details.opportunity.estimatedValue).toBe(20000)
    expect((await as(alex.id).listProductLines(O.proposal)).length).toBe(3)
    expect((await as(adele.id).getOpportunity(O.qualification)).productLines).toEqual([])
  })

  it("start from the Product's description and List price, and make the Estimated value their total", async () => {
    const line = await as(adele.id).addProductLine(O.qualification, { productId: PR.consultingHour, quantity: 2 })
    expect(line).toMatchObject({
      productName: "Consulting",
      description: "Senior consultant, billed per hour.",
      quantity: 2,
      unitPrice: 125,
      listPriceAtAdd: 125,
      discountPercent: 0,
      lineAmount: 250,
    })
    expect((await as(adele.id).getOpportunity(O.qualification)).opportunity.estimatedValue).toBe(250)
  })

  it("keep the List price they started from when the unit price is changed or the Product's price moves", async () => {
    const line = await as(adele.id).addProductLine(O.qualification, { productId: PR.workshopDay, quantity: 1, unitPrice: 1200, discountPercent: 10 })
    expect(line).toMatchObject({ unitPrice: 1200, listPriceAtAdd: 1450, lineAmount: 1080 })
    await as(megan.id).updateProduct(PR.workshopDay, { listPrice: 1600 })
    const [kept] = await as(adele.id).listProductLines(O.qualification)
    expect(kept).toMatchObject({ listPriceAtAdd: 1450, unitPrice: 1200 })
  })

  it("round each line to cents before adding them up", async () => {
    const gateway = as(adele.id)
    for (const unitPrice of [0.15, 0.15, 0.15]) {
      await gateway.addProductLine(O.qualification, { productId: PR.licence, quantity: 1, unitPrice, discountPercent: 50 })
    }
    expect((await gateway.getOpportunity(O.qualification)).opportunity.estimatedValue).toBe(0.24)
  })

  it("recalculate the Estimated value when a line changes or goes", async () => {
    const gateway = as(alex.id)
    await gateway.updateProductLine(PL.proposalConsulting, { quantity: 80 })
    expect((await gateway.getOpportunity(O.proposal)).opportunity.estimatedValue).toBe(17500)
    await gateway.removeProductLine(PL.proposalLicences)
    expect((await gateway.getOpportunity(O.proposal)).opportunity.estimatedValue).toBe(17250)
  })

  it("leave the Estimated value as it was when the last line is removed, and typeable again", async () => {
    const gateway = as(alex.id)
    for (const id of [PL.proposalConsulting, PL.proposalWorkshop]) await gateway.removeProductLine(id)
    expect((await gateway.getOpportunity(O.proposal)).opportunity.estimatedValue).toBe(250)
    await gateway.removeProductLine(PL.proposalLicences)
    expect((await gateway.getOpportunity(O.proposal)).opportunity.estimatedValue).toBe(250)
    expect((await gateway.updateOpportunity(O.proposal, { estimatedValue: 12345 })).estimatedValue).toBe(12345)
  })

  it("refuse a typed Estimated value while lines exist, but not an unchanged one", async () => {
    const gateway = as(alex.id)
    expect((await errorOf(gateway.updateOpportunity(O.proposal, { estimatedValue: 1 }))).fieldErrors).toHaveProperty("estimatedValue")
    expect((await gateway.updateOpportunity(O.proposal, { estimatedValue: 20000, nextStep: "Call" })).nextStep).toBe("Call")
  })

  it("refuse a retired Product, a quantity of zero and a discount above 100", async () => {
    const gateway = as(adele.id)
    expect((await errorOf(gateway.addProductLine(O.qualification, { productId: PR.retired, quantity: 1 }))).fieldErrors).toHaveProperty("productId")
    const errors = (await errorOf(gateway.addProductLine(O.qualification, { productId: PR.licence, quantity: 0, discountPercent: 101 }))).fieldErrors
    expect(Object.keys(errors).sort()).toEqual(["discountPercent", "quantity"])
    expect((await gateway.listProductLines(O.qualification)).length).toBe(0)
  })

  it("follow the Opportunity: its Owner and the Owner's manager change them, a peer or outsider cannot", async () => {
    expect((await errorOf(as(alex.id).addProductLine(O.qualification, { productId: PR.licence, quantity: 1 }))).code).toBe("forbidden")
    expect((await errorOf(as(diego.id).removeProductLine(PL.proposalLicences))).code).toBe("forbidden")
    expect((await errorOf(as(adele.id).updateProductLine(PL.proposalLicences, { quantity: 2 }))).code).toBe("forbidden")
    await as(megan.id).updateProductLine(PL.proposalLicences, { quantity: 2 })
    await as(megan.id).addProductLine(O.qualification, { productId: PR.licence, quantity: 1 })
  })

  it("are read-only once the Opportunity is closed", async () => {
    const gateway = as(alex.id)
    expect((await gateway.getOpportunity(O.won)).productLines.length).toBe(2)
    expect((await errorOf(gateway.addProductLine(O.won, { productId: PR.licence, quantity: 1 }))).code).toBe("invalid")
    expect((await errorOf(gateway.updateProductLine(PL.wonWorkshop, { quantity: 1 }))).code).toBe("invalid")
    expect((await errorOf(gateway.removeProductLine(PL.wonWorkshop))).code).toBe("invalid")
  })

  it("keep their Product when the Product is retired, and a Product's name on the line", async () => {
    await as(megan.id).retireProduct(PR.consultingHour)
    const lines = await as(alex.id).listProductLines(O.proposal)
    expect(lines.find((l) => l.id === PL.proposalConsulting)?.productName).toBe("Consulting")
    await as(alex.id).updateProductLine(PL.proposalConsulting, { quantity: 50 })
  })
})

describe("Quotes", () => {
  it("makes a Draft from an open Opportunity with its Account, Primary Contact and Product lines, valid for 30 days", async () => {
    const quote = await as(alex.id).createQuote(O.proposal)
    expect(quote).toMatchObject({
      number: "Q-00006",
      revision: 0,
      status: "draft",
      accountId: A.fabrikam,
      contactId: C.pieter,
      contactName: "Pieter Claes",
      validUntil: "2026-11-08",
      ownerId: alex.id,
      netTotal: 20000,
      vat21: 4200,
      grossTotal: 24200,
    })
    const { lines } = await as(alex.id).getQuote(quote.id)
    expect(lines.map((l) => [l.productName, l.quantity, l.lineAmount, l.vatRate])).toEqual([
      ["Consulting", 100, 12500, 21],
      ["Workshop day", 5, 7250, 21],
      ["Cloud licence", 10, 250, 21],
    ])
    expect((await as(alex.id).getOpportunity(O.proposal)).productLines).toHaveLength(3)
  })

  it("gives an Opportunity without lines an empty Draft, and allows several Quotes per Opportunity", async () => {
    const first = await as(adele.id).createQuote(O.qualification)
    const second = await as(adele.id).createQuote(O.qualification)
    expect(first).toMatchObject({ netTotal: 0, grossTotal: 0 })
    expect([first.number, second.number]).toEqual(["Q-00006", "Q-00007"])
    expect((await as(adele.id).listQuotes(O.qualification)).map((q) => q.id)).toHaveLength(2)
  })

  it("follows the Opportunity's Owner: a manager makes it for the report, a peer cannot", async () => {
    expect((await as(megan.id).createQuote(O.proposal)).ownerId).toBe(alex.id)
    expect((await errorOf(as(adele.id).createQuote(O.proposal))).code).toBe("forbidden")
    expect((await errorOf(as(diego.id).createQuote(O.proposal))).code).toBe("forbidden")
  })

  it("refuses a new Quote on a closed Opportunity, and reopening leaves its Quotes alone", async () => {
    expect((await errorOf(as(alex.id).createQuote(O.won))).code).toBe("invalid")
    await as(alex.id).reopenOpportunity(O.won, "negotiation")
    expect((await as(alex.id).listQuotes(O.won)).map((q) => [q.number, q.status])).toEqual([["Q-00004", "accepted"]])
  })

  it("changes the Contact and Valid until of a Draft, never of a Sent Quote", async () => {
    const draft = await as(alex.id).updateQuote(Q.draft, { contactId: "", validUntil: "2026-12-01" })
    expect(draft.contactId).toBeUndefined()
    expect(draft.validUntil).toBe("2026-12-01")
    expect((await as(alex.id).updateQuote(Q.draft, { contactId: C.lotte })).contactName).toBe("Lotte de Groot")
    expect((await errorOf(as(alex.id).updateQuote(Q.draft, { validUntil: "2026-02-30" }))).fieldErrors).toHaveProperty("validUntil")
    expect((await errorOf(as(alex.id).updateQuote(Q.sent, { validUntil: "2026-12-01" }))).code).toBe("invalid")
  })

  it("edits lines on the Quote alone while it is a Draft: price, quantity, discount, and VAT per rate on the net total per rate", async () => {
    const gateway = as(alex.id)
    const line = await gateway.addQuoteLine(Q.draft, { productId: PR.consultingHour, quantity: 3, unitPrice: 100, discountPercent: 10 })
    expect(line).toMatchObject({ vatRate: 21, lineAmount: 270, description: "Senior consultant, billed per hour." })
    expect((await gateway.getQuote(Q.draft)).quote).toMatchObject({ netTotal: 7520, vat21: 56.7, vat9: 652.5, grossTotal: 8229.2 })
    await gateway.updateQuoteLine(line.id, { quantity: 1 })
    expect((await gateway.getQuote(Q.draft)).quote).toMatchObject({ netTotal: 7340, vat21: 18.9, grossTotal: 8011.4 })
    await gateway.removeQuoteLine(QL.draftWorkshop)
    expect((await gateway.getQuote(Q.draft)).quote).toMatchObject({ netTotal: 90, vat9: 0, vat21: 18.9, grossTotal: 108.9 })
    // The Opportunity's own lines and Estimated value never move.
    const opportunity = await gateway.getOpportunity(O.proposal)
    expect(opportunity.productLines).toHaveLength(3)
    expect(opportunity.opportunity.estimatedValue).toBe(20000)
  })

  it("refuses bad line values and a retired Product on a Quote line", async () => {
    const gateway = as(alex.id)
    expect((await errorOf(gateway.addQuoteLine(Q.draft, { productId: PR.consultingHour, quantity: 0 }))).fieldErrors).toHaveProperty("quantity")
    expect((await errorOf(gateway.addQuoteLine(Q.draft, { productId: PR.retired, quantity: 1 }))).fieldErrors).toHaveProperty("productId")
  })

  it.each([
    ["Sent", Q.sent],
    ["Revised", Q.revised],
    ["Accepted", Q.accepted],
    ["Rejected", Q.rejected],
  ])("only a Draft can be edited or deleted: %s is final as sent", async (_label, id) => {
    const gateway = as(megan.id)
    expect((await errorOf(gateway.addQuoteLine(id, { productId: PR.consultingHour, quantity: 1 }))).code).toBe("invalid")
    expect((await errorOf(gateway.deleteQuote(id))).code).toBe("invalid")
    expect((await errorOf(gateway.updateQuote(id, { validUntil: "2027-01-01" }))).code).toBe("invalid")
  })

  it("deletes a Draft with its lines", async () => {
    await as(alex.id).deleteQuote(Q.draft)
    expect(store.quotes.has(Q.draft)).toBe(false)
    expect(store.quoteLines.has(QL.draftWorkshop)).toBe(false)
  })

  it("Send sets Sent, the sent date and who sent it; only a Draft can be sent", async () => {
    const sent = await as(alex.id).sendQuote(Q.draft, DOWNLOAD_PDF)
    expect(sent).toMatchObject({ status: "sent", sentOn: NOW.toISOString(), sentById: alex.id, sentByName: "Alex Wilber" })
    expect((await errorOf(as(alex.id).sendQuote(Q.draft, DOWNLOAD_PDF))).code).toBe("invalid")
  })

  it("Revise keeps the number, adds 1 to the Revision, copies the lines and marks the old Quote Revised", async () => {
    const draft = await as(alex.id).reviseQuote(Q.sent)
    expect(draft).toMatchObject({ number: "Q-00001", revision: 2, status: "draft", netTotal: 12750, validUntil: "2026-11-08" })
    expect(draft.sentOn).toBeUndefined()
    expect((await as(alex.id).getQuote(draft.id)).lines).toHaveLength(2)
    expect((await as(alex.id).getQuote(Q.sent)).quote.status).toBe("revised")
    expect((await errorOf(as(alex.id).reviseQuote(Q.sent))).code).toBe("invalid")
    expect((await errorOf(as(alex.id).reviseQuote(draft.id))).code).toBe("invalid")
  })

  it("Accept rejects the Opportunity's other Sent Quotes and leaves Drafts and other Opportunities alone", async () => {
    const accepted = await as(alex.id).acceptQuote(Q.sent)
    expect(accepted.status).toBe("accepted")
    const quotes = new Map((await as(alex.id).listQuotes(O.proposal)).map((q) => [q.id, q.status]))
    expect(quotes.get(Q.expired)).toBe("rejected")
    expect(quotes.get(Q.draft)).toBe("draft")
    expect(quotes.get(Q.revised)).toBe("revised")
    expect(store.quotes.get(Q.accepted)?.status).toBe("accepted")
  })

  it("Reject sets Rejected, and a Draft or final Quote cannot be accepted or rejected", async () => {
    expect((await as(alex.id).rejectQuote(Q.sent)).status).toBe("rejected")
    expect((await errorOf(as(alex.id).acceptQuote(Q.draft))).code).toBe("invalid")
    expect((await errorOf(as(alex.id).rejectQuote(Q.sent))).code).toBe("invalid")
    expect((await errorOf(as(alex.id).acceptQuote(Q.revised))).code).toBe("invalid")
  })

  it("only the Owner and the Owner's manager send, revise, accept and reject", async () => {
    for (const userId of [adele.id, diego.id]) {
      const gateway = as(userId)
      for (const act of [() => gateway.sendQuote(Q.draft, DOWNLOAD_PDF), () => gateway.reviseQuote(Q.sent), () => gateway.acceptQuote(Q.sent), () => gateway.rejectQuote(Q.sent)]) {
        expect((await errorOf(act())).code).toBe("forbidden")
      }
    }
    expect((await as(megan.id).acceptQuote(Q.sent)).status).toBe("accepted")
    expect((await as(diego.id).getQuote(Q.sent)).canEdit).toBe(false)
  })

  it("acts on no Quote of a closed Opportunity", async () => {
    await as(alex.id).closeOpportunity(O.proposal, { outcome: "won", actualValue: 1 })
    expect((await errorOf(as(alex.id).acceptQuote(Q.sent))).code).toBe("invalid")
    expect((await errorOf(as(alex.id).sendQuote(Q.draft, DOWNLOAD_PDF))).code).toBe("invalid")
    expect((await errorOf(as(alex.id).addQuoteLine(Q.draft, { productId: PR.consultingHour, quantity: 1 }))).code).toBe("invalid")
  })

  it("Close as lost rejects the Sent Quotes; Close as won leaves them", async () => {
    await as(alex.id).closeOpportunity(O.proposal, { outcome: "lost", lostReason: "price" })
    const statuses = (await as(alex.id).listQuotes(O.proposal)).map((q) => [q.id, q.status] as const)
    expect(new Map(statuses).get(Q.sent)).toBe("rejected")
    expect(new Map(statuses).get(Q.expired)).toBe("rejected")
    expect(new Map(statuses).get(Q.draft)).toBe("draft")
    expect(new Map(statuses).get(Q.revised)).toBe("revised")
  })

  it("Close as won leaves Sent Quotes as they are", async () => {
    await as(alex.id).closeOpportunity(O.proposal, { outcome: "won" })
    expect(store.quotes.get(Q.sent)?.status).toBe("sent")
  })

  it("a Quote never changes the Opportunity's Estimated value", async () => {
    await as(alex.id).acceptQuote(Q.sent)
    await as(alex.id).createQuote(O.proposal)
    expect((await as(alex.id).getOpportunity(O.proposal)).opportunity.estimatedValue).toBe(20000)
  })

  it("Reassign moves the Opportunity's Quotes to the new Owner, also the sent ones", async () => {
    await as(megan.id).reassign({ type: "opportunity", id: O.proposal }, diego.id)
    const quotes = await as(diego.id).listQuotes(O.proposal)
    expect(quotes.length).toBeGreaterThan(0)
    expect(quotes.every((q) => q.ownerId === diego.id && q.ownerName === "Diego Siciliani")).toBe(true)
    expect((await as(diego.id).acceptQuote(Q.sent)).status).toBe("accepted")
  })

  it("everyone reads every Quote", async () => {
    const details = await as(diego.id).getQuote(Q.sent)
    expect(details.quote.number).toBe("Q-00001")
    expect(details.lines).toHaveLength(2)
    expect(details.opportunity.id).toBe(O.proposal)
    expect(details.canEdit).toBe(false)
    expect((await as(diego.id).getOpportunity(O.proposal)).quotes.map((q) => q.id)).toEqual([Q.draft, Q.sent, Q.revised, Q.expired])
  })
})

describe("Quote templates and settings", () => {
  const { templates: TPL } = SEED_IDS
  const letter = () => store.quoteTemplates.get(TPL.businessLetter)!

  it("are read by everyone, the Default first", async () => {
    for (const user of [adele, diego, megan]) {
      expect((await as(user.id).listQuoteTemplates()).map((t) => t.name)).toEqual(["Business letter", "Order form", "Proposal"])
      expect((await as(user.id).getQuoteSettings()).companyName).toBe("Northwind Solutions B.V.")
    }
  })

  it("are changed only by a Catalogue manager", async () => {
    const { definition } = letter()
    expect((await errorOf(as(adele.id).createQuoteTemplate({ name: "Mine", definition }))).code).toBe("forbidden")
    expect((await errorOf(as(adele.id).updateQuoteTemplate(TPL.proposal, { name: "Renamed" }))).code).toBe("forbidden")
    expect((await errorOf(as(adele.id).updateQuoteSettings({ phone: "1" }))).code).toBe("forbidden")
    expect((await as(megan.id).updateQuoteSettings({ phone: "1" })).phone).toBe("1")
  })

  it("keep exactly one Default", async () => {
    await as(megan.id).updateQuoteTemplate(TPL.proposal, { isDefault: true })
    expect([...store.quoteTemplates.values()].filter((t) => t.isDefault).map((t) => t.name)).toEqual(["Proposal"])
    const created = await as(megan.id).createQuoteTemplate({ name: "Third", isDefault: true, definition: letter().definition })
    expect([...store.quoteTemplates.values()].filter((t) => t.isDefault).map((t) => t.id)).toEqual([created.id])
    // The Default can't be un-defaulted: another template takes over instead.
    expect((await errorOf(as(megan.id).updateQuoteTemplate(created.id, { isDefault: false }))).fieldErrors).toHaveProperty("isDefault")
  })

  it("refuse a template without its locked Blocks or without a name", async () => {
    const { definition } = letter()
    const noLines = { ...definition, blocks: definition.blocks.filter((b) => b.type !== "lines") }
    expect((await errorOf(as(megan.id).updateQuoteTemplate(TPL.proposal, { definition: noLines }))).fieldErrors).toHaveProperty("definition")
    expect((await errorOf(as(megan.id).updateQuoteTemplate(TPL.proposal, { name: "  " }))).fieldErrors).toHaveProperty("name")
    expect((await errorOf(as(megan.id).updateQuoteSettings({ defaultValidityDays: 0 }))).fieldErrors).toHaveProperty("defaultValidityDays")
  })

  it("settings give a new Quote and a Revision their Valid until", async () => {
    await as(megan.id).updateQuoteSettings({ defaultValidityDays: 10 })
    const draft = await as(alex.id).createQuote(O.proposal)
    expect(draft.validUntil).toBe("2026-10-19")
    const revision = await as(alex.id).reviseQuote(Q.sent)
    expect(revision.validUntil).toBe("2026-10-19")
  })

  it("a Quote can be pointed only at a template that exists", async () => {
    expect((await as(alex.id).updateQuote(Q.draft, { templateId: TPL.proposal })).templateName).toBe("Proposal")
    expect((await errorOf(as(alex.id).updateQuote(Q.draft, { templateId: "nope" }))).code).toBe("notFound")
  })
})

describe("Sending a Quote", () => {
  const pdf = new Uint8Array([37, 80, 68, 70])
  const email = { route: "email", pdf, to: "pieter@fabrikam.example", subject: "S", message: "M" } as const

  it("by email stores the PDF, sends one email from the sender and records how and to whom", async () => {
    const sent = await as(alex.id).sendQuote(Q.draft, { ...email, cc: " cc@fabrikam.example " })
    expect(sent).toMatchObject({ status: "sent", sentVia: "email", sentTo: "pieter@fabrikam.example", hasStoredPdf: true })
    expect(store.sentEmails).toEqual([expect.objectContaining({ from: alex.email, to: "pieter@fabrikam.example", cc: "cc@fabrikam.example", subject: "S", attachmentName: "Q-00003.pdf" })])
    expect(await as(adele.id).getQuotePdf(Q.draft)).toEqual(pdf)
  })

  it("by email without an address, or with a bad one, sends and stores nothing and stays a Draft", async () => {
    for (const to of ["", "  ", "not-an-address"]) {
      expect((await errorOf(as(alex.id).sendQuote(Q.draft, { ...email, to }))).fieldErrors).toHaveProperty("to")
    }
    expect(store.sentEmails).toHaveLength(0)
    expect(store.quotePdfs.size).toBe(0)
    expect(store.quotes.get(Q.draft)?.status).toBe("draft")
  })

  it("by download stores the PDF and sends no email", async () => {
    const sent = await as(alex.id).sendQuote(Q.draft, DOWNLOAD_PDF)
    expect(sent).toMatchObject({ status: "sent", sentVia: "download", hasStoredPdf: true })
    expect(sent.sentTo).toBeUndefined()
    expect(store.sentEmails).toHaveLength(0)
  })

  it("a Sent Quote's stored PDF is not replaced by later changes, and a Quote without one returns undefined", async () => {
    await as(alex.id).sendQuote(Q.draft, DOWNLOAD_PDF)
    await as(megan.id).updateQuoteSettings({ companyName: "Changed B.V." })
    expect(await as(alex.id).getQuotePdf(Q.draft)).toEqual(DOWNLOAD_PDF.pdf)
    expect(await as(alex.id).getQuotePdf(Q.sent)).toBeUndefined()
  })

  it("a Revision starts without the sent address or stored PDF", async () => {
    await as(alex.id).sendQuote(Q.draft, email)
    const revision = await as(alex.id).reviseQuote(Q.draft)
    expect(revision).toMatchObject({ status: "draft", hasStoredPdf: false })
    expect(revision.sentTo).toBeUndefined()
    expect(revision.sentVia).toBeUndefined()
  })
})
