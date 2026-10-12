import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { FormAlert, FormField, TextFields, type TextFieldSpec } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import { PRODUCT_UNIT_LABELS, formatVatRate } from "@/lib/format"
import {
  PRODUCT_UNITS,
  VAT_RATES,
  productErrors,
  type Product,
  type ProductInput,
  type ProductUnit,
  type VatRate,
} from "@/sales"

type ProductValues = { name: string; code: string; description: string; listPrice: string; unit?: ProductUnit; vatRate?: VatRate }

const TOP_SPECS: TextFieldSpec<"name" | "code">[] = [
  { name: "name", label: "Name", required: true },
  { name: "code", label: "Product code", required: true },
]
const DESCRIPTION_SPEC: TextFieldSpec<"description">[] = [{ name: "description", label: "Description", type: "textarea" }]
const PRICE_SPEC: TextFieldSpec<"listPrice">[] = [{ name: "listPrice", label: "List price (€, excl. VAT)", required: true, type: "number" }]

function emptyValues(): ProductValues {
  return { name: "", code: "", description: "", listPrice: "" }
}

function valuesOf(product: Product): ProductValues {
  return {
    name: product.name,
    code: product.code,
    description: product.description ?? "",
    listPrice: String(product.listPrice),
    unit: product.unit,
    vatRate: product.vatRate,
  }
}

/** The form's values as a Product, as far as they are filled in; productErrors reports the rest. */
function inputOf(values: ProductValues): Partial<ProductInput> {
  const price = values.listPrice.trim()
  return {
    name: values.name.trim(),
    code: values.code.trim(),
    description: values.description.trim(),
    unit: values.unit,
    listPrice: price === "" ? undefined : Number(price),
    vatRate: values.vatRate,
  }
}

function ProductFields({
  idPrefix,
  values,
  errors,
  onChange,
}: {
  idPrefix: string
  values: ProductValues
  errors: Record<string, string>
  onChange: (changes: Partial<ProductValues>) => void
}) {
  const set = (name: string, value: string) => onChange({ [name]: value })
  return (
    <>
      <TextFields idPrefix={idPrefix} specs={TOP_SPECS} values={values} errors={errors} onChange={set} />
      <TextFields idPrefix={idPrefix} specs={DESCRIPTION_SPEC} values={values} errors={errors} onChange={set} />
      <FormField id={`${idPrefix}-unit`} label="Unit" required error={errors.unit}>
        <Select value={values.unit ?? ""} onValueChange={(unit) => onChange({ unit: unit as ProductUnit })}>
          <SelectTrigger
            id={`${idPrefix}-unit`}
            className="w-full"
            aria-invalid={errors.unit ? true : undefined}
            aria-describedby={errors.unit ? `${idPrefix}-unit-error` : undefined}
          >
            <SelectValue placeholder="Pick a Unit" />
          </SelectTrigger>
          <SelectContent>
            {PRODUCT_UNITS.map((unit) => (
              <SelectItem key={unit} value={unit}>
                {PRODUCT_UNIT_LABELS[unit]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <TextFields idPrefix={idPrefix} specs={PRICE_SPEC} values={values} errors={errors} onChange={set} />
      <FormField id={`${idPrefix}-vatRate`} label="VAT rate" required error={errors.vatRate}>
        <Select
          value={values.vatRate === undefined ? "" : String(values.vatRate)}
          onValueChange={(rate) => onChange({ vatRate: Number(rate) as VatRate })}
        >
          <SelectTrigger
            id={`${idPrefix}-vatRate`}
            className="w-full"
            aria-invalid={errors.vatRate ? true : undefined}
            aria-describedby={errors.vatRate ? `${idPrefix}-vatRate-error` : undefined}
          >
            <SelectValue placeholder="Pick a VAT rate" />
          </SelectTrigger>
          <SelectContent>
            {VAT_RATES.map((rate) => (
              <SelectItem key={rate} value={String(rate)}>
                {formatVatRate(rate)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </>
  )
}

/** "+ New" on the Products list: everything the Product needs, then on to its page. */
export function NewProductDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const gateway = useGateway()
  const navigate = useNavigate()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState<ProductValues>(emptyValues)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: (input: ProductInput) => gateway.createProduct(input),
    onSuccess: async (product) => {
      await invalidate()
      navigate(`/products/${product.id}`)
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const close = (next: boolean) => {
    if (!next) {
      setValues(emptyValues())
      setErrors({})
      create.reset()
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const input = inputOf(values)
    const found = productErrors(input)
    setErrors(found)
    if (Object.keys(found).length === 0) create.mutate({ ...input, description: input.description || undefined } as ProductInput)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <DialogHeader className="sm:col-span-2">
            <DialogTitle>New Product</DialogTitle>
            <DialogDescription>The List price is the euro price per Unit, excluding VAT.</DialogDescription>
          </DialogHeader>
          <ProductFields idPrefix="new-product" values={values} errors={errors} onChange={(c) => setValues((v) => ({ ...v, ...c }))} />
          {create.isError && <FormAlert error={create.error} className="sm:col-span-2" />}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The Product's details as a form, for a Catalogue manager. A new List price doesn't touch existing Product lines. */
export function EditProductForm({ product, onDone }: { product: Product; onDone: () => void }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState<ProductValues>(() => valuesOf(product))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (input: ProductInput) => gateway.updateProduct(product.id, input),
    onSuccess: async () => {
      await invalidate()
      onDone()
    },
    onError: (error) => setErrors(fieldErrorsOf(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const input = inputOf(values)
    const found = productErrors(input)
    setErrors(found)
    // A blank description clears it.
    if (Object.keys(found).length === 0) save.mutate(input as ProductInput)
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Edit Product" className="grid gap-4 sm:grid-cols-2">
      <ProductFields idPrefix="edit-product" values={values} errors={errors} onChange={(c) => setValues((v) => ({ ...v, ...c }))} />
      {save.isError && <FormAlert error={save.error} className="sm:col-span-2" />}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}
