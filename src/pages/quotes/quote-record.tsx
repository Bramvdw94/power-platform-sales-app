import { useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Check, Download, Eye, Pencil, Plus, RotateCcw, Send, Trash2, Trophy, X } from "lucide-react"
import { ContactPicker, type ContactChoice } from "@/components/records/account-picker"
import { DetailList, FormAlert, FormField } from "@/components/records/fields"
import { RecordError, RecordLoading, RecordPage, RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import { formatDate, formatPrice, formatVatRate } from "@/lib/format"
import { fullName, isOpenStage, isQuoteEditable, quoteLabel, quotePdfFileName, quoteTotals, sentDescription, type Quote, type QuoteLine } from "@/sales"
import type { QuoteDetails } from "@/data/gateway"
import { CloseOpportunityDialog } from "@/pages/opportunities/close-dialogs"
import { LineDialog } from "@/pages/opportunities/product-lines"
import { PreviewPdfDialog } from "./preview-pdf-dialog"
import { documentOf, downloadPdf, templateFor, useQuotePdfSources } from "./quote-pdf-support"
import { QuoteStatusBadges } from "./quote-status"
import { SendQuoteDialog } from "./send-quote-dialog"

export default function QuoteRecordPage() {
  const { id = "" } = useParams()
  const gateway = useGateway()
  const navigate = useNavigate()
  const invalidate = useInvalidateRecords()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [sending, setSending] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const sources = useQuotePdfSources()
  const { data, error, isPending } = useQuery({ queryKey: ["Quote", id], queryFn: () => gateway.getQuote(id) })

  const move = useMutation({
    mutationFn: async (action: "revise" | "accept" | "reject") => {
      switch (action) {
        case "revise":
          return { quote: await gateway.reviseQuote(id), action }
        case "accept":
          return { quote: await gateway.acceptQuote(id), action }
        case "reject":
          return { quote: await gateway.rejectQuote(id), action }
      }
    },
    onSuccess: async ({ quote, action }) => {
      await invalidate()
      if (action === "revise") navigate(`/quotes/${quote.id}`)
      // Accepting a Quote is winning the deal: the Close dialog opens at the Quote's net total, and cancelling it keeps the Quote Accepted.
      if (action === "accept") setClosing(true)
    },
  })

  const download = useMutation({
    mutationFn: async () => {
      const pdf = await gateway.getQuotePdf(id)
      if (!pdf || !data) throw new Error("There is no stored PDF for this Quote.")
      downloadPdf(pdf, quotePdfFileName(data.quote))
    },
  })

  if (isPending) return <RecordLoading />
  if (error) return <RecordError error={error} />

  const { quote, opportunity, canEdit } = data
  const open = isOpenStage(opportunity.stage)
  const mayAct = canEdit && open && !editing
  const draft = isQuoteEditable(quote)
  const busy = move.isPending
  const template = sources.templates && templateFor(data, sources.templates)

  const opportunityLink = (
    <Link to={`/opportunities/${opportunity.id}`} className="text-primary hover:underline">
      {opportunity.name}
    </Link>
  )

  const actions = mayAct && (
    <>
      {draft && (
        <>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
          <Button variant="outline" disabled={!sources.settings || !template} onClick={() => setPreviewing(true)}>
            <Eye aria-hidden />
            Preview PDF
          </Button>
          <Button disabled={busy} onClick={() => setSending(true)}>
            <Send aria-hidden />
            Send
          </Button>
          <Button variant="outline" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        </>
      )}
      {quote.status === "sent" && (
        <>
          <Button disabled={busy} onClick={() => move.mutate("accept")}>
            <Check aria-hidden />
            Accept
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => move.mutate("reject")}>
            <X aria-hidden />
            Reject
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => move.mutate("revise")}>
            <RotateCcw aria-hidden />
            Revise
          </Button>
        </>
      )}
      {quote.status === "accepted" && (
        <Button onClick={() => setClosing(true)}>
          <Trophy aria-hidden />
          Close Opportunity as won
        </Button>
      )}
    </>
  )

  const downloadAction = !draft && quote.hasStoredPdf && (
    <Button variant="outline" disabled={download.isPending} onClick={() => download.mutate()}>
      <Download aria-hidden />
      Download PDF
    </Button>
  )

  return (
    <RecordPage
      kind="Quote"
      name={quoteLabel(quote)}
      highlights={[
        { label: "Status", value: <QuoteStatusBadges quote={quote} /> },
        { label: "Opportunity", value: opportunityLink },
        { label: "Account", value: quote.accountName },
        { label: "Valid until", value: quote.validUntil && formatDate(quote.validUntil) },
        { label: "Net total", value: formatPrice(quote.netTotal) },
        { label: "Gross total", value: formatPrice(quote.grossTotal) },
        { label: "Owner", value: quote.ownerName },
      ]}
      actions={actions || downloadAction ? <>{actions}{downloadAction}</> : undefined}
    >
      {move.isError && <FormAlert error={move.error} />}
      {download.isError && <FormAlert error={download.error} />}
      {quote.sentOn && (
        <p className="rounded-md border p-3 text-sm">
          {sentDescription(quote, formatDate)}
          {quote.hasStoredPdf ? ` The exact PDF is stored: ${quotePdfFileName(quote)}.` : " No PDF was stored for this Quote."}
        </p>
      )}
      {!open && (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">This Opportunity is closed, so its Quotes are read-only.</p>
      )}
      {quote.status === "accepted" && open && canEdit && (
        <p className="rounded-md border p-3 text-sm">
          This Quote is accepted. Close the Opportunity as won at {formatPrice(quote.netTotal)} to finish the deal.
        </p>
      )}

      <RecordSection title="Details">
        {editing ? <EditQuoteForm details={data} onDone={() => setEditing(false)} /> : <QuoteDetailList details={data} opportunityLink={opportunityLink} />}
      </RecordSection>

      <QuoteLinesPanel quote={quote} lines={data.lines} canEdit={mayAct && draft} />

      {sending && <SendQuoteDialog details={data} onClose={() => setSending(false)} />}
      {previewing && sources.settings && template && (
        <PreviewPdfDialog
          title={`Preview ${quoteLabel(quote)}`}
          description={`Drawn with the "${template.name}" template. A Draft shows a watermark; nothing is sent.`}
          fileName={quotePdfFileName(quote)}
          document={documentOf(data, sources.settings, template)}
          onClose={() => setPreviewing(false)}
        />
      )}
      {deleting && <DeleteQuoteDialog quote={quote} opportunityId={opportunity.id} onClose={() => setDeleting(false)} />}
      {closing && open && (
        <CloseOpportunityDialog
          opportunity={opportunity}
          open
          onOpenChange={(next) => setClosing(next)}
          initialOutcome="won"
          initialActualValue={quote.netTotal}
        />
      )}
    </RecordPage>
  )
}

