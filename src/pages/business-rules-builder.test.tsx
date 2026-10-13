import { beforeEach, describe, expect, it } from "vitest"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SEED_IDS, SEED_USERS, addStarterProcesses, addStarterRules, createSeededStore, type InMemorySalesStore } from "@/data/in-memory"
import { routes } from "@/routes"
import { renderWithGateway } from "@/test/render"
import { setViewport } from "@/test/viewport"
import type { BusinessRuleRow } from "@/sales/engine"
import type { Id } from "@/sales"

const { megan, adele } = SEED_USERS
const { contacts } = SEED_IDS

function renderApp(path: string, options: { userId?: Id; store?: InMemorySalesStore } = {}) {
  const store = options.store ?? addStarterRules(addStarterProcesses(createSeededStore()))
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = renderWithGateway(<RouterProvider router={router} />, { userId: options.userId ?? megan.id, store })
  return { ...result, router, store }
}

beforeEach(() => setViewport("desktop"))

const rulesList = () => screen.findByRole("list", { name: "Business rules" })
const dialog = () => screen.findByRole("dialog")

async function openRulesTab(user: ReturnType<typeof userEvent.setup>, table?: RegExp) {
  await user.click(await screen.findByRole("tab", { name: "Business rules" }))
  if (table) await user.click(await screen.findByRole("button", { name: table }))
  return screen.findByRole("group", { name: "Table" })
}

