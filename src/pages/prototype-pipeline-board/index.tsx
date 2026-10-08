// PROTOTYPE: pipeline board (issue #7). Three variants, switchable via ?variant=A|B|C
// with the floating bar or the arrow keys. In-memory sample data; nothing is saved. Throwaway.
import { useState } from "react"
import { PrototypeSwitcher, useVariant } from "@/components/prototype-switcher"
import { applyFilters, DEFAULT_FILTERS, type Filters } from "./data"
import { FilterBar, StateReadout, useBoard } from "./shared"
import * as A from "./variant-a"
import * as B from "./variant-b"
import * as C from "./variant-c"

const VARIANTS = [
  { key: "A", name: A.name },
  { key: "B", name: B.name },
  { key: "C", name: C.name },
]

export default function PipelineBoardPrototype() {
  const [variant, setVariant] = useState(useVariant(VARIANTS.map((v) => v.key)))
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const { board, dialog } = useBoard()
  const list = applyFilters(board.all, filters)

  return (
    <div className="flex flex-col gap-4 px-4 sm:px-6 py-6 pb-24 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Prototype with sample data. Changes are not saved.</p>
        </div>
        <FilterBar filters={filters} setFilters={setFilters} />
      </div>
      <StateReadout lastAction={board.lastAction} filters={filters} shown={list.length} />
      {variant === "A" && <A.VariantA list={list} board={board} />}
      {variant === "B" && <B.VariantB list={list} board={board} />}
      {variant === "C" && <C.VariantC list={list} board={board} />}
      {dialog}
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />
    </div>
  )
}
