/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): small pieces the three variants of #165 share:
// badges, the decision / create-order / cancel dialogs and the totals block.

import { useState, type ReactNode } from "react"
import { Check, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type { QuoteDetails } from "@/data/gateway"
import { formatDate, formatPrice, formatVatRate } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  APPROVAL_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  approvalFor,
  approvalHint,
  approverChain,
  bandOf,
  createOrder,
  decide,
  fmtPct,
  mayDecide,
  orderFigures,
  orderForQuote,
  protoLines,
  quoteFigures,
  recall,
  requestApproval,
  sendBlock,
  setOrderStatus,
  updateOrder,
  isLocked,
  currentStep,
  useProto,
  useViewer,
  PEOPLE,
  type Approval,
  type ApprovalStatusLabel,
  type Figures,
  type Order,
  type OrderStatus,
  type Person,
  type Step,
} from "./model"

export const VARIANTS = [
  { key: "A", name: "Panels on the record" },
  { key: "B", name: "Status strip and paper" },
  { key: "C", name: "Drawer and split view" },
]

// ---------------------------------------------------------------- badges

const BADGE: Record<ApprovalStatusLabel, string> = {
  none: "border-border bg-background text-foreground",
  pending: "border-transparent bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-50",
  approved: "border-transparent bg-green-700 text-white",
  rejected: "border-transparent bg-red-700 text-white",
}
export function ApprovalBadge({ status }: { status: ApprovalStatusLabel }) {
  return <Badge className={BADGE[status]}>{status === "none" ? "No approval" : APPROVAL_STATUS_LABELS[status]}</Badge>
}

const ORDER_BADGE: Record<OrderStatus, string> = {
  open: "border-transparent bg-blue-100 text-blue-950 dark:bg-blue-900 dark:text-blue-50",
  fulfilled: "border-transparent bg-green-700 text-white",
  cancelled: "border-border bg-muted text-foreground",
}
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={ORDER_BADGE[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
}

export const STEP_LABEL: Record<Step["state"], string> = { waiting: "Waiting", current: "Deciding", approved: "Approved", rejected: "Rejected" }
export const stepTone = (state: Step["state"]) =>
  state === "approved"
    ? "bg-green-700 text-white"
    : state === "rejected"
      ? "bg-red-700 text-white"
      : state === "current"
        ? "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-50"
        : "bg-muted text-foreground"

export function Hint({ children, tone = "warn", className }: { children: ReactNode; tone?: "warn" | "ok"; className?: string }) {
  return (
    <p
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "warn" ? "border-amber-600/50 bg-amber-100 text-amber-950 dark:border-amber-500/50 dark:bg-amber-950 dark:text-amber-100" : "border-green-700/40 bg-green-100 text-green-950 dark:bg-green-950 dark:text-green-100",
        className,
      )}
    >
      {children}
    </p>
  )
}

export const when = (iso: string) => formatDate(iso)

// ---------------------------------------------------------------- a Quote, with its discount state

export function useQuoteState(details: QuoteDetails) {
  const s = useProto()
  const viewer = useViewer()
  const { quote, opportunity } = details
  const lines = protoLines(s, details)
  const f = quoteFigures(s, details)
  const approval = approvalFor(s, quote.id)
  const locked = isLocked(approval)
  const band = bandOf(f.effective)
  const chain = approverChain(quote.ownerId, f.effective)
  const draft = quote.status === "draft"
  const blocker = draft ? sendBlock(s, details) : undefined
  const open = !["closedWon", "closedLost"].includes(opportunity.stage)
  const mayEdit = open && draft && !locked && (details.canEdit || viewer.person.id === PEOPLE[quote.ownerId]?.managerId)
  const order = orderForQuote(s, quote.id)
  const canCreateOrder = quote.status === "accepted" && opportunity.stage === "closedWon" && !order
  return {
    s, viewer, lines, f, approval, locked, band, chain, draft, blocker, mayEdit, order, canCreateOrder,
    hint: approvalHint(quote.ownerId, f.effective),
    canRequest: draft && band !== "none" && (!approval || approval.status !== "pending") && approval?.status !== "approved" && open,
    mayDecide: approval ? mayDecide(approval, viewer.person) : false,
    mayRecall: !!approval && approval.status === "pending" && (viewer.person.id === approval.requester.id || viewer.person.id === PEOPLE[approval.requester.id]?.managerId),
    request: () =>
      requestApproval({ quoteId: quote.id, label: quote.revision > 0 ? `${quote.number} (rev ${quote.revision})` : quote.number, accountName: quote.accountName, ownerId: quote.ownerId, effective: f.effective, net: f.net }),
  }
}
export type QuoteState = ReturnType<typeof useQuoteState>

