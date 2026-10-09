import type { User } from "@/sales"
import { cn } from "@/lib/utils"

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}

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
