import { useState, type FormEvent } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Menu, PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react"
import powerAppsLogo from "/power-apps.svg"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import { cn } from "@/lib/utils"
import { HOME, NEW_RECORD_ITEMS, PIPELINE, RECORD_LISTS, type NavItem } from "./nav-items"
import { UserAvatar } from "./user-badge"

const COLLAPSED_KEY = "salesapp.sidebarCollapsed"

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true"
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  } catch {
    // Storage blocked: the sidebar just won't remember its state.
  }
}

/**
 * The frame around every page: a collapsible left sidebar and a top bar with
 * search and "+ New" on a desktop; a bottom tab bar on a phone.
 */
export function AppShell() {
  return useIsDesktop() ? <DesktopShell /> : <PhoneShell />
}

function DesktopShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = () => {
    setCollapsed(!collapsed)
    writeCollapsed(!collapsed)
  }

  return (
    <div className="flex h-dvh bg-background">
      <aside
        className={cn("flex shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width]", collapsed ? "w-16" : "w-60")}
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <img src={powerAppsLogo} alt="" className="size-6" />
          {!collapsed && <span className="font-semibold">Sales</span>}
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1 p-2">
          {[HOME, PIPELINE, ...RECORD_LISTS].map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} />
          ))}
        </nav>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            className="w-full justify-start"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && <span>Collapse</span>}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <GlobalSearch />
          <NewMenu />
          <CurrentUserChip />
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <ShellContent />
        </main>
      </div>
    </div>
  )
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center gap-3 rounded-md px-3 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
          collapsed && "justify-center px-0",
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {!collapsed && item.label}
    </NavLink>
  )
}

function GlobalSearch() {
  const navigate = useNavigate()
  const [text, setText] = useState("")
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const query = text.trim()
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`)
  }
  return (
    <form role="search" onSubmit={submit} className="relative max-w-md flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        aria-label="Search Leads, Opportunities, Accounts and Contacts"
        placeholder="Search Leads, Opportunities, Accounts and Contacts"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="pl-8"
      />
    </form>
  )
}

function NewMenu() {
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="ml-auto">
          <Plus aria-hidden />
          New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {NEW_RECORD_ITEMS.map((item) => (
          <DropdownMenuItem key={item.to} onSelect={() => navigate(item.to)}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CurrentUserChip() {
  const { data } = useCurrentUser()
  if (!data) return <Skeleton className="h-8 w-32" />
  return (
    <div className="flex items-center gap-2">
      <UserAvatar user={data.user} />
      <span className="text-sm font-medium" aria-hidden>
        {data.user.fullName}
      </span>
    </div>
  )
}

function PhoneShell() {
  const { data } = useCurrentUser()
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background px-4">
        <img src={powerAppsLogo} alt="" className="size-5" />
        <span className="font-semibold">Sales</span>
        <span className="ml-auto">{data ? <UserAvatar user={data.user} /> : <Skeleton className="size-8 rounded-full" />}</span>
      </header>
      <main className="flex-1 pb-16">
        <ShellContent />
      </main>
      <BottomTabs />
    </div>
  )
}

const LIST_PATHS = RECORD_LISTS.map((item) => item.to)

function BottomTabs() {
  const { pathname } = useLocation()
  const inMenu = pathname === "/menu" || LIST_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const tabs: (NavItem & { active?: boolean })[] = [
    HOME,
    PIPELINE,
    { to: "/search", label: "Search", icon: Search },
    { to: "/menu", label: "Menu", icon: Menu, active: inMenu },
  ]
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 grid h-16 grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ to, label, icon: Icon, active }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground",
              (isActive || active) && "font-medium text-primary",
            )
          }
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

/** The page, or why the app can't show it: everything needs the signed-in user first. */
function ShellContent() {
  const { error } = useCurrentUser()
  if (error) {
    return (
      <div role="alert" className="m-4 rounded-md border border-destructive/50 p-4 text-sm">
        <p className="font-medium">We couldn't load your user.</p>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    )
  }
  return <Outlet />
}
