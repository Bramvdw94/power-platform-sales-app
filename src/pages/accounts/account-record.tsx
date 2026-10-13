import { useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Pencil, Plus } from "lucide-react"
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
import { ACCOUNT_TYPE_LABELS, INDUSTRY_LABELS, opportunitySummary } from "@/lib/format"
import { fullName, toEngineRecord, type Account } from "@/sales"
import { NewContactDialog } from "@/pages/contacts/contact-form"
import { NewOpportunityDialog } from "@/pages/opportunities/opportunity-form"
import { EditAccountForm } from "./account-form"

export default function AccountRecordPage() {
  const { id = "" } = useParams()
  const gateway = useGateway()
  const [editing, setEditing] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [addingOpportunity, setAddingOpportunity] = useState(false)
  const { data, error, isPending } = useQuery({ queryKey: ["Account", id], queryFn: () => gateway.getAccount(id) })
  const ruleExtras = useMemo<RuleExtras>(
    () => ({ related: { contacts: (data?.contacts ?? []).map(toEngineRecord), opportunities: (data?.opportunities ?? []).map(toEngineRecord) } }),
    [data?.contacts, data?.opportunities],
  )

  if (isPending) return <RecordLoading />
  if (error) return <RecordError error={error} />

  const { account, contacts, opportunities, canEdit } = data
  return (
    <RecordPage
      kind="Account"
      name={account.name}
      highlights={[
        { label: "Account type", value: account.accountType && ACCOUNT_TYPE_LABELS[account.accountType] },
        { label: "City", value: [account.city, account.country].filter(Boolean).join(", ") },
        { label: "Phone", value: account.phone },
        { label: "Website", value: account.website && <ExternalLink href={account.website} /> },
        { label: "Owner", value: account.ownerName },
      ]}
      actions={
        canEdit &&
        !editing && (
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <ReassignButton record={{ type: "account", id: account.id }} ownerId={account.ownerId} name={account.name} />
          </>
        )
      }
      activity={<ActivityTimeline record={{ type: "account", id: account.id }} canAdd={canEdit} />}
    >
      <RecordSection title="Details">
        {editing ? (
          <EditAccountForm account={account} onDone={() => setEditing(false)} ruleExtras={ruleExtras} />
        ) : (
          <AccountDetails account={account} ruleExtras={ruleExtras} />
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

      <RecordSection
        title={`Opportunities (${opportunities.length})`}
        action={
          <Button variant="ghost" size="sm" onClick={() => setAddingOpportunity(true)}>
            <Plus aria-hidden />
            New Opportunity
          </Button>
        }
      >
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
      <NewOpportunityDialog
        open={addingOpportunity}
        onOpenChange={setAddingOpportunity}
        account={{ id: account.id, name: account.name }}
      />
    </RecordPage>
  )
}

function AccountDetails({ account, ruleExtras }: { account: Account; ruleExtras: RuleExtras }) {
  const context = useRuleContext("account", account.id, ruleExtras)
  const notices = useRuleNotices(context, account)
  const preview = useRulePreview(context, account)
  return (
    <>
      <RuleNoticeList notices={notices} />
      <DetailList
        ruleViews={preview.viewOf}
        items={[
          { label: "Account Name", field: "name", value: account.name, wide: true },
          { label: "Website", field: "website", value: account.website && <ExternalLink href={account.website} /> },
          { label: "Phone", field: "phone", value: account.phone },
          { label: "Account type", field: "accountType", value: account.accountType && ACCOUNT_TYPE_LABELS[account.accountType] },
          { label: "Industry", field: "industry", value: account.industry && INDUSTRY_LABELS[account.industry] },
          { label: "Street", field: "street", value: account.street, wide: true },
          { label: "Postcode", field: "postcode", value: account.postcode },
          { label: "City", field: "city", value: account.city },
          { label: "Country", field: "country", value: account.country },
          { label: "Owner", value: account.ownerName },
          { label: "Description", field: "description", value: account.description, wide: true },
        ]}
      />
    </>
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
