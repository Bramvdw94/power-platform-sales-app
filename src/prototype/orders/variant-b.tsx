/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): variant B of #165, "Status strip and paper".
// The record leads with where it stands: a status strip with the approval chain, discount edited
// in a live Pricing card with a threshold gauge, Home as an inbox that decides in place, Orders as
// a board by status and an Order that reads like the paper order confirmation.

import { Link, useParams } from "react-router-dom"
import { useState } from "react"
import { Check, ChevronDown, ChevronRight, ShoppingCart, X } from "lucide-react"
import { RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { QuoteDetails } from "@/data/gateway"
import { formatDate, formatPrice, formatVatRate } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  THRESHOLDS,
  currentStep,
  decide,
  fmtPct,
  inTeam,
  mayDecide,
  orderAccountHref,
  orderFigures,
  orderOpportunityHref,
  orderQuoteHref,
  personName,
  setLineDiscount,
  setQuoteDiscount,
  useProto,
  useViewer,
  ORDER_STATUS_LABELS,
  type Approval,
  type Order,
  type OrderStatus,
} from "./model"
import { ApprovalBadge, DecisionButtons, DiscountInput, Hint, OrderActions, OrderEditFields, OrderStatusBadge, STEP_LABEL, TotalsRows, stepTone, useQuoteState, waitingFor, when, type QuoteState } from "./shared"

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("")

// ---------------------------------------------------------------- the status strip

type Phase = "done" | "active" | "todo"
function Stepper({ items }: { items: { label: string; phase: Phase; note?: string }[] }) {
  return (
    <ol className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:flex" aria-label="Where this record stands">
      {items.map((it, i) => (
        <li key={it.label} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
              it.phase === "done" && "bg-green-700 text-white",
              it.phase === "active" && "bg-primary text-primary-foreground",
              it.phase === "todo" && "bg-muted text-foreground",
            )}
          >
            {it.phase === "done" ? <Check className="size-4" aria-hidden /> : i + 1}
          </span>
          <span className="min-w-0">
            <span className={cn("block text-sm", it.phase === "active" ? "font-semibold" : "font-medium")}>{it.label}</span>
            {it.note && <span className="block text-xs text-muted-foreground">{it.note}</span>}
          </span>
          {i < items.length - 1 && <span aria-hidden className="mx-1 hidden h-px flex-1 bg-border sm:block" />}
        </li>
      ))}
    </ol>
  )
}

