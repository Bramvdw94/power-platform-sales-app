import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import type { DocBlock, QuoteDocument } from "@/sales"

// An HTML drawing of a QuoteDocument on an A4 sheet, for the template builder. The sheet is paper, so its
// colours stay light in a dark theme. The PDF itself is drawn by lib/quote-pdf.ts from the same document.

const SHEET_W = 794
const SHEET_H = 1123
const INK = "#1d2230"
const MUTED = "#5a6274"
const RULE = "#d9dde6"

const FONTS = { sans: "Helvetica, Arial, sans-serif", serif: "'Times New Roman', Times, serif" }

const label: CSSProperties = { fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", color: MUTED, fontWeight: 600 }

function Block({ block, accent }: { block: DocBlock; accent: string }) {
  switch (block.type) {
    case "header": {
      const brand = (
        <div style={{ fontWeight: 700, fontSize: 17, color: block.band ? "#fff" : accent }}>
          {block.logo ? <img src={block.logo} alt="" style={{ maxHeight: 40, maxWidth: 150 }} /> : block.companyName}
        </div>
      )
      const right = block.band ? (
        <div style={{ fontWeight: 700, fontSize: 18, color: "#fff" }}>{block.title}</div>
      ) : block.showSender ? (
        <div style={{ fontSize: 10, color: MUTED }}>
          {block.senderLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : (
        <div />
      )
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexDirection: block.logoPosition === "right" ? "row-reverse" : "row",
            ...(block.band ? { background: accent, margin: "-44px -56px 0", padding: "26px 56px" } : {}),
          }}
        >
          {brand}
          {right}
        </div>
      )
    }
    case "address":
      return (
        <div style={{ marginTop: 18, lineHeight: 1.5 }}>
          {block.lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )
    case "reference":
      return (
        <div style={{ display: "flex", gap: 16, padding: "10px 0", borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
          {block.items.map((item) => (
            <div key={item.label} style={{ flex: 1 }}>
              <div style={label}>{item.label}</div>
              <div>{item.value}</div>
            </div>
          ))}
        </div>
      )
    case "title":
      return (
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>{block.title}</div>
          {block.intro && <p style={{ margin: "6px 0 0" }}>{block.intro}</p>}
        </div>
      )
    case "lines":
      return (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              {block.columns.map((c) => (
                <th key={c.id} style={{ ...label, textAlign: c.align, padding: "6px 4px", borderBottom: `1.5px solid ${accent}` }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, n) => (
                  <td key={n} style={{ textAlign: block.columns[n].align, padding: "7px 4px", borderBottom: `1px solid ${RULE}`, verticalAlign: "top", whiteSpace: "pre-line", fontWeight: block.columns[n].id === "description" ? 600 : 400 }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case "totals":
      return (
        <table style={{ marginLeft: "auto", width: 300, borderCollapse: "collapse" }}>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.label}>
                <td style={{ padding: "4px", fontWeight: row.strong ? 700 : 400, borderTop: row.strong ? `1.5px solid ${accent}` : undefined }}>{row.label}</td>
                <td style={{ padding: "4px", textAlign: "right", fontWeight: row.strong ? 700 : 400, borderTop: row.strong ? `1.5px solid ${accent}` : undefined }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    case "terms":
      return (
        <div style={{ fontSize: 10.5, color: MUTED }}>
          <div style={label}>{block.heading}</div>
          <p style={{ margin: "4px 0" }}>{block.text}</p>
          {block.url && <p style={{ margin: 0, color: accent }}>{block.url}</p>}
        </div>
      )
    case "contact":
      return (
        <div>
          <div style={label}>{block.heading}</div>
          {block.lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )
    case "signature":
      return (
        <div>
          <div style={{ fontWeight: 700, color: accent }}>{block.heading}</div>
          <div style={{ display: "flex", gap: 18, paddingTop: 40 }}>
            {block.fields.map((field) => (
              <div key={field} style={{ flex: 1, borderTop: `1px solid ${INK}`, paddingTop: 3, fontSize: 10, color: MUTED }}>
                {field}
              </div>
            ))}
          </div>
        </div>
      )
    case "footer":
      return null
  }
}

/** Scales the 794 px sheet down to the width it has. */
function useFit() {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => setScale(el.clientWidth > 0 ? Math.min(1, el.clientWidth / SHEET_W) : 1)
    fit()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, scale }
}

export function QuoteSheet({
  document: doc,
  wrap,
  className,
  onDragOverSheet,
  onDropOnSheet,
}: {
  document: QuoteDocument
  /** Lets the builder wrap each Block, for selecting and dragging. */
  wrap?: (block: DocBlock, node: ReactNode) => ReactNode
  className?: string
  onDragOverSheet?: (event: React.DragEvent) => void
  onDropOnSheet?: (event: React.DragEvent) => void
}) {
  const { ref, scale } = useFit()
  const accent = doc.style.accent
  return (
    <div ref={ref} className={className} style={{ height: SHEET_H * scale }}>
      <div
        role="img"
        aria-label="Quote PDF preview"
        onDragOver={onDragOverSheet}
        onDrop={onDropOnSheet}
        style={{
          width: SHEET_W,
          minHeight: SHEET_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          background: "#fff",
          color: INK,
          fontFamily: FONTS[doc.style.font],
          fontSize: 12.5,
          lineHeight: 1.45,
          boxSizing: "border-box",
          padding: "44px 56px 32px",
          boxShadow: "0 2px 14px rgba(10,20,40,.18)",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {doc.blocks.map((block) => {
          const node = <Block key={block.id} block={block} accent={accent} />
          return wrap ? wrap(block, node) : node
        })}
        {doc.watermark && (
          <div style={{ position: "absolute", top: 420, left: 0, right: 0, textAlign: "center", fontSize: 120, fontWeight: 700, color: "rgba(200,30,30,.09)", transform: "rotate(-24deg)", pointerEvents: "none", letterSpacing: "0.1em" }}>
            {doc.watermark}
          </div>
        )}
        <div style={{ marginTop: "auto", borderTop: `1px solid ${RULE}`, paddingTop: 8, fontSize: 10, color: MUTED, display: "flex", flexWrap: "wrap", gap: "4px 20px", justifyContent: "center" }}>
          {doc.footer.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
