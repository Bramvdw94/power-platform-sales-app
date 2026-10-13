import { useMutation } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { FormAlert } from "@/components/records/fields"
import { RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { formatDate, formatPrice } from "@/lib/format"
import { quoteLabel, type Quote } from "@/sales"
import { QuoteStatusBadges } from "./quote-status"

/**
 * The Opportunity's Quotes: number, status, sent date, Valid until and net total. Its Owner and
 * manager make a new one while the Opportunity is open; a closed Opportunity takes no new Quotes.
 */
export function QuotesPanel({ opportunityId, quotes, canCreate }: { opportunityId: string; quotes: Quote[]; canCreate: boolean }) {
  const gateway = useGateway()
  const navigate = useNavigate()
  const invalidate = useInvalidateRecords()
  const create = useMutation({
    mutationFn: () => gateway.createQuote(opportunityId),
    onSuccess: async (quote) => {
      await invalidate()
      navigate(`/quotes/${quote.id}`)
    },
  })

  return (
    <RecordSection
      title="Quotes"
      action={
        canCreate && (
          <Button variant="outline" size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
            <Plus aria-hidden />
            New quote
          </Button>
        )
      }
    >
      {quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canCreate ? "No Quotes. Make one from this Opportunity: its Account, Primary Contact and Product lines are copied." : "No Quotes."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table aria-label="Quotes">
            <TableHeader>
              <TableRow>
                <TableHead>Quote</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Valid until</TableHead>
                <TableHead className="text-right">Net total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell>
                    <Link to={`/quotes/${quote.id}`} className="font-medium text-primary hover:underline">
                      {quoteLabel(quote)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <QuoteStatusBadges quote={quote} />
                  </TableCell>
                  <TableCell>{quote.sentOn ? formatDate(quote.sentOn) : "—"}</TableCell>
                  <TableCell>{quote.validUntil ? formatDate(quote.validUntil) : "—"}</TableCell>
                  <TableCell className="text-right">{formatPrice(quote.netTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {create.isError && <FormAlert error={create.error} className="mt-2" />}
    </RecordSection>
  )
}
