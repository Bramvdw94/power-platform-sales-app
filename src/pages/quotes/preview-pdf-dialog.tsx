import { Download } from "lucide-react"
import { useState } from "react"
import { FormAlert } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { renderQuotePdf } from "@/lib/quote-pdf"
import { QuoteSheet } from "@/pages/products/quote-sheet"
import type { QuoteDocument } from "@/sales"
import { downloadPdf } from "./quote-pdf-support"

/**
 * Shows what a PDF will say, drawn as an A4 sheet. The PDF itself is only built on Download: the Power Apps
 * player does not let a page show a PDF inline, so the preview is the same document model drawn in HTML.
 */
export function PreviewPdfDialog({ title, description, fileName, document, onClose }: { title: string; description: string; fileName: string; document: QuoteDocument; onClose: () => void }) {
  const [error, setError] = useState<unknown>()
  const download = async () => {
    try {
      downloadPdf(await renderQuotePdf(document), fileName)
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div>
          <Button variant="outline" size="sm" onClick={() => void download()}>
            <Download aria-hidden />
            Download PDF
          </Button>
        </div>
        {error ? <FormAlert error={error} /> : null}
        <QuoteSheet document={document} />
      </DialogContent>
    </Dialog>
  )
}
