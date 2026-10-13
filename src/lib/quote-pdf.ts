import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib"
import type { Align, DocBlock, QuoteDocument } from "@/sales"

// Draws a QuoteDocument to A4. What goes on the page is decided by buildQuoteDocument; this only lays it out.

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48
const CONTENT_W = PAGE_W - 2 * MARGIN
const FOOTER_H = 44
const MUTED = rgb(0.35, 0.38, 0.45)
const INK = rgb(0.11, 0.13, 0.19)
const RULE = rgb(0.8, 0.82, 0.86)

function hex(color: string) {
  const n = parseInt(color.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

type Fonts = { regular: PDFFont; bold: PDFFont }

class Painter {
  page!: PDFPage
  y = 0
  private readonly pdf: PDFDocument
  private readonly fonts: Fonts
  private readonly doc: QuoteDocument
  private readonly logo: PDFImage | undefined
  private readonly accent: ReturnType<typeof rgb>

  constructor(pdf: PDFDocument, fonts: Fonts, doc: QuoteDocument, logo: PDFImage | undefined, accent: ReturnType<typeof rgb>) {
    this.pdf = pdf
    this.fonts = fonts
    this.doc = doc
    this.logo = logo
    this.accent = accent
    this.newPage()
  }

  get bottom() {
    return MARGIN + FOOTER_H
  }

  /** The text with anything the standard font cannot encode replaced, so a stray character never fails the whole PDF. */
  safe(value: string, font: PDFFont): string {
    const known = new Set(font.getCharacterSet())
    return Array.from(value).map((c) => (c === "\n" || known.has(c.codePointAt(0)!) ? c : "?")).join("")
  }

  width(value: string, font: PDFFont, size: number) {
    return font.widthOfTextAtSize(this.safe(value, font).replace(/\n/g, " "), size)
  }

  wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const out: string[] = []
    for (const paragraph of this.safe(value, font).split("\n")) {
      let line = ""
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word
        if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
          out.push(line)
          line = word
        } else line = next
      }
      out.push(line)
    }
    return out
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H])
    this.y = PAGE_H - MARGIN
    if (this.doc.watermark) {
      const size = 110
      const w = this.fonts.bold.widthOfTextAtSize(this.doc.watermark, size)
      this.page.drawText(this.doc.watermark, {
        x: PAGE_W / 2 - (w / 2) * Math.cos(0.42) + (size / 3) * Math.sin(0.42),
        y: PAGE_H / 2 - (w / 2) * Math.sin(0.42) - size / 3 * Math.cos(0.42),
        size,
        font: this.fonts.bold,
        color: rgb(0.8, 0.12, 0.12),
        opacity: 0.1,
        rotate: degrees(24),
      })
    }
    this.footer()
  }

  ensure(height: number) {
    if (this.y - height < this.bottom) this.newPage()
  }

  text(value: string, x: number, size: number, opts: { font?: PDFFont; color?: ReturnType<typeof rgb>; align?: Align; width?: number } = {}) {
    const font = opts.font ?? this.fonts.regular
    const text = this.safe(value, font).replace(/\n/g, " ")
    const w = font.widthOfTextAtSize(text, size)
    const left = opts.align === "right" ? x + (opts.width ?? 0) - w : x
    this.page.drawText(text, { x: left, y: this.y - size, size, font, color: opts.color ?? INK })
  }

  /** Wrapped paragraph from the cursor down; returns nothing, moves the cursor. */
  paragraph(value: string, size: number, opts: { x?: number; width?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; leading?: number } = {}) {
    const font = opts.font ?? this.fonts.regular
    const leading = opts.leading ?? size * 1.4
    for (const line of this.wrap(value, font, size, opts.width ?? CONTENT_W)) {
      this.ensure(leading)
      this.text(line, opts.x ?? MARGIN, size, { font, color: opts.color })
      this.y -= leading
    }
  }

  rule(color = RULE, thickness = 0.8) {
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y }, thickness, color })
  }

  footer() {
    const lines = this.doc.footer
    if (lines.length === 0) return
    const size = 8
    const y = MARGIN + FOOTER_H - 6
    this.page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.8, color: RULE })
    let row = this.wrap(lines.join("   ·   "), this.fonts.regular, size, CONTENT_W)
    row = row.slice(0, 3)
    row.forEach((line, i) => {
      const w = this.fonts.regular.widthOfTextAtSize(line, size)
      this.page.drawText(line, { x: (PAGE_W - w) / 2, y: y - 14 - i * 11, size, font: this.fonts.regular, color: MUTED })
    })
  }

  drawLogo(x: number, topY: number, maxH: number, maxW: number, alignRight: boolean): number {
    if (!this.logo) return 0
    const scale = Math.min(maxH / this.logo.height, maxW / this.logo.width)
    const w = this.logo.width * scale
    const h = this.logo.height * scale
    this.page.drawImage(this.logo, { x: alignRight ? x - w : x, y: topY - h, width: w, height: h })
    return h
  }

  header(b: Extract<DocBlock, { type: "header" }>) {
    const logoRight = b.logoPosition === "right"
    if (b.band) {
      const h = 78
      this.page.drawRectangle({ x: 0, y: PAGE_H - h, width: PAGE_W, height: h, color: this.accent })
      this.y = PAGE_H - 22
      const white = rgb(1, 1, 1)
      const brandX = logoRight ? PAGE_W - MARGIN : MARGIN
      const logoH = this.drawLogo(brandX, this.y, 34, 130, logoRight)
      if (!logoH) {
        const w = this.width(b.companyName, this.fonts.bold, 15)
        this.text(b.companyName, logoRight ? brandX - w : brandX, 15, { font: this.fonts.bold, color: white })
      }
      const titleX = logoRight ? MARGIN : PAGE_W - MARGIN
      const w = this.width(b.title, this.fonts.bold, 17)
      this.page.drawText(this.safe(b.title, this.fonts.bold), { x: logoRight ? titleX : titleX - w, y: PAGE_H - 40, size: 17, font: this.fonts.bold, color: white })
      this.y = PAGE_H - h - 22
      return
    }
    const top = this.y
    const brandX = logoRight ? PAGE_W - MARGIN : MARGIN
    const logoH = this.drawLogo(brandX, top, 40, 150, logoRight)
    if (!logoH) {
      const w = this.width(b.companyName, this.fonts.bold, 16)
      this.page.drawText(this.safe(b.companyName, this.fonts.bold), { x: logoRight ? brandX - w : brandX, y: top - 16, size: 16, font: this.fonts.bold, color: this.accent })
    }
    let senderBottom = top
    if (b.showSender) {
      const senderX = logoRight ? MARGIN : PAGE_W - MARGIN - 200
      let y = top
      for (const line of b.senderLines) {
        this.page.drawText(this.safe(line, this.fonts.regular), { x: senderX, y: y - 9, size: 9, font: this.fonts.regular, color: MUTED })
        y -= 12
      }
      senderBottom = y
    }
    this.y = Math.min(senderBottom, top - Math.max(logoH, 18)) - 16
  }

  address(b: Extract<DocBlock, { type: "address" }>) {
    this.y -= 14
    for (const line of b.lines) {
      this.ensure(14)
      this.text(line, MARGIN, 10.5)
      this.y -= 14
    }
    this.y -= 8
  }

  reference(b: Extract<DocBlock, { type: "reference" }>) {
    this.ensure(46)
    this.y -= 4
    this.rule()
    this.y -= 8
    const colW = CONTENT_W / Math.max(1, b.items.length)
    b.items.forEach((item, i) => {
      this.text(item.label.toUpperCase(), MARGIN + i * colW, 7, { font: this.fonts.bold, color: MUTED })
      this.y -= 10
      this.text(item.value, MARGIN + i * colW, 10)
      this.y += 10
    })
    this.y -= 28
    this.rule()
    this.y -= 14
  }

  title(b: Extract<DocBlock, { type: "title" }>) {
    this.ensure(50)
    this.paragraph(b.title, 18, { font: this.fonts.bold, color: this.accent, leading: 24 })
    if (b.intro.trim()) {
      this.y -= 2
      this.paragraph(b.intro, 10.5)
    }
    this.y -= 8
  }

  lines(b: Extract<DocBlock, { type: "lines" }>) {
    const fixed: Record<string, number> = { code: 58, quantity: 38, unit: 46, price: 64, discount: 44, vat: 34, amount: 68 }
    const gap = 6
    const flexW = CONTENT_W - b.columns.reduce((sum, c) => sum + (c.id === "description" ? 0 : fixed[c.id]), 0) - gap * (b.columns.length - 1)
    const widths = b.columns.map((c) => (c.id === "description" ? flexW : fixed[c.id]))
    const xs: number[] = []
    let at = MARGIN
    for (const w of widths) {
      xs.push(at)
      at += w + gap
    }
    const size = 9
    const head = () => {
      this.ensure(30)
      b.columns.forEach((c, i) => this.text(c.label.toUpperCase(), xs[i], 7, { font: this.fonts.bold, color: MUTED, align: c.align, width: widths[i] }))
      this.y -= 14
      this.rule(this.accent, 1.2)
      this.y -= 6
    }
    head()
    for (const row of b.rows) {
      const wrapped = row.map((cell, i) => this.wrap(cell, b.columns[i].id === "description" ? this.fonts.regular : this.fonts.regular, size, widths[i]))
      const height = Math.max(...wrapped.map((l) => l.length)) * 12 + 6
      if (this.y - height < this.bottom) {
        this.newPage()
        head()
      }
      wrapped.forEach((cellLines, i) => {
        cellLines.forEach((line, n) => {
          const isDesc = b.columns[i].id === "description"
          const sub = isDesc && n > 0
          const font = isDesc && n === 0 ? this.fonts.bold : this.fonts.regular
          const savedY = this.y
          this.y = savedY - n * 12
          this.text(line, xs[i], size, { font, color: sub ? MUTED : INK, align: b.columns[i].align, width: widths[i] })
          this.y = savedY
        })
      })
      this.y -= height - 2
      this.rule(RULE, 0.5)
      this.y -= 4
    }
    this.y -= 6
  }

  totals(b: Extract<DocBlock, { type: "totals" }>) {
    const w = 250
    const x = PAGE_W - MARGIN - w
    this.ensure(b.rows.length * 16 + 10)
    for (const row of b.rows) {
      if (row.strong) {
        this.page.drawLine({ start: { x, y: this.y + 3 }, end: { x: PAGE_W - MARGIN, y: this.y + 3 }, thickness: 1.2, color: this.accent })
        this.y -= 4
      }
      const font = row.strong ? this.fonts.bold : this.fonts.regular
      const size = row.strong ? 11 : 9.5
      this.text(row.label, x, size, { font })
      this.text(row.value, x, size, { font, align: "right", width: w })
      this.y -= 16
    }
    this.y -= 8
  }

  terms(b: Extract<DocBlock, { type: "terms" }>) {
    if (!b.text && !b.url) return
    this.ensure(40)
    this.text(b.heading.toUpperCase(), MARGIN, 7, { font: this.fonts.bold, color: MUTED })
    this.y -= 12
    if (b.text) this.paragraph(b.text, 8.5, { color: MUTED })
    if (b.url) this.paragraph(b.url, 8.5, { color: this.accent })
    this.y -= 8
  }

  contact(b: Extract<DocBlock, { type: "contact" }>) {
    this.ensure(14 + b.lines.length * 13)
    this.text(b.heading.toUpperCase(), MARGIN, 7, { font: this.fonts.bold, color: MUTED })
    this.y -= 12
    for (const line of b.lines) {
      this.text(line, MARGIN, 9.5)
      this.y -= 13
    }
    this.y -= 8
  }

  signature(b: Extract<DocBlock, { type: "signature" }>) {
    this.ensure(110)
    this.y -= 6
    this.text(b.heading, MARGIN, 11, { font: this.fonts.bold, color: this.accent })
    this.y -= 56
    const colW = (CONTENT_W - 2 * 18) / 3
    b.fields.forEach((field, i) => {
      const x = MARGIN + i * (colW + 18)
      this.page.drawLine({ start: { x, y: this.y }, end: { x: x + colW, y: this.y }, thickness: 0.8, color: INK })
      this.page.drawText(this.safe(field, this.fonts.regular), { x, y: this.y - 11, size: 8, font: this.fonts.regular, color: MUTED })
    })
    this.y -= 26
  }

  draw(block: Exclude<DocBlock, { type: "footer" }>) {
    switch (block.type) {
      case "header":
        return this.header(block)
      case "address":
        return this.address(block)
      case "reference":
        return this.reference(block)
      case "title":
        return this.title(block)
      case "lines":
        return this.lines(block)
      case "totals":
        return this.totals(block)
      case "terms":
        return this.terms(block)
      case "contact":
        return this.contact(block)
      case "signature":
        return this.signature(block)
    }
  }
}

async function embedLogo(pdf: PDFDocument, dataUrl: string | undefined): Promise<PDFImage | undefined> {
  if (!dataUrl) return undefined
  const match = /^data:image\/(png|jpeg);base64,(.*)$/.exec(dataUrl)
  if (!match) return undefined
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))
  try {
    return match[1] === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  } catch {
    return undefined
  }
}

/** The PDF bytes of a Quote document: A4, one or more pages, with a watermark on a Draft. */
export async function renderQuotePdf(doc: QuoteDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const serif = doc.style.font === "serif"
  const fonts: Fonts = {
    regular: await pdf.embedFont(serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica),
    bold: await pdf.embedFont(serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold),
  }
  const header = doc.blocks.find((b) => b.type === "header")
  const logo = await embedLogo(pdf, header?.type === "header" ? header.logo : undefined)
  const painter = new Painter(pdf, fonts, doc, logo, hex(doc.style.accent))
  for (const block of doc.blocks) painter.draw(block)
  return pdf.save()
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: "application/pdf" })
}
