import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCurrentUser } from "@/hooks/use-current-user"
import { describeError } from "@/lib/errors"
import { ForecastTab } from "./forecast-tab"
import { QuotasTab } from "./quotas-tab"
import { TeamTab } from "./team-tab"
import { useForecastData } from "./use-forecast-data"

/**
 * The Forecast page: the forecast of me, my team or one report; managers also
 * get the Team and Quotas tabs, a salesperson without reports gets no tabs.
 */
export default function ForecastPage() {
  const currentUser = useCurrentUser()
  const data = useForecastData()
  const error = currentUser.error ?? data.error

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Forecast</h1>
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/50 p-4 text-sm">
          {describeError(error)}
        </p>
      ) : !currentUser.data || data.isPending || !data.opportunities || !data.quotas ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Loaded
          me={currentUser.data.user}
          directReports={currentUser.data.directReports}
          data={{ today: data.today, opportunities: data.opportunities, quotas: data.quotas }}
        />
      )}
    </div>
  )
}

function Loaded({
  me,
  directReports,
  data,
}: {
  me: Parameters<typeof ForecastTab>[0]["me"]
  directReports: Parameters<typeof ForecastTab>[0]["directReports"]
  data: Parameters<typeof ForecastTab>[0]["data"]
}) {
  if (directReports.length === 0) return <ForecastTab data={data} me={me} directReports={directReports} />
  return (
    <Tabs defaultValue="forecast" className="gap-4">
      <TabsList>
        <TabsTrigger value="forecast">Forecast</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
        <TabsTrigger value="quotas">Quotas</TabsTrigger>
      </TabsList>
      <TabsContent value="forecast">
        <ForecastTab data={data} me={me} directReports={directReports} />
      </TabsContent>
      <TabsContent value="team">
        <TeamTab data={data} me={me} directReports={directReports} />
      </TabsContent>
      <TabsContent value="quotas">
        <QuotasTab data={data} me={me} directReports={directReports} />
      </TabsContent>
    </Tabs>
  )
}
