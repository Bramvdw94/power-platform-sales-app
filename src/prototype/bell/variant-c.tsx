// PROTOTYPE (throwaway, never merge): C, a short dropdown (latest five) plus a full Notifications page.
import { useState } from "react"
import { Link } from "react-router-dom"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useNotifications } from "@/hooks/use-notifications"
import { BellButton, EmptyNotifications, MarkAllButton, NotificationRow, Segmented, useOpenNotification } from "./shared"

export function BellC() {
  const [open, setOpen] = useState(false)
  const { data = [] } = useNotifications(open)
  const openOne = useOpenNotification(() => setOpen(false))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <BellButton />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <MarkAllButton />
        </div>
        <div className="divide-y">
          {data.length === 0 ? <EmptyNotifications /> : data.slice(0, 5).map((n) => <NotificationRow key={n.id} n={n} onOpen={openOne} />)}
        </div>
        <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-accent">
          See all Notifications
        </Link>
      </PopoverContent>
    </Popover>
  )
}

export function NotificationsPageC() {
  const [tab, setTab] = useState("all")
  const { data = [], isPending } = useNotifications()
  const openOne = useOpenNotification()
  const shown = tab === "unread" ? data.filter((n) => !n.read) : data
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <MarkAllButton />
      </div>
      <Segmented value={tab} onChange={setTab} />
      <div className="divide-y overflow-hidden rounded-lg border">
        {isPending ? null : shown.length === 0 ? <EmptyNotifications /> : shown.map((n) => <NotificationRow key={n.id} n={n} onOpen={openOne} />)}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Notifications are removed 30 days after they were sent.</p>
    </div>
  )
}
