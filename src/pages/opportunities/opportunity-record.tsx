import { useMemo, useState, type ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Check, Pencil, RotateCcw, Trophy } from "lucide-react"
import { ActivityTimeline } from "@/components/records/activity-timeline"
import { DetailList, FormAlert } from "@/components/records/fields"
import { RuleNoticeList } from "@/components/records/rule-effects"
import { ReassignButton } from "@/components/records/reassign-dialog"
import { ProcessBar } from "@/components/records/process/process-bar"
import { SwitchProcessButton } from "@/components/records/process/switch-process"
import { RecordError, RecordLoading, RecordPage, RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { useGateway } from "@/hooks/use-gateway"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { useRecordProcess } from "@/hooks/use-process"
import { useRuleContext, useRuleNotices, useRulePreview, type RuleExtras } from "@/hooks/use-rules"
import { FORECAST_CATEGORY_LABELS, LEAD_SOURCE_LABELS, LOST_REASON_LABELS, STAGE_LABELS, formatDate, formatEuro } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  OPEN_STAGES,
  canSwitchProcess,
  fullName,
  opportunityParents,
  toEngineRecord,
  isOpenStage,
  type OpenStage,
  type Opportunity,
} from "@/sales"
import type { OpportunityDetails } from "@/data/gateway"
import { ExpectedCloseDate } from "./expected-close-date"
import { CloseOpportunityDialog, ReopenOpportunityDialog } from "./close-dialogs"
import { EditOpportunityForm } from "./opportunity-form"
import { QuotesPanel } from "@/pages/quotes/quotes-panel"
import { ProductLinesPanel } from "./product-lines"

