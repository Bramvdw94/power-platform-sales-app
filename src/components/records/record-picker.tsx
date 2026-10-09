import { useId, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SalesGateway } from "@/data/gateway"
import { useGateway } from "@/hooks/use-gateway"
import { cn } from "@/lib/utils"
import type { Id } from "@/sales"

/** A picked record: its id and the name shown for it. */
export type RecordChoice = { id: Id; name: string }

export type RecordOption = RecordChoice & { detail?: string }

export const PICKER_SUGGESTIONS = 8

/**
 * Picks a record by typing part of its name. Any record can be picked,
 * whoever owns it: linking never needs edit rights on the linked record.
 */
export function RecordPicker({
  id,
  value,
  onChange,
  invalid,
  noun,
  search: searchRecords,
}: {
  id: string
  value: RecordChoice | null
  onChange: (value: RecordChoice | null) => void
  invalid?: boolean
  /** Plural record name, e.g. "Accounts". */
  noun: string
  search: (gateway: SalesGateway, text: string) => Promise<RecordOption[]>
}) {
  const gateway = useGateway()
  const listId = useId()
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const search = text.trim()

  const { data } = useQuery({
    queryKey: [noun, "picker", search],
    queryFn: () => searchRecords(gateway, search),
    enabled: open && search.length > 0,
  })
  const options = search ? (data ?? []) : []

  if (value) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
        <span className="flex-1 truncate" id={id}>
          {value.name}
        </span>
        <Button type="button" variant="ghost" size="icon" className="size-6" aria-label={`Remove ${value.name}`} onClick={() => onChange(null)}>
          <X aria-hidden />
        </Button>
      </div>
    )
  }

  const choose = (index: number) => {
    const option = options[index]
    if (!option) return
    onChange({ id: option.id, name: option.name })
    setText("")
    setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        placeholder={`Search ${noun}`}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, options.length - 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === "Enter" && open && options.length > 0) {
            e.preventDefault()
            choose(active)
          } else if (e.key === "Escape") {
            setOpen(false)
          }
        }}
      />
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={noun}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={cn("cursor-pointer rounded-sm px-2 py-1.5 text-sm", index === active && "bg-accent text-accent-foreground")}
              // mousedown, not click: it fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault()
                choose(index)
              }}
            >
              {option.name}
              {option.detail && <span className="ml-2 text-muted-foreground">{option.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
