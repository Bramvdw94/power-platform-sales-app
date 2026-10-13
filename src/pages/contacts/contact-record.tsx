import { useMemo, useState, type ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { ReassignButton } from "@/components/records/reassign-dialog"
import { ActivityTimeline } from "@/components/records/activity-timeline"
import { DetailList } from "@/components/records/fields"
import { RuleNoticeList } from "@/components/records/rule-effects"
import {
  RecordError,
  RecordLoading,
  RecordPage,
  RecordSection,
  RelatedList,
} from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { useGateway } from "@/hooks/use-gateway"
import { useRuleContext, useRuleNotices, useRulePreview, type RuleExtras } from "@/hooks/use-rules"
import { opportunitySummary } from "@/lib/format"
import { fullName, toEngineRecord, type Contact } from "@/sales"
import { EditContactForm } from "./contact-form"

export default function ContactRecordPage() {
  const { id = "" } = useParams()
  const gateway = useGateway()
  const [editing, setEditing] = useState(false)
  const { data, error, isPending } = useQuery({ queryKey: ["Contact", id], queryFn: () => gateway.getContact(id) })
  const ruleExtras = useMemo<RuleExtras>(() => ({ parents: { account: data?.account ? toEngineRecord(data.account) : null } }), [data?.account])

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
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <ReassignButton record={{ type: "contact", id: contact.id }} ownerId={contact.ownerId} name={fullName(contact)} />
          </>
        )
      }
      activity={<ActivityTimeline record={{ type: "contact", id: contact.id }} canAdd={canEdit} />}
    >
      <RecordSection title="Details">
        {editing ? (
          <EditContactForm contact={contact} onDone={() => setEditing(false)} ruleExtras={ruleExtras} />
        ) : (
          <ContactDetails contact={contact} accountLink={accountLink} ruleExtras={ruleExtras} />
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

function ContactDetails({ contact, accountLink, ruleExtras }: { contact: Contact; accountLink: ReactNode; ruleExtras: RuleExtras }) {
  const context = useRuleContext("contact", contact.id, ruleExtras)
  const notices = useRuleNotices(context, contact)
  const preview = useRulePreview(context, contact)
  return (
    <>
      <RuleNoticeList notices={notices} />
      <DetailList
        ruleViews={preview.viewOf}
        items={[
          { label: "First name", field: "firstName", value: contact.firstName },
          { label: "Last name", field: "lastName", value: contact.lastName },
          { label: "Account", field: "accountId", value: accountLink },
          { label: "Job title", field: "jobTitle", value: contact.jobTitle },
          { label: "Email", field: "email", value: contact.email && <MailLink email={contact.email} /> },
          { label: "Phone", field: "phone", value: contact.phone },
          { label: "Mobile", field: "mobile", value: contact.mobile },
          { label: "Owner", value: contact.ownerName },
        ]}
      />
    </>
  )
}

function MailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className="text-primary hover:underline">
      {email}
    </a>
  )
}