function ChainChips({ approval }: { approval: Approval }) {
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Approvers">
      {approval.steps.map((s, i) => (
        <li key={i} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
          <span className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm">
            <span className={cn("grid size-7 place-items-center rounded-full text-xs font-semibold", stepTone(s.state))}>{initials(s.who.name)}</span>
            <span>
              <span className="font-medium">{s.who.name}</span>
              <span className="text-muted-foreground"> · {STEP_LABEL[s.state]}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function StatusStripB({ details, q }: { details: QuoteDetails; q: QuoteState }) {
  const { quote } = details
  const a = q.approval
  const needs = q.band !== "none"
  const sentOrLater = quote.status !== "draft"
  const approvalPhase: Phase = !needs && !a ? "done" : a?.status === "approved" ? "done" : a?.status === "pending" ? "active" : q.draft ? "active" : "done"
  const items = [
    { label: "Draft", phase: (q.draft ? "done" : "done") as Phase, note: q.draft ? "Prices and discounts" : undefined },
    {
      label: "Approval",
      phase: approvalPhase,
      note: !needs && !a ? "Not needed" : a?.status === "pending" ? `Waiting for ${waitingFor(a)}` : a?.status === "approved" ? "Approved" : a?.status === "rejected" ? "Rejected" : "Needed",
    },
    { label: "Sent", phase: (sentOrLater ? "done" : approvalPhase === "done" && q.draft ? "active" : "todo") as Phase, note: sentOrLater ? undefined : q.blocker },
    { label: "Accepted", phase: (quote.status === "accepted" ? "done" : quote.status === "sent" ? "active" : "todo") as Phase },
    { label: "Order", phase: (q.order ? "done" : q.canCreateOrder ? "active" : "todo") as Phase, note: q.order?.number },
  ]
  return (
    <section aria-label="Status" className="space-y-3 rounded-md border p-4">
      <Stepper items={items} />
      {(a || needs) && (
        <div className="space-y-3 border-t pt-3">
          {a ? <ChainChips approval={a} /> : <p className="text-sm">{q.hint}.</p>}
          {a?.steps.map((s, i) => s.comment && <p key={i} className="text-sm">“{s.comment}” <span className="text-muted-foreground">· {s.who.name}, {s.on && when(s.on)}</span></p>)}
          {a?.note && <p className="text-sm text-muted-foreground">{a.note}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {!a && q.canRequest && <Button onClick={q.request}>Request approval</Button>}
            {a?.status === "rejected" && q.canRequest && <Button onClick={q.request}>Ask again</Button>}
            {a?.status === "lapsed" && q.canRequest && <Button onClick={q.request}>Request approval again</Button>}
            {a && <DecisionButtons approval={a} />}
            {q.blocker && <span className="text-sm text-muted-foreground">Send is locked: {q.blocker.toLowerCase()}.</span>}
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- the Pricing card

function Gauge({ effective }: { effective: number }) {
  const max = 40
  const at = (n: number) => `${(Math.min(n, max) / max) * 100}%`
  const tone = effective > THRESHOLDS.second ? "bg-red-700" : effective > THRESHOLDS.first ? "bg-amber-600" : "bg-green-700"
  return (
    <div className="space-y-1">
      <div className="relative h-3 rounded-full bg-muted" role="img" aria-label={`Effective discount ${fmtPct(Math.round(effective * 10) / 10)}; thresholds at ${THRESHOLDS.first} % and ${THRESHOLDS.second} %`}>
        <div className={cn("h-3 rounded-full", tone)} style={{ width: at(effective) }} />
        {[THRESHOLDS.first, THRESHOLDS.second].map((t) => (
          <span key={t} className="absolute -top-1 h-5 w-0.5 bg-foreground/60" style={{ left: at(t) }} />
        ))}
      </div>
      <div className="relative h-4 text-xs text-muted-foreground">
        <span className="absolute -translate-x-1/2" style={{ left: at(THRESHOLDS.first) }}>{THRESHOLDS.first} %</span>
        <span className="absolute -translate-x-1/2" style={{ left: at(THRESHOLDS.second) }}>{THRESHOLDS.second} %</span>
      </div>
    </div>
  )
}

function PricingCard({ details, q }: { details: QuoteDetails; q: QuoteState }) {
  const { quote } = details
  const { f } = q
  const editable = q.mayEdit
  return (
    <aside aria-label="Pricing" className="space-y-4 rounded-md border p-4 lg:sticky lg:top-4">
      <div>
        <p className="text-xs text-muted-foreground">Effective discount vs List price</p>
        <p className="text-3xl font-semibold tabular-nums">{fmtPct(Math.round(f.effective * 10) / 10)}</p>
      </div>
      <Gauge effective={f.effective} />
      <p className="text-sm">{q.hint}.</p>

      <div className="space-y-2">
        <p className="text-sm font-medium">Discount per line</p>
        {q.lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{l.name}</span>
            {editable ? <DiscountInput id={`b-line-${l.id}`} label={`Discount on ${l.name}`} value={l.discountPct} onChange={(n) => setLineDiscount(quote.id, l.id, n)} /> : <span>{l.discountPct ? fmtPct(l.discountPct) : "—"}</span>}
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="b-quote-discount" className="text-sm font-medium">
            Quote discount
          </Label>
          {editable ? (
            <DiscountInput id="b-quote-discount" label="Quote discount" value={f.quoteDiscountPct} onChange={(n) => setQuoteDiscount(quote.id, n)} />
          ) : (
            <span className="text-sm">{f.quoteDiscountPct ? fmtPct(Math.round(f.quoteDiscountPct * 100) / 100) : "—"}</span>
          )}
        </div>
        {editable && (
          <input
            type="range"
            aria-label="Quote discount slider"
            min={0}
            max={40}
            step={1}
            value={Math.min(40, Math.round(f.quoteDiscountPct))}
            onChange={(e) => setQuoteDiscount(quote.id, Number(e.target.value))}
            className="w-full accent-primary"
          />
        )}
      </div>
      <dl className="space-y-1 border-t pt-3 text-sm">
        <Row label="Subtotal" value={formatPrice(f.subtotal)} />
        {f.quoteDiscountPct > 0 && <Row label="Quote discount" value={`− ${formatPrice(f.quoteDiscount)}`} />}
        <Row label="Net total" value={formatPrice(f.net)} strong />
        <Row label="VAT" value={formatPrice(f.vat)} />
        <Row label="Gross total" value={formatPrice(f.gross)} strong />
      </dl>
      {q.locked && <p className="text-xs text-muted-foreground">Read-only while the Approval is Pending.</p>}
    </aside>
  )
}

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={cn("flex justify-between gap-2", strong && "font-medium")}>
    <dt>{label}</dt>
    <dd className="tabular-nums">{value}</dd>
  </div>
)

export function QuoteBodyB({ details }: { details: QuoteDetails }) {
  const q = useQuoteState(details)
  return (
    <>
      <StatusStripB details={details} q={q} />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <RecordSection title="Quote lines">
          <div className="overflow-x-auto">
            <Table aria-label="Quote lines">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">VAT</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell className="text-right">{l.qty}</TableCell>
                    <TableCell className="text-right">
                      {l.discountPct > 0 && <span className="mr-1 text-muted-foreground line-through">{formatPrice(l.unitPrice)}</span>}
                      {formatPrice(l.unitPrice * (1 - l.discountPct / 100))}
                      {l.discountPct > 0 && <span className="block text-xs text-muted-foreground">− {fmtPct(l.discountPct)}</span>}
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">{formatVatRate(l.vatRate)}</TableCell>
                    <TableCell className="text-right font-medium">{formatPrice(l.qty * l.unitPrice * (1 - l.discountPct / 100))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TotalsRows f={q.f} colSpan={4} />
            </Table>
          </div>
        </RecordSection>
        <PricingCard details={details} q={q} />
      </div>
    </>
  )
}

export function QuoteActionsB({ details, busy, onSend }: { details: QuoteDetails; busy: boolean; onSend: () => void }) {
  const q = useQuoteState(details)
  return q.draft ? (
    <Button disabled={busy || !!q.blocker} onClick={onSend} title={q.blocker}>
      Send
    </Button>
  ) : null
}

export function OrderButtonB({ details, onCreate }: { details: QuoteDetails; onCreate: () => void }) {
  const q = useQuoteState(details)
  if (q.order)
    return (
      <Button variant="outline" asChild>
        <Link to={`/orders/${q.order.id}`}>View {q.order.number}</Link>
      </Button>
    )
  return q.canCreateOrder && details.canEdit ? (
    <Button onClick={onCreate}>
      <ShoppingCart aria-hidden />
      Create Order
    </Button>
  ) : null
}

export function OpportunityApprovalB({ approvalId }: { approvalId: string }) {
  const { approvals } = useProto()
  const a = approvals.find((x) => x.id === approvalId)
  if (!a) return null
  return (
    <section aria-label="Approval" className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ApprovalBadge status={a.status === "pending" ? "pending" : a.status === "approved" ? "approved" : "none"} />
        <p className="text-sm">{a.summary}. Requested by {a.requester.name}, {when(a.requestedOn)}.</p>
      </div>
      <ChainChips approval={a} />
      <div className="flex flex-wrap gap-2">
        <DecisionButtons approval={a} />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Home

function InboxRow({ a }: { a: Approval }) {
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState("")
  const [error, setError] = useState("")
  const { person } = useViewer()
  return (
    <li className="py-1">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-accent">
        {open ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="block font-medium break-words">{a.subjectLabel}</span>
          <span className="block text-sm text-muted-foreground">
            {a.accountName} · {a.summary}
          </span>
        </span>
        <span className="hidden text-right text-sm sm:block">
          <span className="block font-medium">{formatPrice(a.amount)}</span>
          <span className="block text-muted-foreground">{a.requester.name}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-l-2 py-2 pl-4 ml-3">
          <ChainChips approval={a} />
          <p className="text-sm">Requested by {a.requester.name}, {when(a.requestedOn)}{a.href && <> · <Link to={a.href} className="text-primary hover:underline">Open the record</Link></>}</p>
          <div className="grid gap-1.5">
            <Label htmlFor={`inbox-${a.id}`} className="text-sm">Comment</Label>
            <Textarea id={`inbox-${a.id}`} value={comment} onChange={(e) => setComment(e.target.value)} aria-invalid={error ? true : undefined} />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide(a.id, person, true, comment)}>
              <Check aria-hidden />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => (comment.trim() ? decide(a.id, person, false, comment) : setError("Reject needs a comment."))}>
              <X aria-hidden />
              Reject
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

export function HomeApprovalsB() {
  const { approvals } = useProto()
  const { person } = useViewer()
  const mine = approvals.filter((a) => a.status === "pending" && mayDecide(a, person))
  const waiting = approvals.filter((a) => a.status === "pending" && a.requester.id === person.id)
  if (mine.length === 0 && waiting.length === 0) return <Hint tone="ok">Nothing is waiting for your approval.</Hint>
  return (
    <section aria-label="Waiting for my approval" className="rounded-md border border-amber-600/50 bg-card p-3">
      <h2 className="px-2 pb-1 font-semibold">Waiting for my approval ({mine.length})</h2>
      {mine.length === 0 ? <p className="px-2 pb-2 text-sm text-muted-foreground">Nothing is waiting for you.</p> : <ul className="divide-y">{mine.map((a) => <InboxRow key={a.id} a={a} />)}</ul>}
      {waiting.length > 0 && (
        <p className="border-t px-2 pt-2 text-sm text-muted-foreground">
          You are waiting for: {waiting.map((a) => `${a.subjectLabel} (${waitingFor(a)})`).join("; ")}
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- Orders

const BOARD: OrderStatus[] = ["open", "fulfilled", "cancelled"]

function OrderCard({ o, compact }: { o: Order; compact?: boolean }) {
  const f = orderFigures(o)
  return (
    <Link to={`/orders/${o.id}`} className="block rounded-md border bg-card p-3 hover:bg-accent">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-primary">{o.number}</span>
        <span className="text-sm font-medium tabular-nums">{formatPrice(f.net)}</span>
      </div>
      <p className="text-sm">{o.accountName}</p>
      {!compact && <p className="truncate text-sm text-muted-foreground">{o.opportunityName}</p>}
      <p className="mt-1 text-xs text-muted-foreground">
        {o.requestedDelivery ? `Deliver by ${formatDate(o.requestedDelivery)}` : `Ordered ${formatDate(o.orderDate)}`} · {personName(o.ownerId)}
      </p>
    </Link>
  )
}

export function OrdersPageB() {
  const { orders } = useProto()
  const { person } = useViewer()
  const [scope, setScope] = useState<"my" | "team" | "all">("all")
  const list = orders.filter((o) => (scope === "all" ? true : scope === "team" ? inTeam(o, person) : o.ownerId === person.id))
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <div role="group" aria-label="Show" className="ml-auto inline-flex rounded-md border p-0.5">
          {(["my", "team", "all"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)} className={cn("rounded px-3 py-1 text-sm", scope === s ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
              {s === "my" ? "Mine" : s === "team" ? "My team" : "Everyone"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {BOARD.map((status) => {
          const col = list.filter((o) => o.status === status).sort((a, b) => b.orderDate.localeCompare(a.orderDate))
          return (
            <section key={status} aria-label={ORDER_STATUS_LABELS[status]} className="space-y-2 rounded-md bg-muted p-2">
              <h2 className="flex items-center gap-2 px-1 text-sm font-semibold">
                {ORDER_STATUS_LABELS[status]} <span className="rounded-full bg-background px-2 text-xs font-medium">{col.length}</span>
              </h2>
              {col.length === 0 && <p className="px-1 py-3 text-sm text-foreground/80">Nothing {ORDER_STATUS_LABELS[status].toLowerCase()}.</p>}
              {col.map((o) => (
                <OrderCard key={o.id} o={o} />
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function OrdersTabB({ scope }: { scope: { type: "opportunity" | "account"; id: string } }) {
  const { orders } = useProto()
  const mine = orders.filter((o) => (scope.type === "account" ? o.accountId === scope.id : o.opportunityId === scope.id))
  const first = BOARD.find((s) => mine.some((o) => o.status === s)) ?? "open"
  return (
    <RecordSection title="Orders">
      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Orders yet.</p>
      ) : (
        <Tabs defaultValue={first}>
          <TabsList>
            {BOARD.map((s) => (
              <TabsTrigger key={s} value={s}>
                {ORDER_STATUS_LABELS[s]} ({mine.filter((o) => o.status === s).length})
              </TabsTrigger>
            ))}
          </TabsList>
          {BOARD.map((s) => (
            <TabsContent key={s} value={s} className="grid gap-2 sm:grid-cols-2">
              {mine.filter((o) => o.status === s).length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
              {mine.filter((o) => o.status === s).map((o) => <OrderCard key={o.id} o={o} compact />)}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </RecordSection>
  )
}

export function OrderPageB() {
  const { id = "" } = useParams()
  const { orders } = useProto()
  const o = orders.find((x) => x.id === id)
  if (!o) return <p className="p-6">Order not found.</p>
  const f = orderFigures(o)
  const link = (href: string | undefined, text: string) => (href ? <Link to={href} className="text-primary hover:underline">{text}</Link> : text)
  const phases: { label: string; phase: Phase; note?: string }[] = [
    { label: "Open", phase: o.status === "open" ? "active" : "done", note: formatDate(o.orderDate) },
    o.status === "cancelled" ? { label: "Cancelled", phase: "done", note: o.history[o.history.length - 1] && when(o.history[o.history.length - 1].at) } : { label: "Fulfilled", phase: o.status === "fulfilled" ? "done" : "todo" },
  ]
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
      <Link to="/orders" className="text-sm text-primary hover:underline">← All Orders</Link>
      <section className="space-y-3 rounded-md border p-4">
        <Stepper items={phases} />
        {o.status === "cancelled" && <Hint>Cancelled: {o.cancelComment}</Hint>}
      </section>
      <article aria-label={`Order ${o.number}`} className="space-y-6 rounded-md border bg-card p-5 shadow-sm md:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-widest text-muted-foreground uppercase">Order</p>
            <h1 className="text-3xl font-semibold tracking-tight">{o.number}</h1>
            <OrderStatusBadge status={o.status} />
          </div>
          <dl className="text-right text-sm">
            <dt className="text-xs text-muted-foreground">Order date</dt>
            <dd>{formatDate(o.orderDate)}</dd>
            <dt className="mt-2 text-xs text-muted-foreground">Owner</dt>
            <dd>{personName(o.ownerId)}</dd>
          </dl>
        </header>
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Customer</p>
            <p className="font-medium">{link(orderAccountHref(o), o.accountName)}</p>
            {o.contactName && <p>{o.contactName}</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">From</p>
            <p>{link(orderQuoteHref(o), o.quoteLabel)}</p>
            <p>{link(orderOpportunityHref(o), o.opportunityName)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net total</p>
            <p className="text-xl font-semibold tabular-nums">{formatPrice(f.net)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table aria-label="Order lines">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-right">{l.qty}</TableCell>
                  <TableCell className="text-right">
                    {l.discountPct > 0 && <span className="mr-1 text-muted-foreground line-through">{formatPrice(l.unitPrice)}</span>}
                    {formatPrice(l.unitPrice * (1 - l.discountPct / 100))}
                  </TableCell>
                  <TableCell className="text-right">{formatPrice(l.qty * l.unitPrice * (1 - l.discountPct / 100))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TotalsRows f={f} colSpan={3} />
          </Table>
        </div>
        <section aria-label="Delivery" className="space-y-2 border-t pt-4">
          <h2 className="text-sm font-semibold">Delivery and reference</h2>
          <OrderEditFields order={o} idPrefix="paper" />
        </section>
        <footer className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap gap-2">
            <OrderActions order={o} />
          </div>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {o.history.map((h, i) => (
              <li key={i}>{when(h.at)} · {h.by} · {h.text}</li>
            ))}
          </ul>
        </footer>
      </article>
    </div>
  )
}

export { currentStep }
