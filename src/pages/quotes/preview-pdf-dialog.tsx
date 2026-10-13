import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import { FormAlert } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { downloadPdf } from "./quote-pdf-support"

/** Draws a PDF with `render` and shows it; nothing is stored or sent. */
export function PreviewPdfDialog({ title, description, fileName, render, onClose }: { title: string; description: string; fileName: string; render: () => Promise<Uint8Array>; onClose: () => void }) {
  const [bytes, setBytes] = useState<Uint8Array>()
  const [url, setUrl] = useState<string>()
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    let cancelled = false
    let made: string | undefined
    render().then(
      (pdf) => {
        if (cancelled) return
        setBytes(pdf)
        try {
          made = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }))
          setUrl(made)
        } catch {
          // No object URLs here: the Download button still works.
        }
      },
      (e: unknown) => !cancelled && setError(e),
    )
    return () => {
      cancelled = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [render])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-[90vh] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <FormAlert error={error} />
        ) : !bytes ? (
          <p className="text-sm text-muted-foreground">Drawing the PDF…</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div>
              <Button variant="outline" size="sm" onClick={() => downloadPdf(bytes, fileName)}>
                <Download aria-hidden />
                Download PDF
              </Button>
            </div>
            {url && <iframe title="PDF preview" src={url} className="min-h-0 w-full flex-1 rounded-md border" />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
