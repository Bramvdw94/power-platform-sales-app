import { RecordList, type Column } from "@/components/records/record-list"
import { formatDate } from "@/lib/format"
import { fullName, type Contact } from "@/sales"
import { NewContactDialog } from "./contact-form"

const COLUMNS: Column<Contact>[] = [
  { field: "lastName", label: "Name", essential: true, render: (c) => fullName(c) },
  { field: "accountName", label: "Account", essential: true },
  { field: "jobTitle", label: "Job title" },
  { field: "email", label: "Email" },
  { field: "ownerName", label: "Owner" },
  { field: "createdOn", label: "Created on", render: (c) => formatDate(c.createdOn) },
]

export default function ContactListPage() {
  return (
    <RecordList<Contact>
      title="Contacts"
      noun="Contacts"
      singular="Contact"
      load={(gateway, query) => gateway.listContacts(query)}
      columns={COLUMNS}
      defaultSort={{ field: "lastName", direction: "asc" }}
      href={(c) => `/contacts/${c.id}`}
      searchLabel="Search Contacts by name or email"
      renderNewDialog={(props) => <NewContactDialog {...props} />}
    />
  )
}
