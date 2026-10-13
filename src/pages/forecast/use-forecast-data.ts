import { useQuery } from "@tanstack/react-query"
import { useGateway } from "@/hooks/use-gateway"
import { forecastPeriods, toDateOnly, type Opportunity, type Quota } from "@/sales"

/**
 * Everything the Forecast page counts: the Opportunities of me and my direct
 * reports (closed ones included) and their Quota rows from the start of this
 * quarter, which covers both "this month plus 5" and "this quarter plus 2".
 */
export function useForecastData() {
  const gateway = useGateway()
  const today = toDateOnly(new Date())
  const [quarter] = forecastPeriods(today, "quarter")
  const opportunities = useQuery({
    queryKey: ["Forecast", "opportunities"],
    queryFn: () => gateway.getPipeline({ owner: "myTeam", closeDate: "any", showClosed: true }),
  })
  const quotas = useQuery({
    queryKey: ["Forecast", "quotas", quarter.key],
    queryFn: () => gateway.listQuotas({ scope: "myTeam", from: quarter.key, months: 9 }),
  })
  return {
    today,
    opportunities: opportunities.data as Opportunity[] | undefined,
    quotas: quotas.data as Quota[] | undefined,
    error: opportunities.error ?? quotas.error,
    isPending: opportunities.isPending || quotas.isPending,
  }
}

export type ForecastData = {
  today: string
  opportunities: Opportunity[]
  quotas: Quota[]
}
