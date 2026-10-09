import { describe, expect, it } from "vitest"
import { canEdit, isInView, teamMemberIds, type ListView } from "./permissions"

// Megan manages Adele and Alex; Diego is outside her team.
const users = [
  { id: "megan", managerId: null },
  { id: "adele", managerId: "megan" },
  { id: "alex", managerId: "megan" },
  { id: "diego", managerId: null },
]

describe("canEdit: Owner or the Owner's manager", () => {
  it.each([
    ["adele", "adele", true],
    ["megan", "adele", true],
    ["megan", "alex", true],
    ["megan", "megan", true],
    ["alex", "adele", false],
    ["diego", "adele", false],
    ["adele", "megan", false],
    ["megan", "diego", false],
    ["adele", "unknown-owner", false],
  ])("%s editing a record owned by %s: %s", (userId, ownerId, expected) => {
    expect(canEdit(userId, ownerId, users)).toBe(expected)
  })

  it("does not reach a manager's manager (hierarchy depth 1)", () => {
    const deeper = [...users, { id: "intern", managerId: "adele" }]
    expect(canEdit("adele", "intern", deeper)).toBe(true)
    expect(canEdit("megan", "intern", deeper)).toBe(false)
  })
})

describe("My team", () => {
  it.each([
    ["megan", ["megan", "adele", "alex"]],
    ["adele", ["adele"]],
    ["diego", ["diego"]],
  ])("for %s is %j", (userId, team) => {
    expect(teamMemberIds(userId, users)).toEqual(team)
  })
})

describe("isInView", () => {
  const cases: Array<[ListView, string, string, boolean]> = [
    ["my", "megan", "megan", true],
    ["my", "megan", "adele", false],
    ["myTeam", "megan", "adele", true],
    ["myTeam", "megan", "diego", false],
    ["myTeam", "adele", "alex", false],
    ["myTeam", "adele", "adele", true],
    ["all", "adele", "diego", true],
  ]

  it.each(cases)("view %s for %s includes a record owned by %s: %s", (view, userId, ownerId, expected) => {
    expect(isInView(view, ownerId, userId, users)).toBe(expected)
  })
})
