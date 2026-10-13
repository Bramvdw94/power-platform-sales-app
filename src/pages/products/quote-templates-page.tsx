import { useMemo, useState, type DragEvent, type FormEvent } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Eye, GripVertical, Lock, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { FormAlert, FormField } from "@/components/records/fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import {
  BLOCK_LABELS,
  PDF_FONTS,
  PDF_LANGUAGES,
  availableBlockTypes,
  buildQuoteDocument,
  flag,
  isLockedBlock,
  moveBlock,
  newBlock,
  placeBlock,
  removeBlock,
  sampleQuoteInput,
  serializeDefinition,
  text,
  toDateOnly,
  updateBlockOptions,
  type Block,
  type BlockType,
  type DocBlock,
  type PageStyle,
  type QuoteSettings,
  type QuoteTemplate,
  type TemplateDefinition,
} from "@/sales"
import { PreviewPdfDialog } from "@/pages/quotes/preview-pdf-dialog"
import { documentOf } from "@/pages/quotes/quote-pdf-support"
import { ProductsTabs } from "./products-tabs"
import { QuoteSheet } from "./quote-sheet"

const ACCENTS = ["#14213d", "#0f6b5c", "#7a1f3d", "#3b3f46"]

type Draft = { name: string; isDefault: boolean; definition: TemplateDefinition }

/** What is being dragged: a Block from the tray, or one already on the page. */
type Drag = { kind: "new"; type: BlockType } | { kind: "move"; id: string }

const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"

export default function QuoteTemplatesPage() {
  const gateway = useGateway()
  const { data: me } = useCurrentUser()
  const templates = useQuery({ queryKey: ["QuoteTemplates"], queryFn: () => gateway.listQuoteTemplates() })
  const settings = useQuery({ queryKey: ["QuoteSettings"], queryFn: () => gateway.getQuoteSettings() })
  const canEdit = !!me?.user.isCatalogueManager

  return (
    <>
      <ProductsTabs />
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Quote templates</h1>
        {templates.error || settings.error ? (
          <FormAlert error={templates.error ?? settings.error} />
        ) : !templates.data || !settings.data || !me ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Builder templates={templates.data} settings={settings.data} canEdit={canEdit} user={me.user} />
        )}
      </div>
    </>
  )
}

