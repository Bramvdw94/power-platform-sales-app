/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): variant A of #165, "Panels on the record".
// Everything is a card on the record, like today's Quote and Opportunity pages: the discount is
// typed into the lines table, the Approval is its own card, Orders are a list with My / My team / All.

import { Link, useNavigate, useParams } from "react-router-dom"
import { useState } from "react"
import { ShoppingCart } from "lucide-react"
import { RecordPage, RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { QuoteDetails } from "@/data/gateway"
import { formatDate, formatPrice, formatVatRate } from "@/lib/format"
import {
  THRESHOLDS,
  currentStep,
  fmtPct,
  inTeam,
  orderAccountHref,
  orderFigures,
  orderOpportunityHref,
  orderQuoteHref,
  personName,
  setLineDiscount,
  setQuoteDiscount,
  useProto,
  useViewer,
  type Approval,
  type Order,
} from "./model"
import {
  ApprovalBadge,
  CreateOrderDialog,
  DecisionButtons,
  DiscountInput,
  Hint,
  OrderActions,
  OrderEditFields,
  OrderLinesTable,
  OrderStatusBadge,
  STEP_LABEL,
  TotalsRows,
  stepTone,
  useQuoteState,
  waitingFor,
  when,
} from "./shared"
import { approvalStatusOf } from "./model"
import { cn } from "@/lib/utils"

const NO_ORDERS = "No Orders yet. Create one from an Accepted Quote once the Opportunity is Closed Won."

// ---------------------------------------------------------------- Quote

export function QuoteBodyA({ details }: { details: QuoteDetails }) {
  const q = useQuoteState(details)
  const { quote } = details
  const { f } = q
  const editable = q.mayEdit
  const showDiscountColumn = q.lines.some((l) => l.discountPct > 0) || editable
  const cols = 5 + (showDiscountColumn ? 1 : 0)
  return (
    <>
      <RecordSection title="Quote lines">
        <div className="overflow-x-auto">
          <Table aria-label="Quote lines">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="hidden text-right sm:table-cell">List price</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                {showDiscountColumn && <TableHead className="text-right">Discount</TableHead>}
                <TableHead className="hidden text-right sm:table-cell">VAT</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-right">{l.qty}</TableCell>
                  <TableCell className="hidden text-right sm:table-cell">{formatPrice(l.listPrice)}</TableCell>
                  <TableCell className="text-right">{formatPrice(l.unitPrice)}</TableCell>
                  {showDiscountColumn && (
                    <TableCell className="text-right">
                      {editable ? (
                        <DiscountInput id={`line-${l.id}`} label={`Discount on ${l.name}`} value={l.discountPct} onChange={(n) => setLineDiscount(quote.id, l.id, n)} />
                      ) : l.discountPct ? (
                        fmtPct(l.discountPct)
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  )}
                  <TableCell className="hidden text-right sm:table-cell">{formatVatRate(l.vatRate)}</TableCell>
                  <TableCell className="text-right font-medium">{formatPrice(l.qty * l.unitPrice * (1 - l.discountPct / 100))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TotalsRows f={f} colSpan={cols - 1} />
          </Table>
        </div>

        <div className="mt-4 grid gap-3 rounded-md border p-3 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex items-center gap-2">
            {editable ? (
              <>
                <label htmlFor="quote-discount" className="text-sm font-medium">
                  Quote discount
                </label>
                <DiscountInput id="quote-discount" label="Quote discount" value={f.quoteDiscountPct} onChange={(n) => setQuoteDiscount(quote.id, n)} />
              </>
            ) : (
              <span className="text-sm font-medium">Quote discount {f.quoteDiscountPct ? fmtPct(Math.round(f.quoteDiscountPct * 100) / 100) : "none"}</span>
            )}
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">Effective discount vs List price: </span>
            <span className="font-medium">{fmtPct(Math.round(f.effective * 10) / 10)}</span>
          </p>
        </div>

        {q.draft && q.band !== "none" && !q.approval && (
          <Hint className="mt-3 flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1">{q.hint}. Send stays locked until it is Approved.</span>
            {q.canRequest && <Button size="sm" onClick={q.request}>Request approval</Button>}
          </Hint>
        )}
        {q.draft && q.band === "none" && f.quoteDiscountPct + f.effective > 0 && <p className="mt-3 text-sm text-muted-foreground">{q.hint}.</p>}
        {q.locked && <p className="mt-3 text-sm text-muted-foreground">The Quote and its lines are read-only while the Approval is Pending.</p>}
      </RecordSection>
      <ApprovalPanelA approval={q.approval} fallback={q.draft ? <ThresholdLegend /> : null} />
    </>
  )
}

function ThresholdLegend() {
  return (
    <ul className="space-y-1 text-sm text-muted-foreground">
      <li>Up to {THRESHOLDS.first} %: no Approval needed</li>
      <li>Up to {THRESHOLDS.second} %: the Owner's manager approves</li>
      <li>Above {THRESHOLDS.second} %: the Owner's manager, then their manager</li>
    </ul>
  )
}

export function ApprovalPanelA({ approval, fallback }: { approval?: Approval; fallback?: React.ReactNode }) {
  if (!approval && !fallback) return null
  return (
    <RecordSection title="Approval" action={approval && <ApprovalBadge status={approval.status === "pending" ? "pending" : approval.status === "approved" ? "approved" : approval.status === "rejected" ? "rejected" : "none"} />}>
      {!approval ? (
        <div className="space-y-2">
          <p className="text-sm">No Approval has been requested.</p>
          {fallback}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm">
            <span className="font-medium">{approval.summary}</span> · {formatPrice(approval.amount)} · requested by {approval.requester.name} on {when(approval.requestedOn)}
          </p>
          <ol className="space-y-2" aria-label="Approvers">
            {approval.steps.map((s, i) => (
              <li key={i} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border p-3">
                <span className="grid size-6 place-items-center rounded-full bg-muted text-xs font-medium">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {s.who.name} <span className="font-normal text-muted-foreground">· {s.role}</span>
                  </p>
                  {s.comment && <p className="text-sm">“{s.comment}”</p>}
                  {s.on && <p className="text-xs text-muted-foreground">{when(s.on)}</p>}
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", stepTone(s.state))}>{STEP_LABEL[s.state]}</span>
              </li>
            ))}
          </ol>
          {approval.note && <p className="text-sm text-muted-foreground">{approval.note}</p>}
          {approval.status === "pending" && <p className="text-sm">Waiting for {waitingFor(approval)}.</p>}
          <div className="flex flex-wrap gap-2">
            <DecisionButtons approval={approval} />
          </div>
        </div>
      )}
    </RecordSection>
  )
}

export function QuoteActionsA({ details, busy, onSend }: { details: QuoteDetails; busy: boolean; onSend: () => void }) {
  const q = useQuoteState(details)
  return (
    <>
      {q.draft && q.canRequest && q.band !== "none" && !q.approval && (
        <Button onClick={q.request}>Request approval</Button>
      )}
      {q.draft && (
        <Button disabled={busy || !!q.blocker} onClick={onSend} title={q.blocker}>
          Send
        </Button>
      )}
    </>
  )
}

export function OrderButtonA({ details, onCreate }: { details: QuoteDetails; onCreate: () => void }) {
  const q = useQuoteState(details)
  if (q.order)
    return (
      <Button variant="outline" asChild>
        <Link to={`/orders/${q.order.id}`}>
          <ShoppingCart aria-hidden />
          {q.order.number}
        </Link>
      </Button>
    )
  return q.canCreateOrder && details.canEdit ? (
    <Button onClick={onCreate}>
      <ShoppingCart aria-hidden />
      Create Order
    </Button>
  ) : null
}

// ---------------------------------------------------------------- Home

export function HomeApprovalsA() {
  const { approvals } = useProto()
  const { person } = useViewer()
  const mine = approvals.filter((a) => a.status === "pending" && (currentStep(a)?.who.id === person.id))
  return (
    <RecordSection title={`Waiting for my approval${mine.length ? ` (${mine.length})` : ""}`}>
      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting for your approval.</p>
      ) : (
        <ul className="divide-y">
          {mine.map((a) => (
            <li key={a.id} className="space-y-2 py-2 first:pt-0 last:pb-0">
              <div>
                {a.href ? (
                  <Link to={a.href} className="font-medium text-primary hover:underline">
                    {a.subjectLabel}
                  </Link>
                ) : (
                  <span className="font-medium">{a.subjectLabel}</span>
                )}
                <p className="text-sm text-muted-foreground">
                  {a.accountName} · {a.summary} · {formatPrice(a.amount)}
                </p>
                <p className="text-sm text-muted-foreground">Requested by {a.requester.name}, {when(a.requestedOn)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <DecisionButtons approval={a} size="sm" noRecall />
              </div>
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  )
}

// ---------------------------------------------------------------- Orders

export function OrdersTabA({ scope }: { scope: { type: "opportunity" | "account"; id: string } }) {
  const { orders } = useProto()
  const mine = orders.filter((o) => (scope.type === "account" ? o.accountId === scope.id : o.opportunityId === scope.id))
  return (
    <RecordSection title={`Orders (${mine.length})`}>
      {mine.length === 0 ? <p className="text-sm text-muted-foreground">{NO_ORDERS}</p> : <OrdersTable orders={mine} showAccount={scope.type === "opportunity" ? false : true} showOpportunity={scope.type === "account"} />}
    </RecordSection>
  )
}

function OrdersTable({ orders, showAccount = true, showOpportunity = true, showOwner = false }: { orders: Order[]; showAccount?: boolean; showOpportunity?: boolean; showOwner?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <Table aria-label="Orders">
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Status</TableHead>
            {showAccount && <TableHead>Account</TableHead>}
            {showOpportunity && <TableHead>Opportunity</TableHead>}
            <TableHead>Order date</TableHead>
            {showOwner && <TableHead>Owner</TableHead>}
            <TableHead className="text-right">Net total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => (
            <TableRow key={o.id}>
              <TableCell>
                <Link to={`/orders/${o.id}`} className="font-medium text-primary hover:underline">
                  {o.number}
                </Link>
              </TableCell>
              <TableCell>
                <OrderStatusBadge status={o.status} />
              </TableCell>
              {showAccount && <TableCell>{o.accountName}</TableCell>}
              {showOpportunity && <TableCell className="max-w-64 truncate">{o.opportunityName}</TableCell>}
              <TableCell>{formatDate(o.orderDate)}</TableCell>
              {showOwner && <TableCell>{personName(o.ownerId)}</TableCell>}
              <TableCell className="text-right">{formatPrice(orderFigures(o).net)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function OrdersPageA() {
  const { orders } = useProto()
  const { person } = useViewer()
  const [scope, setScope] = useState<"my" | "team" | "all">("my")
  const list = orders
    .filter((o) => (scope === "all" ? true : scope === "team" ? inTeam(o, person) : o.ownerId === person.id))
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.number.localeCompare(a.number))
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
      <Tabs value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
        <TabsList>
          <TabsTrigger value="my">My Orders</TabsTrigger>
          <TabsTrigger value="team">My team</TabsTrigger>
          <TabsTrigger value="all">All Orders</TabsTrigger>
        </TabsList>
      </Tabs>
      <RecordSection title={`${list.length} ${list.length === 1 ? "Order" : "Orders"}`}>
        {list.length === 0 ? <p className="text-sm text-muted-foreground">No Orders here.</p> : <OrdersTable orders={list} showOwner />}
      </RecordSection>
    </div>
  )
}

export function OrderPageA() {
  const { id = "" } = useParams()
  const { orders } = useProto()
  const order = orders.find((o) => o.id === id)
  if (!order) return <p className="p-6">Order not found.</p>
  const f = orderFigures(order)
  const link = (href: string | undefined, text: string) => (href ? <Link to={href} className="text-primary hover:underline">{text}</Link> : text)
  return (
    <RecordPage
      kind="Order"
      name={order.number}
      highlights={[
        { label: "Status", value: <OrderStatusBadge status={order.status} /> },
        { label: "Account", value: link(orderAccountHref(order), order.accountName) },
        { label: "Opportunity", value: link(orderOpportunityHref(order), order.opportunityName) },
        { label: "Quote", value: link(orderQuoteHref(order), order.quoteLabel) },
        { label: "Order date", value: formatDate(order.orderDate) },
        { label: "Net total", value: formatPrice(f.net) },
        { label: "Owner", value: personName(order.ownerId) },
      ]}
      actions={<OrderActions order={order} />}
      activity={<OrderHistoryA order={order} />}
    >
      {order.status === "cancelled" && <Hint>Cancelled: {order.cancelComment}</Hint>}
      <RecordSection title="Details">
        <OrderEditFields order={order} idPrefix="order" />
        <p className="mt-3 text-xs text-muted-foreground">Lines, discount and totals are frozen copies of {order.quoteLabel}. Only these three fields can change.</p>
      </RecordSection>
      <RecordSection title="Order lines">
        <OrderLinesTable order={order} />
      </RecordSection>
    </RecordPage>
  )
}

function OrderHistoryA({ order }: { order: Order }) {
  return (
    <RecordSection title="Timeline">
      <ul className="divide-y">
        {[...order.history].reverse().map((h, i) => (
          <li key={i} className="py-2 first:pt-0 last:pb-0">
            <p className="text-sm font-medium">{h.text}</p>
            <p className="text-xs text-muted-foreground">{h.by} · {when(h.at)}</p>
          </li>
        ))}
      </ul>
    </RecordSection>
  )
}

export function OpportunityApprovalA({ approvalId }: { approvalId: string }) {
  const { approvals } = useProto()
  const a = approvals.find((x) => x.id === approvalId)
  return a ? <ApprovalPanelA approval={a} /> : null
}

export { approvalStatusOf, CreateOrderDialog, useNavigate }