export function DiscountInput({ id, label, value, disabled, onChange, className }: { id: string; label: string; value: number; disabled?: boolean; onChange: (n: number) => void; className?: string }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <span className={cn("relative inline-block", className)}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        value={text ?? String(Math.round(value * 100) / 100)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value)
          onChange(Number(e.target.value))
        }}
        onBlur={() => setText(null)}
        className="h-8 w-20 [appearance:textfield] pr-6 text-right [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-muted-foreground">
        %
      </span>
    </span>
  )
}

// ---------------------------------------------------------------- totals

/** Subtotal, "Quote discount (x %)" as a minus amount, Net total, VAT per rate and Gross, as decided in #148. */
export function TotalsRows({ f, colSpan, trailing = 0 }: { f: Figures; colSpan: number; trailing?: number }) {
  const row = (label: ReactNode, value: ReactNode, strong = false) => (
    <TableRow className={strong ? "font-medium" : undefined}>
      <TableCell colSpan={colSpan}>{label}</TableCell>
      <TableCell className="text-right">{value}</TableCell>
      {trailing > 0 && <TableCell colSpan={trailing} />}
    </TableRow>
  )
  return (
    <TableFooter>
      {f.quoteDiscountPct > 0 && row("Subtotal", formatPrice(f.subtotal))}
      {f.quoteDiscountPct > 0 && row(`Quote discount (${fmtPct(Math.round(f.quoteDiscountPct * 100) / 100)})`, `− ${formatPrice(f.quoteDiscount)}`)}
      {row("Net total", formatPrice(f.net), true)}
      {f.byRate.map((r) => row(`VAT ${formatVatRate(r.rate)} on ${formatPrice(r.net)}`, formatPrice(r.vat)))}
      {row("Gross total", formatPrice(f.gross), true)}
    </TableFooter>
  )
}

