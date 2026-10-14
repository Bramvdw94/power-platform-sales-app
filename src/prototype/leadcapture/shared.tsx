/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): pieces the three variants share.

import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { Flame, Hand, Loader2, Moon, Plus, ShieldCheck, Snowflake, Sparkles, Sun, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { cn } from "@/lib/utils"
import {
  COND_FIELDS, COND_OPS, PEOPLE, RATING_LABELS, fmtDate, firstName, isAway, personName, submitWebLead, uid, useProto,
  type Cond, type CondField, type CondOp, type Entry, type Rating, type RatingInfo, type Target, type WebLeadValues,
} from "./model"

// ---- Rating ----
export const RATING_TONE: Record<Rating, string> = {
  hot: "border-red-300 bg-red-100 text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
  warm: "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  cold: "border-sky-300 bg-sky-100 text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
}
export const RATING_ICON: Record<Rating, typeof Flame> = { hot: Flame, warm: Sun, cold: Snowflake }
export const NO_RATING_TONE = "border-dashed text-muted-foreground"

export function RatingChip({ info, className, hideSource }: { info: RatingInfo; className?: string; hideSource?: boolean }) {
  if (!info.rating) return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", NO_RATING_TONE, className)}>No Rating</span>
  const Icon = RATING_ICON[info.rating]
  const SrcIcon = info.source === "hand" ? Hand : Sparkles
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", RATING_TONE[info.rating], className)}>
      <Icon className="size-3" aria-hidden />
      {RATING_LABELS[info.rating]}
      {!hideSource && (
        <>
          <SrcIcon className="size-3 opacity-70" aria-hidden />
          <span className="sr-only">{info.source === "hand" ? "set by hand" : "set by the Lead score rule"}</span>
        </>
      )}
    </span>
  )
}
export const sourceText = (info: RatingInfo) =>
  info.source === "hand"
    ? `Set by hand by ${info.by ?? "the Owner"}${info.on ? ` on ${fmtDate(info.on.slice(0, 10))}` : ""}`
    : info.score != null
      ? `Set by the Decision rule "Lead score" (Score ${info.score})`
      : "Not scored yet"

// ---- Away ----
export function AwayTag({ id, className }: { id: string; className?: string }) {
  const s = useProto()
  if (!isAway(id, s)) return null
  const until = s.away[id]?.returnOn
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground", className)}>
      <Moon className="size-3" aria-hidden />
      Away{until ? ` until ${fmtDate(until)}` : ""}
    </span>
  )
}