export default function OpportunityRecordPage() {
  const { id = "" } = useParams()
  const gateway = useGateway()
  const [editing, setEditing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const { data, error, isPending } = useQuery({ queryKey: ["Opportunity", id], queryFn: () => gateway.getOpportunity(id) })
  const me = useCurrentUser().data

  if (isPending) return <RecordLoading />
  if (error) return <RecordError error={error} />

  return <OpportunityRecord data={data} editing={editing} setEditing={setEditing} closing={closing} setClosing={setClosing} reopening={reopening} setReopening={setReopening} canSwitch={!!me && canSwitchProcess(me.user, data.opportunity.ownerId, me.directReports)} />
}

function OpportunityRecord({
  data,
  editing,
  setEditing,
  closing,
  setClosing,
  reopening,
  setReopening,
  canSwitch,
}: {
  data: OpportunityDetails
  editing: boolean
  setEditing: (value: boolean) => void
  closing: boolean
  setClosing: (value: boolean) => void
  reopening: boolean
  setReopening: (value: boolean) => void
  canSwitch: boolean
}) {
  const { opportunity, account, canEdit } = data
  const process = useRecordProcess("opportunity", opportunity)
  const ruleExtras = useMemo<RuleExtras>(
    () => ({
      parents: opportunityParents({ account, primaryContact: data.primaryContact, originatingLead: data.originatingLead }),
      related: { productLines: data.productLines.map(toEngineRecord), quotes: data.quotes.map(toEngineRecord) },
    }),
    [account, data.primaryContact, data.originatingLead, data.productLines, data.quotes],
  )
  const isOpen = isOpenStage(opportunity.stage)
  const accountLink = (
    <Link to={`/accounts/${account.id}`} className="text-primary hover:underline">
      {account.name}
    </Link>
  )

  // Closed Opportunities are read-only: no Edit, only Reopen and Reassign.
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
      <ReassignButton record={{ type: "opportunity", id: opportunity.id }} ownerId={opportunity.ownerId} name={opportunity.name} />
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
        ...(opportunity.forecastCategory ? [{ label: "Forecast category", value: FORECAST_CATEGORY_LABELS[opportunity.forecastCategory] }] : []),
        opportunity.stage === "closedWon"
          ? { label: "Actual value", value: formatEuro(opportunity.actualValue ?? 0) }
          : { label: "Estimated value", value: formatEuro(opportunity.estimatedValue) },
        isOpen
          ? { label: "Expected close date", value: <ExpectedCloseDate opportunity={opportunity} /> }
          : { label: "Close date", value: opportunity.closeDate && formatDate(opportunity.closeDate) },
        { label: "Owner", value: opportunity.ownerName },
      ]}
      actions={actions || undefined}
      activity={<ActivityTimeline record={{ type: "opportunity", id: opportunity.id }} canAdd={canEdit} />}
    >
      {process.status === "following" ? (
        <ProcessBar
          table="opportunity"
          record={opportunity}
          process={process}
          canEdit={canEdit && !editing}
          canSwitch={canSwitch}
          parents={opportunityParents({ account, primaryContact: data.primaryContact, originatingLead: data.originatingLead })}
          productLines={data.productLines}
          quotes={data.quotes}
          onClose={() => setClosing(true)}
        />
      ) : process.status === "none" ? (
        <>
          <StagePath opportunity={opportunity} canChange={canEdit && !editing} />
          {canSwitch && isOpen && (
            <div className="flex justify-end">
              <SwitchProcessButton table="opportunity" record={opportunity} label="Follow a Process" />
            </div>
          )}
        </>
      ) : null}

      {!isOpen && (
        <RecordSection title="Close">
          <CloseDetails opportunity={opportunity} />
        </RecordSection>
      )}

      <RecordSection title="Details">
        {editing ? (
          <EditOpportunityForm opportunity={opportunity} onDone={() => setEditing(false)} hasProductLines={data.productLines.length > 0} ruleExtras={ruleExtras} />
        ) : (
          <OpportunityDetailList details={data} accountLink={accountLink} ruleExtras={ruleExtras} />
        )}
      </RecordSection>

      <ProductLinesPanel opportunityId={opportunity.id} lines={data.productLines} canEdit={canEdit && isOpen} />

      <QuotesPanel opportunityId={opportunity.id} quotes={data.quotes} canCreate={canEdit && isOpen} />

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
            <li key={stage} className="flex-auto md:min-w-0 md:flex-1">
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
                      : "bg-muted text-foreground/75",
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
        <li className="flex-auto md:min-w-0 md:flex-1">
          <span
            aria-current={!isOpen ? "step" : undefined}
            className={cn(
              "flex h-9 w-full items-center justify-center rounded-md px-2 text-sm whitespace-nowrap",
              opportunity.stage === "closedWon" && "bg-green-700 font-medium text-white",
              opportunity.stage === "closedLost" && "bg-red-700 font-medium text-white",
              isOpen && "bg-muted text-foreground/75",
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

function OpportunityDetailList({ details, accountLink, ruleExtras }: { details: OpportunityDetails; accountLink: ReactNode; ruleExtras: RuleExtras }) {
  const { opportunity, primaryContact, originatingLead } = details
  const leadId = originatingLead?.id ?? opportunity.originatingLeadId
  const context = useRuleContext("opportunity", opportunity.id, ruleExtras)
  const notices = useRuleNotices(context, opportunity)
  const preview = useRulePreview(context, opportunity)
  return (
    <>
    <RuleNoticeList notices={notices} />
    <DetailList
      ruleViews={preview.viewOf}
      items={[
        { label: "Name", field: "name", value: opportunity.name, wide: true },
        { label: "Account", field: "accountId", value: accountLink },
        {
          label: "Primary Contact",
          field: "primaryContactId",
          value: primaryContact && (
            <Link to={`/contacts/${primaryContact.id}`} className="text-primary hover:underline">
              {fullName(primaryContact)}
            </Link>
          ),
        },
        {
          label: "Estimated value",
          field: "estimatedValue",
          value: (
            <>
              {formatEuro(opportunity.estimatedValue)}
              {details.productLines.length > 0 && (
                <span className="block text-xs text-muted-foreground">Total of {details.productLines.length} Product {details.productLines.length === 1 ? "line" : "lines"}</span>
              )}
            </>
          ),
        },
        { label: "Expected close date", field: "expectedCloseDate", value: formatDate(opportunity.expectedCloseDate) },
        { label: "Probability", field: "probability", value: `${opportunity.probability}%` },
        ...(opportunity.forecastCategory ? [{ label: "Forecast category", field: "forecastCategory", value: FORECAST_CATEGORY_LABELS[opportunity.forecastCategory] }] : []),
        { label: "Lead source", field: "leadSource", value: opportunity.leadSource && LEAD_SOURCE_LABELS[opportunity.leadSource] },
        { label: "Next step", field: "nextStep", value: opportunity.nextStep, wide: true },
        {
          label: "Originating Lead",
          value: leadId && (
            <Link to={`/leads/${leadId}`} className="text-primary hover:underline">
              {originatingLead ? fullName(originatingLead) : "View Lead"}
            </Link>
          ),
        },
        { label: "Owner", value: opportunity.ownerName },
        { label: "Description", field: "description", value: opportunity.description, wide: true },
      ]}
    />
    </>
  )
}
