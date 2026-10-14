// PROTOTYPE (throwaway, never merge): the public form lives outside the app shell.
import { ProtoSwitcher, useVariantImpl } from "./index"

export default function WebFormRoute() {
  const V = useVariantImpl()
  return (
    <>
      <V.WebForm />
      <ProtoSwitcher />
    </>
  )
}
