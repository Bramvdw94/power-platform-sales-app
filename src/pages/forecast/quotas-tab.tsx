import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import { describeError } from "@/lib/errors"
import { formatEuro } from "@/lib/format"
import { quarterOf, quotaMonths, type DateOnly, type Id, type Quota, type User } from "@/sales"
import { monthLabel } from "./forecast-format"
import type { ForecastData } from "./use-forecast-data"

type Person = { user: User; editable: boolean }

/** A quarter's Quota is the sum of its months; a partial quarter at the start of the grid totals the months shown. */
function quarterColumns(months: DateOnly[]): { label: string; months: DateOnly[] }[] {
  const groups = new Map<string, DateOnly[]>()
  for (const month of months) groups.set(quarterOf(month), [...(groups.get(quarterOf(month)) ?? []), month])
  return [...groups].map(([key, list]) => ({ label: `Q${key.slice(-1)} ${key.slice(0, 4)}`, months: list }))
}

export function QuotasTab({ data, me, directReports }: { data: ForecastData; me: User; directReports: User[] }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const isDesktop = useIsDesktop()
  const months = quotaMonths(data.today, 6)
  const quarters = quarterColumns(months)
  const people: Person[] = [...directReports.map((user) => ({ user, editable: true })), { user: me, editable: false }]

  const amountOf = (personId: Id, month: DateOnly) =>
    data.quotas.find((q: Quota) => q.salespersonId === personId && q.month === month)?.amount
  const sum = (personId: Id | null, list: DateOnly[]) =>
    list.reduce((total, month) => total + (personId === null ? people.reduce((t, p) => t + (amountOf(p.user.id, month) ?? 0), 0) : (amountOf(personId, month) ?? 0)), 0)

  const save = useMutation({
    mutationFn: ({ personId, month, amount }: { personId: Id; month: DateOnly; amount: number }) =>
      gateway.setQuota(personId, month, amount),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(describeError(error)),
  })

  const cell = (person: Person, month: DateOnly) => (
    <QuotaCell
      key={`${person.user.id}-${month}`}
      label={`${person.user.fullName} ${monthLabel(month)}`}
      saved={amountOf(person.user.id, month)}
      editable={person.editable}
      onSave={(amount) => save.mutate({ personId: person.user.id, month, amount })}
    />
  )

  const ownRowNote = me.managerId === null ? "Set by a system administrator" : "Set by your manager"

  if (!isDesktop) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Quotas save when you leave a field. Your own Quota is set by someone else.</p>
        {people.map((person) => (
          <fieldset key={person.user.id} className="space-y-2 rounded-md border p-3">
            <legend className="px-1 font-semibold">{person.user.fullName}</legend>
            {!person.editable && <p className="text-xs text-muted-foreground">{ownRowNote}</p>}
            <div className="grid grid-cols-2 gap-3">
              {months.map((month) => (
                <div key={month} className="space-y-1">
                  <span className="block text-xs text-muted-foreground">{monthLabel(month)}</span>
                  {cell(person, month)}
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {quarters.map((q) => `${q.label}: ${formatEuro(sum(person.user.id, q.months))}`).join(" · ")}
            </p>
          </fieldset>
        ))}
        <p className="text-sm font-semibold">
          Team: {quarters.map((q) => `${q.label} ${formatEuro(sum(null, q.months))}`).join(" · ")}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Quotas save when you leave a field. Your own Quota is set by someone else.</p>
      <div className="overflow-x-auto rounded-md border">
        <table aria-label="Quotas" className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Salesperson
              </th>
              {months.map((month) => (
                <th key={month} scope="col" className="px-3 py-2 text-right font-medium">
                  {monthLabel(month)}
                </th>
              ))}
              {quarters.map((q) => (
                <th key={q.label} scope="col" className="px-3 py-2 text-right font-medium">
                  {q.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.user.id} className="border-b">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {person.user.fullName}
                  {!person.editable && <span className="block text-xs font-normal text-muted-foreground">{ownRowNote}</span>}
                </th>
                {months.map((month) => (
                  <td key={month} className="px-2 py-1 text-right">
                    {cell(person, month)}
                  </td>
                ))}
                {quarters.map((q) => (
                  <td key={q.label} className="px-3 py-2 text-right tabular-nums">
                    {formatEuro(sum(person.user.id, q.months))}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-muted/50 font-semibold">
              <th scope="row" className="px-3 py-2 text-left">
                Team
              </th>
              {months.map((month) => (
                <td key={month} className="px-3 py-2 text-right tabular-nums">
                  {formatEuro(sum(null, [month]))}
                </td>
              ))}
              {quarters.map((q) => (
                <td key={q.label} className="px-3 py-2 text-right tabular-nums">
                  {formatEuro(sum(null, q.months))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** A euro amount that saves when you leave it; read-only when the Quota is not yours to set. */
function QuotaCell({
  label,
  saved,
  editable,
  onSave,
}: {
  label: string
  saved: number | undefined
  editable: boolean
  onSave: (amount: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  if (!editable) return <span className="px-3 tabular-nums">{saved === undefined ? "—" : formatEuro(saved)}</span>

  const shown = draft ?? (saved === undefined ? "" : String(saved))
  const commit = () => {
    if (draft === null) return
    const amount = draft.trim() === "" ? 0 : Number(draft)
    setDraft(null)
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter an amount of 0 or more.")
      return
    }
    if (amount !== (saved ?? 0) || (saved === undefined && draft.trim() !== "")) onSave(amount)
  }

  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      step={100}
      aria-label={label}
      value={shown}
      placeholder="0"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="w-28 text-right tabular-nums"
    />
  )
}
