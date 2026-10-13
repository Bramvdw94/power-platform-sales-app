import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { OP_LABELS, RELATED_LABELS, fieldLabel, valueLabel } from "@/lib/process-labels"
import {
  conditionFields,
  fieldInfo,
  newId,
  relatedFields,
  type FieldOption,
} from "@/sales"
import {
  LIMITS,
  RELATED_LISTS,
  isRelatedCheck,
  type Check,
  type ConditionGroup,
  type EngineTable,
  type FieldCondition,
  type FieldInfo,
  type Op,
  type RelatedCheck,
  type RelatedList,
  type Scalar,
} from "@/sales/engine"

const OPS_BY_TYPE: Record<FieldInfo["type"], Op[]> = {
  text: ["equals", "isNot", "isEmpty", "isNotEmpty"],
  number: ["equals", "isNot", "greaterThan", "lessThan", "isEmpty", "isNotEmpty"],
  date: ["equals", "greaterThan", "lessThan", "isEmpty", "isNotEmpty"],
  choice: ["equals", "isNot", "isOneOf", "isEmpty", "isNotEmpty"],
  lookup: ["isEmpty", "isNotEmpty"],
  boolean: ["equals"],
}

const NO_VALUE: Op[] = ["isEmpty", "isNotEmpty"]

/**
 * What the builder is for. A Gate needs every check to pass, so it has no all/any choice but can count
 * related records; Entry criteria look at the record and its parents only; a Business rule has both.
 */
export type ConditionKind = "entry" | "gate" | "rule"

function defaultValue(info: FieldInfo | undefined, op: Op): Scalar | Scalar[] | undefined {
  if (NO_VALUE.includes(op)) return undefined
  if (op === "isOneOf") return info?.options?.[0] ? [info.options[0]] : []
  switch (info?.type) {
    case "choice":
      return info.options?.[0] ?? ""
    case "number":
      return 0
    case "boolean":
      return true
    default:
      return ""
  }
}

function withField(condition: FieldCondition, ref: string, info: FieldInfo | undefined): FieldCondition {
  const ops = OPS_BY_TYPE[info?.type ?? "text"]
  const op = ops.includes(condition.op) ? condition.op : ops[0]
  const { value: _value, ...rest } = condition
  void _value
  const value = defaultValue(info, op)
  return { ...rest, field: ref, op, ...(value === undefined ? {} : { value }) }
}

function withOp(condition: FieldCondition, op: Op, info: FieldInfo | undefined): FieldCondition {
  const { value: _value, ...rest } = condition
  void _value
  const value = defaultValue(info, op)
  return { ...rest, op, ...(value === undefined ? {} : { value }) }
}

export function ValueEditor({
  info,
  condition,
  label,
  onChange,
}: {
  info: FieldInfo | undefined
  condition: FieldCondition
  label: string
  onChange: (value: Scalar | Scalar[]) => void
}) {
  if (NO_VALUE.includes(condition.op)) return null
  const value = condition.value
  if (info?.type === "choice" && condition.op === "isOneOf") {
    const chosen = Array.isArray(value) ? value : value === undefined ? [] : [value]
    return (
      <fieldset aria-label={label} className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
        {(info.options ?? []).map((option) => (
          <label key={option} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={chosen.includes(option)}
              onChange={(e) => onChange(e.target.checked ? [...chosen, option] : chosen.filter((c) => c !== option))}
            />
            {valueLabel(option)}
          </label>
        ))}
      </fieldset>
    )
  }
  if (info?.type === "choice") {
    return (
      <NativeSelect aria-label={label} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        {(info.options ?? []).map((option) => (
          <option key={option} value={option}>
            {valueLabel(option)}
          </option>
        ))}
      </NativeSelect>
    )
  }
  if (info?.type === "boolean") {
    return (
      <NativeSelect aria-label={label} value={String(value ?? true)} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </NativeSelect>
    )
  }
  if (info?.type === "number") {
    return <Input aria-label={label} type="number" value={String(value ?? "")} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />
  }
  return <Input aria-label={label} type={info?.type === "date" ? "date" : "text"} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
}

