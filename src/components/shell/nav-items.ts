import { Briefcase, Building2, Columns3, Home, type LucideIcon, UserPlus, Users, Workflow } from "lucide-react"

export type NavItem = { to: string; label: string; icon: LucideIcon }

export const HOME: NavItem = { to: "/", label: "Home", icon: Home }
export const PIPELINE: NavItem = { to: "/pipeline", label: "Pipeline", icon: Columns3 }

/** The four record lists, in sidebar order. */
export const RECORD_LISTS: NavItem[] = [
  { to: "/leads", label: "Leads", icon: UserPlus },
  { to: "/opportunities", label: "Opportunities", icon: Briefcase },
  { to: "/accounts", label: "Accounts", icon: Building2 },
  { to: "/contacts", label: "Contacts", icon: Users },
  // PROTOTYPE (wayfinder #67)
  { to: "/processes", label: "Automation", icon: Workflow },
]

/** "+ New" menu entries: the list page opens its New dialog for `?new=1`. */
export const NEW_RECORD_ITEMS = [
  { to: "/leads?new=1", label: "Lead" },
  { to: "/opportunities?new=1", label: "Opportunity" },
  { to: "/accounts?new=1", label: "Account" },
  { to: "/contacts?new=1", label: "Contact" },
]
