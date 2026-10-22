// PROTOTYPE (throwaway, never merge): A, a dropdown under the bell.
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useNotifications } from "@/hooks/use-notifications"
import { BellButton, EmptyNotifications, MarkAllButton, NotificationRow, useOpenNotification } from "./shared"

export function BellA() {
  const [open, setOpen] = useState(false)
  const { data = [] } = useNotifications(open)
  const openOne = useOpenNotification(() => setOpen(false))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <BellButton />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <MarkAllButton />
        </div>
        <div className="max-h-[26rem] divide-y overflow-y-auto">
          {data.length === 0 ? <EmptyNotifications /> : data.map((n) => <NotificationRow key={n.id} n={n} onOpen={openOne} />)}
        </div>
      </PopoverContent>
    </Popover>
  )
}
