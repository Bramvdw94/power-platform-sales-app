// PROTOTYPE (throwaway, never merge): B, a side panel with All / Unread and day groups.
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useNotifications } from "@/hooks/use-notifications"
import type { Notification } from "@/sales"
import { BellButton, EmptyNotifications, MarkAllButton, NotificationRow, Segmented, useOpenNotification } from "./shared"

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString()
}

export function BellB() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState("all")
  const { data = [] } = useNotifications(open)
  const openOne = useOpenNotification(() => setOpen(false))
  const shown = tab === "unread" ? data.filter((n) => !n.read) : data
  const groups: [string, Notification[]][] = [
    ["Today", shown.filter((n) => isToday(n.createdOn))],
    ["Earlier", shown.filter((n) => !isToday(n.createdOn))],
  ]
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <BellButton />
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="top-0 right-0 left-auto h-dvh max-w-[min(26rem,100vw)] translate-x-0 translate-y-0 content-start gap-0 rounded-none p-0 sm:max-w-md"
      >
        <div className="flex items-center justify-between gap-2 border-b py-3 pr-12 pl-4">
          <DialogTitle className="text-base">Notifications</DialogTitle>
          <MarkAllButton />
        </div>
        <DialogDescription className="sr-only">Your latest Notifications, newest first.</DialogDescription>
        <div className="border-b px-4 py-2">
          <Segmented value={tab} onChange={setTab} />
        </div>
        <div className="min-h-0 overflow-y-auto">
          {shown.length === 0 ? (
            <EmptyNotifications />
          ) : (
            groups.map(([label, items]) =>
              items.length === 0 ? null : (
                <section key={label}>
                  <h3 className="bg-muted/50 px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
                  <div className="divide-y">
                    {items.map((n) => <NotificationRow key={n.id} n={n} onOpen={openOne} />)}
                  </div>
                </section>
              ),
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
