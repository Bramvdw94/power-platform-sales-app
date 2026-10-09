import { RecordList, type Column } from "@/components/records/record-list"
import { formatDate } from "@/lib/format"
import type { Account } from "@/sales"
import { NewAccountDialog } from "./account-form"

const COLUMNS: Column<Account>[] = [
  { field: "name", label: "Account Name", essential: true },
  { field: "city", label: "City", essential: true },
  { field: "country", label: "Country" },
  { field: "phone", label: "Phone" },
  { field: "ownerName", label: "Owner" },
  { field: "createdOn", label: "Created on", render: (a) => formatDate(a.createdOn) },
]

export default function AccountListPage() {
  return (
    <RecordList<Account>
      title="Accounts"
      noun="Accounts"
      singular="Account"
      load={(gateway, query) => gateway.listAccounts(query)}
      columns={COLUMNS}
      defaultSort={{ field: "name", direction: "asc" }}
      href={(a) => `/accounts/${a.id}`}
      searchLabel="Search Accounts"
      renderNewDialog={(props) => <NewAccountDialog {...props} />}
    />
  )
}
