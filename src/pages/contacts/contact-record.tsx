import { useState, type ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { ActivityTimeline } from "@/components/records/activity-timeline"
import { DetailList } from "@/components/records/fields"
import {
  RecordError,
  RecordLoading,
  RecordPage,
  RecordSection,
  RelatedList,
} from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { useGateway } from "@/hooks/use-gateway"
import { opportunitySummary } from "@/lib/format"
import { fullName, type Contact } from "@/sales"
import { EditContactForm } from "./contact-form"

export default function ContactRecordPage() {
  const { id = "" } = useParams()
  const gateway = useGateway()
  const [editing, setEditing] = useState(false)
  const { data, error, isPending } = useQuery({ queryKey: ["Contact", id], queryFn: () => gateway.getContact(id) })

  if (isPending) return <RecordLoading />
  if (error) return <RecordError error={error} />

  const { contact, account, opportunities, canEdit } = data
  const accountLink = account && (
    <Link to={`/accounts/${account.id}`} className="text-primary hover:underline">
      {account.name}
    </Link>
  )
  return (
    <RecordPage
      kind="Contact"
      name={fullName(contact)}
      highlights={[
        { label: "Job title", value: contact.jobTitle },
        { label: "Account", value: accountLink },
        { label: "Email", value: contact.email && <MailLink email={contact.email} /> },
        { label: "Phone", value: contact.phone ?? contact.mobile },
        { label: "Owner", value: contact.ownerName },
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
      activity={<ActivityTimeline record={{ type: "contact", id: contact.id }} canAdd={canEdit} />}
    >
      <RecordSection title="Details">
        {editing ? (
          <EditContactForm contact={contact} onDone={() => setEditing(false)} />
        ) : (
          <ContactDetails contact={contact} accountLink={accountLink} />
        )}
      </RecordSection>

      <RecordSection title={`Opportunities (${opportunities.length})`}>
        <RelatedList
          empty="Not the Primary Contact on any Opportunity."
          items={opportunities.map((o) => ({
            id: o.id,
            href: `/opportunities/${o.id}`,
            title: o.name,
            detail: opportunitySummary(o),
          }))}
        />
      </RecordSection>
    </RecordPage>
  )
}

function ContactDetails({ contact, accountLink }: { contact: Contact; accountLink: ReactNode }) {
  return (
    <DetailList
      items={[
        { label: "First name", value: contact.firstName },
        { label: "Last name", value: contact.lastName },
        { label: "Account", value: accountLink },
        { label: "Job title", value: contact.jobTitle },
        { label: "Email", value: contact.email && <MailLink email={contact.email} /> },
        { label: "Phone", value: contact.phone },
        { label: "Mobile", value: contact.mobile },
        { label: "Owner", value: contact.ownerName },
      ]}
    />
  )
}

function MailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className="text-primary hover:underline">
      {email}
    </a>
  )
}
