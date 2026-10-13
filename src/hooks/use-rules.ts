import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type { BusinessRules } from "@/data/gateway"
import {
  activityRelated,
  previewRules,
  ruleNotices,
  toDraftRecord,
  toEngineRecord,
  type RuleContext,
} from "@/sales"
import type { EngineRecord, EngineTable, Parents, Related } from "@/sales/engine"
import { useGateway } from "./use-gateway"

/**
 * The Business rules of a table, loaded once per session (builders change them rarely).
 * With the kill switch off there are none to apply.
 */
export function useBusinessRules(table: EngineTable) {
  const gateway = useGateway()
  return useQuery<BusinessRules>({
    queryKey: ["rules", table],
    queryFn: () => gateway.getBusinessRules(table),
    staleTime: 5 * 60_000,
  })
}

/** What the rules of a record's table need beyond its own fields: parents one hop up and related lists. */
export type RuleExtras = {
  parents?: Parents
  /** Added to the record's activities, e.g. Product lines and Quotes. */
  related?: Related
}

/**
 * The rules, parents and related lists to judge a record by. Activities are read from the same
 * query the process bar and the timeline use, so they cost no extra call.
 */
export function useRuleContext(table: EngineTable, recordId: string | undefined, extras: RuleExtras = {}): RuleContext {
  const gateway = useGateway()
  const rules = useBusinessRules(table)
  const activities = useQuery({
    queryKey: ["activities", table, recordId],
    queryFn: () => gateway.listActivities({ type: table, id: recordId! }),
    enabled: !!recordId,
  })
  const { parents, related: extraRelated } = extras
  return useMemo<RuleContext>(
    () => ({
      table,
      rules: rules.data?.engineEnabled ? rules.data.rules : [],
      parents,
      related: { ...activityRelated(activities.data ?? []), ...extraRelated },
    }),
    [table, rules.data, activities.data, parents, extraRelated],
  )
}

/** The effects of the rules on a record, edited or not: `patch` holds the user's edits over `record`. */
export function useRulePreview(context: RuleContext, record: object | null, patch: Record<string, unknown> = {}) {
  return useMemo(() => {
    const stored = record ? toEngineRecord(record) : null
    return previewRules(context, stored, toDraftRecord(stored as EngineRecord | null, patch))
    // patch is rebuilt each render by the callers; its content drives the preview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, record, JSON.stringify(patch)])
}

/** Read mode: warnings, required fields still empty and blocks that hold on the stored record. */
export function useRuleNotices(context: RuleContext, record: object) {
  return useMemo(() => ruleNotices(context, toEngineRecord(record)), [context, record])
}
