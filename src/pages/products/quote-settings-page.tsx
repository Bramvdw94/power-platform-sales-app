import { useState, type FormEvent } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { FormAlert, FormField } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useGateway } from "@/hooks/use-gateway"
import { useInvalidateRecords } from "@/hooks/use-invalidate-records"
import { fieldErrorsOf } from "@/lib/errors"
import { EMAIL_PLACEHOLDERS, MAX_LOGO_LENGTH, type QuoteSettings } from "@/sales"
import { ProductsTabs } from "./products-tabs"

export default function QuoteSettingsPage() {
  const gateway = useGateway()
  const { data: me } = useCurrentUser()
  const { data, error } = useQuery({ queryKey: ["QuoteSettings"], queryFn: () => gateway.getQuoteSettings() })
  return (
    <>
      <ProductsTabs />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Quote settings</h1>
        <p className="text-sm text-muted-foreground">Company details, terms and email templates behind every Quote PDF. Everyone reads them; a Catalogue manager changes them.</p>
        {error ? <FormAlert error={error} /> : !data || !me ? <p className="text-sm text-muted-foreground">Loading…</p> : <SettingsForm settings={data} canEdit={me.user.isCatalogueManager} />}
      </div>
    </>
  )
}

type Values = Omit<QuoteSettings, "id" | "defaultValidityDays"> & { defaultValidityDays: string }

function valuesOf(settings: QuoteSettings): Values {
  const copy: Partial<QuoteSettings> = { ...settings }
  delete copy.id
  return { ...(copy as Omit<QuoteSettings, "id">), defaultValidityDays: String(settings.defaultValidityDays) }
}

function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function SettingsForm({ settings, canEdit }: { settings: QuoteSettings; canEdit: boolean }) {
  const gateway = useGateway()
  const invalidate = useInvalidateRecords()
  const [values, setValues] = useState<Values>(valuesOf(settings))
  const [logoError, setLogoError] = useState("")
  const save = useMutation({
    mutationFn: () => gateway.updateQuoteSettings({ ...values, defaultValidityDays: Number(values.defaultValidityDays) }),
    onSuccess: () => invalidate(),
  })
  const errors = fieldErrorsOf(save.error)
  const set = (name: keyof Values) => (e: { target: { value: string } }) => setValues({ ...values, [name]: e.target.value })
  const text = (name: keyof Values, label: string, wide = false) => (
    <FormField id={`qs-${name}`} label={label} error={errors[name]} className={wide ? "sm:col-span-2" : undefined}>
      <Input id={`qs-${name}`} value={values[name]} readOnly={!canEdit} onChange={set(name)} />
    </FormField>
  )
  const area = (name: keyof Values, label: string, rows = 3) => (
    <FormField id={`qs-${name}`} label={label} error={errors[name]} className="sm:col-span-2">
      <Textarea id={`qs-${name}`} rows={rows} value={values[name]} readOnly={!canEdit} onChange={set(name)} />
    </FormField>
  )

  const pickLogo = async (file: File | undefined) => {
    setLogoError("")
    if (!file) return
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setLogoError("The logo must be a PNG or JPEG image.")
    const url = await readLogo(file)
    if (url.length > MAX_LOGO_LENGTH) return setLogoError("The logo is too large. Use an image under 300 KB.")
    setValues((v) => ({ ...v, logo: url }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }

  return (
    <form aria-label="Quote settings" onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
        <h2 className="text-sm font-medium sm:col-span-2">Company</h2>
        {text("companyName", "Company name")}
        {text("phone", "Phone")}
        {area("address", "Address", 2)}
        {text("email", "Email")}
        {text("website", "Website")}
        {text("kvk", "KvK")}
        {text("btwId", "Btw-id")}
        {text("iban", "IBAN")}
        <div className="grid gap-1.5 sm:col-span-2">
          <FormField id="qs-logo" label="Logo (PNG or JPEG, under 300 KB)" error={errors.logo || logoError}>
            <div className="flex items-center gap-3">
              {values.logo && <img src={values.logo} alt="Logo" className="max-h-12 max-w-40 rounded border bg-white p-1" />}
              {canEdit && <Input id="qs-logo" type="file" accept="image/png,image/jpeg" className="max-w-xs" onChange={(e) => void pickLogo(e.target.files?.[0])} />}
              {canEdit && values.logo && (
                <Button type="button" variant="outline" size="sm" onClick={() => setValues({ ...values, logo: "" })}>
                  Remove logo
                </Button>
              )}
            </div>
          </FormField>
        </div>
      </div>

      <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
        <h2 className="text-sm font-medium sm:col-span-2">Terms</h2>
        <FormField id="qs-defaultValidityDays" label="Default validity (days)" error={errors.defaultValidityDays}>
          <Input id="qs-defaultValidityDays" type="number" min={1} value={values.defaultValidityDays} readOnly={!canEdit} onChange={set("defaultValidityDays")} />
        </FormField>
        {text("termsUrl", "General terms link")}
        {area("termsText", "Default terms text", 4)}
      </div>

      <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
        <h2 className="text-sm font-medium sm:col-span-2">Email</h2>
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Placeholders: {EMAIL_PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ")}. The Owner can still change the subject and message before sending.
        </p>
        {text("emailSubject", "Email subject", true)}
        {area("emailMessage", "Email message", 8)}
      </div>

      {save.isError && Object.keys(errors).length === 0 && <FormAlert error={save.error} />}
      {save.isSuccess && <p role="status" className="text-sm text-muted-foreground">Quote settings saved.</p>}
      {canEdit ? (
        <Button type="submit" disabled={save.isPending}>
          Save settings
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Only a Catalogue manager changes Quote settings.</p>
      )}
    </form>
  )
}
