// PROTOTYPE (throwaway, never merge): variant C, "Always editable with a test bench": popup form, rules edited in place with a live "Try a web Lead" panel.

import { useState } from "react"
import { ArrowDown, ArrowUp, Check, CheckCircle2, CircleSlash, Moon, Plus, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/shell/user-badge"
import { useCurrentUser } from "@/hooks/use-current-user"
import { cn } from "@/lib/utils"
import { AwayForm } from "./away-form"
import {
  BANDS, PEOPLE, RATINGS, RATING_LABELS, assign, canSetAway, discardRule, fmtDate, isAway, moveEntry, newEntry, personName, plusDays, publishRule, ratingFromScore, ratingOf, removeEntry, resetRating, ruleDirty, saveEntry, setAway, setRating, setRule, useProto, type Rating, type RatingInfo, type WebLeadValues,
} from "./model"
import { AwayTag, CompanyPage, CondRows, ConsentRow, EMPTY, Field, Honeypot, RATING_TONE, RecentWebLeads, TargetEditor, Turnstile, fieldProps, sourceText, useWebForm } from "./shared"
import type { Variant } from "./types"

function WebForm() {
  const f = useWebForm()
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState<1 | 2>(1)
  const [sent, setSent] = useState(false)
  const next = () => { if (f.validate(["lastName", "email", "company"])) setStep(2) }
  const send = () => { if (f.submit()) setTimeout(() => setSent(true), 700) }
  return (
    <CompanyPage>
      <div className="mx-auto max-w-2xl py-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Questions about your sales tools?</h1>
        <p className="mt-3 text-lg text-muted-foreground">Our advisers help you pick, set up and run them. Say hello and we will get back to you.</p>
        {sent && <p role="status" className="mt-6 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Check className="size-4 text-green-700 dark:text-green-400" aria-hidden /> Message sent. Thank you.</p>}
        <div className="mt-6"><Button size="lg" onClick={() => { f.reset(); setStep(1); setSent(false); setOpen(true) }}>Contact us</Button></div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          {f.done && sent ? (
            <div role="status" className="space-y-3 py-6 text-center">
              <CheckCircle2 className="mx-auto size-12 text-green-700 dark:text-green-400" aria-hidden />
              <DialogTitle>Thank you</DialogTitle>
              <DialogDescription>Your message is on its way to our team.</DialogDescription>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Contact us</DialogTitle>
                <DialogDescription>Step {step} of 2 · {step === 1 ? "About you" : "Your message"}</DialogDescription>
              </DialogHeader>
              <div aria-hidden className="flex gap-1.5"><div className="h-1 flex-1 rounded bg-primary" /><div className={cn("h-1 flex-1 rounded", step === 2 ? "bg-primary" : "bg-muted")} /></div>
              <form noValidate className="relative space-y-4" onSubmit={(e) => { e.preventDefault(); step === 1 ? next() : send() }}>
                <Honeypot f={f} />
                {step === 1 ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field id="c-first" label="First name"><Input {...fieldProps("c-first")} value={f.v.firstName} onChange={(e) => f.set("firstName")(e.target.value)} /></Field>
                      <Field id="c-last" label="Last name" required error={f.errors.lastName}><Input {...fieldProps("c-last", f.errors.lastName)} value={f.v.lastName} onChange={(e) => f.set("lastName")(e.target.value)} /></Field>
                    </div>
                    <Field id="c-email" label="Email" required error={f.errors.email}><Input {...fieldProps("c-email", f.errors.email)} type="email" value={f.v.email} onChange={(e) => f.set("email")(e.target.value)} /></Field>
                    <Field id="c-company" label="Company" required error={f.errors.company}><Input {...fieldProps("c-company", f.errors.company)} value={f.v.company} onChange={(e) => f.set("company")(e.target.value)} /></Field>
                    <Button type="submit" className="w-full">Next</Button>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field id="c-phone" label="Phone"><Input {...fieldProps("c-phone")} type="tel" value={f.v.phone} onChange={(e) => f.set("phone")(e.target.value)} /></Field>
                      <Field id="c-job" label="Job title"><Input {...fieldProps("c-job")} value={f.v.jobTitle} onChange={(e) => f.set("jobTitle")(e.target.value)} /></Field>
                    </div>
                    <Field id="c-msg" label="Message" required error={f.errors.message}><Textarea {...fieldProps("c-msg", f.errors.message)} rows={3} value={f.v.message} onChange={(e) => f.set("message")(e.target.value)} /></Field>
                    <ConsentRow f={f} id="c-consent" />
                    <Turnstile f={f} />
                    <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setStep(1)}>Back</Button><Button type="submit" className="flex-1" disabled={f.sending}>{f.sending ? "Sending…" : "Send"}</Button></div>
                  </>
                )}
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </CompanyPage>
  )
}

function TryPanel() {
  const s = useProto()
  const [v, setV] = useState<WebLeadValues>({ ...EMPTY, email: "eva@jansen.nl", company: "Jansen BV", jobTitle: "Operations Director", message: "We would like a demo." })
  const a = assign(s.rule, v, s)
  const fields: [keyof WebLeadValues, string][] = [["email", "Email"], ["company", "Company"], ["jobTitle", "Job title"], ["message", "Message"]]
  return (
    <section aria-label="Try a web Lead" className="space-y-3 rounded-lg border bg-card p-4">
      <div><h3 className="font-semibold">Try a web Lead</h3><p className="text-sm text-muted-foreground">Type what a visitor might enter. Nothing is saved and the round robin does not move.</p></div>
      {fields.map(([k, label]) => (
        <div key={k} className="space-y-1"><label htmlFor={`c-try-${k}`} className="text-sm">{label}</label><Input id={`c-try-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
      ))}
      <ol className="space-y-1.5 text-sm" aria-label="How the rule goes through it">
        {a.trace.map((t, i) => (
          <li key={i} className={cn("flex items-start gap-2 rounded-md px-2 py-1", t.status === "assigned" || t.status === "fallback" ? "bg-green-100 text-green-950 dark:bg-green-950 dark:text-green-100" : t.status === "away" ? "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100" : "text-muted-foreground")}>
            {t.status === "no-match" ? <CircleSlash className="mt-0.5 size-4 shrink-0" aria-hidden /> : t.status === "away" ? <Moon className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Check className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span>{t.text}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm font-medium">Goes to {personName(a.ownerId)}</p>
    </section>
  )
}

function AvailabilityList({ meId }: { meId: string }) {
  const s = useProto()
  return (
    <section aria-label="Availability" className="space-y-1 rounded-lg border bg-card p-4">
      <h3 className="font-semibold">Who is Away</h3>
      <ul className="divide-y">
        {PEOPLE.map((p) => {
          const can = canSetAway(meId, p.id)
          const on = isAway(p.id, s)
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-0 flex-1">{p.name}</span>
              <Input type="date" aria-label={`${p.name} back on`} min={plusDays(1)} disabled={!can || !on} className="h-8 w-36" value={on ? s.away[p.id]?.returnOn ?? "" : ""} onChange={(e) => setAway(p.id, { away: true, returnOn: e.target.value || undefined, setBy: meId })} />
              <Switch aria-label={`${p.name} is Away`} checked={on} disabled={!can} onCheckedChange={(c) => setAway(p.id, { away: c, returnOn: c ? s.away[p.id]?.returnOn : undefined, setBy: meId })} />
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Only the person and their manager can change this. Away skips the person in round robin and in entries that name only them.</p>
    </section>
  )
}

function AssignmentTab() {
  const s = useProto()
  const me = useCurrentUser().data?.user
  const dirty = ruleDirty(s)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-64 flex-1">
          <h2 className="text-lg font-semibold">Assignment rule</h2>
          <p className="text-sm text-muted-foreground">Every entry stays open for editing. Use the test panel to see where a web Lead would land. <Link to="/prototype/web-form" className="text-primary underline underline-offset-2">Open the public web form</Link></p>
        </div>
        <Button variant="outline" disabled={!dirty} onClick={discardRule}>Discard</Button>
        <Button disabled={!dirty} onClick={publishRule}>{dirty ? "Publish changes" : "Published"}</Button>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          {s.rule.entries.map((e, i) => (
            <section key={e.id} aria-label={`Entry ${i + 1}`} className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm font-semibold">Entry {i + 1}</span>
                <span className="ml-auto" />
                <Button variant="ghost" size="icon" aria-label={`Move entry ${i + 1} up`} disabled={i === 0} onClick={() => moveEntry(e.id, -1)}><ArrowUp aria-hidden /></Button>
                <Button variant="ghost" size="icon" aria-label={`Move entry ${i + 1} down`} disabled={i === s.rule.entries.length - 1} onClick={() => moveEntry(e.id, 1)}><ArrowDown aria-hidden /></Button>
                <Button variant="ghost" size="icon" aria-label={`Delete entry ${i + 1}`} onClick={() => removeEntry(e.id)}><Trash2 aria-hidden /></Button>
              </div>
              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div><h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">When</h3><CondRows entry={e} onChange={saveEntry} /></div>
                <div><h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Give it to</h3><TargetEditor target={e.target} onChange={(target) => saveEntry({ ...e, target })} /></div>
              </div>
            </section>
          ))}
          <Button variant="outline" onClick={() => saveEntry(newEntry())}><Plus aria-hidden /> Add entry</Button>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
            <label htmlFor="c-fallback" className="text-sm font-medium">If no entry gives it to anyone, the Fallback Owner is</label>
            <NativeSelect id="c-fallback" className="w-48" value={s.rule.fallbackId} onChange={(e) => setRule({ ...s.rule, fallbackId: e.target.value })}>
              {PEOPLE.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
            <AwayTag id={s.rule.fallbackId} />
          </div>
          <RecentWebLeads />
        </div>
        <div className="space-y-4 lg:sticky lg:top-4">
          <TryPanel />
          {me && <AvailabilityList meId={me.id} />}
        </div>
      </div>
    </div>
  )
}

function UserAway({ user }: { user: import("@/sales").User }) {
  const s = useProto()
  const away = isAway(user.id, s)
  const presets: [string, string | undefined][] = [["Until tomorrow", plusDays(1)], ["For a week", plusDays(7)], ["No end date", undefined]]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${user.fullName}${away ? ", Away" : ""}. Open availability`} className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-muted">
          <UserAvatar user={user} />
          <span className="hidden text-sm font-medium md:inline">{user.fullName}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold">Going away?</p>
          <div className="flex flex-wrap gap-2">{presets.map(([label, d]) => <Button key={label} size="sm" variant="outline" onClick={() => setAway(user.id, { away: true, returnOn: d, setBy: user.id })}>{label}</Button>)}</div>
        </div>
        <AwayForm userId={user.id} meId={user.id} idPrefix="c-me" />
      </PopoverContent>
    </Popover>
  )
}

function AwayBanner({ user }: { user: import("@/sales").User }) {
  const s = useProto()
  if (!isAway(user.id, s)) return null
  const until = s.away[user.id]?.returnOn
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <Moon className="size-4" aria-hidden />
      <span>You are Away. New web Leads skip you{until ? ` until ${fmtDate(until)}` : ""}.</span>
      <Button size="sm" variant="outline" className="ml-auto h-7 bg-transparent" onClick={() => setAway(user.id, { away: false })}>I'm back</Button>
    </div>
  )
}

function RatingColumn({ info }: { info: RatingInfo }) {
  if (!info.rating) return <span className="text-sm text-muted-foreground">–</span>
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span aria-hidden className={cn("size-2.5 rounded-full border", RATING_TONE[info.rating])} />
      {RATING_LABELS[info.rating]}
      {info.source === "hand" && <span className="rounded border px-1 text-[11px] text-muted-foreground">by hand</span>}
      {info.score != null && <span className="text-xs text-muted-foreground tabular-nums">{info.score}</span>}
    </span>
  )
}

function SavedViews({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts: Record<string, number> }) {
  const items = [["all", "All Leads"], ["hot", "Hot"], ["warm", "Warm"], ["cold", "Cold"], ["none", "No Rating"]] as const
  return (
    <div role="group" aria-label="Saved views" className="flex flex-wrap gap-x-5 border-b">
      {items.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)} className={cn("-mb-px border-b-2 px-1 pb-2 text-sm", value === k ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {label} <span className="tabular-nums">({counts[k] ?? 0})</span>
        </button>
      ))}
    </div>
  )
}

const TOTAL = 100
function RatingPanel({ lead, canEdit }: { lead: { id: string; lastName: string }; canEdit: boolean }) {
  const s = useProto()
  const me = useCurrentUser().data?.user
  const info = ratingOf(s, lead)
  const ruleSays = info.score != null ? ratingFromScore(info.score) : null
  const [open, setOpen] = useState(false)
  return (
    <section role="region" aria-label="Rating" className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Rating</h2>
        {info.rating ? <span className={cn("rounded-full border px-2.5 py-0.5 text-sm font-medium", RATING_TONE[info.rating])}>{RATING_LABELS[info.rating]}</span> : <span className="text-sm text-muted-foreground">No Rating</span>}
        {canEdit && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild><Button variant="outline" size="sm" className="ml-auto">Override</Button></PopoverTrigger>
            <PopoverContent align="end" className="w-56 space-y-2">
              <p className="text-sm font-semibold">Set the Rating yourself</p>
              <div className="flex flex-col gap-1">
                {([...RATINGS, null] as (Rating | null)[]).map((r) => <Button key={r ?? "none"} variant={info.rating === r ? "secondary" : "ghost"} className="justify-start" onClick={() => { setRating(lead, r, me?.fullName ?? "you"); setOpen(false) }}>{r ? RATING_LABELS[r] : "No Rating"}</Button>)}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {info.score != null ? (
        <div className="mt-4">
          <div className="relative h-3 overflow-hidden rounded-full" role="img" aria-label={`Score ${info.score} of 100. Cold below ${BANDS.warm}, Warm ${BANDS.warm} to ${BANDS.hot - 1}, Hot ${BANDS.hot} and up.`}>
            <div className="absolute inset-y-0 left-0 bg-sky-300 dark:bg-sky-800" style={{ width: `${BANDS.warm}%` }} />
            <div className="absolute inset-y-0 bg-amber-300 dark:bg-amber-800" style={{ left: `${BANDS.warm}%`, width: `${BANDS.hot - BANDS.warm}%` }} />
            <div className="absolute inset-y-0 right-0 bg-red-300 dark:bg-red-800" style={{ left: `${BANDS.hot}%` }} />
          </div>
          <div className="relative h-4" aria-hidden><span className="absolute -top-1 size-2.5 -translate-x-1/2 rotate-45 border-t border-l bg-foreground" style={{ left: `${(info.score / TOTAL) * 100}%` }} /></div>
          <div className="flex justify-between text-xs text-muted-foreground" aria-hidden><span>Cold</span><span>Warm from {BANDS.warm}</span><span>Hot from {BANDS.hot}</span></div>
          <p className="mt-2 text-sm">Score <strong>{info.score}</strong> → the rule says <strong>{ruleSays ? RATING_LABELS[ruleSays] : "?"}</strong></p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">The Decision rule "Lead score" has not scored this Lead yet.</p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        {sourceText(info)}
        {info.source === "hand" && ruleSays && canEdit && <Button variant="link" className="h-auto p-0" onClick={() => resetRating(lead)}>Reset to the rule</Button>}
      </p>
    </section>
  )
}

export const variantC: Variant = {
  name: "Test bench",
  WebForm,
  AssignmentTab,
  UserAway,
  AwayBanner,
  RatingColumn,
  SavedViews,
  RatingPanel,
}
