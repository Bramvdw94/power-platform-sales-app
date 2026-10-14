import { Briefcase, Building2, Columns3, Home, type LucideIcon, Package, ShoppingCart, TrendingUp, UserPlus, Users, Workflow } from "lucide-react"

export type NavItem = { to: string; label: string; icon: LucideIcon }

export const HOME: NavItem = { to: "/", label: "Home", icon: Home }
export const PIPELINE: NavItem = { to: "/pipeline", label: "Pipeline", icon: Columns3 }
export const FORECAST: NavItem = { to: "/forecast", label: "Forecast", icon: TrendingUp }
export const AUTOMATION: NavItem = { to: "/automation", label: "Automation", icon: Workflow }

/** The record lists, in sidebar order. */
export const RECORD_LISTS: NavItem[] = [
  { to: "/leads", label: "Leads", icon: UserPlus },
  { to: "/opportunities", label: "Opportunities", icon: Briefcase },
  { to: "/orders", label: "Orders", icon: ShoppingCart },
  { to: "/accounts", label: "Accounts", icon: Building2 },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/products", label: "Products", icon: Package },
]

/** "+ New" menu entries: the list page opens its New dialog for `?new=1`. */
export const NEW_RECORD_ITEMS = [
  { to: "/leads?new=1", label: "Lead" },
  { to: "/opportunities?new=1", label: "Opportunity" },
  { to: "/accounts?new=1", label: "Account" },
  { to: "/contacts?new=1", label: "Contact" },
]
