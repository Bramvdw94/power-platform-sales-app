import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { STARTER_RULES, SEED_IDS, SEED_USERS, addStarterProcesses, addStarterRules, createSeededStore, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { BusinessRuleDefinition, BusinessRuleRow, Effect } from "@/sales/engine"
import type { Id } from "@/sales"

const { megan, adele } = SEED_USERS
const { opportunities, leads, contacts, accounts } = SEED_IDS

function rule(id: string, name: string, table: BusinessRuleDefinition["table"], conditions: BusinessRuleDefinition["when"]["conditions"], effects: Effect[]): BusinessRuleRow {
  return { id, name, enabled: true, definition: { schemaVersion: 1, table, when: { match: "all", conditions }, effects } }
}

function renderApp(path: string, options: { userId?: Id; rules?: BusinessRuleRow[]; store?: InMemorySalesStore; withProcesses?: boolean } = {}) {
  const base = createSeededStore()
  const store = options.store ?? (options.withProcesses ? addStarterProcesses(base) : base)
  if (options.rules) store.businessRules.push(...options.rules)
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return { ...renderWithGateway(<RouterProvider router={router} />, { userId: options.userId, store }), store }
}

const details = () => screen.findByRole("region", { name: "Details" })
const edit = async () => userEvent.setup().click(await screen.findByRole("button", { name: "Edit" }))
const saveButton = (form: HTMLElement) => within(form).getByRole("button", { name: "Save" })

beforeEach(() => setViewport("desktop"))

describe("a block save rule", () => {
  it("disables Save live, names the rule, and enables it again when the condition no longer holds", async () => {
    const user = userEvent.setup()
    renderApp(`/contacts/${contacts.lotte}`, { rules: STARTER_RULES.filter((r) => r.id === "rule-contact-reachable") })
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = await screen.findByRole("form", { name: "Edit Contact" })
    expect(saveButton(form)).toBeEnabled()

    await user.clear(within(form).getByLabelText("Email"))
    const box = await within(form).findByRole("alert")
    expect(box).toHaveTextContent("Can't save: Add an email address, a phone or a mobile number.")
    expect(box).toHaveTextContent("Contacts must be reachable")
    expect(saveButton(form)).toBeDisabled()

    await user.type(within(form).getByLabelText("Phone"), "+31 6 1234")
    await waitFor(() => expect(within(form).queryByRole("alert")).not.toBeInTheDocument())
    expect(saveButton(form)).toBeEnabled()
  })

  it("shows the block on the Details card in read mode when the condition holds", async () => {
    const store = createSeededStore()
    store.contacts.set("con-ghost", { id: "con-ghost", lastName: "Ghost", accountId: accounts.tailwind, ownerId: adele.id, createdOn: new Date().toISOString() })
    renderApp(`/contacts/con-ghost`, { store, rules: STARTER_RULES.filter((r) => r.id === "rule-contact-reachable") })
    const card = await details()
    expect(await within(card).findByText(/Add an email address, a phone or a mobile number/)).toBeInTheDocument()
  })
})

describe("a required rule", () => {
  const needsNextStep = rule("r-next", "Deals over 10k need a Next step", "opportunity", [{ field: "estimatedValue", op: "greaterThan", value: 10000 }], [{ type: "required", field: "nextStep" }])

  it("marks the field with an asterisk and the rule's name", async () => {
    const user = userEvent.setup()
    renderApp(`/opportunities/${opportunities.qualification}`, { rules: [needsNextStep] })
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = await screen.findByRole("form", { name: "Edit Opportunity" })
    expect(within(form).getByText("Required by the rule “Deals over 10k need a Next step”")).toBeInTheDocument()
    expect(within(form).getByText("Next step").textContent).toContain("*")
  })

  it("lets an unrelated edit to an older record through, though the field is empty", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${opportunities.qualification}`, { rules: [needsNextStep] })
    expect(store.opportunities.get(opportunities.qualification)?.nextStep).toBeUndefined()
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = await screen.findByRole("form", { name: "Edit Opportunity" })
    await user.type(within(form).getByLabelText("Description"), "Pilot first")
    expect(saveButton(form)).toBeEnabled()
    await user.click(saveButton(form))
    await waitFor(() => expect(store.opportunities.get(opportunities.qualification)?.description).toBe("Pilot first"))
  })

  it("stops clearing the field", async () => {
    const user = userEvent.setup()
    renderApp(`/opportunities/${opportunities.proposal}`, { userId: SEED_USERS.alex.id, rules: [needsNextStep] })
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = await screen.findByRole("form", { name: "Edit Opportunity" })
    expect(saveButton(form)).toBeEnabled()
    await user.clear(within(form).getByLabelText(/^Next step/))
    expect(saveButton(form)).toBeDisabled()
    expect(within(form).getByText("Required by the rule “Deals over 10k need a Next step”").closest("p")).toHaveClass("text-destructive")
  })

  it("lists a required field that is empty on the Details card", async () => {
    renderApp(`/opportunities/${opportunities.qualification}`, { rules: [needsNextStep] })
    const card = await details()
    expect(await within(card).findByText("Next step is empty, and this record needs it.")).toBeInTheDocument()
  })
})

describe("a read-only rule", () => {
  it("disables the field with a lock and the reason", async () => {
    const user = userEvent.setup()
    const store = createSeededStore()
    store.accounts.get(accounts.tailwind)!.accountType = "customer"
    store.accounts.get(accounts.tailwind)!.industry = "consulting"
    renderApp(`/accounts/${accounts.tailwind}`, { store, rules: STARTER_RULES.filter((r) => r.id === "rule-customer-industry") })
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = await screen.findByRole("form", { name: "Edit Account" })
    expect(within(form).getByText("Read-only because of the rule “Customers keep their Industry”")).toBeInTheDocument()
    expect(within(form).getByRole("combobox", { name: /Industry/ })).toBeDisabled()
  })
})

describe("a set value rule", () => {
  it("fills the field in, highlights it and says it can be changed", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/opportunities/${opportunities.qualification}`, { rules: STARTER_RULES.filter((r) => r.id === "rule-partner-best-case") })
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = await screen.findByRole("form", { name: "Edit Opportunity" })
    const forecast = within(form).getByLabelText("Forecast category")
    expect(forecast).toHaveValue("pipeline")
    await user.selectOptions(within(form).getByLabelText("Lead source"), "partner")
    expect(forecast).toHaveValue("bestCase")
    expect(within(form).getByText("Filled in by the rule “Partner deals are Best case”. You can change it.")).toBeInTheDocument()

    await user.click(saveButton(form))
    await waitFor(() => expect(store.opportunities.get(opportunities.qualification)?.forecastCategory).toBe("bestCase"))
  })
})

