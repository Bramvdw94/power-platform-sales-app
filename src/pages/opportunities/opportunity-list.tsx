import { RecordList, type Column, type ListFilter } from "@/components/records/record-list"
import { STAGE_LABELS, formatEuro } from "@/lib/format"
import { STAGES, type Opportunity, type Stage } from "@/sales"
import { NewOpportunityDialog } from "./opportunity-form"
import { ExpectedCloseDate } from "./expected-close-date"
import { lastActivityCell } from "@/prototype/forecast"

const COLUMNS: Column<Opportunity>[] = [
  { field: "name", label: "Name", essential: true },
  { field: "accountName", label: "Account" },
  { field: "stage", label: "Stage", essential: true, render: (o) => STAGE_LABELS[o.stage] },
  { field: "estimatedValue", label: "Estimated value", render: (o) => formatEuro(o.estimatedValue) },
  { field: "probability", label: "Probability", render: (o) => `${o.probability}%` },
  { field: "expectedCloseDate", label: "Expected close date", render: (o) => <ExpectedCloseDate opportunity={o} /> },
  { field: "ownerName", label: "Owner" },
  { field: "createdOn", label: "Last activity", render: (o) => lastActivityCell(o.id) },
]

const STAGE_FILTER: ListFilter = {
  label: "Stage",
  allLabel: "Any Stage",
  defaultValue: "open",
  options: [{ value: "open", label: "Open Stages" }, ...STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))],
}

export default function OpportunityListPage() {
  return (
    <RecordList<Opportunity>
      title="Opportunities"
      noun="Opportunities"
      singular="Opportunity"
      load={(gateway, query, stage) =>
        gateway.listOpportunities({ ...query, stage: stage as Stage | "open" | undefined })
      }
      filter={STAGE_FILTER}
      columns={COLUMNS}
      defaultSort={{ field: "expectedCloseDate", direction: "asc" }}
      href={(o) => `/opportunities/${o.id}`}
      searchLabel="Search Opportunities"
      renderNewDialog={(props) => <NewOpportunityDialog {...props} />}
    />
  )
}
