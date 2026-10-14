/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): variant C of #165, "Drawer and split view".
// The record stays calm: discounts are edited in one dialog with the threshold ladder beside it,
// the Approval lives in a drawer opened from a chip in the header, Home is a review queue with the
// request on the right, and Orders are a list beside the Order, like a mail client.

import { Link, useNavigate, useParams } from "react-router-dom"
import { useState } from "react"
import { Check, ChevronRight, ShoppingCart, X } from "lucide-react"
import { RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NativeSelect } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { QuoteDetails } from "@/data/gateway"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import { formatDate, formatPrice, formatVatRate } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  THRESHOLDS,
  approvalHint,
  bandOf,
  currentStep,
  figures,
  fmtPct,
  inTeam,
  mayDecide,
  orderAccountHref,
  orderFigures,
  orderOpportunityHref,
  orderQuoteHref,
  personName,
  setDiscounts,
  useProto,
  useViewer,
  ORDER_STATUS_LABELS,
  approvalStatusOf,
  type Approval,
  type Order,
  type ProtoLine,
} from "./model"
import { ApprovalBadge, DecisionButtons, DiscountInput, Hint, OrderActions, OrderEditFields, OrderLinesTable, OrderStatusBadge, STEP_LABEL, TotalsRows, stepTone, useQuoteState, waitingFor, when, type QuoteState } from "./shared"

// ---------------------------------------------------------------- the drawer

