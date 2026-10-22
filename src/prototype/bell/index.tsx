/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): mounts the bell variants of #171 in the header, switched with ?variant=A|B|C.
import { PrototypeSwitcher, useVariant } from "./prototype-switcher"
import { VARIANTS } from "./shared"
import { BellA } from "./variant-a"
import { BellB } from "./variant-b"
import { BellC, NotificationsPageC } from "./variant-c"

const KEYS = VARIANTS.map((v) => v.key)

export function ProtoBell() {
  const v = useVariant(KEYS)
  return v === "B" ? <BellB /> : v === "C" ? <BellC /> : <BellA />
}

export function ProtoSwitcher() {
  return <PrototypeSwitcher variants={VARIANTS} current={useVariant(KEYS)} />
}

export { NotificationsPageC }
