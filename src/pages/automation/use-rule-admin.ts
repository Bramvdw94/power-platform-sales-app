import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useGateway } from "@/hooks/use-gateway"
import type { EngineTable } from "@/sales/engine"

export function useRuleList(table: EngineTable) {
  const gateway = useGateway()
  return useQuery({ queryKey: ["rule-admin", "list", table], queryFn: () => gateway.listRulesAdmin(table) })
}

/** After a change to a rule: the admin lists, and the rules every record page reads. A saved rule applies at once. */
export function useRefreshRules() {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["rule-admin"] }),
      queryClient.invalidateQueries({ queryKey: ["rules"] }),
    ])
  }
}