function Builder({ templates, settings, canEdit, user }: { templates: QuoteTemplate[]; settings: QuoteSettings; canEdit: boolean; user: { fullName: string; email: string; phone?: string } }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [selectedId, setSelectedId] = useState<string | undefined>(templates.find((t) => t.isDefault)?.id ?? templates[0]?.id)
  const current = templates.find((t) => t.id === selectedId) ?? templates[0]
  const [draft, setDraft] = useState<Draft | undefined>(current && { name: current.name, isDefault: current.isDefault, definition: current.definition })
  const [loadedFrom, setLoadedFrom] = useState(current)
  const [selectedBlock, setSelectedBlock] = useState<string>("lines")
  const [drag, setDrag] = useState<Drag>()
  const [dropIndex, setDropIndex] = useState<number>()
  const [previewing, setPreviewing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<QuoteTemplate>()
  const [previewQuoteId, setPreviewQuoteId] = useState("")
  const recentQuotes = useQuery({ queryKey: ["Quotes", "recent"], queryFn: () => gateway.listRecentQuotes() })
  const chosenQuote = useQuery({ queryKey: ["Quote", previewQuoteId], queryFn: () => gateway.getQuote(previewQuoteId), enabled: !!previewQuoteId })
  const remove = useMutation({
    mutationFn: (id: string) => gateway.deleteQuoteTemplate(id),
    onSuccess: () => {
      setSelectedId(undefined)
      return invalidate()
    },
  })
  const makeDefault = useMutation({
    mutationFn: (id: string) => gateway.updateQuoteTemplate(id, { isDefault: true }),
    onSuccess: () => invalidate(),
  })

  // A template that was saved (or another one picked) replaces the draft.
  if (current && current !== loadedFrom) {
    setLoadedFrom(current)
    setDraft({ name: current.name, isDefault: current.isDefault, definition: current.definition })
  }

  const save = useMutation({
    mutationFn: () => gateway.updateQuoteTemplate(current!.id, { name: draft!.name, isDefault: draft!.isDefault, definition: draft!.definition }),
    onSuccess: () => invalidate(),
  })

  const today = toDateOnly(new Date())
  const document = useMemo(
    () => {
      if (!draft) return undefined
      if (previewQuoteId && chosenQuote.data) return documentOf(chosenQuote.data, settings, { ...current!, definition: draft.definition })
      return buildQuoteDocument(sampleQuoteInput(draft.definition, settings, user, today))
    },
    [draft, settings, user, today, previewQuoteId, chosenQuote.data, current],
  )

  if (!current || !draft || !document) return <p className="text-sm text-muted-foreground">There are no Quote templates yet.</p>

  const dirty = draft.name !== current.name || draft.isDefault !== current.isDefault || serializeDefinition(draft.definition) !== serializeDefinition(current.definition)
  const errors = fieldErrorsOf(save.error)
  const setDefinition = (definition: TemplateDefinition) => setDraft({ ...draft, definition })
  const setStyle = (style: Partial<PageStyle>) => setDefinition({ ...draft.definition, style: { ...draft.definition.style, ...style } })
  const tray = availableBlockTypes(draft.definition)
  const blocks = draft.definition.blocks
  const selected = blocks.find((b) => b.id === selectedBlock)

  const addBlock = (type: BlockType, index?: number) => {
    const block = newBlock(type, blocks.map((b) => b.id))
    setDefinition(placeBlock(draft.definition, block, index ?? blocks.length))
    setSelectedBlock(block.id)
  }

  const finishDrop = (index: number) => {
    if (drag?.kind === "new") addBlock(drag.type, index)
    if (drag?.kind === "move") {
      const block = blocks.find((b) => b.id === drag.id)
      if (block) setDefinition(placeBlock(draft.definition, block, index > blocks.indexOf(block) ? index - 1 : index))
    }
    setDrag(undefined)
    setDropIndex(undefined)
  }

  /** Where a drop on this Block lands: before it in its upper half, after it in its lower half. */
  const indexFor = (event: DragEvent, id: string) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const at = blocks.findIndex((b) => b.id === id)
    return event.clientY < rect.top + rect.height / 2 ? at : at + 1
  }

  const wrap = (docBlock: DocBlock, node: React.ReactNode) => {
    const block = blocks.find((b) => b.id === docBlock.id)
    if (!block) return node
    const locked = block.type === "footer"
    return (
      <div
        key={block.id}
        data-block={block.id}
        draggable={canEdit && !locked}
        onClick={() => setSelectedBlock(block.id)}
        onDragStart={() => setDrag({ kind: "move", id: block.id })}
        onDragEnd={() => {
          setDrag(undefined)
          setDropIndex(undefined)
        }}
        onDragOver={(event) => {
          if (!drag) return
          event.preventDefault()
          event.stopPropagation()
          setDropIndex(indexFor(event, block.id))
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          finishDrop(indexFor(event, block.id))
        }}
        style={{
          outline: selectedBlock === block.id ? "2px solid #2f5bd3" : "1px dashed transparent",
          outlineOffset: 4,
          cursor: canEdit ? "grab" : "default",
          boxShadow: dropIndex !== undefined && dropIndex === blocks.indexOf(block) ? "0 -6px 0 -3px #2f5bd3" : dropIndex !== undefined && dropIndex === blocks.indexOf(block) + 1 ? "0 6px 0 -3px #2f5bd3" : undefined,
        }}
      >
        {node}
      </div>
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="space-y-4">
        <section aria-label="Templates" className="rounded-md border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Templates</h2>
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden />
                New template
              </Button>
            )}
          </div>
          <ul className="grid gap-1.5">
            {templates.map((t) => (
              <li key={t.id} className={`flex flex-wrap items-center gap-1 rounded-md border p-1 ${t.id === current.id ? "border-primary" : ""}`}>
                <button type="button" aria-pressed={t.id === current.id} className="min-w-0 flex-1 truncate px-2 py-1 text-left text-sm font-medium" onClick={() => setSelectedId(t.id)}>
                  {t.name}
                </button>
                {t.isDefault && <Badge variant="secondary">Default</Badge>}
                {canEdit && (
                  <>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Rename ${t.name}`} onClick={() => setRenaming(t)}>
                      <Pencil aria-hidden />
                      Rename
                    </Button>
                    {!t.isDefault && (
                      <>
                        <Button type="button" variant="ghost" size="sm" aria-label={`Set ${t.name} as Default`} disabled={makeDefault.isPending} onClick={() => makeDefault.mutate(t.id)}>
                          <Star aria-hidden />
                          Set Default
                        </Button>
                        <Button type="button" variant="ghost" size="sm" aria-label={`Delete ${t.name}`} disabled={remove.isPending} onClick={() => remove.mutate(t.id)}>
                          <Trash2 aria-hidden />
                          Delete
                        </Button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {(remove.isError || makeDefault.isError) && <FormAlert error={remove.error ?? makeDefault.error} />}
        </section>
      <form aria-label="Template details" onSubmit={submit} noValidate className="space-y-4 rounded-md border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="tpl-name" label="Name" error={errors.name}>
            <Input id="tpl-name" value={draft.name} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </FormField>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="tpl-default"
            checked={draft.isDefault}
            disabled={!canEdit || current.isDefault}
            onCheckedChange={(checked) => setDraft({ ...draft, isDefault: checked === true })}
          />
          <Label htmlFor="tpl-default">Default template</Label>
          {errors.isDefault && <span className="text-sm text-destructive">{errors.isDefault}</span>}
        </div>

        <fieldset className="grid gap-3 sm:grid-cols-2" disabled={!canEdit}>
          <legend className="mb-1 text-sm font-medium">Page style</legend>
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-accent">Accent colour</Label>
            <div className="flex items-center gap-2">
              {ACCENTS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Accent ${color}`}
                  aria-pressed={draft.definition.style.accent === color}
                  onClick={() => setStyle({ accent: color })}
                  className="size-7 rounded-full border-2 aria-pressed:ring-2 aria-pressed:ring-ring"
                  style={{ background: color }}
                />
              ))}
              <Input id="tpl-accent" type="color" className="h-8 w-12 p-1" value={draft.definition.style.accent} onChange={(e) => setStyle({ accent: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-font">Typeface</Label>
            <select id="tpl-font" className={selectClass} value={draft.definition.style.font} onChange={(e) => setStyle({ font: e.target.value as PageStyle["font"] })}>
              {PDF_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f === "sans" ? "Sans (Helvetica)" : "Serif (Times)"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-logo">Logo position</Label>
            <select id="tpl-logo" className={selectClass} value={draft.definition.style.logoPosition} onChange={(e) => setStyle({ logoPosition: e.target.value as PageStyle["logoPosition"] })}>
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-language">Language</Label>
            <select id="tpl-language" className={selectClass} value={draft.definition.style.language} onChange={(e) => setStyle({ language: e.target.value as PageStyle["language"] })}>
              {PDF_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l === "nl" ? "Dutch" : "English"}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        {canEdit && (
          <div
            role="group"
            aria-label="Blocks you can add"
            className={`grid gap-2 rounded-md border-2 border-dashed p-3 ${drag?.kind === "move" ? "border-primary bg-accent" : ""}`}
            onDragOver={(event) => drag?.kind === "move" && event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (drag?.kind === "move") setDefinition(removeBlock(draft.definition, drag.id))
              setDrag(undefined)
              setDropIndex(undefined)
            }}
          >
            <p className="text-sm font-medium">Blocks you can add</p>
            <div className="flex flex-wrap gap-2">
              {tray.length === 0 && <span className="text-sm text-muted-foreground">Every Block is on the page.</span>}
              {tray.map((type) => (
                <span key={type} draggable onDragStart={() => setDrag({ kind: "new", type })} onDragEnd={() => setDrag(undefined)} className="inline-flex items-center gap-1 rounded-md border bg-card py-1 pr-1 pl-2 text-sm">
                  <GripVertical className="size-3.5 text-muted-foreground" aria-hidden />
                  {BLOCK_LABELS[type]}
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Add ${BLOCK_LABELS[type]}`} onClick={() => addBlock(type)}>
                    <Plus aria-hidden />
                  </Button>
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Drag a Block onto the page to add it, drag Blocks on the page to move them, and drag one back here to remove it. Click a Block to edit it.</p>
          </div>
        )}

        <ol aria-label="Blocks on the page" className="grid gap-1.5">
          {blocks.map((block, i) => {
            const locked = isLockedBlock(block.type)
            return (
              <li key={block.id} className={`flex items-center gap-1 rounded-md border p-1 ${selectedBlock === block.id ? "border-primary" : ""}`}>
                <button type="button" className="min-w-0 flex-1 truncate px-2 py-1 text-left text-sm font-medium" onClick={() => setSelectedBlock(block.id)}>
                  {BLOCK_LABELS[block.type]}
                </button>
                {locked && <Lock className="size-3.5 text-muted-foreground" aria-label="Always on the page" />}
                {canEdit && (
                  <>
                    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Move up ${BLOCK_LABELS[block.type]}`} disabled={i === 0 || block.type === "footer"} onClick={() => setDefinition(moveBlock(draft.definition, block.id, -1))}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Move down ${BLOCK_LABELS[block.type]}`} disabled={i >= blocks.length - 1 || blocks[i + 1]?.type === "footer" || block.type === "footer"} onClick={() => setDefinition(moveBlock(draft.definition, block.id, 1))}>
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Remove ${BLOCK_LABELS[block.type]}`} disabled={locked} onClick={() => setDefinition(removeBlock(draft.definition, block.id))}>
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            )
          })}
        </ol>

        {selected && (
          <BlockOptions
            block={selected}
            readOnly={!canEdit}
            onChange={(options) => setDefinition(updateBlockOptions(draft.definition, selected.id, options))}
          />
        )}

        {errors.definition && <p className="text-sm text-destructive">{errors.definition}</p>}
        {save.isError && Object.keys(errors).length === 0 && <FormAlert error={save.error} />}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setPreviewing(true)}>
            <Eye aria-hidden />
            Preview PDF
          </Button>
          {canEdit ? (
            <>
              <Button type="submit" disabled={!dirty || save.isPending}>
                Save template
              </Button>
              <Button type="button" variant="outline" disabled={!dirty} onClick={() => setDraft({ name: current.name, isDefault: current.isDefault, definition: current.definition })}>
                Discard changes
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Only a Catalogue manager changes Quote templates.</p>
          )}
        </div>
      </form>
      </div>

      <div className="min-w-0 space-y-2 lg:sticky lg:top-4 lg:self-start">
        <div className="grid gap-1.5">
          <Label htmlFor="tpl-preview-with">Preview with</Label>
          <select id="tpl-preview-with" className={selectClass} value={previewQuoteId} onChange={(e) => setPreviewQuoteId(e.target.value)}>
            <option value="">Example data</option>
            {(recentQuotes.data ?? []).map((q) => (
              <option key={q.id} value={q.id}>
                {q.number}
                {q.revision > 0 ? ` rev ${q.revision}` : ""} · {q.accountName}
              </option>
            ))}
          </select>
        </div>
        <QuoteSheet document={document} wrap={wrap} onDragOverSheet={canEdit ? (event) => drag && event.preventDefault() : undefined} onDropOnSheet={canEdit ? () => finishDrop(blocks.length) : undefined} />
      </div>

      {previewing && (
        <PreviewPdfDialog
          title={`Preview ${draft.name}`}
          description="Drawn with example data. Nothing is saved or sent."
          fileName={`${draft.name}.pdf`}
          document={document}
          onClose={() => setPreviewing(false)}
        />
      )}
      {renaming && <RenameTemplateDialog template={renaming} onClose={() => setRenaming(undefined)} />}
      {creating && <NewTemplateDialog definition={draft.definition} onClose={() => setCreating(false)} onCreated={(id) => setSelectedId(id)} />}
    </div>
  )
}

function BlockOptions({ block, readOnly, onChange }: { block: Block; readOnly: boolean; onChange: (options: Block["options"]) => void }) {
  const check = (name: string, caption: string) => (
    <div className="flex items-center gap-2">
      <Checkbox id={`opt-${name}`} checked={flag(block, name)} disabled={readOnly} onCheckedChange={(checked) => onChange({ [name]: checked === true })} />
      <Label htmlFor={`opt-${name}`}>{caption}</Label>
    </div>
  )
  let body: React.ReactNode
  switch (block.type) {
    case "header":
      body = (
        <>
          {check("band", "Colour band")}
          {check("sender", "Sender address")}
        </>
      )
      break
    case "reference":
      body = check("revision", "Show the Revision")
      break
    case "title":
      body = (
        <FormField id="opt-intro" label="Intro text">
          <Textarea id="opt-intro" rows={3} value={text(block, "intro")} readOnly={readOnly} onChange={(e) => onChange({ intro: e.target.value })} />
        </FormField>
      )
      break
    case "lines":
      body = (
        <>
          {check("code", "Product code")}
          {check("unit", "Unit")}
          {check("discount", "Discount")}
          {check("vat", "VAT rate")}
        </>
      )
      break
    case "terms":
      body = (
        <>
          {check("useSettings", "Terms from Quote settings")}
          {!flag(block, "useSettings") && (
            <FormField id="opt-text" label="Own terms text">
              <Textarea id="opt-text" rows={4} value={text(block, "text")} readOnly={readOnly} onChange={(e) => onChange({ text: e.target.value })} />
            </FormField>
          )}
        </>
      )
      break
    case "contact":
      body = check("phone", "Owner's phone")
      break
    case "signature":
      body = (
        <FormField id="opt-heading" label="Heading">
          <Input id="opt-heading" value={text(block, "heading")} readOnly={readOnly} onChange={(e) => onChange({ heading: e.target.value })} />
        </FormField>
      )
      break
    default:
      body = <p className="text-sm text-muted-foreground">This Block has no options.</p>
  }
  return (
    <section aria-label={`${BLOCK_LABELS[block.type]} options`} className="grid gap-2 rounded-md bg-muted/40 p-3">
      <h2 className="text-sm font-medium">{BLOCK_LABELS[block.type]}</h2>
      {body}
    </section>
  )
}

function RenameTemplateDialog({ template, onClose }: { template: QuoteTemplate; onClose: () => void }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [name, setName] = useState(template.name)
  const rename = useMutation({
    mutationFn: () => gateway.updateQuoteTemplate(template.id, { name }),
    onSuccess: async () => {
      await invalidate()
      onClose()
    },
  })
  const errors = fieldErrorsOf(rename.error)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
          <DialogDescription>Quotes keep using the template under its new name.</DialogDescription>
        </DialogHeader>
        <form
          aria-label="Rename template"
          onSubmit={(event) => {
            event.preventDefault()
            rename.mutate()
          }}
          className="grid gap-3"
        >
          <FormField id="rename-tpl-name" label="Name" required error={errors.name}>
            <Input id="rename-tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          {rename.isError && Object.keys(errors).length === 0 && <FormAlert error={rename.error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={rename.isPending}>
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NewTemplateDialog({ definition, onClose, onCreated }: { definition: TemplateDefinition; onClose: () => void; onCreated: (id: string) => void }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [name, setName] = useState("")
  const create = useMutation({
    mutationFn: () => gateway.createQuoteTemplate({ name, definition }),
    onSuccess: async (template) => {
      await invalidate()
      onCreated(template.id)
      onClose()
    },
  })
  const errors = fieldErrorsOf(create.error)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>The new template starts as a copy of the one on screen, with its unsaved changes.</DialogDescription>
        </DialogHeader>
        <form
          aria-label="New template"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
          className="grid gap-3"
        >
          <FormField id="new-tpl-name" label="Name" required error={errors.name}>
            <Input id="new-tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          {create.isError && Object.keys(errors).length === 0 && <FormAlert error={create.error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Create template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
