import { Plus, Trash2 } from "lucide-react"
import { ValueEditor } from "@/components/conditions/condition-builder"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { EFFECT_LABELS } from "@/lib/rule-labels"
import { fieldLabel } from "@/lib/process-labels"
import { EFFECT_TYPES, defaultSetValue, effectFields, fieldInfoOf, newEffect, type EffectType } from "@/sales"
import type { Effect, EngineTable, Scalar } from "@/sales/engine"
import { useState } from "react"

function FieldSelect({ label, value, fields, onChange }: { label: string; value: string; fields: string[]; onChange: (field: string) => void }) {
  const missing = !fields.includes(value)
  return (
    <NativeSelect aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={missing || undefined}>
      {missing && <option value={value}>{value} (removed)</option>}
      {fields.map((f) => (
        <option key={f} value={f}>
          {fieldLabel(f)}
        </option>
      ))}
    </NativeSelect>
  )
}

function EffectRow({ table, effect, label, onChange, onRemove, readOnly }: { table: EngineTable; effect: Effect; label: string; onChange: (effect: Effect) => void; onRemove: () => void; readOnly: boolean }) {
  return (
    <div role="group" aria-label={label} className="grid gap-2 rounded-md border bg-card p-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-start">
      <p className="pt-1.5 text-sm font-medium">{EFFECT_LABELS[effect.type]}</p>
      <div className="grid min-w-0 gap-2">
        {(effect.type === "required" || effect.type === "readOnly") && (
          <FieldSelect label={`${label} field`} value={effect.field} fields={effectFields(table, effect.type)} onChange={(field) => onChange({ ...effect, field })} />
        )}
        {effect.type === "setValue" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <FieldSelect
              label={`${label} field`}
              value={effect.field}
              fields={effectFields(table, "setValue")}
              onChange={(field) => onChange({ type: "setValue", field, value: defaultSetValue(fieldInfoOf(table, field)) })}
            />
            <ValueEditor
              info={fieldInfoOf(table, effect.field)}
              condition={{ field: effect.field, op: "equals", value: (effect.value ?? "") as Scalar }}
              label={`${label} value`}
              onChange={(value) => onChange({ ...effect, value: value as Scalar })}
            />
          </div>
        )}
        {effect.type === "warning" && (
          <>
            <Input aria-label={`${label} message`} placeholder="What the user should know" value={effect.message} onChange={(e) => onChange({ ...effect, message: e.target.value })} />
            <NativeSelect
              aria-label={`${label} shown at`}
              value={effect.field ?? ""}
              onChange={(e) => {
                const { field: _field, ...rest } = effect
                void _field
                onChange(e.target.value ? { ...rest, field: e.target.value } : rest)
              }}
            >
              <option value="">Top of the form</option>
              {effectFields(table, "warning").map((f) => (
                <option key={f} value={f}>
                  Under {fieldLabel(f)}
                </option>
              ))}
            </NativeSelect>
          </>
        )}
        {effect.type === "blockSave" && (
          <Input aria-label={`${label} message`} placeholder="Why the record can't be saved" value={effect.message} onChange={(e) => onChange({ ...effect, message: e.target.value })} />
        )}
      </div>
      {!readOnly && (
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
          <Trash2 aria-hidden />
        </Button>
      )}
    </div>
  )
}

/** The effects a rule has while its conditions hold. */
export function EffectsEditor({ table, effects, onChange, readOnly }: { table: EngineTable; effects: Effect[]; onChange: (effects: Effect[]) => void; readOnly: boolean }) {
  const [adding, setAdding] = useState<EffectType>("required")
  return (
    <div role="group" aria-label="Effects" className="grid gap-2">
      {effects.length === 0 && <p className="text-sm text-muted-foreground">No effects yet.</p>}
      {effects.map((effect, index) => (
        <EffectRow
          key={index}
          table={table}
          effect={effect}
          label={`Effect ${index + 1}`}
          readOnly={readOnly}
          onChange={(next) => onChange(effects.map((e, i) => (i === index ? next : e)))}
          onRemove={() => onChange(effects.filter((_, i) => i !== index))}
        />
      ))}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="New effect type" className="w-44" value={adding} onChange={(e) => setAdding(e.target.value as EffectType)}>
            {EFFECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {EFFECT_LABELS[type]}
              </option>
            ))}
          </NativeSelect>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...effects, newEffect(table, adding)])}>
            <Plus aria-hidden /> Add effect
          </Button>
        </div>
      )}
    </div>
  )
}
