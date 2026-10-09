import { RecordList, type Column, type ListFilter } from "@/components/records/record-list"
import { Badge } from "@/components/ui/badge"
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, formatDate } from "@/lib/format"
import { LEAD_STATUSES, fullName, type Lead, type LeadStatus } from "@/sales"
import { NewLeadDialog } from "./lead-form"

const COLUMNS: Column<Lead>[] = [
  { field: "lastName", label: "Name", essential: true, render: (l) => fullName(l) },
  { field: "company", label: "Company", essential: true },
  { field: "status", label: "Lead status", essential: true, render: (l) => <LeadStatusBadge status={l.status} /> },
  { field: "email", label: "Email" },
  { field: "leadSource", label: "Lead source", render: (l) => (l.leadSource ? LEAD_SOURCE_LABELS[l.leadSource] : "") },
  { field: "ownerName", label: "Owner" },
  { field: "createdOn", label: "Created on", render: (l) => formatDate(l.createdOn) },
]

const STATUS_FILTER: ListFilter = {
  label: "Lead status",
  allLabel: "All statuses",
  options: LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s] })),
}

export default function LeadListPage() {
  return (
    <RecordList<Lead>
      title="Leads"
      noun="Leads"
      singular="Lead"
      load={(gateway, query, status) => gateway.listLeads({ ...query, status: status as LeadStatus | undefined })}
      columns={COLUMNS}
      filter={STATUS_FILTER}
      defaultSort={{ field: "createdOn", direction: "desc" }}
      href={(l) => `/leads/${l.id}`}
      searchLabel="Search Leads"
      renderNewDialog={(props) => <NewLeadDialog {...props} />}
    />
  )
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const variant = status === "disqualified" ? "outline" : status === "qualified" ? "default" : "secondary"
  return <Badge variant={variant}>{LEAD_STATUS_LABELS[status]}</Badge>
}
