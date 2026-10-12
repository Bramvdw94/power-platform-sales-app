import { useState, type FormEvent } from "react"
import { useParams } from "react-router-dom"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { DetailList, FormAlert } from "@/components/records/fields"
import { RecordError, RecordLoading, RecordPage, RecordSection } from "@/components/records/record-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { PRODUCT_UNIT_LABELS, formatDate, formatPrice, formatVatRate } from "@/lib/format"
import type { Product } from "@/sales"
import { EditProductForm } from "./product-form"

export default function ProductRecordPage() {
  const { id = "" } = useParams()
  const gateway = useGateway()
  const [editing, setEditing] = useState(false)
  const [retiring, setRetiring] = useState(false)
  const { data: me } = useCurrentUser()
  const { data: product, error, isPending } = useQuery({ queryKey: ["Product", id], queryFn: () => gateway.getProduct(id) })

  if (isPending) return <RecordLoading />
  if (error) return <RecordError error={error} />

  const canManage = !!me?.user.isCatalogueManager
  return (
    <RecordPage
      kind="Product"
      name={product.name}
      highlights={[
        { label: "Product code", value: product.code },
        { label: "List price", value: `${formatPrice(product.listPrice)} per ${PRODUCT_UNIT_LABELS[product.unit].toLowerCase()}` },
        { label: "VAT rate", value: formatVatRate(product.vatRate) },
        { label: "Status", value: <StatusBadge product={product} /> },
      ]}
      actions={
        canManage &&
        !editing &&
        !product.retired && (
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setRetiring(true)}>
              Retire
            </Button>
          </>
        )
      }
    >
      <RecordSection title="Details">
        {editing ? (
          <EditProductForm product={product} onDone={() => setEditing(false)} />
        ) : (
          <DetailList
            items={[
              { label: "Name", value: product.name },
              { label: "Product code", value: product.code },
              { label: "Description", value: product.description, wide: true },
              { label: "Unit", value: PRODUCT_UNIT_LABELS[product.unit] },
              { label: "List price", value: formatPrice(product.listPrice) },
              { label: "VAT rate", value: formatVatRate(product.vatRate) },
              { label: "Status", value: <StatusBadge product={product} /> },
              { label: "Created on", value: formatDate(product.createdOn) },
            ]}
          />
        )}
      </RecordSection>
      {retiring && <RetireDialog product={product} onOpenChange={setRetiring} />}
    </RecordPage>
  )
}

function StatusBadge({ product }: { product: Product }) {
  return product.retired ? <Badge variant="secondary">Retired</Badge> : <Badge variant="outline">Active</Badge>
}

function RetireDialog({ product, onOpenChange }: { product: Product; onOpenChange: (open: boolean) => void }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const retire = useMutation({
    mutationFn: () => gateway.retireProduct(product.id),
    onSuccess: async () => {
      await invalidate()
      onOpenChange(false)
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    retire.mutate()
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Retire Product</DialogTitle>
            <DialogDescription>
              {product.name} can't be added to new lines any more. Lines that already use it keep it.
            </DialogDescription>
          </DialogHeader>
          {retire.isError && <FormAlert error={retire.error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={retire.isPending}>
              Retire
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
