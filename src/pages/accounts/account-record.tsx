import { useState } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Pencil, Plus } from "lucide-react"
import { DetailList } from "@/components/records/fields"
import {
  ActivityPlaceholder,
  RecordError,
  RecordLoading,
  RecordPage,
  RecordSection,
  RelatedList,
} from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { useGateway } from "@/hooks/use-gateway"
import { opportunitySummary } from "@/lib/format"
import { fullName, type Account } from "@/sales"
import { NewContactDialog } from "@/pages/contacts/contact-form"
import { EditAccountForm } from "./account-form"

export default function AccountRecordPage() {
  const { id = "" } = useParams()
  const gateway = useGateway()
  const [editing, setEditing] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const { data, error, isPending } = useQuery({ queryKey: ["Account", id], queryFn: () => gateway.getAccount(id) })

  if (isPending) return <RecordLoading />
  if (error) return <RecordError error={error} />

  const { account, contacts, opportunities, canEdit } = data
  return (
    <RecordPage
      kind="Account"
      name={account.name}
      highlights={[
        { label: "City", value: [account.city, account.country].filter(Boolean).join(", ") },
        { label: "Phone", value: account.phone },
        { label: "Website", value: account.website && <ExternalLink href={account.website} /> },
        { label: "Owner", value: account.ownerName },
      ]}
      actions={
        canEdit &&
        !editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
        )
      }
      activity={<ActivityPlaceholder />}
    >
      <RecordSection title="Details">
        {editing ? (
          <EditAccountForm account={account} onDone={() => setEditing(false)} />
        ) : (
          <AccountDetails account={account} />
        )}
      </RecordSection>

      <RecordSection
        title={`Contacts (${contacts.length})`}
        action={
          <Button variant="ghost" size="sm" onClick={() => setAddingContact(true)}>
            <Plus aria-hidden />
            New Contact
          </Button>
        }
      >
        <RelatedList
          empty="No Contacts yet."
          items={contacts.map((c) => ({
            id: c.id,
            href: `/contacts/${c.id}`,
            title: fullName(c),
            detail: [c.jobTitle, c.email].filter(Boolean).join(" · "),
          }))}
        />
      </RecordSection>

      <RecordSection title={`Opportunities (${opportunities.length})`}>
        <RelatedList
          empty="No Opportunities yet."
          items={opportunities.map((o) => ({
            id: o.id,
            href: `/opportunities/${o.id}`,
            title: o.name,
            detail: opportunitySummary(o),
          }))}
        />
      </RecordSection>

      <NewContactDialog
        open={addingContact}
        onOpenChange={setAddingContact}
        account={{ id: account.id, name: account.name }}
      />
    </RecordPage>
  )
}

function AccountDetails({ account }: { account: Account }) {
  return (
    <DetailList
      items={[
        { label: "Account Name", value: account.name, wide: true },
        { label: "Website", value: account.website && <ExternalLink href={account.website} /> },
        { label: "Phone", value: account.phone },
        { label: "Street", value: account.street, wide: true },
        { label: "Postcode", value: account.postcode },
        { label: "City", value: account.city },
        { label: "Country", value: account.country },
        { label: "Owner", value: account.ownerName },
        { label: "Description", value: account.description, wide: true },
      ]}
    />
  )
}

function ExternalLink({ href }: { href: string }) {
  const url = /^https?:\/\//i.test(href) ? href : `https://${href}`
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {href.replace(/^https?:\/\//i, "")}
    </a>
  )
}
