import { useState, type FormEvent } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { RecordSection, RelatedList } from "@/components/records/record-page"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useGateway } from "@/hooks/use-gateway"
import { describeError } from "@/lib/errors"
import { opportunitySummary } from "@/lib/format"
import { fullName } from "@/sales"

/** Global search: Leads, Opportunities, Accounts and Contacts by name, grouped by type. On a phone it is also where you type. */
export default function SearchPage() {
  const gateway = useGateway()
  const [params, setParams] = useSearchParams()
  const query = params.get("q") ?? ""
  const [text, setText] = useState(query)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setParams(text.trim() ? { q: text.trim() } : {})
  }
  const { data, error, isPending } = useQuery({
    queryKey: ["search", query],
    queryFn: () => gateway.search(query),
    enabled: query.length > 0,
  })

  const groups = data
    ? [
        {
          title: "Leads",
          items: data.leads.map((l) => ({ id: l.id, href: `/leads/${l.id}`, title: fullName(l), detail: [l.company, l.email].filter(Boolean).join(" · ") })),
        },
        {
          title: "Opportunities",
          items: data.opportunities.map((o) => ({ id: o.id, href: `/opportunities/${o.id}`, title: o.name, detail: `${o.accountName} · ${opportunitySummary(o)}` })),
        },
        {
          title: "Accounts",
          items: data.accounts.map((a) => ({ id: a.id, href: `/accounts/${a.id}`, title: a.name, detail: [a.city, a.country].filter(Boolean).join(", ") })),
        },
        {
          title: "Contacts",
          items: data.contacts.map((c) => ({ id: c.id, href: `/contacts/${c.id}`, title: fullName(c), detail: [c.accountName, c.email].filter(Boolean).join(" · ") })),
        },
      ].filter((g) => g.items.length > 0)
    : []

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      <form role="search" onSubmit={submit} className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          key={query}
          aria-label="Search Leads, Opportunities, Accounts and Contacts"
          placeholder="Search Leads, Opportunities, Accounts and Contacts"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="pl-8"
        />
      </form>
      {!query ? (
        <p className="text-sm text-muted-foreground">Search by name, or by email for Leads and Contacts.</p>
      ) : error ? (
        <p role="alert" className="rounded-md border border-destructive/50 p-4 text-sm">
          {describeError(error)}
        </p>
      ) : isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : groups.length === 0 ? (
        <p className="text-sm">Nothing matches “{query}”.</p>
      ) : (
        groups.map((group) => (
          <RecordSection key={group.title} title={`${group.title} (${group.items.length})`}>
            <RelatedList items={group.items} empty="" />
          </RecordSection>
        ))
      )}
    </div>
  )
}
