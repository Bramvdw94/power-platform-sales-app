import { useState, type FormEvent, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ListQuery, Page, SalesGateway, SortDirection } from "@/data/gateway"
import { useGateway } from "@/hooks/use-gateway"
import { describeError } from "@/lib/errors"
import { cn } from "@/lib/utils"
import type { ListView } from "@/sales"

export const PAGE_SIZE = 50

const VIEWS: { value: ListView; label: string }[] = [
  { value: "my", label: "My" },
  { value: "myTeam", label: "My team" },
  { value: "all", label: "All" },
]

export type Column<T> = {
  field: keyof T & string
  label: string
  render?: (record: T) => ReactNode
  /** Shown on a phone too; other columns appear from desktop width. */
  essential?: boolean
}

type Sort<T> = { field: keyof T & string; direction: SortDirection }

/** A list's own filter, such as Lead status: one value at a time, or all. Kept in the URL as `?filter=`. */
export type ListFilter = {
  label: string
  /** The option for no filter, e.g. "All statuses". */
  allLabel: string
  options: { value: string; label: string }[]
}

const ALL = "all"

type RecordListProps<T extends { id: string }> = {
  title: string
  /** Plural record name for the query key and empty state, e.g. "Accounts". */
  noun: string
  /** Singular record name for the New button, e.g. "Account". */
  singular: string
  /** `filter` is the picked value of the list's filter, if it has one. */
  load: (gateway: SalesGateway, query: ListQuery<T>, filter: string | undefined) => Promise<Page<T>>
  columns: Column<T>[]
  defaultSort: Sort<T>
  /** The first column links to the record page. */
  href: (record: T) => string
  searchLabel: string
  /** The New dialog, opened by the New button and by `?new=1` (the top bar's "+ New"). */
  renderNewDialog: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode
  filter?: ListFilter
}

function parseView(value: string | null): ListView {
  return VIEWS.some((v) => v.value === value) ? (value as ListView) : "my"
}

/**
 * A record list: the fixed views My, My team and All, a search box, sortable
 * columns and server-side paging. The state lives in the URL so Back and
 * shared links keep it.
 */
export function RecordList<T extends { id: string }>(props: RecordListProps<T>) {
  const { title, noun, singular, load, columns, defaultSort, href, searchLabel, renderNewDialog, filter } = props
  const gateway = useGateway()
  const [params, setParams] = useSearchParams()

  const view = parseView(params.get("view"))
  const search = params.get("q") ?? ""
  const page = Math.max(1, Number(params.get("page")) || 1)
  const sort = parseSort(params.get("sort"), columns) ?? defaultSort
  const query: ListQuery<T> = { view, search: search || undefined, sort, page, pageSize: PAGE_SIZE }
  const filterParam = params.get("filter")
  const filterValue = filter?.options.some((o) => o.value === filterParam) ? filterParam! : undefined

  const { data, error, isPending, isPlaceholderData } = useQuery({
    queryKey: [noun, query, filterValue],
    queryFn: () => load(gateway, query, filterValue),
    placeholderData: keepPreviousData,
  })

  /** Changes some URL state; anything but paging starts again at page 1. */
  const update = (changes: Record<string, string | null>) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key)
        else next.set(key, value)
      }
      if (!("page" in changes)) next.delete("page")
      return next
    })
  }

  const newOpen = params.get("new") === "1"
  const setNewOpen = (open: boolean) => update({ new: open ? "1" : null, page: params.get("page") })

  const toggleSort = (field: keyof T & string) => {
    const direction: SortDirection = sort.field === field && sort.direction === "asc" ? "desc" : "asc"
    update({ sort: `${field}:${direction}` })
  }

  const totalCount = data?.totalCount ?? 0
  const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const first = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, totalCount)

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <Button className="ml-auto" onClick={() => setNewOpen(true)}>
          <Plus aria-hidden />
          New {singular}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={view} onValueChange={(value) => update({ view: value === "my" ? null : value })}>
          <SelectTrigger aria-label="View" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIEWS.map((v) => (
              <SelectItem key={v.value} value={v.value}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filter && (
          <Select value={filterValue ?? ALL} onValueChange={(value) => update({ filter: value === ALL ? null : value })}>
            <SelectTrigger aria-label={filter.label} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{filter.allLabel}</SelectItem>
              {filter.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <ListSearch key={search} initial={search} label={searchLabel} onSearch={(text) => update({ q: text })} />
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/50 p-4 text-sm">
          {describeError(error)}
        </p>
      ) : (
        <div className={cn("rounded-md border", isPlaceholderData && "opacity-60")}>
          <Table aria-label={title} aria-busy={isPending || isPlaceholderData}>
            <TableHeader>
              <TableRow>
                {columns.map((column) => {
                  const active = sort.field === column.field
                  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown
                  return (
                    <TableHead
                      key={column.field}
                      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                      className={cn(!column.essential && "hidden md:table-cell")}
                    >
                      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => toggleSort(column.field)}>
                        {column.label}
                        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                      </Button>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableRow>
                  <TableCell colSpan={columns.length}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ) : data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                    No {noun.toLowerCase()} {search ? `match “${search}”` : "in this view"}.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((record) => (
                  <TableRow key={record.id}>
                    {columns.map((column, index) => {
                      const content = column.render ? column.render(record) : String(record[column.field] ?? "")
                      return (
                        <TableCell key={column.field} className={cn(!column.essential && "hidden md:table-cell")}>
                          {index === 0 ? (
                            <Link to={href(record)} className="font-medium text-primary hover:underline">
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {data && totalCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-live="polite">
            {first}–{last} of {totalCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={page <= 1}
            onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : null })}
          >
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => update({ page: String(page + 1) })}>
            Next
          </Button>
        </div>
      )}

      {renderNewDialog({ open: newOpen, onOpenChange: setNewOpen })}
    </div>
  )
}

function parseSort<T>(value: string | null, columns: Column<T>[]): Sort<T> | undefined {
  const [field, direction] = (value ?? "").split(":")
  const column = columns.find((c) => c.field === field)
  if (!column || (direction !== "asc" && direction !== "desc")) return undefined
  return { field: column.field, direction }
}

function ListSearch({ initial, label, onSearch }: { initial: string; label: string; onSearch: (text: string) => void }) {
  const [text, setText] = useState(initial)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSearch(text.trim())
  }
  return (
    <form role="search" onSubmit={submit} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        aria-label={label}
        placeholder={label}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (e.target.value === "") onSearch("")
        }}
        className="pl-8"
      />
    </form>
  )
}
