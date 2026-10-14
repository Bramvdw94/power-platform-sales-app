/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): mounts the three variants of #165 on the real Quote,
// Opportunity, Account and Home pages, plus the new Orders pages. Switch with ?variant=A|B|C.

import "./prototype.css"
import { useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import type { QuoteDetails } from "@/data/gateway"
import { CloseOpportunityDialog } from "@/pages/opportunities/close-dialogs"
import { formatPrice } from "@/lib/format"
import { fmtPct, useProto, useViewer, createOrder, orderForQuote } from "./model"
import { PrototypeSwitcher, useVariant } from "./prototype-switcher"
import { ApprovalBadge, CreateOrderDialog, VARIANTS, orderArgsOf, useQuoteState } from "./shared"
import { HomeApprovalsA, OpportunityApprovalA, OrderButtonA, OrderPageA, OrdersPageA, OrdersTabA, QuoteActionsA, QuoteBodyA } from "./variant-a"
import { HomeApprovalsB, OpportunityApprovalB, OrderButtonB, OrderPageB, OrdersPageB, OrdersTabB, QuoteActionsB, QuoteBodyB } from "./variant-b"
import { HomeApprovalsC, OpportunityApprovalC, OrderButtonC, OrderPageC, OrdersPageC, OrdersTabC, QuoteActionsC, QuoteBodyC } from "./variant-c"
import { approvalStatusOf } from "./model"

const KEYS = VARIANTS.map((v) => v.key)
export const useProtoVariant = () => useVariant(KEYS)

/** The name of whoever the switcher says the Prototype is viewing as (shown where the signed-in user is). */
export function useProtoName(): string {
  return useViewer().person.name
}

export function ProtoSwitcher() {
  return <PrototypeSwitcher variants={VARIANTS} current={useProtoVariant()} />
}

function pick<T>(v: string, a: T, b: T, c: T): T {
  return v === "B" ? b : v === "C" ? c : a
}

// ---------------------------------------------------------------- Quote page

/** Replaces the Quote lines card: lines, discounts, totals and the Approval. */
export function ProtoQuoteBody({ details }: { details: QuoteDetails }) {
  const v = useProtoVariant()
  const Body = pick(v, QuoteBodyA, QuoteBodyB, QuoteBodyC)
  return <Body details={details} />
}

/** Replaces the Send button: locked until the Approval is Approved, and Request approval where the variant puts it. */
export function ProtoQuoteActions(props: { details: QuoteDetails; busy: boolean; onSend: () => void }) {
  const v = useProtoVariant()
  const Actions = pick(v, QuoteActionsA, QuoteActionsB, QuoteActionsC)
  return <Actions {...props} />
}

/** Create Order on an Accepted Quote of a Closed Won Opportunity; the Order's link once it exists. */
export function ProtoOrderAction({ details }: { details: QuoteDetails }) {
  const v = useProtoVariant()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const Button = pick(v, OrderButtonA, OrderButtonB, OrderButtonC)
  return (
    <>
      <Button details={details} onCreate={() => setCreating(true)} />
      {creating && (
        <CreateOrderDialog
          details={details}
          onClose={() => setCreating(false)}
          onCreated={(order) => {
            setCreating(false)
            navigate(`/orders/${order.id}`)
          }}
        />
      )}
    </>
  )
}

/** The Quote's header fields: the totals after the Quote discount, the Effective discount and the Approval status. */
export function ProtoQuoteHighlights({ details }: { details: QuoteDetails }) {
  return <QuoteFigure details={details} what="net" />
}
export function QuoteFigure({ details, what }: { details: QuoteDetails; what: "net" | "gross" | "effective" | "approval" }) {
  const q = useQuoteState(details)
  if (what === "net") return <>{formatPrice(q.f.net)}</>
  if (what === "gross") return <>{formatPrice(q.f.gross)}</>
  if (what === "effective") return <>{fmtPct(Math.round(q.f.effective * 10) / 10)}</>
  return <ApprovalBadge status={approvalStatusOf(q.approval)} />
}

/** Close dialog after Accept: at the net total after the Quote discount, with the option to create the Order right away. */
export function ProtoCloseDialog({ details, open, onOpenChange }: { details: QuoteDetails; open: boolean; onOpenChange: (open: boolean) => void }) {
  const q = useQuoteState(details)
  const s = useProto()
  const [create, setCreate] = useState(true)
  const exists = !!orderForQuote(s, details.quote.id)
  return (
    <CloseOpportunityDialog
      opportunity={details.opportunity}
      open={open}
      onOpenChange={onOpenChange}
      initialOutcome="won"
      initialActualValue={q.f.net}
      extra={
        !exists && (
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
            <span>
              <span className="font-medium">Create the Order now</span>
              <span className="block text-muted-foreground">A frozen copy of the lines, the Quote discount and the totals. You can also do it later from the Quote.</span>
            </span>
          </label>
        )
      }
      onWon={() => {
        if (create && !exists) createOrder(orderArgsOf(details, q))
      }}
    />
  )
}

// ---------------------------------------------------------------- Opportunity, Account

export function ProtoOpportunityApproval({ opportunityId }: { opportunityId: string }) {
  const v = useProtoVariant()
  const { approvals } = useProto()
  const a = approvals.find((x) => x.subjectId === opportunityId)
  if (!a) return null
  const View = pick(v, OpportunityApprovalA, OpportunityApprovalB, OpportunityApprovalC)
  return <View approvalId={a.id} />
}

export function ProtoOrdersTab({ scope }: { scope: { type: "opportunity" | "account"; id: string } }) {
  const v = useProtoVariant()
  const Tab = pick(v, OrdersTabA, OrdersTabB, OrdersTabC)
  return <Tab scope={scope} />
}

// ---------------------------------------------------------------- Home and Orders pages

/** Home slots: the variant says where "Waiting for my approval" goes (`top`, `card` in the grid, `bottom`). */
export function ProtoHome({ slot }: { slot: "top" | "card" | "bottom" }): ReactNode {
  const v = useProtoVariant()
  if (slot === "card" && v === "A") return <HomeApprovalsA />
  if (slot === "top" && v === "B") return <HomeApprovalsB />
  if (slot === "bottom" && v === "C") return <HomeApprovalsC />
  return null
}

export function OrdersPage() {
  const v = useProtoVariant()
  return pick(v, <OrdersPageA />, <OrdersPageB />, <OrdersPageC />)
}
export function OrderPage() {
  const v = useProtoVariant()
  return pick(v, <OrderPageA />, <OrderPageB />, <OrderPageC />)
}

export { Link }
