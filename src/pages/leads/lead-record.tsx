import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Ban, BadgeCheck, Pencil, PhoneCall, RotateCcw, Undo2 } from "lucide-react"
import { ActivityTimeline } from "@/components/records/activity-timeline"
import { DetailList, FormAlert } from "@/components/records/fields"
import { RecordError, RecordLoading, RecordPage, RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import type { LeadDetails } from "@/data/gateway"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { DISQUALIFY_REASON_LABELS, LEAD_SOURCE_LABELS, formatDate, opportunitySummary } from "@/lib/format"
import { allowedLeadActions, fullName, isLeadReadOnly, type Lead } from "@/sales"
import { DisqualifyDialog } from "./disqualify-dialog"
import { EditLeadForm } from "./lead-form"
import { QualifyDialog } from "./qualify-dialog"
import { LeadStatusBadge } from "./lead-list"

export default function LeadRecordPage() {
  const { id = "" } = useParams()
  const gateway = useGateway()
  const [editing, setEditing] = useState(false)
  const { data, error, isPending } = useQuery({ queryKey: ["Lead", id], queryFn: () => gateway.getLead(id) })

  if (isPending) return <RecordLoading />
  if (error) return <RecordError error={error} />

  const { lead, opportunity, canEdit } = data
  return (
    <RecordPage
      kind="Lead"
      name={fullName(lead)}
      highlights={[
        { label: "Company", value: lead.company },
        { label: "Lead status", value: <LeadStatusBadge status={lead.status} /> },
        { label: "Email", value: lead.email },
        { label: "Owner", value: lead.ownerName },
      ]}
      actions={canEdit && !editing && <LeadActions lead={lead} onEdit={() => setEditing(true)} />}
      activity={<ActivityTimeline record={{ type: "lead", id: lead.id }} canAdd={canEdit} />}
    >
      {lead.status === "disqualified" && <DisqualifiedNotice lead={lead} />}

      <RecordSection title="Details">
        {editing ? <EditLeadForm lead={lead} onDone={() => setEditing(false)} /> : <LeadDetailList lead={lead} />}
      </RecordSection>

      {lead.status === "qualified" && <QualifiedSection opportunity={opportunity} />}
    </RecordPage>
  )
}

/**
 * The header actions the Lead status allows, for the Owner and the Owner's
 * manager: Edit and the status moves while the Lead is open, Reopen once it is
 * Disqualified, nothing once it is Qualified.
 */
function LeadActions({ lead, onEdit }: { lead: Lead; onEdit: () => void }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [disqualifying, setDisqualifying] = useState(false)
  const [qualifying, setQualifying] = useState(false)
  const actions = allowedLeadActions(lead.status)

  const move = useMutation({
    mutationFn: (action: "markWorking" | "markNotContacted" | "reopen") =>
      action === "reopen"
        ? gateway.reopenLead(lead.id)
        : gateway.setLeadStatus(lead.id, action === "markWorking" ? "working" : "notContacted"),
    onSuccess: () => invalidate(),
  })

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {actions.includes("qualify") && (
        <Button onClick={() => setQualifying(true)}>
          <BadgeCheck aria-hidden />
          Qualify
        </Button>
      )}
      {actions.includes("markWorking") && (
        <Button variant="outline" disabled={move.isPending} onClick={() => move.mutate("markWorking")}>
          <PhoneCall aria-hidden />
          Mark as Working
        </Button>
      )}
      {actions.includes("markNotContacted") && (
        <Button variant="outline" disabled={move.isPending} onClick={() => move.mutate("markNotContacted")}>
          <Undo2 aria-hidden />
          Back to Not Contacted
        </Button>
      )}
      {actions.includes("reopen") && (
        <Button variant="outline" disabled={move.isPending} onClick={() => move.mutate("reopen")}>
          <RotateCcw aria-hidden />
          Reopen
        </Button>
      )}
      {actions.includes("disqualify") && (
        <Button variant="outline" onClick={() => setDisqualifying(true)}>
          <Ban aria-hidden />
          Disqualify
        </Button>
      )}
      {!isLeadReadOnly(lead) && (
        <Button variant="outline" onClick={onEdit}>
          <Pencil aria-hidden />
          Edit
        </Button>
      )}
      {move.isError && <FormAlert error={move.error} className="basis-full text-right" />}
      <DisqualifyDialog lead={lead} open={disqualifying} onOpenChange={setDisqualifying} />
      {qualifying && <QualifyDialog lead={lead} open={qualifying} onOpenChange={setQualifying} />}
    </div>
  )
}

function LeadDetailList({ lead }: { lead: Lead }) {
  return (
    <DetailList
      items={[
        { label: "First name", value: lead.firstName },
        { label: "Last name", value: lead.lastName },
        { label: "Company", value: lead.company, wide: true },
        { label: "Job title", value: lead.jobTitle },
        { label: "Email", value: lead.email && <a href={`mailto:${lead.email}`} className="text-primary hover:underline">{lead.email}</a> },
        { label: "Phone", value: lead.phone },
        { label: "Website", value: lead.website },
        { label: "Lead source", value: lead.leadSource && LEAD_SOURCE_LABELS[lead.leadSource] },
        { label: "Owner", value: lead.ownerName },
        { label: "Description", value: lead.description, wide: true },
      ]}
    />
  )
}

function DisqualifiedNotice({ lead }: { lead: Lead }) {
  return (
    <RecordSection title="Disqualified">
      <DetailList
        items={[
          { label: "Disqualify reason", value: lead.disqualifyReason && DISQUALIFY_REASON_LABELS[lead.disqualifyReason] },
          { label: "Disqualified on", value: lead.disqualifiedOn && formatDate(lead.disqualifiedOn) },
          { label: "Comment", value: lead.disqualifyComment, wide: true },
        ]}
      />
    </RecordSection>
  )
}

function QualifiedSection({ opportunity }: { opportunity: LeadDetails["opportunity"] }) {
  return (
    <RecordSection title="Opportunity">
      {opportunity ? (
        <p className="flex flex-wrap items-baseline gap-x-3">
          <Link to={`/opportunities/${opportunity.id}`} className="font-medium text-primary hover:underline">
            {opportunity.name}
          </Link>
          <span className="text-sm text-muted-foreground">{opportunitySummary(opportunity)}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">This Lead was Qualified, but its Opportunity is not found.</p>
      )}
    </RecordSection>
  )
}