function FieldConditionRow({
  condition,
  fields,
  table,
  label,
  onChange,
  onRemove,
  itemTable,
  readOnly,
}: {
  condition: FieldCondition
  fields: FieldOption[]
  table: EngineTable
  label: string
  onChange: (condition: FieldCondition) => void
  onRemove: () => void
  /** For a related check: the table of the items, where the fields are looked up. */
  itemTable?: string
  readOnly: boolean
}) {
  const info = (itemTable ? fields.find((f) => f.ref === condition.field)?.info : fieldInfo(table, condition.field)) as FieldInfo | undefined
  const missing = !fields.some((f) => f.ref === condition.field)
  const ops = OPS_BY_TYPE[info?.type ?? "text"]
  return (
    <div role="group" aria-label={label} className="grid gap-2 rounded-md border bg-card p-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_auto] sm:items-start">
      <NativeSelect
        aria-label={`${label} field`}
        value={condition.field}
        onChange={(e) => onChange(withField(condition, e.target.value, fields.find((f) => f.ref === e.target.value)?.info))}
        aria-invalid={missing || undefined}
      >
        {missing && <option value={condition.field}>{condition.field} (removed)</option>}
        {fields.map((f) => (
          <option key={f.ref} value={f.ref}>
            {fieldLabel(f.ref)}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label={`${label} operator`} value={condition.op} onChange={(e) => onChange(withOp(condition, e.target.value as Op, info))}>
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </NativeSelect>
      <div className="min-w-0">
        <ValueEditor info={info} condition={condition} label={`${label} value`} onChange={(value) => onChange({ ...condition, value })} />
      </div>
      {!readOnly && (
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
          <Trash2 aria-hidden />
        </Button>
      )}
    </div>
  )
}

function RelatedCheckRow({
  check,
  table,
  label,
  allowSince,
  onChange,
  onRemove,
  readOnly,
}: {
  check: RelatedCheck
  table: EngineTable
  label: string
  allowSince: boolean
  onChange: (check: RelatedCheck) => void
  onRemove: () => void
  readOnly: boolean
}) {
  const lists = Object.keys(RELATED_LISTS[table]) as RelatedList[]
  const fields = relatedFields(table, check.related)
  const where = check.where ?? []
  const itemTable = RELATED_LISTS[table][check.related] ?? ""
  return (
    <div role="group" aria-label={label} className="grid gap-2 rounded-md border bg-card p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">At least</span>
        <Input
          aria-label={`${label} count`}
          type="number"
          min={1}
          className="w-20"
          value={check.atLeast}
          onChange={(e) => onChange({ ...check, atLeast: Math.max(1, Number(e.target.value) || 1) })}
        />
        <NativeSelect
          aria-label={`${label} records`}
          className="w-44"
          value={check.related}
          onChange={(e) => onChange({ ...check, related: e.target.value as RelatedList, where: [] })}
        >
          {lists.map((list) => (
            <option key={list} value={list}>
              {RELATED_LABELS[list][1]}
            </option>
          ))}
        </NativeSelect>
        <span className="text-sm">{where.length > 0 ? "where" : "(any)"}</span>
        {where.length > 1 && (
          <NativeSelect aria-label={`${label} match`} className="w-40" value={check.match ?? "all"} onChange={(e) => onChange({ ...check, match: e.target.value as "all" | "any" })}>
            <option value="all">all of</option>
            <option value="any">any of</option>
          </NativeSelect>
        )}
        {!readOnly && (
          <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
      <div className="grid gap-2 pl-2 sm:pl-4">
        {where.map((condition, index) => (
          <FieldConditionRow
            key={condition.id ?? index}
            condition={condition}
            fields={fields}
            table={table}
            itemTable={itemTable}
            label={`${label} filter ${index + 1}`}
            onChange={(next) => onChange({ ...check, where: where.map((c, i) => (i === index ? next : c)) })}
            onRemove={() => onChange({ ...check, where: where.filter((_, i) => i !== index) })}
            readOnly={readOnly}
          />
        ))}
        <div hidden={readOnly}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fields.length === 0}
            onClick={() => {
              const first = fields[0]
              const condition: FieldCondition = { id: newId("w", where.map((c) => c.id ?? "")), field: first.ref, op: "isNotEmpty" }
              onChange({ ...check, where: [...where, condition] })
            }}
          >
            <Plus aria-hidden /> Add filter
          </Button>
        </div>
      </div>
      {allowSince && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={check.sinceStepEntered === true}
            onChange={(e) => {
              const { sinceStepEntered: _since, ...rest } = check
              void _since
              onChange(e.target.checked ? { ...rest, sinceStepEntered: true } : rest)
            }}
          />
          Only those added since the record entered this Step
        </label>
      )}
    </div>
  )
}

/**
 * The condition builder shared by Entry criteria, Gates and Business rules: all or any of a list of
 * field conditions (the record's own fields and its parents one hop up) and, where the kind allows,
 * "at least N related records where ...".
 */
export function ConditionBuilder({
  table,
  value,
  onChange,
  kind,
  label,
  allowSince = false,
  readOnly = false,
}: {
  table: EngineTable
  value: ConditionGroup
  onChange: (group: ConditionGroup) => void
  kind: ConditionKind
  label: string
  allowSince?: boolean
  /** Shows the conditions without the buttons that add or remove them; the inputs are disabled by the caller. */
  readOnly?: boolean
}) {
  const fields = conditionFields(table, true)
  const checks = value.conditions
  const relatedCount = checks.filter(isRelatedCheck).length
  const atLimit = checks.length >= LIMITS.conditionsPerGroup
  const relatedAllowed = kind !== "entry" && Object.keys(RELATED_LISTS[table]).length > 0
  const noun = kind === "gate" ? "check" : "condition"
  const update = (next: Check[]) => onChange({ ...value, conditions: next })
  const ids = checks.map((c) => c.id ?? "")

  return (
    <div role="group" aria-label={label} className="grid gap-2">
      {kind !== "gate" && checks.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <span>Match</span>
          <NativeSelect aria-label={`${label} match`} className="w-32" value={value.match} onChange={(e) => onChange({ ...value, match: e.target.value as "all" | "any" })}>
            <option value="all">all</option>
            <option value="any">any</option>
          </NativeSelect>
          <span>of these</span>
        </div>
      )}
      {checks.length === 0 && <p className="text-sm text-muted-foreground">{kind === "entry" ? "No conditions yet." : kind === "gate" ? "No checks: the record can move on at once." : "No conditions yet."}</p>}
      {checks.map((check, index) => {
        const rowLabel = `${kind === "gate" ? "Check" : "Condition"} ${index + 1}`
        return isRelatedCheck(check) ? (
          <RelatedCheckRow
            key={check.id ?? index}
            check={check}
            table={table}
            label={rowLabel}
            allowSince={allowSince}
            onChange={(next) => update(checks.map((c, i) => (i === index ? next : c)))}
            onRemove={() => update(checks.filter((_, i) => i !== index))}
            readOnly={readOnly}
          />
        ) : (
          <FieldConditionRow
            key={check.id ?? index}
            condition={check}
            fields={fields}
            table={table}
            label={rowLabel}
            onChange={(next) => update(checks.map((c, i) => (i === index ? next : c)))}
            onRemove={() => update(checks.filter((_, i) => i !== index))}
            readOnly={readOnly}
          />
        )
      })}
      <div className="flex flex-wrap items-center gap-2" hidden={readOnly}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={atLimit}
          onClick={() => update([...checks, { id: newId("c", ids), field: fields[0].ref, op: "isNotEmpty" }])}
        >
          <Plus aria-hidden /> Add {noun}
        </Button>
        {relatedAllowed && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={atLimit || relatedCount >= LIMITS.relatedChecksPerGroup}
            onClick={() => {
              const list = Object.keys(RELATED_LISTS[table])[0] as RelatedList
              update([...checks, { id: newId("c", ids), related: list, atLeast: 1 }])
            }}
          >
            <Plus aria-hidden /> Add related-record check
          </Button>
        )}
        {atLimit && <span className="text-xs text-muted-foreground">The most is {LIMITS.conditionsPerGroup} {noun}s.</span>}
        {!atLimit && relatedCount >= LIMITS.relatedChecksPerGroup && relatedAllowed && (
          <span className="text-xs text-muted-foreground">The most is {LIMITS.relatedChecksPerGroup} related-record checks.</span>
        )}
      </div>
    </div>
  )
}
