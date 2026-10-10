import { useState } from "react"
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import { describeError } from "@/lib/errors"
import { formatEuro } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  DEFAULT_PIPELINE_FILTER,
  OPEN_STAGES,
  STAGES,
  canEdit,
  isOpenStage,
  pipelineSummary,
  stageTotals,
  type CloseDateFilter,
  type OpenStage,
  type Opportunity,
  type PipelineFilter,
  type PipelineOwnerFilter,
} from "@/sales"
import { CloseOpportunityDialog } from "../opportunities/close-dialogs"
import { PipelineBoard } from "./pipeline-board"
import { PipelineFunnel } from "./pipeline-funnel"
import type { MoveTo, PipelineViewProps } from "./pipeline-parts"

type View = "board" | "funnel"

const OWNER_OPTIONS: { value: PipelineOwnerFilter; label: string }[] = [
  { value: "mine", label: "My Opportunities" },
  { value: "myTeam", label: "My team" },
  { value: "everyone", label: "Everyone" },
]

const CLOSE_DATE_OPTIONS: { value: CloseDateFilter; label: string }[] = [
  { value: "any", label: "Any close date" },
  { value: "thisQuarter", label: "Closing this quarter" },
  { value: "nextQuarter", label: "Closing next quarter" },
  { value: "thisYear", label: "Closing this year" },
]

type Closing = { opportunity: Opportunity; outcome: "won" | "lost" }

/**
 * The Pipeline page: open Opportunities by Stage, as a Board (default on
 * desktop) or a Funnel (default on phone), with the header totals and the
 * owner, close date and "Show closed" filters.
 */
export default function PipelinePage() {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const isDesktop = useIsDesktop()
  const [chosenView, setChosenView] = useState<View | null>(null)
  const view = chosenView ?? (isDesktop ? "board" : "funnel")
  const [filter, setFilter] = useState<PipelineFilter>(DEFAULT_PIPELINE_FILTER)
  const [closing, setClosing] = useState<Closing | null>(null)

  const currentUser = useCurrentUser()
  const { data, error, isPending, isPlaceholderData } = useQuery({
    queryKey: ["Pipeline", filter],
    queryFn: () => gateway.getPipeline(filter),
    placeholderData: keepPreviousData,
  })

  const onError = (error: unknown) => toast.error(describeError(error))
  const changeStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: OpenStage }) => gateway.changeStage(id, stage),
    onSuccess: () => invalidate(),
    onError,
  })
  const reopen = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: OpenStage }) => gateway.reopenOpportunity(id, stage),
    onSuccess: () => invalidate(),
    onError,
  })

  const isEditable = (opportunity: Opportunity) => {
    if (!currentUser.data) return false
    const { user, directReports } = currentUser.data
    return canEdit(user.id, opportunity.ownerId, [user, ...directReports])
  }

  const moveTo: MoveTo = (opportunity, to) => {
    if (opportunity.stage === to || !isEditable(opportunity)) return
    const { id } = opportunity
    if (isOpenStage(opportunity.stage)) {
      if (isOpenStage(to)) changeStage.mutate({ id, stage: to })
      else setClosing({ opportunity, outcome: to === "closedWon" ? "won" : "lost" })
    } else if (isOpenStage(to)) {
      reopen.mutate({ id, stage: to })
    } else {
      toast.error("Reopen the Opportunity before closing it again.")
    }
  }

  const opportunities = data ?? []
  const summary = pipelineSummary(opportunities)
  const props: PipelineViewProps = {
    opportunities,
    stages: filter.showClosed ? STAGES : OPEN_STAGES,
    totals: stageTotals(opportunities),
    isEditable,
    moveTo,
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <Tabs value={view} onValueChange={(value) => setChosenView(value as View)} className="gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <TabsList aria-label="View" className="ml-auto">
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="funnel">Funnel</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={filter.owner} onValueChange={(owner) => setFilter({ ...filter, owner: owner as PipelineOwnerFilter })}>
            <SelectTrigger aria-label="Owner" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OWNER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filter.closeDate}
            onValueChange={(closeDate) => setFilter({ ...filter, closeDate: closeDate as CloseDateFilter })}
          >
            <SelectTrigger aria-label="Close date" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLOSE_DATE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Checkbox
              id="pipeline-show-closed"
              checked={filter.showClosed}
              onCheckedChange={(checked) => setFilter({ ...filter, showClosed: checked === true })}
            />
            <Label htmlFor="pipeline-show-closed">Show closed</Label>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/50 p-4 text-sm">
            {describeError(error)}
          </p>
        ) : isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div aria-busy={isPlaceholderData} className={cn("space-y-4", isPlaceholderData && "opacity-60")}>
            <dl aria-label="Pipeline totals" className="grid max-w-xl grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Open pipeline</dt>
                <dd className="text-xl font-semibold tabular-nums">{formatEuro(summary.openTotal)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Weighted pipeline</dt>
                <dd className="text-xl font-semibold tabular-nums">{formatEuro(summary.weightedTotal)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Open Opportunities</dt>
                <dd className="text-xl font-semibold tabular-nums">{summary.openCount}</dd>
              </div>
            </dl>
            <TabsContent value="board">
              <PipelineBoard {...props} />
            </TabsContent>
            <TabsContent value="funnel">
              <PipelineFunnel {...props} />
            </TabsContent>
          </div>
        )}
      </Tabs>

      {closing && (
        <CloseOpportunityDialog
          key={`${closing.opportunity.id}-${closing.outcome}`}
          opportunity={closing.opportunity}
          initialOutcome={closing.outcome}
          open
          onOpenChange={(open) => !open && setClosing(null)}
        />
      )}
    </div>
  )
}

