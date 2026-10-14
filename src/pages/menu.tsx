import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"
import { AI_ASSIST, AUTOMATION, FORECAST, RECORD_LISTS } from "@/components/shell/nav-items"
import { UserAvatar } from "@/components/shell/user-badge"
import { useCurrentUser } from "@/hooks/use-current-user"

/** The phone's Menu tab: the record lists, who is signed in, and the theme. */
export default function MenuPage() {
  const { data } = useCurrentUser()
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
      <nav aria-label="Pages" className="divide-y rounded-md border">
        {[FORECAST, ...RECORD_LISTS, AUTOMATION, AI_ASSIST].map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex h-12 items-center gap-3 px-4">
            <Icon className="size-5 text-muted-foreground" aria-hidden />
            <span className="flex-1">{label}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </nav>
      {data && (
        <section aria-label="Signed in" className="flex items-center gap-3 rounded-md border p-4">
          <UserAvatar user={data.user} />
          <div className="flex-1">
            <p className="font-medium">{data.user.fullName}</p>
            <p className="text-sm text-muted-foreground">{data.user.email}</p>
          </div>
          <ModeToggle />
        </section>
      )}
    </div>
  )
}
