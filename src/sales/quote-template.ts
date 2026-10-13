import { SalesRuleError } from "./errors"
import type { Id } from "./types"

export const BLOCK_TYPES = ["header", "address", "reference", "title", "lines", "totals", "terms", "contact", "signature", "footer"] as const
export type BlockType = (typeof BLOCK_TYPES)[number]

export const BLOCK_LABELS: Record<BlockType, string> = {
  header: "Header",
  address: "Customer address",
  reference: "Reference strip",
  title: "Title and intro",
  lines: "Product lines",
  totals: "Totals and VAT per rate",
  terms: "Terms",
  contact: "Your contact person",
  signature: "Acceptance and signature",
  footer: "Footer",
}

/** Product lines, Totals and the Footer are on every Quote PDF: they can't be removed, and the Footer stays last. */
export const LOCKED_BLOCKS: readonly BlockType[] = ["lines", "totals", "footer"]

export function isLockedBlock(type: BlockType): boolean {
  return LOCKED_BLOCKS.includes(type)
}

export type BlockOptions = Record<string, string | boolean>

/** One Block of a template. `id` is unique within the template. */
export type Block = { id: string; type: BlockType; options: BlockOptions }

export const PDF_FONTS = ["sans", "serif"] as const
export type PdfFont = (typeof PDF_FONTS)[number]
export const PDF_LANGUAGES = ["nl", "en"] as const
export type PdfLanguage = (typeof PDF_LANGUAGES)[number]

export type PageStyle = {
  /** "#rrggbb" */
  accent: string
  font: PdfFont
  logoPosition: "left" | "right"
  language: PdfLanguage
}

export type TemplateDefinition = { version: 1; style: PageStyle; blocks: Block[] }

export type QuoteTemplate = {
  id: Id
  name: string
  isDefault: boolean
  definition: TemplateDefinition
}

export type QuoteTemplateInput = { name: string; isDefault?: boolean; definition: TemplateDefinition }
export type QuoteTemplateUpdate = Partial<QuoteTemplateInput>

/** The options a new Block of this type starts with. */
export function defaultOptions(type: BlockType): BlockOptions {
  switch (type) {
    case "header":
      return { band: false, sender: true }
    case "reference":
      return { revision: true }
    case "title":
      return { intro: "" }
    case "lines":
      return { code: true, unit: true, discount: true, vat: true }
    case "terms":
      return { useSettings: true, text: "" }
    case "contact":
      return { phone: true }
    case "signature":
      return { heading: "" }
    default:
      return {}
  }
}

export const DEFAULT_STYLE: PageStyle = { accent: "#14213d", font: "sans", logoPosition: "right", language: "nl" }

export function newBlock(type: BlockType, takenIds: readonly string[] = []): Block {
  let id: string = type
  for (let n = 2; takenIds.includes(id); n++) id = `${type}-${n}`
  return { id, type, options: defaultOptions(type) }
}

export function flag(block: Block, name: string): boolean {
  return block.options[name] === true
}

export function text(block: Block, name: string): string {
  const value = block.options[name]
  return typeof value === "string" ? value : ""
}

/** The refusals for a definition that would draw an incomplete or unreadable PDF. Empty when it is fine. */
export function definitionErrors(definition: TemplateDefinition): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const block of definition.blocks) {
    if (!BLOCK_TYPES.includes(block.type)) errors.push(`Unknown Block "${block.type}".`)
    if (seen.has(block.type)) errors.push(`${BLOCK_LABELS[block.type]} can be on the page only once.`)
    seen.add(block.type)
  }
  for (const type of LOCKED_BLOCKS) if (!seen.has(type)) errors.push(`${BLOCK_LABELS[type]} must be on the page.`)
  if (!/^#[0-9a-fA-F]{6}$/.test(definition.style.accent)) errors.push("The accent colour must be a hex colour such as #14213d.")
  if (!PDF_FONTS.includes(definition.style.font)) errors.push("Unknown typeface.")
  if (!PDF_LANGUAGES.includes(definition.style.language)) errors.push("The language must be Dutch or English.")
  if (!["left", "right"].includes(definition.style.logoPosition)) errors.push("The logo goes left or right.")
  return errors
}

export function requireValidDefinition(definition: TemplateDefinition): void {
  const errors = definitionErrors(definition)
  if (errors.length > 0) throw new SalesRuleError(errors.join(" "))
}

/** Reads the JSON stored on a template; anything unreadable is a refusal, never a half-drawn PDF. */
export function parseDefinition(json: string | null | undefined): TemplateDefinition {
  let raw: unknown
  try {
    raw = JSON.parse(json ?? "")
  } catch {
    throw new SalesRuleError("The template's definition is not valid JSON.")
  }
  const candidate = raw as Partial<TemplateDefinition> | null
  if (!candidate || !Array.isArray(candidate.blocks) || typeof candidate.style !== "object" || candidate.style === null) {
    throw new SalesRuleError("The template's definition is incomplete.")
  }
  const definition: TemplateDefinition = {
    version: 1,
    style: { ...DEFAULT_STYLE, ...candidate.style },
    blocks: candidate.blocks.map((b) => ({ id: String(b.id), type: b.type, options: { ...defaultOptions(b.type), ...(b.options ?? {}) } })),
  }
  requireValidDefinition(definition)
  return definition
}

export function serializeDefinition(definition: TemplateDefinition): string {
  return JSON.stringify(definition)
}

/** The Footer is always the last Block, wherever it was dropped. */
export function normaliseBlocks(blocks: readonly Block[]): Block[] {
  const footers = blocks.filter((b) => b.type === "footer")
  return [...blocks.filter((b) => b.type !== "footer"), ...footers]
}

export function moveBlock(definition: TemplateDefinition, id: string, direction: -1 | 1): TemplateDefinition {
  const blocks = [...definition.blocks]
  const from = blocks.findIndex((b) => b.id === id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= blocks.length) return definition
  ;[blocks[from], blocks[to]] = [blocks[to], blocks[from]]
  return { ...definition, blocks: normaliseBlocks(blocks) }
}

/** Puts a Block at an index (0 = top), moving it if it is already on the page. */
export function placeBlock(definition: TemplateDefinition, block: Block, index: number): TemplateDefinition {
  const rest = definition.blocks.filter((b) => b.id !== block.id)
  const at = Math.max(0, Math.min(index, rest.length))
  rest.splice(at, 0, block)
  return { ...definition, blocks: normaliseBlocks(rest) }
}

/** Removes a Block; the locked ones stay. */
export function removeBlock(definition: TemplateDefinition, id: string): TemplateDefinition {
  const block = definition.blocks.find((b) => b.id === id)
  if (!block || isLockedBlock(block.type)) return definition
  return { ...definition, blocks: definition.blocks.filter((b) => b.id !== id) }
}

export function updateBlockOptions(definition: TemplateDefinition, id: string, options: BlockOptions): TemplateDefinition {
  return { ...definition, blocks: definition.blocks.map((b) => (b.id === id ? { ...b, options: { ...b.options, ...options } } : b)) }
}

/** The Block types not yet on the page: the tray. */
export function availableBlockTypes(definition: TemplateDefinition): BlockType[] {
  const used = new Set(definition.blocks.map((b) => b.type))
  return BLOCK_TYPES.filter((t) => !used.has(t))
}

export function templateErrors(input: { name?: string }): Record<string, string> {
  const errors: Record<string, string> = {}
  if (input.name !== undefined && input.name.trim() === "") errors.name = "Enter a name."
  return errors
}
