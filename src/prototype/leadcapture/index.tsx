// PROTOTYPE (throwaway, never merge): picks the variant and mounts the switcher.
import { variantA } from "./variant-a"
import { variantB } from "./variant-b"
import { variantC } from "./variant-c"
import { PrototypeSwitcher, useVariant } from "./switcher"
import type { Variant } from "./types"

const VARIANTS: Record<string, Variant> = { A: variantA, B: variantB, C: variantC }
const KEYS = Object.keys(VARIANTS)

export function useVariantImpl(): Variant {
  return VARIANTS[useVariant(KEYS)]
}

export function ProtoSwitcher() {
  const current = useVariant(KEYS)
  return <PrototypeSwitcher current={current} variants={KEYS.map((key) => ({ key, name: VARIANTS[key].name }))} />
}
