import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import { describeError } from "@/lib/errors"

type RecordPageProps = {
  /** The record type, shown above the name, e.g. "Account". */
  kind: string
  name: string
  /** Key fields under the name. */
  highlights: { label: string; value: ReactNode }[]
  /** Header actions (Edit and the like); left out for users who may not change the record. */
  actions?: ReactNode
  /** Details and related lists. */
  children: ReactNode
  activity: ReactNode
}

/**
 * A record page: a header with the name, key fields and actions; details and
 * related lists beside the activity timeline on a desktop, and "Details |
 * Activity" tabs on a phone.
 */
export function RecordPage({ kind, name, highlights, actions, children, activity }: RecordPageProps) {
  const isDesktop = useIsDesktop()
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <header className="space-y-3 rounded-md border p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{kind}</p>
            <h1 className="text-2xl font-semibold tracking-tight break-words">{name}</h1>
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {highlights.map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd>{item.value || "—"}</dd>
            </div>
          ))}
        </dl>
      </header>

      {isDesktop ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-4">{children}</div>
          <section aria-label="Activity" className="min-w-0">
            {activity}
          </section>
        </div>
      ) : (
        <Tabs defaultValue="details">
          <TabsList className="w-full">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="space-y-4">
            {children}
          </TabsContent>
          <TabsContent value="activity">{activity}</TabsContent>
        </Tabs>
      )}
    </div>
  )
}

/** A titled card on a record page: the details, or a related list. */
export function RecordSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card role="region" aria-label={title} className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle>{title}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  )
}

/** A related list: one line per record, linking to it. */
export function RelatedList({ items, empty }: { items: { id: string; href: string; title: string; detail?: ReactNode }[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 py-2 first:pt-0 last:pb-0">
          <Link to={item.href} className="font-medium text-primary hover:underline">
            {item.title}
          </Link>
          {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Until the activity timeline arrives (#33). */
export function ActivityPlaceholder() {
  return (
    <RecordSection title="Activity">
      <p className="text-sm text-muted-foreground">Notes, Tasks and Phone Calls come in #33.</p>
    </RecordSection>
  )
}

export function RecordLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6" aria-busy="true">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export function RecordError({ error }: { error: unknown }) {
  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <p role="alert" className="rounded-md border border-destructive/50 p-4 text-sm">
        {describeError(error)}
      </p>
    </div>
  )
}