describe("a warning rule", () => {
  it("shows under its field, and a warning without a field shows at the top of the details", async () => {
    const user = userEvent.setup()
    renderApp(`/leads/${leads.working}`, {
      userId: SEED_USERS.alex.id,
      rules: [rule("r-w", "Phone please", "lead", [{ field: "phone", op: "isEmpty" }], [{ type: "warning", field: "phone", message: "A phone number helps." }, { type: "warning", message: "No phone on file." }])],
    })
    const card = await details()
    expect(await within(card).findByText(/No phone on file\./)).toBeInTheDocument()
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = await screen.findByRole("form", { name: "Edit Lead" })
    expect(within(form).getByText(/A phone number helps\./)).toBeInTheDocument()
    expect(within(form).getByText(/No phone on file\./)).toBeInTheDocument()
    await user.type(within(form).getByLabelText("Phone"), "+32 3 555")
    await waitFor(() => expect(within(form).queryByText(/A phone number helps\./)).not.toBeInTheDocument())
  })
})

describe("rule effects in the process bar's Key fields", () => {
  // The Lead Process's first Step has the Key fields Lead source and Phone.
  it("lock a Key field, mark a required one and warn, as on the Details form", async () => {
    renderApp(`/leads/${leads.notContacted}`, {
      withProcesses: true,
      rules: [
        rule("r-ro", "Source is fixed", "lead", [{ field: "email", op: "isNotEmpty" }], [{ type: "readOnly", field: "leadSource" }]),
        rule("r-req", "Phone needed", "lead", [{ field: "phone", op: "isEmpty" }], [{ type: "required", field: "phone" }, { type: "warning", field: "phone", message: "Call them to get a number." }]),
      ],
    })
    const panel = within(await screen.findByRole("region", { name: "Coaching" }))
    expect(await panel.findByText("Read-only because of the rule “Source is fixed”")).toBeInTheDocument()
    expect(panel.queryByLabelText("Lead source")).not.toBeInTheDocument()
    expect(panel.getByText("Required by the rule “Phone needed”")).toBeInTheDocument()
    expect(panel.getByText(/Call them to get a number\./)).toBeInTheDocument()
    expect(panel.getByLabelText(/^Phone/)).toBeEnabled()
  })

  it("show a block save at the Key field and send nothing", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/leads/${leads.notContacted}`, {
      withProcesses: true,
      rules: [rule("r-block", "Phone is frozen", "lead", [{ field: "phone", op: "isNotEmpty" }], [{ type: "blockSave", message: "Phones are updated by the call centre." }])],
    })
    const panel = within(await screen.findByRole("region", { name: "Coaching" }))
    await user.type(await panel.findByLabelText("Phone"), "+31 6 1234")
    await user.tab()
    expect(await panel.findByText("Can't save: Phones are updated by the call centre.")).toBeInTheDocument()
    expect(store.leads.get(leads.notContacted)?.phone).toBeUndefined()
  })

  it("stop clearing a required Key field", async () => {
    const user = userEvent.setup()
    const { store } = renderApp(`/leads/${leads.notContacted}`, {
      withProcesses: true,
      rules: [rule("r-req", "Source needed", "lead", [{ field: "email", op: "isNotEmpty" }], [{ type: "required", field: "leadSource" }])],
    })
    const panel = within(await screen.findByRole("region", { name: "Coaching" }))
    await user.selectOptions(await panel.findByLabelText(/^Lead source/), "")
    expect(await panel.findByText(/Lead source is required by the rule “Source needed”/)).toBeInTheDocument()
    expect(store.leads.get(leads.notContacted)?.leadSource).toBe("website")
  })
})

describe("exempt saves", () => {
  const blockAll = rule("r-all", "Frozen", "opportunity", [{ field: "name", op: "isNotEmpty" }], [{ type: "blockSave", message: "Nothing changes today." }, { type: "required", field: "nextStep" }])

  it("Reassign and Close as lost go through a block save and a required rule", async () => {
    const { gateway } = renderApp(`/opportunities/${opportunities.qualification}`, { rules: [blockAll] })
    await expect(gateway.closeOpportunity(opportunities.qualification, { outcome: "lost", lostReason: "price" })).resolves.toMatchObject({ stage: "closedLost" })
    await expect(gateway.reassign({ type: "opportunity", id: opportunities.qualification }, megan.id)).resolves.toBeUndefined()
    // An ordinary edit is still stopped by the same rule.
    const { gateway: second } = renderApp(`/opportunities/${opportunities.proposal}`, { userId: SEED_USERS.alex.id, rules: [blockAll] })
    await expect(second.updateOpportunity(opportunities.proposal, { name: "Renamed" })).rejects.toThrow(/Nothing changes today/)
  })
})

describe("the kill switch", () => {
  it("shows no effects when it is off", async () => {
    const store = addStarterRules(createSeededStore())
    store.engineEnabled = false
    store.contacts.set("con-ghost", { id: "con-ghost", lastName: "Ghost", accountId: accounts.tailwind, ownerId: adele.id, createdOn: new Date().toISOString() })
    renderApp(`/contacts/con-ghost`, { store })
    const card = await details()
    expect(card).toBeInTheDocument()
    await waitFor(() => expect(within(card).queryByText(/Add an email address/)).not.toBeInTheDocument())
    await edit()
    const form = await screen.findByRole("form", { name: "Edit Contact" })
    expect(within(form).queryByRole("alert")).not.toBeInTheDocument()
    expect(saveButton(form)).toBeEnabled()
  })
})