describe("the Business rules tab", () => {
  it("lists a table's rules with an on/off switch, the When summary, effect chips and who changed it last", async () => {
    const user = userEvent.setup()
    renderApp("/automation")
    await openRulesTab(user, /Opportunities/)
    const list = await rulesList()
    const row = within(list).getByText("Large deals need a Next step").closest("li")!
    expect(within(row).getByRole("switch", { name: "Switch off Large deals need a Next step" })).toBeChecked()
    expect(within(row).getByText(/When Estimated value is more than 50000/)).toBeInTheDocument()
    expect(within(row).getByText("Require Next step")).toBeInTheDocument()
    expect(within(row).getByText("Last changed by: not recorded")).toBeInTheDocument()
  })

  it("counts the rules of each table on its tab", async () => {
    const user = userEvent.setup()
    renderApp("/automation")
    await openRulesTab(user)
    expect(await screen.findByRole("button", { name: /^Opportunities\s*3$/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Leads\s*1$/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Accounts\s*1$/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Contacts\s*1$/ })).toBeInTheDocument()
  })

  it("shows a salesperson the rules but no way to change them", async () => {
    const user = userEvent.setup()
    renderApp("/automation", { userId: adele.id })
    await openRulesTab(user, /Contacts/)
    const list = await rulesList()
    expect(screen.queryByRole("button", { name: "New rule" })).not.toBeInTheDocument()
    expect(within(list).getByRole("switch")).toBeDisabled()
    await user.click(within(list).getByRole("button", { name: "Contacts must be reachable" }))
    const editor = await dialog()
    expect(within(editor).getByText("Only a Process builder can change a rule.")).toBeInTheDocument()
    expect(within(editor).queryByRole("button", { name: "Save" })).not.toBeInTheDocument()
    expect(within(editor).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()
  })

  it("shows a red Error badge on a rule the engine could not run", async () => {
    const user = userEvent.setup()
    const store = addStarterRules(createSeededStore())
    store.engineErrors.push({ id: "err-1", ruleId: "rule-contact-reachable", code: "fieldMissing", message: "The field mobile no longer exists.", occurredOn: "2026-10-12T10:00:00Z" })
    renderApp("/automation", { store })
    await openRulesTab(user, /Contacts/)
    const list = await rulesList()
    expect(await within(list).findByLabelText("Error: 1 Engine error")).toBeInTheDocument()
    await user.click(within(list).getByRole("button", { name: "Contacts must be reachable" }))
    const editor = await dialog()
    expect(await within(editor).findByText("The field mobile no longer exists.")).toBeInTheDocument()
  })
})

describe("the rule editor", () => {
  async function newContactBlockRule(user: ReturnType<typeof userEvent.setup>, name = "No ghosts") {
    const store = createSeededStore()
    const view = renderApp("/automation", { store })
    await openRulesTab(user, /Contacts/)
    await user.click(screen.getByRole("button", { name: "New rule" }))
    const editor = await dialog()
    await user.type(within(editor).getByLabelText(/^Name/), name)
    await user.click(within(editor).getByRole("button", { name: "Add condition" }))
    await user.selectOptions(within(editor).getByLabelText("Condition 1 field"), "email")
    await user.selectOptions(within(editor).getByLabelText("Condition 1 operator"), "isEmpty")
    await user.selectOptions(within(editor).getByLabelText("New effect type"), "blockSave")
    await user.click(within(editor).getByRole("button", { name: "Add effect" }))
    await user.type(within(editor).getByLabelText("Effect 1 message"), "A Contact needs an email address.")
    return { ...view, editor, store }
  }

  it("creates a block save rule that disables Save on a record at once", async () => {
    const user = userEvent.setup()
    const { editor, router, store } = await newContactBlockRule(user)
    await user.click(within(editor).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(store.businessRules.map((r) => r.name)).toContain("No ghosts"))
    expect(store.ruleChanges.get(store.businessRules[0].id)?.by).toBe("Megan Bowen")
    expect(await within(await rulesList()).findByText("Last changed by Megan Bowen on", { exact: false })).toBeInTheDocument()

    await act(() => router.navigate(`/contacts/${contacts.lotte}`))
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = await screen.findByRole("form", { name: "Edit Contact" })
    expect(within(form).getByRole("button", { name: "Save" })).toBeEnabled()
    await user.clear(within(form).getByLabelText("Email"))
    expect(await within(form).findByRole("alert")).toHaveTextContent("A Contact needs an email address.")
    expect(within(form).getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("Try it on a record shows whether the rule applies and what it would do", async () => {
    const user = userEvent.setup()
    const store = createSeededStore()
    store.contacts.set("con-ghost", { id: "con-ghost", lastName: "Ghost", accountId: SEED_IDS.accounts.tailwind, ownerId: adele.id, createdOn: new Date().toISOString() })
    renderApp("/automation", { store })
    await openRulesTab(user, /Contacts/)
    await user.click(screen.getByRole("button", { name: "New rule" }))
    const editor = await dialog()
    await user.type(within(editor).getByLabelText(/^Name/), "No ghosts")
    await user.click(within(editor).getByRole("button", { name: "Add condition" }))
    await user.selectOptions(within(editor).getByLabelText("Condition 1 field"), "email")
    await user.selectOptions(within(editor).getByLabelText("Condition 1 operator"), "isEmpty")
    await user.selectOptions(within(editor).getByLabelText("New effect type"), "blockSave")
    await user.click(within(editor).getByRole("button", { name: "Add effect" }))
    await user.type(within(editor).getByLabelText("Effect 1 message"), "Needs an email.")

    await user.type(within(editor).getByLabelText("Find a record"), "Ghost")
    await waitFor(() => expect(within(editor).getByRole("option", { name: /Ghost/ })).toBeInTheDocument())
    await user.selectOptions(within(editor).getByLabelText("Record to try"), within(editor).getByRole("option", { name: /Ghost/ }))
    const result = await within(editor).findByRole("status", { name: "" })
    expect(result).toHaveTextContent("The rule applies to this record.")
    expect(result).toHaveTextContent("Save would be blocked: “Needs an email.”")

    await user.clear(within(editor).getByLabelText("Find a record"))
    await user.type(within(editor).getByLabelText("Find a record"), "Lotte")
    await waitFor(() => expect(within(editor).getByRole("option", { name: /Lotte/ })).toBeInTheDocument())
    await user.selectOptions(within(editor).getByLabelText("Record to try"), within(editor).getByRole("option", { name: /Lotte/ }))
    await waitFor(() => expect(within(editor).getByRole("status")).toHaveTextContent("does not apply"))
  })

  it("refuses a rule that closes a set value cycle", async () => {
    const user = userEvent.setup()
    renderApp("/automation")
    await openRulesTab(user, /Opportunities/)
    await user.click(screen.getByRole("button", { name: "New rule" }))
    const editor = await dialog()
    await user.type(within(editor).getByLabelText(/^Name/), "Best case means partner")
    await user.click(within(editor).getByRole("button", { name: "Add condition" }))
    await user.selectOptions(within(editor).getByLabelText("Condition 1 field"), "forecastCategory")
    await user.selectOptions(within(editor).getByLabelText("New effect type"), "setValue")
    await user.click(within(editor).getByRole("button", { name: "Add effect" }))
    await user.selectOptions(within(editor).getByLabelText("Effect 1 field"), "leadSource")
    await user.selectOptions(within(editor).getByLabelText("Effect 1 value"), "partner")
    const reasons = await within(editor).findByRole("alert", { name: "Why this rule can't be saved" })
    expect(reasons).toHaveTextContent("would keep setting each other's fields")
    expect(within(editor).getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("warns when another rule also sets the same field, without stopping the save", async () => {
    const user = userEvent.setup()
    renderApp("/automation")
    await openRulesTab(user, /Opportunities/)
    await user.click(screen.getByRole("button", { name: "New rule" }))
    const editor = await dialog()
    await user.type(within(editor).getByLabelText(/^Name/), "Tidy forecast")
    await user.selectOptions(within(editor).getByLabelText("New effect type"), "setValue")
    await user.click(within(editor).getByRole("button", { name: "Add effect" }))
    await user.selectOptions(within(editor).getByLabelText("Effect 1 field"), "forecastCategory")
    expect(await within(editor).findByRole("status", { name: "Worth knowing" })).toHaveTextContent("Partner deals are Best case")
    expect(within(editor).getByRole("button", { name: "Save" })).toBeEnabled()
  })

  it("can't set Estimated value", async () => {
    const user = userEvent.setup()
    renderApp("/automation")
    await openRulesTab(user, /Opportunities/)
    await user.click(screen.getByRole("button", { name: "New rule" }))
    const editor = await dialog()
    await user.selectOptions(within(editor).getByLabelText("New effect type"), "setValue")
    await user.click(within(editor).getByRole("button", { name: "Add effect" }))
    const field = within(editor).getByLabelText("Effect 1 field")
    expect(within(field).queryByRole("option", { name: "Estimated value" })).not.toBeInTheDocument()
    expect(within(field).getByRole("option", { name: "Forecast category" })).toBeInTheDocument()
  })

  it("stops at 50 rules switched on per table", async () => {
    const user = userEvent.setup()
    const store = createSeededStore()
    const many: BusinessRuleRow[] = Array.from({ length: 50 }, (_, i) => ({
      id: `rule-${i}`,
      name: `Rule ${i}`,
      enabled: true,
      definition: { schemaVersion: 1, table: "contact", when: { match: "all", conditions: [] }, effects: [{ type: "warning", message: `Note ${i}` }] },
    }))
    store.businessRules.push(...many)
    renderApp("/automation", { store })
    await openRulesTab(user, /Contacts/)
    await user.click(screen.getByRole("button", { name: "New rule" }))
    const editor = await dialog()
    await user.type(within(editor).getByLabelText(/^Name/), "One too many")
    await user.selectOptions(within(editor).getByLabelText("New effect type"), "warning")
    await user.click(within(editor).getByRole("button", { name: "Add effect" }))
    await user.type(within(editor).getByLabelText("Effect 1 message"), "Hello")
    expect(await within(editor).findByRole("alert", { name: "Why this rule can't be saved" })).toHaveTextContent("at most 50 rules")
    expect(within(editor).getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("turning a rule off removes its effect on records", async () => {
    const user = userEvent.setup()
    const { router } = renderApp("/automation")
    await openRulesTab(user, /Contacts/)
    const list = await rulesList()
    await user.click(within(list).getByRole("switch", { name: "Switch off Contacts must be reachable" }))
    await waitFor(() => expect(within(list).getByRole("switch", { name: "Switch on Contacts must be reachable" })).not.toBeChecked())
    expect(within(list).getByText("Off")).toBeInTheDocument()

    await act(() => router.navigate(`/contacts/${contacts.lotte}`))
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const form = await screen.findByRole("form", { name: "Edit Contact" })
    await user.clear(within(form).getByLabelText("Email"))
    expect(within(form).queryByRole("alert")).not.toBeInTheDocument()
    expect(within(form).getByRole("button", { name: "Save" })).toBeEnabled()
  })

  it("deletes a rule from the editor after asking", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/automation")
    await openRulesTab(user, /Contacts/)
    const list = await rulesList()
    await user.click(within(list).getByRole("button", { name: "Contacts must be reachable" }))
    const editor = await dialog()
    await user.click(within(editor).getByRole("button", { name: "Delete" }))
    expect(store.businessRules.some((r) => r.id === "rule-contact-reachable")).toBe(true)
    await user.click(within(editor).getByRole("button", { name: "Yes, delete the rule" }))
    await waitFor(() => expect(store.businessRules.some((r) => r.id === "rule-contact-reachable")).toBe(false))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("shows the rule's name and effects when edited, and saves a changed message", async () => {
    const user = userEvent.setup()
    const { store } = renderApp("/automation")
    await openRulesTab(user, /Contacts/)
    const list = await rulesList()
    await user.click(within(list).getByRole("button", { name: "Contacts must be reachable" }))
    const editor = await dialog()
    const message = within(editor).getByLabelText("Effect 1 message")
    await user.clear(message)
    await user.type(message, "Add any way to reach them.")
    await user.click(within(editor).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(JSON.stringify(store.businessRules.find((r) => r.id === "rule-contact-reachable")?.definition)).toContain("Add any way to reach them."))
  })
})
