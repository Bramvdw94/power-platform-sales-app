import type { User } from "@/sales"
import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"

/** The signed-in user's initials in a circle; the full name is its accessible name. */
export function UserAvatar({ user, className }: { user: User; className?: string }) {
  return (
    <span
      role="img"
      aria-label={user.fullName}
      title={user.fullName}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground",
        className,
      )}
    >
      {initials(user.fullName)}
    </span>
  )
}
