// PROTOTYPE (throwaway, never merge): the Away switch with an optional return date.

import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { canSetAway, firstName, fmtDate, isAway, personName, plusDays, setAway, useProto } from "./model"

export function AwayForm({ userId, meId, className, idPrefix = "away", compact }: { userId: string; meId: string; className?: string; idPrefix?: string; compact?: boolean }) {
  const s = useProto()
  const a = s.away[userId]
  const can = canSetAway(meId, userId)
  const on = isAway(userId, s)
  const self = userId === meId
  return (
    <div className={cn(compact ? "flex flex-wrap items-center gap-3" : "space-y-3", className)}>
      <div className={cn("flex items-center gap-3", !compact && "justify-between")}>
        <label htmlFor={`${idPrefix}-${userId}`} className="text-sm font-medium">{self ? "I'm Away" : `${firstName(userId)} is Away`}</label>
        <Switch id={`${idPrefix}-${userId}`} checked={on} disabled={!can} onCheckedChange={(c) => setAway(userId, { away: c, returnOn: c ? a?.returnOn : undefined, setBy: meId })} />
      </div>
      <div className={cn(compact ? "flex items-center gap-2" : "space-y-1")}>
        <label htmlFor={`${idPrefix}-${userId}-date`} className="text-sm text-muted-foreground">Back on (optional)</label>
        <Input id={`${idPrefix}-${userId}-date`} type="date" min={plusDays(1)} disabled={!can || !on} value={on ? a?.returnOn ?? "" : ""} onChange={(e) => setAway(userId, { away: true, returnOn: e.target.value || undefined, setBy: meId })} className="max-w-44" />
      </div>
      {compact && !can && <span className="text-xs text-muted-foreground">Only {firstName(userId)} or their manager can change this.</span>}
      {!compact && <p className="text-xs text-muted-foreground">
        {on
          ? `New web Leads skip ${self ? "you" : firstName(userId)}${a?.returnOn ? ` until ${fmtDate(a.returnOn)}, then it switches off by itself` : " until it is switched off"}. Your own Leads are not moved.`
          : "Round robin includes you and entries naming you apply."}
        {on && a?.setBy && a.setBy !== userId && ` Set by ${personName(a.setBy)}.`}
        {!can && " Only the person or their manager can change this."}
      </p>}
    </div>
  )
}