export function Avatar({ id, size = 8, className }: { id: string; size?: 6 | 8 | 10; className?: string }) {
  const s = useProto()
  const away = isAway(id, s)
  const ini = personName(id).split(" ").map((p) => p[0]).join("").slice(0, 2)
  return (
    <span
      title={personName(id) + (away ? " (Away)" : "")}
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground", size === 6 ? "size-6" : size === 10 ? "size-10" : "size-8", away && "bg-muted text-foreground ring-1 ring-border", className)}
    >
      {ini}
      {away && <Moon className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-background p-0.5 text-foreground" aria-hidden />}
    </span>
  )
}

// ---- Conditions and targets (shared editors) ----
export function CondRows({ entry, onChange, className }: { entry: Entry; onChange: (e: Entry) => void; className?: string }) {
  const upd = (id: string, patch: Partial<Cond>) => onChange({ ...entry, conds: entry.conds.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  return (
    <div className={cn("space-y-2", className)}>
      {entry.conds.length > 1 && (
        <p className="flex items-center gap-2 text-sm">
          Match
          <NativeSelect aria-label="Match all or any" className="w-24" value={entry.mode} onChange={(e) => onChange({ ...entry, mode: e.target.value as Entry["mode"] })}>
            <option value="all">all</option>
            <option value="any">any</option>
          </NativeSelect>
          of these
        </p>
      )}
      {entry.conds.map((c, i) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label={`Condition ${i + 1} field`} className="w-32" value={c.field} onChange={(e) => upd(c.id, { field: e.target.value as CondField })}>
            {COND_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </NativeSelect>
          <NativeSelect aria-label={`Condition ${i + 1} operator`} className="w-32" value={c.op} onChange={(e) => upd(c.id, { op: e.target.value as CondOp })}>
            {COND_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
          {c.op !== "isBlank" && (
            <Input aria-label={`Condition ${i + 1} value`} className="min-w-32 flex-1" value={c.value} placeholder="value" onChange={(e) => upd(c.id, { value: e.target.value })} />
          )}
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove condition ${i + 1}`} disabled={entry.conds.length === 1} onClick={() => onChange({ ...entry, conds: entry.conds.filter((x) => x.id !== c.id) })}>
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...entry, conds: [...entry.conds, { id: uid("c"), field: "email", op: "contains", value: "" }] })}>
        <Plus aria-hidden /> Add condition
      </Button>
    </div>
  )
}

export function TargetEditor({ target, onChange }: { target: Target; onChange: (t: Target) => void }) {
  const s = useProto()
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Assign to" className="inline-flex rounded-md border p-0.5 text-sm">
        {(["person", "robin"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={target.kind === k}
            onClick={() => onChange(k === "person" ? { kind: "person", userId: target.kind === "person" ? target.userId : target.userIds[0] ?? "user-adele" } : { kind: "robin", userIds: target.kind === "robin" ? target.userIds : [target.userId] })}
            className={cn("rounded px-3 py-1", target.kind === k ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted")}
          >
            {k === "person" ? "One person" : "Round robin"}
          </button>
        ))}
      </div>
      {target.kind === "person" ? (
        <NativeSelect aria-label="Salesperson" className="max-w-64" value={target.userId} onChange={(e) => onChange({ kind: "person", userId: e.target.value })}>
          {PEOPLE.map((p) => <option key={p.id} value={p.id}>{p.name}{isAway(p.id, s) ? " (Away)" : ""}</option>)}
        </NativeSelect>
      ) : (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm text-muted-foreground">Take turns between</legend>
          {PEOPLE.map((p) => {
            const on = target.userIds.includes(p.id)
            return (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={on} onCheckedChange={(c) => onChange({ kind: "robin", userIds: c ? [...target.userIds, p.id] : target.userIds.filter((x) => x !== p.id) })} />
                {p.name}
                <AwayTag id={p.id} />
              </label>
            )
          })}
        </fieldset>
      )}
    </div>
  )
}

export function condText(c: Cond): string {
  const f = COND_FIELDS.find((x) => x.value === c.field)?.label ?? c.field
  const o = COND_OPS.find((x) => x.value === c.op)?.label ?? c.op
  return c.op === "isBlank" ? `${f} ${o}` : `${f} ${o} "${c.value || "…"}"`
}
export function targetText(t: Target): string {
  return t.kind === "person" ? personName(t.userId) : `Round robin: ${t.userIds.map(firstName).join(", ") || "nobody yet"}`
}

export function RecentWebLeads({ className }: { className?: string }) {
  const s = useProto()
  return (
    <section className={cn("space-y-2", className)} aria-label="Recent web Leads">
      <h3 className="text-sm font-semibold">Recent web Leads</h3>
      <ul className="divide-y rounded-md border text-sm">
        {s.recent.slice(0, 5).map((w) => (
          <li key={w.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
            <span className="font-medium">{w.name}</span>
            <span className="text-muted-foreground">{w.company}</span>
            <span className="ml-auto">→ {personName(w.ownerId)}</span>
            <span className="basis-full text-xs text-muted-foreground">{w.how}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---- The public form ----
export const EMPTY: WebLeadValues = { firstName: "", lastName: "", email: "", company: "", phone: "", jobTitle: "", message: "" }
export type FormApi = ReturnType<typeof useWebForm>

export function useWebForm() {
  const [v, setV] = useState<WebLeadValues>(EMPTY)
  const [consent, setConsent] = useState(false)
  const [human, setHuman] = useState<"idle" | "checking" | "passed">("idle")
  const [honey, setHoney] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)
  const [sending, setSending] = useState(false)

  const check = (keys: string[]): Record<string, string> => {
    const e: Record<string, string> = {}
    if (keys.includes("lastName") && !v.lastName.trim()) e.lastName = "Enter your last name."
    if (keys.includes("email")) {
      if (!v.email.trim()) e.email = "Enter your email address."
      else if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) e.email = "That doesn't look like an email address."
    }
    if (keys.includes("company") && !v.company.trim()) e.company = "Enter your company."
    if (keys.includes("message") && !v.message.trim()) e.message = "Tell us what you need."
    if (keys.includes("consent") && !consent) e.consent = "Please agree to the privacy statement to send the form."
    if (keys.includes("human") && human !== "passed") e.human = "Please confirm you are not a robot."
    return e
  }
  const ALL = ["lastName", "email", "company", "message", "consent", "human"]
  const verify = () => {
    if (human !== "idle") return
    setHuman("checking")
    setTimeout(() => { setHuman("passed"); setErrors((e) => { const { human: _h, ...rest } = e; return rest }) }, 800)
  }
  const validate = (keys: string[] = ALL) => {
    const e = check(keys)
    setErrors((old) => ({ ...Object.fromEntries(Object.entries(old).filter(([k]) => !keys.includes(k))), ...e }))
    return Object.keys(e).length === 0
  }
  const submit = () => {
    if (!validate()) return false
    setSending(true)
    setTimeout(() => {
      // A filled honeypot gets the same thank-you but nothing is saved.
      if (!honey) submitWebLead(v)
      setSending(false)
      setDone(true)
    }, 600)
    return true
  }
  const reset = () => { setV(EMPTY); setConsent(false); setHuman("idle"); setErrors({}); setDone(false) }
  return { v, set: (k: keyof WebLeadValues) => (value: string) => { setV((o) => ({ ...o, [k]: value })); setErrors((e) => { const { [k]: _x, ...rest } = e; return rest }) }, consent, setConsent: (c: boolean) => { setConsent(c); if (c) setErrors((e) => { const { consent: _c, ...rest } = e; return rest }) }, human, verify, honey, setHoney, errors, validate, submit, done, sending, reset }
}

export function Field({ id, label, required, error, hint, children, className }: { id: string; label: string; required?: boolean; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span aria-hidden className="text-destructive"> *</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export const fieldProps = (id: string, error?: string, hint?: string) => ({
  id,
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error ? `${id}-err` : hint ? `${id}-hint` : undefined,
})

export function Turnstile({ f, className }: { f: FormApi; className?: string }) {
  return (
    <div className={className}>
      <div className="flex w-full max-w-72 items-center gap-3 rounded-md border bg-muted/40 px-3 py-3 text-sm">
        <button
          type="button"
          role="checkbox"
          aria-checked={f.human === "passed"}
          aria-label="Verify you are human"
          onClick={f.verify}
          className="flex size-6 shrink-0 items-center justify-center rounded border-2 border-foreground/50 bg-background"
        >
          {f.human === "checking" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : f.human === "passed" ? <ShieldCheck className="size-4 text-green-700 dark:text-green-400" aria-hidden /> : null}
        </button>
        <span>{f.human === "passed" ? "Verified" : f.human === "checking" ? "Verifying…" : "Verify you are human"}</span>
        <span className="ml-auto text-[10px] leading-tight text-muted-foreground">Cloudflare<br />Turnstile</span>
      </div>
      {f.errors.human && <p role="alert" className="mt-1.5 text-sm text-destructive">{f.errors.human}</p>}
    </div>
  )
}

export function Honeypot({ f }: { f: FormApi }) {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>Leave this empty<input tabIndex={-1} autoComplete="off" name="website" value={f.honey} onChange={(e) => f.setHoney(e.target.value)} /></label>
    </div>
  )
}

export function ConsentRow({ f, id = "consent" }: { f: FormApi; id?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <Checkbox id={id} checked={f.consent} onCheckedChange={(c) => f.setConsent(c === true)} aria-invalid={f.errors.consent ? true : undefined} aria-describedby={f.errors.consent ? `${id}-err` : undefined} className="mt-0.5" />
        <label htmlFor={id} className="text-sm">
          I agree that Contoso Advisory stores my details to answer this request, as described in the{" "}
          <a href="#privacy" className="underline underline-offset-2">privacy statement</a>.
        </label>
      </div>
      {f.errors.consent && <p id={`${id}-err`} role="alert" className="text-sm text-destructive">{f.errors.consent}</p>}
    </div>
  )
}

/** The customer's own plain page around the form (not part of the app). */
export function CompanyPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <p className="bg-zinc-900 px-4 py-1.5 text-center text-xs text-zinc-100">
        Prototype: this is the company's own website, not the app.{" "}
        <Link to="/automation?tab=assignment" className="underline underline-offset-2">Open the Assignment rule in the app</Link>
      </p>
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
          <span className="text-lg font-bold tracking-tight">Contoso Advisory</span>
          <nav aria-label="Company" className="ml-auto flex gap-5 text-sm text-muted-foreground">
            <a href="#services" className="hover:text-foreground">Services</a>
            <a href="#about" className="hover:text-foreground">About</a>
            <a href="#contact" className="font-medium text-foreground">Contact</a>
          </nav>
        </div>
      </header>
      <main id="contact" className="mx-auto max-w-5xl px-4 pt-8 pb-24 md:pt-12">{children}</main>
      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground" id="privacy">
        © Contoso Advisory · Privacy statement · Chamber of Commerce 12345678
      </footer>
    </div>
  )
}