function QuoteDetailList({ details, opportunityLink }: { details: QuoteDetails; opportunityLink: React.ReactNode }) {
  const { quote, contact } = details
  return (
    <DetailList
      items={[
        { label: "Quote number", value: quote.number },
        { label: "Revision", value: String(quote.revision) },
        { label: "Status", value: <QuoteStatusBadges quote={quote} /> },
        { label: "Opportunity", value: opportunityLink },
        {
          label: "Account",
          value: quote.accountId && (
            <Link to={`/accounts/${quote.accountId}`} className="text-primary hover:underline">
              {quote.accountName}
            </Link>
          ),
        },
        {
          label: "Contact",
          value: contact && (
            <Link to={`/contacts/${contact.id}`} className="text-primary hover:underline">
              {fullName(contact)}
            </Link>
          ),
        },
        { label: "Valid until", value: quote.validUntil && formatDate(quote.validUntil) },
        { label: "Quote template", value: quote.templateName ?? "Default template" },
        { label: "Sent on", value: quote.sentOn && formatDate(quote.sentOn) },
        { label: "Sent by", value: quote.sentByName },
        { label: "Owner", value: quote.ownerName },
      ]}
    />
  )
}

function EditQuoteForm({ details, onDone }: { details: QuoteDetails; onDone: () => void }) {
  const { quote } = details
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [contact, setContact] = useState<ContactChoice | null>(quote.contactId ? { id: quote.contactId, name: quote.contactName ?? "" } : null)
  const [validUntil, setValidUntil] = useState(quote.validUntil ?? "")
  const [templateId, setTemplateId] = useState(quote.templateId ?? "")
  const { data: templates } = useQuery({ queryKey: ["QuoteTemplates"], queryFn: () => gateway.listQuoteTemplates() })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => gateway.updateQuote(quote.id, { contactId: contact?.id ?? "", validUntil, ...(templateId ? { templateId } : {}) }),
    onSuccess: async () => {
      await invalidate()
      onDone()
    },
    onError: (e) => setErrors(fieldErrorsOf(e)),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setErrors({})
    save.mutate()
  }
  return (
    <form aria-label="Edit Quote" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <FormField id="edit-quote-contact" label="Contact" error={errors.contactId}>
        <ContactPicker id="edit-quote-contact" value={contact} onChange={setContact} />
      </FormField>
      <FormField id="edit-quote-valid-until" label="Valid until" error={errors.validUntil}>
        <Input id="edit-quote-valid-until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} aria-invalid={errors.validUntil ? true : undefined} />
      </FormField>
      <FormField id="edit-quote-template" label="Quote template" className="sm:col-span-2">
        <select
          id="edit-quote-template"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">{`Default${templates?.find((t) => t.isDefault) ? ` (${templates.find((t) => t.isDefault)!.name})` : ""}`}</option>
          {templates?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </FormField>
      {save.isError && !Object.keys(errors).length && <FormAlert error={save.error} />}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** The Quote's own lines. A Draft's are edited here and nowhere else: the Opportunity's lines and Estimated value stay as they are. */
function QuoteLinesPanel({ quote, lines, canEdit }: { quote: Quote; lines: QuoteLine[]; canEdit: boolean }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [dialog, setDialog] = useState<{ line?: QuoteLine } | null>(null)
  const remove = useMutation({
    mutationFn: (id: string) => gateway.removeQuoteLine(id),
    onSuccess: () => invalidate(),
  })
  const totals = quoteTotals(lines)

  return (
    <RecordSection
      title="Quote lines"
      action={
        canEdit && (
          <Button variant="outline" size="sm" onClick={() => setDialog({})}>
            <Plus aria-hidden />
            Add line
          </Button>
        )
      }
    >
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{canEdit ? "No lines yet. Add one to price this Quote." : "No lines."}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table aria-label="Quote lines">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {canEdit && (
                  <TableHead className="w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="max-w-72 whitespace-normal">
                    <span className="font-medium">{line.productName}</span>
                    {line.description && <span className="block text-sm text-muted-foreground">{line.description}</span>}
                  </TableCell>
                  <TableCell className="text-right">{line.quantity}</TableCell>
                  <TableCell className="text-right">{formatPrice(line.unitPrice)}</TableCell>
                  <TableCell className="text-right">{line.discountPercent ? `${line.discountPercent}%` : "—"}</TableCell>
                  <TableCell className="text-right">{formatVatRate(line.vatRate)}</TableCell>
                  <TableCell className="text-right font-medium">{formatPrice(line.lineAmount)}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${line.productName}`} onClick={() => setDialog({ line })}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Remove ${line.productName}`} disabled={remove.isPending} onClick={() => remove.mutate(line.id)}>
                        <Trash2 aria-hidden />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>Net total</TableCell>
                <TableCell className="text-right">{formatPrice(totals.net)}</TableCell>
                {canEdit && <TableCell />}
              </TableRow>
              {totals.byRate.map((rate) => (
                <TableRow key={rate.rate}>
                  <TableCell colSpan={5}>
                    VAT {formatVatRate(rate.rate)} on {formatPrice(rate.net)}
                  </TableCell>
                  <TableCell className="text-right">{formatPrice(rate.vat)}</TableCell>
                  {canEdit && <TableCell />}
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={5}>Gross total</TableCell>
                <TableCell className="text-right">{formatPrice(totals.gross)}</TableCell>
                {canEdit && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      {remove.isError && <FormAlert error={remove.error} className="mt-2" />}
      {!canEdit && quote.status !== "draft" && <p className="mt-2 text-xs text-muted-foreground">What was sent stays as it was sent; revise the Quote to change it.</p>}
      {dialog && (
        <LineDialog
          noun="Quote line"
          idPrefix="quote-line"
          line={dialog.line}
          onClose={() => setDialog(null)}
          onSave={({ productId, ...values }) =>
            dialog.line ? gateway.updateQuoteLine(dialog.line.id, values) : gateway.addQuoteLine(quote.id, { ...values, productId })
          }
        />
      )}
    </RecordSection>
  )
}

function DeleteQuoteDialog({ quote, opportunityId, onClose }: { quote: Quote; opportunityId: string; onClose: () => void }) {
  const gateway = useGateway()
  const navigate = useNavigate()
  const invalidate = useInvalidateRecords()
  const remove = useMutation({
    mutationFn: () => gateway.deleteQuote(quote.id),
    onSuccess: async () => {
      navigate(`/opportunities/${opportunityId}`)
      await invalidate()
    },
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Quote</DialogTitle>
          <DialogDescription>{quoteLabel(quote)} and its lines are deleted. Only a Draft can be deleted.</DialogDescription>
        </DialogHeader>
        {remove.isError && <FormAlert error={remove.error} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

