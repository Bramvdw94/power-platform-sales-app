// The header bell and its list of Notifications (#171).

import { forwardRef } from "react"
import { Bell, Briefcase, Building2, UserPlus, Users, type LucideIcon } from "lucide-react"
import { useMarkAllNotificationsRead, useUnreadNotificationCount } from "@/hooks/use-notifications"
import { formatAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { unreadBadge, type Notification, type RecordType } from "@/sales"

const TYPES: Record<RecordType, { label: string; icon: LucideIcon }> = {
  lead: { label: "Lead", icon: UserPlus },
  opportunity: { label: "Opportunity", icon: Briefcase },
  account: { label: "Account", icon: Building2 },
  contact: { label: "Contact", icon: Users },
}

export const BellButton = forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(function BellButton(props, ref) {
  const { data: count = 0 } = useUnreadNotificationCount()
  return (
    <button
      ref={ref}
      type="button"
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      {...props}
      className={cn("relative inline-flex size-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none", props.className)}
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground" aria-hidden>
          {unreadBadge(count)}
        </span>
      )}
    </button>
  )
})

export function MarkAllButton({ className }: { className?: string }) {
  const markAll = useMarkAllNotificationsRead()
  const { data: count = 0 } = useUnreadNotificationCount()
  return (
    <button
      type="button"
      disabled={count === 0}
      onClick={() => markAll.mutate()}
      className={cn("rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-accent disabled:pointer-events-none disabled:text-muted-foreground", className)}
    >
      Mark all as read
    </button>
  )
}

export function NotificationRow({ n, onOpen }: { n: Notification; onOpen: (n: Notification) => void }) {
  const type = n.regarding && TYPES[n.regarding.type]
  const Icon = type?.icon
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none", !n.read && "bg-background")}
    >
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="sr-only">{n.read ? "Read: " : "Unread: "}</span>
        <span className={cn("block text-sm", !n.read && "font-medium")}>{n.text}</span>
        <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatAgo(n.createdOn)}</span>
          {type && Icon && (
            <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5">
              <Icon className="size-3" aria-hidden />
              {type.label}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

export function EmptyNotifications() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
      <Bell className="size-6" aria-hidden />
      <p className="font-medium text-foreground">You're all caught up</p>
      <p>Notifications show up here when a record is assigned to you.</p>
    </div>
  )
}
