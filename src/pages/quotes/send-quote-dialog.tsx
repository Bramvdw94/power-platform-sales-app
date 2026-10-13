import { useEffect, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { FormAlert, FormField } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { QuoteDetails } from "@/data/gateway"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import { formatDate } from "@/lib/format"
import { defaultEmail, fullName, quoteLabel, quotePdfFileName, type QuoteSendRoute } from "@/sales"
import { downloadPdf, renderQuote, templateFor, useQuotePdfSources } from "./quote-pdf-support"

/**
 * Send: email the PDF from my Outlook (the default) or download it and send it myself. Both store the
 * exact PDF on the Quote and set it to Sent.
 */
export function SendQuoteDialog({ details, onClose }: { details: QuoteDetails; onClose: () => void }) {
  const { quote, contact, owner } = details
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const { data: me } = useCurrentUser()
  const sources = useQuotePdfSources()
  const [route, setRoute] = useState<QuoteSendRoute>("email")
  const [cc, setCc] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [prefilled, setPrefilled] = useState(false)
  const to = contact?.email?.trim() ?? ""
  const template = sources.templates && templateFor(details, sources.templates)

  useEffect(() => {
    if (prefilled || !sources.settings) return
    const email = defaultEmail(sources.settings, {
      quote,
      contactName: contact ? fullName(contact) : "",
      owner,
      settings: sources.settings,
      formatDate,
    })
    setSubject(email.subject)
    setMessage(email.message)
    setPrefilled(true)
  }, [prefilled, sources.settings, quote, contact, owner])

  const send = useMutation({
    mutationFn: async () => {
      if (!sources.settings || !template) throw new Error("The Quote settings and templates are not loaded yet.")
      const pdf = await renderQuote(details, sources.settings, template, { asSent: true })
      const sent =
        route === "email"
          ? await gateway.sendQuote(quote.id, { route, pdf, to, cc, subject, message })
          : await gateway.sendQuote(quote.id, { route, pdf })
      if (route === "download") downloadPdf(pdf, quotePdfFileName(sent))
      return sent
    },
    onSuccess: async () => {
      await invalidate()
      onClose()
    },
  })

  const noAddress = route === "email" && !to
  const fieldErrors = fieldErrorsOf(send.error)
  const ready = !!sources.settings && !!template && prefilled

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send quote {quoteLabel(quote)}</DialogTitle>
          <DialogDescription>
            The PDF is drawn with the {template ? `"${template.name}"` : "Default"} template and stored on the Quote. Sending locks the Quote.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-2">
          <legend className="sr-only">How to send</legend>
          <RouteOption
            id="send-route-email"
            checked={route === "email"}
            onChange={() => setRoute("email")}
            title="Email it from my Outlook"
            hint={`Sent from ${me?.user.email || "your mailbox"} with the PDF attached.`}
          />
          <RouteOption
            id="send-route-download"
            checked={route === "download"}
            onChange={() => setRoute("download")}
            title="Download the PDF, I'll send it myself"
            hint="The Quote is marked as Sent when you confirm."
          />
        </fieldset>

        {route === "email" && (
          <div className="grid gap-3">
            {noAddress ? (
              <p role="alert" className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
                {contact ? `${fullName(contact)} has no email address.` : "This Quote has no Contact."} Add an email address to the Contact, or download the PDF and send it yourself.
              </p>
            ) : (
              <FormField id="send-to" label="To" error={fieldErrors.to}>
                <Input id="send-to" value={to} readOnly />
              </FormField>
            )}
            <FormField id="send-cc" label="Cc">
              <Input id="send-cc" type="email" multiple value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" />
            </FormField>
            <FormField id="send-subject" label="Subject">
              <Input id="send-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </FormField>
            <FormField id="send-message" label="Message">
              <Textarea id="send-message" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
            </FormField>
          </div>
        )}

        {send.isError && Object.keys(fieldErrors).length === 0 && <FormAlert error={send.error} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!ready || noAddress || send.isPending} onClick={() => send.mutate()}>
            {route === "email" ? "Send quote" : "Download and mark as sent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RouteOption({ id, checked, onChange, title, hint }: { id: string; checked: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary">
      <input id={id} type="radio" name="send-route" className="mt-1" checked={checked} onChange={onChange} />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}
