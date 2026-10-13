import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { FormAlert, FormField, TextFields, type TextFieldSpec } from "@/components/records/fields"
import { PICKER_SUGGESTIONS, RecordPicker, type RecordChoice } from "@/components/records/record-picker"
import { RecordSection } from "@/components/records/record-page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import { formatPrice, PRODUCT_UNIT_LABELS } from "@/lib/format"
import { toNumber } from "@/lib/form"
import { productLineErrors, productLinesTotal, type ProductLine } from "@/sales"

type LineField = "description" | "quantity" | "unitPrice" | "discountPercent"
type LineValues = Record<LineField, string>

const DESCRIPTION: TextFieldSpec<"description">[] = [{ name: "description", label: "Description", type: "textarea" }]
const AMOUNTS: TextFieldSpec<"quantity" | "unitPrice" | "discountPercent">[] = [
  { name: "quantity", label: "Quantity", required: true, type: "number" },
  { name: "unitPrice", label: "Unit price (€, excl. VAT)", required: true, type: "number" },
  { name: "discountPercent", label: "Discount (%)", type: "number" },
]

function valuesOf(line?: ProductLine): LineValues {
  return {
    description: line?.description ?? "",
    quantity: line ? String(line.quantity) : "1",
    unitPrice: line ? String(line.unitPrice) : "",
    discountPercent: line ? String(line.discountPercent) : "0",
  }
}

/**
 * The Opportunity's Product lines. While there are any, the Estimated value is
 * their total. The Owner and the Owner's manager add, change and remove lines;
 * once the Opportunity is closed they are read-only.
 */
export function ProductLinesPanel({ opportunityId, lines, canEdit }: { opportunityId: string; lines: ProductLine[]; canEdit: boolean }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [dialog, setDialog] = useState<{ line?: ProductLine } | null>(null)
  const remove = useMutation({
    mutationFn: (id: string) => gateway.removeProductLine(id),
    onSuccess: () => invalidate(),
  })

  return (
    <RecordSection
      title="Product lines"
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
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? "No Product lines. Add one to build the Estimated value from what you sell; without lines you type it yourself."
            : "No Product lines."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table aria-label="Product lines">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
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
                  <TableCell className="text-right">
                    {formatPrice(line.unitPrice)}
                    {line.unitPrice !== line.listPriceAtAdd && (
                      <span className="block text-xs text-muted-foreground">List {formatPrice(line.listPriceAtAdd)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{line.discountPercent ? `${line.discountPercent}%` : "—"}</TableCell>
                  <TableCell className="text-right font-medium">{formatPrice(line.lineAmount)}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${line.productName}`} onClick={() => setDialog({ line })}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${line.productName}`}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(line.id)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Total, excluding VAT</TableCell>
                <TableCell className="text-right">{formatPrice(productLinesTotal(lines))}</TableCell>
                {canEdit && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      {remove.isError && <FormAlert error={remove.error} className="mt-2" />}
      {dialog && <ProductLineDialog opportunityId={opportunityId} line={dialog.line} onClose={() => setDialog(null)} />}
    </RecordSection>
  )
}

function ProductLineDialog({ opportunityId, line, onClose }: { opportunityId: string; line?: ProductLine; onClose: () => void }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [product, setProduct] = useState<RecordChoice | null>(line ? { id: line.productId, name: line.productName } : null)
  const [values, setValues] = useState<LineValues>(() => valuesOf(line))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: () => {
      const numbers = {
        quantity: toNumber(values.quantity),
        unitPrice: toNumber(values.unitPrice),
        discountPercent: values.discountPercent.trim() === "" ? 0 : toNumber(values.discountPercent),
      }
      return line
        ? gateway.updateProductLine(line.id, { ...numbers, description: values.description })
        : gateway.addProductLine(opportunityId, { ...numbers, productId: product!.id, description: values.description })
    },
    onSuccess: async () => {
      await invalidate()
      onClose()
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const pickProduct = async (choice: RecordChoice | null) => {
    setProduct(choice)
    if (!choice) return
    setErrors((e) => ({ ...e, productId: "" }))
    const picked = await gateway.getProduct(choice.id)
    setValues((v) => ({ ...v, description: picked.description ?? "", unitPrice: String(picked.listPrice) }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found: Record<string, string> = { ...productLineErrors({
      quantity: toNumber(values.quantity),
      unitPrice: toNumber(values.unitPrice),
      discountPercent: values.discountPercent.trim() === "" ? 0 : toNumber(values.discountPercent),
    }) }
    if (!product) found.productId = "Pick a Product."
    setErrors(found)
    if (Object.keys(found).length === 0) save.mutate()
  }

  const onChange = (name: LineField, value: string) => setValues((v) => ({ ...v, [name]: value }))
  const title = line ? "Edit Product line" : "Add Product line"
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {line
                ? `The list price when this line was added was ${formatPrice(line.listPriceAtAdd)}.`
                : "The description and unit price start from the Product; change them for this line if you need to."}
            </DialogDescription>
          </DialogHeader>
          <FormField id="product-line-product" label="Product" required error={errors.productId}>
            {line ? (
              <Input id="product-line-product" value={line.productName} readOnly />
            ) : (
              <RecordPicker
                id="product-line-product"
                value={product}
                onChange={pickProduct}
                invalid={!!errors.productId}
                noun="Products"
                search={async (g, search) => {
                  const page = await g.listProducts({ status: "active", search, sort: { field: "name", direction: "asc" }, pageSize: PICKER_SUGGESTIONS })
                  return page.items.map((p) => ({ id: p.id, name: p.name, detail: `${formatPrice(p.listPrice)} per ${PRODUCT_UNIT_LABELS[p.unit].toLowerCase()}` }))
                }}
              />
            )}
          </FormField>
          <TextFields idPrefix="product-line" specs={DESCRIPTION} values={values} errors={errors} onChange={onChange} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextFields idPrefix="product-line" specs={AMOUNTS} values={values} errors={errors} onChange={onChange} />
          </div>
          {save.isError && !Object.keys(fieldErrorsOf(save.error)).length && <FormAlert error={save.error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
