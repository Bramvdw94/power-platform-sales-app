// PROTOTYPE (throwaway, never merge): what a variant supplies.
import type { ReactNode } from "react"
import type { User } from "@/sales"
import type { RatingInfo } from "./model"

export type Variant = {
  name: string
  /** The public form on the company's page (whole route content). */
  WebForm: () => ReactNode
  /** The Assignment rule tab on the Automation page, with Away and Recent web Leads. */
  AssignmentTab: () => ReactNode
  /** The signed-in user in the top bar, with their own Away switch. */
  UserAway: (p: { user: User }) => ReactNode
  /** Something under the top bar while the signed-in user is Away. */
  AwayBanner: (p: { user: User }) => ReactNode
  RatingColumn: (p: { info: RatingInfo }) => ReactNode
  SavedViews: (p: { value: string; onChange: (v: string) => void; counts: Record<string, number> }) => ReactNode
  /** On the Lead record. */
  RatingPanel: (p: { lead: { id: string; lastName: string }; canEdit: boolean }) => ReactNode
}
