import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"

const TABS = [
  { to: "/products", label: "Products", end: true },
  { to: "/products/quote-templates", label: "Quote templates", end: false },
  { to: "/products/quote-settings", label: "Quote settings", end: false },
]

/** The sections of the Products page: the catalogue, the Quote templates and the Quote settings. */
export function ProductsTabs() {
  return (
    <nav aria-label="Products sections" className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-6 md:pt-6">
      <ul className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn("-mb-px inline-block border-b-2 px-3 py-2 text-sm font-medium", isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
