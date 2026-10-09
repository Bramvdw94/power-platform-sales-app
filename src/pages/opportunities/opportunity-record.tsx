import { useState, type ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Check, Pencil, RotateCcw, Trophy } from "lucide-react"
import { DetailList, FormAlert } from "@/components/records/fields"
import { ActivityPlaceholder, RecordError, RecordLoading, RecordPage, RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { LEAD_SOURCE_LABELS, LOST_REASON_LABELS, STAGE_LABELS, formatDate, formatEuro } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  OPEN_STAGES,
  fullName,
  isOpenStage,
  type OpenStage,
  type Opportunity,
} from "@/sales"
import type { OpportunityDetails } from "@/data/gateway"
import { ExpectedCloseDate } from "./expected-close-date"
import { CloseOpportunityDialog, ReopenOpportunityDialog } from "./close-dialogs"
import { EditOpportunityForm } from "./opportunity-form"

export default function OpportunityRecordPage() {
  const { id = "" } = useParams()
  const gateway = useGateway()
  const [editing, setEditing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const { data, error, isPending } = useQuery({ queryKey: ["Opportunity", id], queryFn: () => gateway.getOpportunity(id) })

  if (isPending) return <RecordLoading />
  if (error) return <RecordError error={error} />

  const { opportunity, account, canEdit } = data
  const isOpen = isOpenStage(opportunity.stage)
  const accountLink = (
    <Link to={`/accounts/${account.id}`} className="text-primary hover:underline">
      {account.name}
    </Link>
  )

  // Closed Opportunities are read-only: no Edit, only Reopen.
  const actions = canEdit && !editing && (
    <>
      {isOpen ? (
        <>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
          <Button onClick={() => setClosing(true)}>
            <Trophy aria-hidden />
            Close
          </Button>
        </>
      ) : (
        <Button variant="outline" onClick={() => setReopening(true)}>
          <RotateCcw aria-hidden />
          Reopen
        </Button>
      )}
    </>
  )

  return (
    <RecordPage
      kind="Opportunity"
      name={opportunity.name}
      highlights={[
        { label: "Account", value: accountLink },
        { label: "Stage", value: STAGE_LABELS[opportunity.stage] },
        { label: "Probability", value: `${opportunity.probability}%` },
        opportunity.stage === "closedWon"
          ? { label: "Actual value", value: formatEuro(opportunity.actualValue ?? 0) }
          : { label: "Estimated value", value: formatEuro(opportunity.estimatedValue) },
        isOpen
          ? { label: "Expected close date", value: <ExpectedCloseDate opportunity={opportunity} /> }
          : { label: "Close date", value: opportunity.closeDate && formatDate(opportunity.closeDate) },
        { label: "Owner", value: opportunity.ownerName },
      ]}
      actions={actions || undefined}
      activity={<ActivityPlaceholder />}
    >
      <StagePath opportunity={opportunity} canChange={canEdit && !editing} />

      {!isOpen && (
        <RecordSection title="Close">
          <CloseDetails opportunity={opportunity} />
        </RecordSection>
      )}

      <RecordSection title="Details">
        {editing ? (
          <EditOpportunityForm opportunity={opportunity} onDone={() => setEditing(false)} />
        ) : (
          <OpportunityDetailList details={data} accountLink={accountLink} />
        )}
      </RecordSection>

      {isOpen ? (
        <CloseOpportunityDialog opportunity={opportunity} open={closing} onOpenChange={setClosing} />
      ) : (
        <ReopenOpportunityDialog opportunity={opportunity} open={reopening} onOpenChange={setReopening} />
      )}
    </RecordPage>
  )
}

/**
 * The Stages as a path. The Owner or manager moves an open Opportunity to any
 * open Stage with one click (forward, back or skipping), which resets its
 * Probability; Closed Won and Closed Lost are reached through Close.
 */
function StagePath({ opportunity, canChange }: { opportunity: Opportunity; canChange: boolean }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const change = useMutation({
    mutationFn: (stage: OpenStage) => gateway.changeStage(opportunity.id, stage),
    onSuccess: () => invalidate(),
  })
  const isOpen = isOpenStage(opportunity.stage)
  const current = OPEN_STAGES.indexOf(opportunity.stage as OpenStage)
  const closedLabel = isOpen ? "Closed" : STAGE_LABELS[opportunity.stage]

  return (
    <nav aria-label="Stage" className="space-y-2">
      <ol className="flex flex-wrap gap-1">
        {OPEN_STAGES.map((stage, index) => {
          const isCurrent = stage === opportunity.stage
          const done = isOpen ? index < current : opportunity.stage === "closedWon"
          const clickable = canChange && isOpen && !isCurrent
          return (
            <li key={stage} className="min-w-0 flex-1">
              <button
                type="button"
                aria-current={isCurrent ? "step" : undefined}
                disabled={!clickable || change.isPending}
                onClick={() => change.mutate(stage)}
                title={clickable ? `Move to ${STAGE_LABELS[stage]}` : undefined}
                className={cn(
                  "flex h-9 w-full items-center justify-center gap-1 rounded-md px-2 text-sm whitespace-nowrap",
                  isCurrent
                    ? "bg-primary font-medium text-primary-foreground"
                    : done
                      ? "bg-primary/15 text-foreground"
                      : "bg-muted text-muted-foreground",
                  clickable && "hover:bg-primary/25 hover:text-foreground",
                  "disabled:cursor-default",
                )}
              >
                {done && <Check className="size-3.5" aria-hidden />}
                {STAGE_LABELS[stage]}
              </button>
            </li>
          )
        })}
        <li className="min-w-0 flex-1">
          <span
            aria-current={!isOpen ? "step" : undefined}
            className={cn(
              "flex h-9 w-full items-center justify-center rounded-md px-2 text-sm whitespace-nowrap",
              opportunity.stage === "closedWon" && "bg-green-600 font-medium text-white",
              opportunity.stage === "closedLost" && "bg-destructive font-medium text-white",
              isOpen && "bg-muted text-muted-foreground",
            )}
          >
            {closedLabel}
          </span>
        </li>
      </ol>
      {change.isError && <FormAlert error={change.error} />}
    </nav>
  )
}

function CloseDetails({ opportunity }: { opportunity: Opportunity }) {
  const won = opportunity.stage === "closedWon"
  return (
    <DetailList
      items={[
        { label: "Outcome", value: STAGE_LABELS[opportunity.stage] },
        { label: "Close date", value: opportunity.closeDate && formatDate(opportunity.closeDate) },
        won
          ? { label: "Actual value", value: opportunity.actualValue !== undefined && formatEuro(opportunity.actualValue) }
          : { label: "Lost reason", value: opportunity.lostReason && LOST_REASON_LABELS[opportunity.lostReason] },
        { label: "Closed by", value: opportunity.closedByName },
        ...(won ? [] : [{ label: "Comment", value: opportunity.lostComment, wide: true }]),
      ]}
    />
  )
}

function OpportunityDetailList({ details, accountLink }: { details: OpportunityDetails; accountLink: ReactNode }) {
  const { opportunity, primaryContact, originatingLead } = details
  const leadId = originatingLead?.id ?? opportunity.originatingLeadId
  return (
    <DetailList
      items={[
        { label: "Name", value: opportunity.name, wide: true },
        { label: "Account", value: accountLink },
        {
          label: "Primary Contact",
          value: primaryContact && (
            <Link to={`/contacts/${primaryContact.id}`} className="text-primary hover:underline">
              {fullName(primaryContact)}
            </Link>
          ),
        },
        { label: "Estimated value", value: formatEuro(opportunity.estimatedValue) },
        { label: "Expected close date", value: formatDate(opportunity.expectedCloseDate) },
        { label: "Probability", value: `${opportunity.probability}%` },
        { label: "Lead source", value: opportunity.leadSource && LEAD_SOURCE_LABELS[opportunity.leadSource] },
        { label: "Next step", value: opportunity.nextStep, wide: true },
        {
          label: "Originating Lead",
          value: leadId && (
            <Link to={`/leads/${leadId}`} className="text-primary hover:underline">
              {originatingLead ? fullName(originatingLead) : "View Lead"}
            </Link>
          ),
        },
        { label: "Owner", value: opportunity.ownerName },
        { label: "Description", value: opportunity.description, wide: true },
      ]}
    />
  )
}