/** The frozen lines of an Order, with the totals. */
export function OrderLinesTable({ order, className }: { order: Order; className?: string }) {
  const f = orderFigures(order)
  const showDiscount = order.lines.some((l) => l.discountPct > 0)
  const cols = 3 + (showDiscount ? 1 : 0) + 1
  return (
    <div className={cn("overflow-x-auto", className)}>
      <Table aria-label="Order lines">
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            {showDiscount && <TableHead className="text-right">Discount</TableHead>}
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {order.lines.map((l, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{l.name}</TableCell>
              <TableCell className="text-right">{l.qty}</TableCell>
              <TableCell className="text-right">{formatPrice(l.unitPrice)}</TableCell>
              {showDiscount && <TableCell className="text-right">{l.discountPct ? fmtPct(l.discountPct) : "—"}</TableCell>}
              <TableCell className="text-right">{formatPrice(l.qty * l.unitPrice * (1 - l.discountPct / 100))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TotalsRows f={f} colSpan={cols - 1} />
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------- dialogs

export function DecideDialog({ approval, mode, onClose }: { approval: Approval; mode: "approve" | "reject"; onClose: () => void }) {
  const { person } = useViewer()
  const [comment, setComment] = useState("")
  const [error, setError] = useState("")
  const approve = mode === "approve"
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!approve && !comment.trim()) return setError("Say why you are rejecting it.")
            decide(approval.id, person, approve, comment)
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>{approve ? "Approve" : "Reject"} {approval.subjectLabel}</DialogTitle>
            <DialogDescription>
              {approval.summary} · {approval.accountName}.{" "}
              {approve ? "The comment is optional." : "One rejection ends the request; the record unlocks and can be changed and asked again."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="decide-comment">Comment{approve ? " (optional)" : ""}</Label>
            <Textarea id="decide-comment" value={comment} onChange={(e) => setComment(e.target.value)} aria-invalid={error ? true : undefined} />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={approve ? "default" : "destructive"}>
              {approve ? <Check aria-hidden /> : <X aria-hidden />}
              {approve ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Approve and Reject, for the current Approver; Recall for the requester, Owner or manager. */
export function DecisionButtons({ approval, size = "default", noRecall }: { approval: Approval; size?: "default" | "sm"; noRecall?: boolean }) {
  const { person } = useViewer()
  const [mode, setMode] = useState<"approve" | "reject" | null>(null)
  const may = mayDecide(approval, person)
  const mayRecall = !noRecall && approval.status === "pending" && (person.id === approval.requester.id || person.id === PEOPLE[approval.requester.id]?.managerId)
  if (approval.status !== "pending") return null
  return (
    <>
      {may && (
        <>
          <Button size={size} onClick={() => setMode("approve")}>
            <Check aria-hidden />
            Approve
          </Button>
          <Button size={size} variant="outline" onClick={() => setMode("reject")}>
            <X aria-hidden />
            Reject
          </Button>
        </>
      )}
      {mayRecall && (
        <Button size={size} variant="outline" onClick={() => recall(approval.id, person)}>
          Recall
        </Button>
      )}
      {mode && <DecideDialog approval={approval} mode={mode} onClose={() => setMode(null)} />}
    </>
  )
}

export function waitingFor(a: Approval) {
  const step = currentStep(a)
  return step ? `${step.who.name}${step.role === "Fallback approver" ? " (Fallback approver)" : ""}` : ""
}

export function orderArgsOf(details: QuoteDetails, q: QuoteState) {
  const { quote, opportunity, contact } = details
  return {
    quoteId: quote.id,
    quoteLabel: quote.revision > 0 ? `${quote.number} (rev ${quote.revision})` : quote.number,
    opportunityId: opportunity.id,
    opportunityName: opportunity.name,
    accountId: quote.accountId,
    accountName: quote.accountName,
    contactName: contact ? `${contact.firstName} ${contact.lastName}` : undefined,
    ownerId: quote.ownerId,
    lines: q.lines,
    quoteDiscountPct: q.f.quoteDiscountPct,
  }
}

export function CreateOrderDialog({ details, onClose, onCreated }: { details: QuoteDetails; onClose: () => void; onCreated: (order: Order) => void }) {
  const q = useQuoteState(details)
  const { quote } = details
  const [delivery, setDelivery] = useState("")
  const [po, setPo] = useState("")
  const [note, setNote] = useState("")
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            onCreated(createOrder({ ...orderArgsOf(details, q), requestedDelivery: delivery, poNumber: po, note }))
          }}
        >
          <DialogHeader>
            <DialogTitle>Create Order</DialogTitle>
            <DialogDescription>
              {quote.number} gets one Order. It keeps frozen copies of the lines, the Quote discount and the totals; later changes to the Quote never reach it.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border p-3 text-sm">
            <dt className="text-muted-foreground">Account</dt>
            <dd className="text-right">{quote.accountName}</dd>
            <dt className="text-muted-foreground">Lines</dt>
            <dd className="text-right">{q.lines.length}</dd>
            <dt className="text-muted-foreground">Quote discount</dt>
            <dd className="text-right">{fmtPct(Math.round(q.f.quoteDiscountPct * 100) / 100)}</dd>
            <dt className="text-muted-foreground">Net total</dt>
            <dd className="text-right font-medium">{formatPrice(q.f.net)}</dd>
            <dt className="text-muted-foreground">Order date</dt>
            <dd className="text-right">Today</dd>
          </dl>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="co-delivery">Requested delivery date</Label>
              <Input id="co-delivery" type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="co-po">Customer PO number</Label>
              <Input id="co-po" value={po} onChange={(e) => setPo(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-note">Note</Label>
            <Textarea id="co-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Create Order</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CancelOrderDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const { person } = useViewer()
  const [comment, setComment] = useState("")
  const [error, setError] = useState("")
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!comment.trim()) return setError("Say why the Order is cancelled.")
            setOrderStatus(order.id, "cancelled", person, comment)
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Cancel {order.number}</DialogTitle>
            <DialogDescription>Cancelled is final and the Order stays in the list. The Opportunity is not reopened.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="cancel-comment">Comment *</Label>
            <Textarea id="cancel-comment" value={comment} onChange={(e) => setComment(e.target.value)} aria-invalid={error ? true : undefined} />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Keep the Order
            </Button>
            <Button type="submit" variant="destructive">
              Cancel Order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Fulfil and Cancel, for the Owner and the Owner's manager of an Open Order. */
export function OrderActions({ order, size = "default" }: { order: Order; size?: "default" | "sm" }) {
  const [cancelling, setCancelling] = useState(false)
  const { person } = useViewer()
  const may = order.status === "open" && (order.ownerId === person.id || PEOPLE[order.ownerId]?.managerId === person.id)
  if (!may) return null
  return (
    <>
      <Button size={size} onClick={() => setOrderStatus(order.id, "fulfilled", person)}>
        <Check aria-hidden />
        Mark fulfilled
      </Button>
      <Button size={size} variant="outline" onClick={() => setCancelling(true)}>
        <X aria-hidden />
        Cancel…
      </Button>
      {cancelling && <CancelOrderDialog order={order} onClose={() => setCancelling(false)} />}
    </>
  )
}

/** The three editable fields of an Order: requested delivery date, PO number, note. */
export function OrderEditFields({ order, idPrefix, className }: { order: Order; idPrefix: string; className?: string }) {
  const { person } = useViewer()
  const may = order.status === "open" && (order.ownerId === person.id || PEOPLE[order.ownerId]?.managerId === person.id)
  const save = (edit: Partial<Pick<Order, "requestedDelivery" | "poNumber" | "note">>) =>
    updateOrder(order.id, { requestedDelivery: order.requestedDelivery, poNumber: order.poNumber, note: order.note, ...edit })
  if (!may)
    return (
      <dl className={cn("grid gap-3 text-sm sm:grid-cols-3", className)}>
        <Item label="Requested delivery">{order.requestedDelivery ? formatDate(order.requestedDelivery) : "—"}</Item>
        <Item label="Customer PO number">{order.poNumber || "—"}</Item>
        <Item label="Note" wide>{order.note || "—"}</Item>
      </dl>
    )
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-delivery`}>Requested delivery</Label>
        <Input id={`${idPrefix}-delivery`} type="date" value={order.requestedDelivery ?? ""} onChange={(e) => save({ requestedDelivery: e.target.value || undefined })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-po`}>Customer PO number</Label>
        <Input id={`${idPrefix}-po`} value={order.poNumber ?? ""} onChange={(e) => save({ poNumber: e.target.value || undefined })} />
      </div>
      <div className="grid gap-1.5 sm:col-span-3">
        <Label htmlFor={`${idPrefix}-note`}>Note</Label>
        <Textarea id={`${idPrefix}-note`} value={order.note ?? ""} onChange={(e) => save({ note: e.target.value || undefined })} />
      </div>
    </div>
  )
}

export function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && "sm:col-span-3")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export const orderTotalLabel = (o: Order) => formatPrice(orderFigures(o).net)
export type { Person }
