// PROTOTYPE (throwaway, never merge): the Leads list with a Rating column and Saved views.
import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { RecordList, type Column } from "@/components/records/record-list"
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, formatDate } from "@/lib/format"
import { LEAD_STATUSES, fullName, type Lead, type LeadStatus } from "@/sales"
import { useGateway } from "@/hooks/use-gateway"
import { NewLeadDialog } from "@/pages/leads/lead-form"
import { LeadStatusBadge } from "@/pages/leads/lead-list"
import type { SalesGateway } from "@/data/gateway"
import { EXTRA_LEADS, RATINGS, ratingOf, useProto } from "./model"
import { useVariantImpl } from "./index"

type RLead = Lead & { rating: string; ratingSort: number }

let seeded: Promise<void> | null = null
/** Sample web Leads on top of the seed, created once so Rating columns have something to show. */
export function seedExtraLeads(gateway: SalesGateway) {
  seeded ??= (async () => {
    for (const l of EXTRA_LEADS) await gateway.createLead({ ...l, leadSource: "website" } as never)
  })()
  return seeded
}

export default function ProtoLeadList() {
  const V = useVariantImpl()
  const gateway = useGateway()
  const s = useProto()
  const [params, setParams] = useSearchParams()
  const saved = params.get("rating") ?? "all"
  // The sample Leads belong to the whole team, so start on All instead of My.
  useEffect(() => {
    if (!params.get("view")) setParams((p) => { const n = new URLSearchParams(p); n.set("view", "all"); return n }, { replace: true })
  }, [params, setParams])
  const all = useQuery({ queryKey: ["proto-all-leads"], queryFn: async () => (await seedExtraLeads(gateway), (await gateway.listLeads({ view: "all", pageSize: 200 })).items) })
  const counts: Record<string, number> = { all: 0, hot: 0, warm: 0, cold: 0, none: 0 }
  for (const l of all.data ?? []) { counts.all++; counts[ratingOf(s, l).rating ?? "none"]++ }

  const columns: Column<RLead>[] = [
    { field: "lastName", label: "Name", essential: true, render: (l) => fullName(l) },
    { field: "ratingSort", label: "Rating", essential: true, render: (l) => <V.RatingColumn info={ratingOf(s, l)} /> },
    { field: "company", label: "Company", essential: true },
    { field: "status", label: "Lead status", render: (l) => <LeadStatusBadge status={l.status} /> },
    { field: "email", label: "Email" },
    { field: "leadSource", label: "Lead source", render: (l) => (l.leadSource ? LEAD_SOURCE_LABELS[l.leadSource] : "") },
    { field: "ownerName", label: "Owner" },
    { field: "createdOn", label: "Created on", render: (l) => formatDate(l.createdOn) },
  ]
  return (
    <RecordList<RLead>
      // The Saved view is part of the query key so the list reloads when it changes.
      noun={`Leads|${saved}|${JSON.stringify(s.ratings)}`}
      title="Leads"
      singular="Lead"
      load={async (g, query, status) => {
        await seedExtraLeads(g)
        const sortByRating = (query.sort?.field as string) === "ratingSort"
        const page = await g.listLeads({ ...query, sort: sortByRating ? undefined : (query.sort as never), page: 1, pageSize: 200, status: status as LeadStatus | undefined })
        let items: RLead[] = page.items.map((l) => {
          const r = ratingOf(s, l)
          return { ...l, rating: r.rating ?? "none", ratingSort: r.rating ? 3 - RATINGS.indexOf(r.rating) : 0 }
        })
        if (saved !== "all") items = items.filter((l) => l.rating === saved)
        if (sortByRating) items.sort((a, b) => (query.sort!.direction === "asc" ? a.ratingSort - b.ratingSort : b.ratingSort - a.ratingSort))
        return { items, totalCount: items.length }
      }}
      columns={columns}
      filter={{ label: "Lead status", allLabel: "All statuses", options: LEAD_STATUSES.map((st) => ({ value: st, label: LEAD_STATUS_LABELS[st] })) }}
      defaultSort={{ field: "createdOn", direction: "desc" }}
      href={(l) => `/leads/${l.id}`}
      searchLabel="Search Leads"
      renderNewDialog={(props) => <NewLeadDialog {...props} />}
      belowTitle={<V.SavedViews value={saved} counts={counts} onChange={(v) => setParams((p) => { const n = new URLSearchParams(p); if (v === "all") n.delete("rating"); else n.set("rating", v); n.delete("page"); return n })} />}
    />
  )
}
