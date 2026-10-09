import type { ReactNode } from "react"
import { useParams, useSearchParams } from "react-router-dom"

/** Stands in for a page whose content a later build ticket brings (spec #23). */
export function PlaceholderPage({ title, ticket, children }: { title: string; ticket: string; children?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-2 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
      <p className="text-sm text-muted-foreground">This page is coming in {ticket}.</p>
    </div>
  )
}

export function ListPlaceholder({ title, ticket }: { title: string; ticket: string }) {
  const [params] = useSearchParams()
  return (
    <PlaceholderPage title={title} ticket={ticket}>
      {params.get("new") === "1" && <p className="text-sm">The New dialog opens here.</p>}
    </PlaceholderPage>
  )
}

export function RecordPlaceholder({ title, ticket }: { title: string; ticket: string }) {
  const { id } = useParams()
  return (
    <PlaceholderPage title={title} ticket={ticket}>
      <p className="text-sm text-muted-foreground">Record {id}</p>
    </PlaceholderPage>
  )
}
