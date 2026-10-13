import { describe, expect, it } from "vitest"
import starters from "../../data/quote-templates.json"
import {
  availableBlockTypes,
  definitionErrors,
  moveBlock,
  newBlock,
  parseDefinition,
  placeBlock,
  removeBlock,
  serializeDefinition,
  updateBlockOptions,
  SalesRuleError,
  type TemplateDefinition,
} from "."

const letter = () => parseDefinition(JSON.stringify(starters.templates[0].definition))
const ids = (d: TemplateDefinition) => d.blocks.map((b) => b.type)

describe("Quote template definitions", () => {
  it("round-trip through the JSON stored on the template", () => {
    expect(parseDefinition(serializeDefinition(letter()))).toEqual(letter())
  })

  it("refuse JSON that is unreadable or incomplete", () => {
    expect(() => parseDefinition("{nope")).toThrow(SalesRuleError)
    expect(() => parseDefinition("{}")).toThrow(SalesRuleError)
    expect(() => parseDefinition(undefined)).toThrow(SalesRuleError)
  })

  it("require Product lines, Totals and the Footer, and each Block only once", () => {
    const base = letter()
    for (const type of ["lines", "totals", "footer"] as const) {
      expect(definitionErrors({ ...base, blocks: base.blocks.filter((b) => b.type !== type) })).toHaveLength(1)
    }
    expect(definitionErrors({ ...base, blocks: [...base.blocks, newBlock("terms", ["terms"])] })).toEqual(["Terms can be on the page only once."])
    expect(definitionErrors({ ...base, style: { ...base.style, accent: "red" } })).toHaveLength(1)
    expect(definitionErrors(base)).toEqual([])
  })

  it("never remove a locked Block", () => {
    const base = letter()
    for (const type of ["lines", "totals", "footer"] as const) {
      expect(removeBlock(base, type)).toBe(base)
    }
    expect(ids(removeBlock(base, "contact"))).not.toContain("contact")
  })

  it("move a Block up and down, and keep the Footer last", () => {
    const base = letter()
    expect(ids(moveBlock(base, "contact", -1)).slice(-3)).toEqual(["contact", "terms", "footer"])
    expect(ids(moveBlock(base, "address", 1)).slice(0, 3)).toEqual(["header", "reference", "address"])
    expect(moveBlock(base, "header", -1)).toBe(base)
    const dropped = placeBlock(base, base.blocks.find((b) => b.type === "footer")!, 0)
    expect(ids(dropped).at(-1)).toBe("footer")
  })

  it("add a Block from the tray at a position, and list what is left in the tray", () => {
    const base = letter()
    expect(availableBlockTypes(base)).toEqual(["signature"])
    const added = placeBlock(base, newBlock("signature", base.blocks.map((b) => b.id)), 4)
    expect(ids(added).indexOf("signature")).toBe(4)
    expect(availableBlockTypes(added)).toEqual([])
  })

  it("change a Block's options without touching the others", () => {
    const base = letter()
    const changed = updateBlockOptions(base, "lines", { discount: false })
    expect(changed.blocks.find((b) => b.id === "lines")?.options).toMatchObject({ code: true, discount: false })
    expect(changed.blocks.find((b) => b.id === "header")).toEqual(base.blocks.find((b) => b.id === "header"))
  })
})
