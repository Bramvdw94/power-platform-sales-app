import { fullName } from "@/sales"
import { PICKER_SUGGESTIONS, RecordPicker, type RecordChoice } from "./record-picker"

export type AccountChoice = RecordChoice
export type ContactChoice = RecordChoice

type PickerProps = {
  id: string
  value: RecordChoice | null
  onChange: (value: RecordChoice | null) => void
  invalid?: boolean
}

/** Picks an Account by typing part of its name. */
export function AccountPicker(props: PickerProps) {
  return (
    <RecordPicker
      {...props}
      noun="Accounts"
      search={async (gateway, search) => {
        const page = await gateway.listAccounts({
          view: "all",
          search,
          sort: { field: "name", direction: "asc" },
          pageSize: PICKER_SUGGESTIONS,
        })
        return page.items.map((a) => ({ id: a.id, name: a.name, detail: a.city }))
      }}
    />
  )
}

/** Picks a Contact by typing part of their name or email. */
export function ContactPicker(props: PickerProps) {
  return (
    <RecordPicker
      {...props}
      noun="Contacts"
      search={async (gateway, search) => {
        const page = await gateway.listContacts({
          view: "all",
          search,
          sort: { field: "lastName", direction: "asc" },
          pageSize: PICKER_SUGGESTIONS,
        })
        return page.items.map((c) => ({ id: c.id, name: fullName(c), detail: c.accountName }))
      }}
    />
  )
}
