export type FormValues<K extends string = string> = Partial<Record<K, string>>

/** Form values as a patch: blank fields become "" so an edit can clear them. */
export function toPatch<K extends string>(values: FormValues<K>, names: readonly K[]): Record<K, string> {
  return Object.fromEntries(names.map((name) => [name, (values[name] ?? "").trim()])) as Record<K, string>
}

/** Form values for a create: blank fields are left out. */
export function toInput<K extends string>(values: FormValues<K>, names: readonly K[]): Partial<Record<K, string>> {
  return Object.fromEntries(
    names.map((name) => [name, values[name]?.trim()]).filter(([, value]) => value),
  ) as Partial<Record<K, string>>
}