function Drawer({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="top-0 right-0 left-auto h-full max-w-full translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none border-y-0 border-r-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? "The chain, who decided and the comments."}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function ApprovalBody({ approval, extra, noRecall }: { approval?: Approval; extra?: React.ReactNode; noRecall?: boolean }) {
  if (!approval) return <div className="space-y-3">{extra}</div>
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-medium">{approval.summary}</span>
        <br />
        {formatPrice(approval.amount)} · requested by {approval.requester.name}, {when(approval.requestedOn)}
      </p>
      <ol className="relative space-y-4 border-l-2 pl-5" aria-label="Approvers">
        {approval.steps.map((s, i) => (
          <li key={i} className="relative">
            <span className={cn("absolute top-0.5 -left-[29px] size-3.5 rounded-full ring-4 ring-background", stepTone(s.state))} />
            <p className="text-sm font-medium">
              {s.who.name} <span className="font-normal text-muted-foreground">· {s.role}</span>
            </p>
            <p className="text-xs text-muted-foreground">{STEP_LABEL[s.state]}{s.on ? ` · ${when(s.on)}` : ""}</p>
            {s.comment && <p className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">{s.comment}</p>}
          </li>
        ))}
      </ol>
      {approval.note && <p className="text-sm text-muted-foreground">{approval.note}</p>}
      <div className="flex flex-wrap gap-2">
        <DecisionButtons approval={approval} noRecall={noRecall} />
      </div>
      {extra}
    </div>
  )
}

function ApprovalChipC({ approval, hint, onOpen }: { approval?: Approval; hint?: string; onOpen: () => void }) {
  const status = approvalStatusOf(approval)
  return (
    <button type="button" onClick={onOpen} className="flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-accent">
      <span className="font-medium">Approval</span>
      <ApprovalBadge status={status} />
      <span className="min-w-0 max-w-56 truncate text-muted-foreground">{approval?.status === "pending" ? `Waiting for ${waitingFor(approval)}` : hint}</span>
      <ChevronRight className="size-4" aria-hidden />
    </button>
  )
}

// ---------------------------------------------------------------- Quote

function DiscountDialog({ details, q, onClose }: { details: QuoteDetails; q: QuoteState; onClose: () => void }) {
  const { quote } = details
  const [lineDiscounts, setLines] = useState<Record<string, number>>(() => Object.fromEntries(q.lines.map((l) => [l.id, l.discountPct])))
  const [quotePct, setQuotePct] = useState(q.f.quoteDiscountPct)
  const draftLines: ProtoLine[] = q.lines.map((l) => ({ ...l, discountPct: lineDiscounts[l.id] ?? 0 }))
  const preview = figures(draftLines, quotePct)
  const band = bandOf(preview.effective)
  const rungs = [
    { key: "none", range: `Up to ${THRESHOLDS.first} %`, who: "No Approval" },
    { key: "manager", range: `Up to ${THRESHOLDS.second} %`, who: "The Owner's manager" },
    { key: "chain", range: `Above ${THRESHOLDS.second} %`, who: "Their manager too, in turn" },
  ]
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setDiscounts(quote.id, lineDiscounts, quotePct)
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Discounts on {quote.number}</DialogTitle>
            <DialogDescription>Line discounts first, then one Quote discount before VAT. Nothing changes until you apply.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1 font-normal">Line</th>
                    <th className="pb-1 text-right font-normal">List</th>
                    <th className="pb-1 text-right font-normal">Discount</th>
                  </tr>
                </thead>
                <tbody>
                  {q.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-2 pr-2">{l.qty} × {l.name}</td>
                      <td className="py-2 text-right tabular-nums">{formatPrice(l.listPrice)}</td>
                      <td className="py-2 text-right">
                        <DiscountInput id={`c-line-${l.id}`} label={`Discount on ${l.name}`} value={lineDiscounts[l.id] ?? 0} onChange={(n) => setLines((d) => ({ ...d, [l.id]: n }))} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t">
                    <td className="py-2 font-medium" colSpan={2}>
                      Quote discount
                    </td>
                    <td className="py-2 text-right">
                      <DiscountInput id="c-quote" label="Quote discount" value={quotePct} onChange={setQuotePct} />
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quote discount presets">
                {[0, 5, 10, 15, 25].map((n) => (
                  <Button key={n} type="button" size="sm" variant={Math.round(quotePct) === n ? "default" : "outline"} onClick={() => setQuotePct(n)}>
                    {n} %
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Effective discount</p>
              <p className="text-2xl font-semibold tabular-nums">{fmtPct(Math.round(preview.effective * 10) / 10)}</p>
              <p className="text-sm">Net total <span className="font-medium">{formatPrice(preview.net)}</span></p>
              <ul className="space-y-1" aria-label="Discount thresholds">
                {rungs.map((r) => (
                  <li key={r.key} className={cn("rounded-md border px-2 py-1.5 text-sm", band === r.key ? "border-primary bg-primary text-primary-foreground" : "")}>
                    <span className="font-medium">{r.range}</span>
                    <span className="block text-xs">{r.who}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm">{approvalHint(quote.ownerId, preview.effective)}.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Apply discounts</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function QuoteBodyC({ details }: { details: QuoteDetails }) {
  const q = useQuoteState(details)
  const [editing, setEditing] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const showDiscount = q.lines.some((l) => l.discountPct > 0)
  const { f } = q
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <ApprovalChipC approval={q.approval} hint={q.hint} onOpen={() => setDrawer(true)} />
        {q.draft && q.blocker && <span className="text-sm text-muted-foreground">Send is locked: {q.blocker.toLowerCase()}.</span>}
      </div>
      <RecordSection
        title="Quote lines"
        action={q.mayEdit && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit discounts…</Button>}
      >
        <div className="overflow-x-auto">
          <Table aria-label="Quote lines">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                {showDiscount && <TableHead className="text-right">Discount</TableHead>}
                <TableHead className="hidden text-right sm:table-cell">VAT</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-right">{l.qty}</TableCell>
                  <TableCell className="text-right">{formatPrice(l.unitPrice)}</TableCell>
                  {showDiscount && <TableCell className="text-right">{l.discountPct ? fmtPct(l.discountPct) : "—"}</TableCell>}
                  <TableCell className="hidden text-right sm:table-cell">{formatVatRate(l.vatRate)}</TableCell>
                  <TableCell className="text-right font-medium">{formatPrice(l.qty * l.unitPrice * (1 - l.discountPct / 100))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TotalsRows f={f} colSpan={showDiscount ? 5 : 4} />
          </Table>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Effective discount {fmtPct(Math.round(f.effective * 10) / 10)} vs List price.{q.locked && " Read-only while the Approval is Pending."}
        </p>
      </RecordSection>
      {editing && <DiscountDialog details={details} q={q} onClose={() => setEditing(false)} />}
      {drawer && (
        <Drawer title="Approval" onClose={() => setDrawer(false)}>
          <ApprovalBody
            approval={q.approval}
            extra={
              <div className="space-y-3">
                {!q.approval && <p className="text-sm">{q.band === "none" ? "No Approval is needed at this discount." : `${q.hint}. Send stays locked until it is Approved.`}</p>}
                {q.canRequest && q.band !== "none" && (!q.approval || q.approval.status !== "pending") && (
                  <Button onClick={q.request}>{q.approval ? "Ask again" : "Request approval"}</Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Up to {THRESHOLDS.first} %: none · up to {THRESHOLDS.second} %: the Owner's manager · above: their manager too.
                </p>
              </div>
            }
          />
        </Drawer>
      )}
    </>
  )
}

export function QuoteActionsC({ details, busy, onSend }: { details: QuoteDetails; busy: boolean; onSend: () => void }) {
  const q = useQuoteState(details)
  return q.draft ? (
    <Button disabled={busy || !!q.blocker} onClick={onSend} title={q.blocker}>
      Send
    </Button>
  ) : null
}

export function OrderButtonC({ details, onCreate }: { details: QuoteDetails; onCreate: () => void }) {
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

export function OpportunityApprovalC({ approvalId }: { approvalId: string }) {
  const { approvals } = useProto()
  const [open, setOpen] = useState(false)
  const a = approvals.find((x) => x.id === approvalId)
  if (!a) return null
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <ApprovalChipC approval={a} onOpen={() => setOpen(true)} />
        <span className="text-sm text-muted-foreground">{a.summary}</span>
      </div>
      {open && (
        <Drawer title="Approval" onClose={() => setOpen(false)}>
          <ApprovalBody approval={a} />
        </Drawer>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Home

export function HomeApprovalsC() {
  const { approvals } = useProto()
  const { person } = useViewer()
  const mine = approvals.filter((a) => a.status === "pending" && mayDecide(a, person))
  const [picked, setPicked] = useState<string | null>(null)
  const a = mine.find((x) => x.id === picked) ?? mine[0]
  return (
    <RecordSection title={`Waiting for my approval${mine.length ? ` (${mine.length})` : ""}`}>
      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting for your approval.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className="divide-y rounded-md border" aria-label="Requests">
            {mine.map((x) => (
              <li key={x.id}>
                <button type="button" aria-current={a?.id === x.id} onClick={() => setPicked(x.id)} className={cn("w-full p-3 text-left hover:bg-accent", a?.id === x.id && "bg-accent")}>
                  <span className="block font-medium break-words">{x.subjectLabel}</span>
                  <span className={cn("block text-sm", a?.id === x.id ? "text-foreground/75" : "text-muted-foreground")}>
                    {x.accountName} · {formatPrice(x.amount)}
                  </span>
                  <span className={cn("block text-xs", a?.id === x.id ? "text-foreground/75" : "text-muted-foreground")}>{x.requester.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {a && (
            <div className="space-y-3 rounded-md border p-4" aria-label="Request">
              <div>
                <p className="text-lg font-semibold">{a.subjectLabel}</p>
                <p className="text-sm">{a.accountName} · {a.summary}</p>
                {a.href && <Link to={a.href} className="text-sm text-primary hover:underline">Open the record</Link>}
              </div>
              <ApprovalBody approval={a} noRecall />
            </div>
          )}
        </div>
      )}
    </RecordSection>
  )
}

// ---------------------------------------------------------------- Orders

function OrderRow({ o, active, onPick }: { o: Order; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button type="button" aria-current={active} onClick={onPick} className={cn("w-full space-y-0.5 p-3 text-left hover:bg-accent", active && "bg-accent")}>
        <span className="flex items-center justify-between gap-2">
          <span className="font-medium">{o.number}</span>
          <span className="text-sm tabular-nums">{formatPrice(orderFigures(o).net)}</span>
        </span>
        <span className="block text-sm">{o.accountName}</span>
        <span className={cn("flex items-center gap-2 text-xs", active ? "text-foreground/75" : "text-muted-foreground")}>
          <OrderStatusBadge status={o.status} />
          {formatDate(o.orderDate)}
        </span>
      </button>
    </li>
  )
}

function OrderDetailC({ o }: { o: Order }) {
  const f = orderFigures(o)
  const link = (href: string | undefined, text: string) => (href ? <Link to={href} className="text-primary hover:underline">{text}</Link> : text)
  return (
    <article aria-label={`Order ${o.number}`} className="min-w-0 space-y-4 rounded-md border p-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {o.number} <OrderStatusBadge status={o.status} />
          </h1>
          <p className="text-sm text-muted-foreground">Ordered {formatDate(o.orderDate)} · {personName(o.ownerId)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OrderActions order={o} />
        </div>
      </header>
      {o.status === "cancelled" && <Hint>Cancelled: {o.cancelComment}</Hint>}
      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">Account</dt><dd>{link(orderAccountHref(o), o.accountName)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Opportunity</dt><dd>{link(orderOpportunityHref(o), o.opportunityName)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Quote</dt><dd>{link(orderQuoteHref(o), o.quoteLabel)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Net total</dt><dd className="font-medium">{formatPrice(f.net)}</dd></div>
      </dl>
      <OrderLinesTable order={o} />
      <OrderEditFields order={o} idPrefix="c-order" />
      <section aria-label="Timeline">
        <h2 className="mb-1 text-sm font-semibold">Timeline</h2>
        <ul className="space-y-0.5 text-sm">
          {[...o.history].reverse().map((h, i) => (
            <li key={i}><span className="text-muted-foreground">{when(h.at)} · {h.by}</span> · {h.text}</li>
          ))}
        </ul>
      </section>
    </article>
  )
}

function OrdersSplit({ selectedId }: { selectedId?: string }) {
  const { orders } = useProto()
  const { person } = useViewer()
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const [scope, setScope] = useState<"my" | "team" | "all">("all")
  const [status, setStatus] = useState<"any" | Order["status"]>("any")
  const list = orders
    .filter((o) => (scope === "all" ? true : scope === "team" ? inTeam(o, person) : o.ownerId === person.id))
    .filter((o) => status === "any" || o.status === status)
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.number.localeCompare(a.number))
  const selected = orders.find((o) => o.id === selectedId) ?? (desktop ? list[0] : undefined)
  const showList = desktop || !selectedId
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      {(showList || !selected) && <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>}
      {!showList && <Link to="/orders" className="text-sm text-primary hover:underline">← Orders</Link>}
      <div className={cn("grid items-start gap-4", desktop ? "grid-cols-[20rem_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]")}>
        {showList && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <NativeSelect aria-label="Whose Orders" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                <option value="my">My Orders</option>
                <option value="team">My team</option>
                <option value="all">All Orders</option>
              </NativeSelect>
              <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="any">Any status</option>
                {(["open", "fulfilled", "cancelled"] as const).map((s) => (
                  <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
                ))}
              </NativeSelect>
            </div>
            <ul className="divide-y rounded-md border" aria-label="Orders">
              {list.length === 0 && <li className="p-3 text-sm text-muted-foreground">No Orders here.</li>}
              {list.map((o) => (
                <OrderRow key={o.id} o={o} active={selected?.id === o.id} onPick={() => navigate(`/orders/${o.id}`)} />
              ))}
            </ul>
          </div>
        )}
        {selected && (desktop || selectedId) ? <OrderDetailC o={selected} /> : desktop ? <p className="text-sm text-muted-foreground">Pick an Order.</p> : null}
      </div>
    </div>
  )
}

export const OrdersPageC = () => <OrdersSplit />
export function OrderPageC() {
  const { id = "" } = useParams()
  return <OrdersSplit selectedId={id} />
}

export function OrdersTabC({ scope }: { scope: { type: "opportunity" | "account"; id: string } }) {
  const { orders } = useProto()
  const mine = orders.filter((o) => (scope.type === "account" ? o.accountId === scope.id : o.opportunityId === scope.id))
  const open = mine.filter((o) => o.status === "open")
  const openValue = open.reduce((s, o) => s + orderFigures(o).net, 0)
  return (
    <RecordSection title="Orders" action={<Button variant="ghost" size="sm" asChild><Link to="/orders">All Orders</Link></Button>}>
      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Orders yet.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            {open.length} open ({formatPrice(openValue)}) · {mine.filter((o) => o.status === "fulfilled").length} fulfilled · {mine.filter((o) => o.status === "cancelled").length} cancelled
          </p>
          <ul className="divide-y">
            {mine.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span className={cn("size-2.5 shrink-0 rounded-full", o.status === "open" ? "bg-blue-600" : o.status === "fulfilled" ? "bg-green-700" : "bg-zinc-500")} aria-hidden />
                <Link to={`/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.number}</Link>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{scope.type === "account" ? o.opportunityName : o.quoteLabel} · {ORDER_STATUS_LABELS[o.status]}</span>
                <span className="text-sm tabular-nums">{formatPrice(orderFigures(o).net)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </RecordSection>
  )
}

export { Check, X, currentStep }
