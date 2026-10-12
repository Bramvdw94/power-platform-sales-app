import { RecordList, type Column } from "@/components/records/record-list"
import { useCurrentUser } from "@/hooks/use-current-user"
import { PRODUCT_UNIT_LABELS, formatPrice, formatVatRate } from "@/lib/format"
import type { Product } from "@/sales"
import { NewProductDialog } from "./product-form"

const COLUMNS: Column<Product>[] = [
  { field: "name", label: "Name", essential: true },
  { field: "code", label: "Product code", essential: true },
  { field: "unit", label: "Unit", render: (p) => PRODUCT_UNIT_LABELS[p.unit] },
  { field: "listPrice", label: "List price", essential: true, render: (p) => formatPrice(p.listPrice) },
  { field: "vatRate", label: "VAT rate", render: (p) => formatVatRate(p.vatRate) },
  { field: "retired", label: "Status", render: (p) => (p.retired ? "Retired" : "Active") },
]

/** The catalogue: everyone reads it; a Catalogue manager also gets New Product. */
export default function ProductListPage() {
  const { data } = useCurrentUser()
  return (
    <RecordList<Product>
      title="Products"
      noun="Products"
      singular="Product"
      load={(gateway, query, filter) =>
        gateway.listProducts({ ...query, status: filter === "retired" ? "retired" : filter === "active" ? "active" : undefined })
      }
      columns={COLUMNS}
      defaultSort={{ field: "name", direction: "asc" }}
      href={(p) => `/products/${p.id}`}
      searchLabel="Search Products"
      hideViews
      canCreate={!!data?.user.isCatalogueManager}
      filter={{
        label: "Status",
        allLabel: "All Products",
        defaultValue: "active",
        options: [
          { value: "active", label: "Active" },
          { value: "retired", label: "Retired" },
        ],
      }}
      renderNewDialog={(props) => <NewProductDialog {...props} />}
    />
  )
}
