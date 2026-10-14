// PROTOTYPE (throwaway, never merge): variant B, "Cards and inline editing": rules as connected cards, Away on the people.

import { useState } from "react"
import { ArrowDown, ArrowRight, ArrowUp, CheckCircle2, Moon, Pencil, Plus, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/shell/user-badge"
import { useCurrentUser } from "@/hooks/use-current-user"
import { cn } from "@/lib/utils"
import { AwayForm } from "./away-form"
import {
  PEOPLE, RATINGS, RATING_LABELS, discardRule, fmtDate, isAway, moveEntry, newEntry, personName, publishRule, ratingFromScore, ratingOf, removeEntry, resetRating, ruleDirty, saveEntry, setRating, setRule, useProto, type Entry, type Rating,
} from "./model"
import { AwayTag, CompanyPage, CondRows, ConsentRow, Field, Honeypot, RATING_ICON, RATING_TONE, RecentWebLeads, TargetEditor, Turnstile, condText, fieldProps, useWebForm } from "./shared"
import type { Variant } from "./types"

function WebForm() {
  const f = useWebForm()
  const required = [f.v.lastName, f.v.email, f.v.company, f.v.message].filter((x) => x.trim()).length + (f.consent ? 1 : 0)
  const errs = Object.entries(f.errors)
  const link: Record<string, string> = { lastName: "b-last", email: "b-email", company: "b-company", message: "b-msg", consent: "b-consent", human: "b-human" }
  return (
    <CompanyPage>
      <div className="grid gap-10 md:grid-cols-[1fr_1.15fr]">
        <div className="space-y-5">
          <h1 className="text-4xl font-bold tracking-tight">Let's talk about your sales process</h1>
          <p className="text-lg text-muted-foreground">Leave your details and we will call you back. Most requests are answered the same day.</p>
          <ul className="space-y-2 text-sm">
            <li>✓ No obligation, no sales pitch</li>
            <li>✓ A real person replies, not a bot</li>
            <li>✓ Your details are only used to answer you</li>
          </ul>
          <p className="text-sm text-muted-foreground">Prefer to write? <a className="underline" href="mailto:hello@contoso-advisory.example">hello@contoso-advisory.example</a></p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm md:p-6">
          {f.done ? (
            <div role="status" className="space-y-3 py-6 text-center">
              <CheckCircle2 className="mx-auto size-12 text-green-700 dark:text-green-400" aria-hidden />
              <h2 className="text-2xl font-semibold">Message sent</h2>
              <p className="text-muted-foreground">Thanks{f.v.firstName ? `, ${f.v.firstName}` : ""}. We will reply to <strong className="text-foreground">{f.v.email}</strong>.</p>
              <Button variant="outline" onClick={f.reset}>Write another</Button>
            </div>
          ) : (
            <form noValidate className="relative space-y-5" onSubmit={(e) => { e.preventDefault(); f.submit() }}>
              <Honeypot f={f} />
              <div aria-hidden className="h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${(required / 5) * 100}%` }} /></div>
              {errs.length > 0 && (
                <div role="alert" className="rounded-md border border-destructive/60 bg-destructive/10 p-3 text-sm">
                  <p className="font-medium">{errs.length} thing{errs.length > 1 ? "s" : ""} to fix</p>
                  <ul className="ml-4 list-disc">{errs.map(([k, m]) => <li key={k}><a className="underline" href={`#${link[k]}`}>{m}</a></li>)}</ul>
                </div>
              )}
              <fieldset className="space-y-3"><legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">You</legend>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="b-first" label="First name"><Input {...fieldProps("b-first")} value={f.v.firstName} onChange={(e) => f.set("firstName")(e.target.value)} /></Field>
                  <Field id="b-last" label="Last name" required error={f.errors.lastName}><Input {...fieldProps("b-last", f.errors.lastName)} value={f.v.lastName} onChange={(e) => f.set("lastName")(e.target.value)} /></Field>
                </div>
                <Field id="b-email" label="Email" required error={f.errors.email}><Input {...fieldProps("b-email", f.errors.email)} type="email" value={f.v.email} onChange={(e) => f.set("email")(e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="b-phone" label="Phone"><Input {...fieldProps("b-phone")} type="tel" value={f.v.phone} onChange={(e) => f.set("phone")(e.target.value)} /></Field>
                  <Field id="b-job" label="Job title"><Input {...fieldProps("b-job")} value={f.v.jobTitle} onChange={(e) => f.set("jobTitle")(e.target.value)} /></Field>
                </div>
              </fieldset>
              <fieldset className="space-y-3"><legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your company</legend>
                <Field id="b-company" label="Company" required error={f.errors.company}><Input {...fieldProps("b-company", f.errors.company)} value={f.v.company} onChange={(e) => f.set("company")(e.target.value)} /></Field>
                <Field id="b-msg" label="How can we help?" required error={f.errors.message}><Textarea {...fieldProps("b-msg", f.errors.message)} rows={3} value={f.v.message} onChange={(e) => f.set("message")(e.target.value)} /></Field>
              </fieldset>
              <ConsentRow f={f} id="b-consent" />
              <div id="b-human"><Turnstile f={f} /></div>
              <Button type="submit" size="lg" className="w-full" disabled={f.sending}>{f.sending ? "Sending…" : "Send"}</Button>
            </form>
          )}
        </div>
      </div>
    </CompanyPage>
  )
}

function PersonChip({ id, meId }: { id: string; meId: string }) {
  const away = isAway(id, useProto())
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${personName(id)}${away ? ", Away" : ""}. Change Away`} className={cn("inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-sm hover:bg-muted", away && "text-muted-foreground")}>
          <span className={cn("relative inline-flex size-6 items-center justify-center rounded-full text-[11px] font-medium", away ? "bg-muted text-foreground ring-1 ring-border" : "bg-primary text-primary-foreground")}>{personName(id).split(" ").map((p) => p[0]).join("")}</span>
          <span className={cn(away && "line-through decoration-muted-foreground/60")}>{personName(id).split(" ")[0]}</span>
          {away && <Moon className="size-3.5" aria-hidden />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72"><p className="mb-3 text-sm font-semibold">{personName(id)}</p><AwayForm userId={id} meId={meId} idPrefix="b-chip" /></PopoverContent>
    </Popover>
  )
}

function EntryCard({ e, i, last, meId }: { e: Entry; i: number; last: boolean; meId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="relative">
      <div className="flex gap-3 rounded-lg border bg-card p-3 shadow-xs md:p-4">
        <div className="flex flex-col items-center gap-1">
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Move entry ${i + 1} up`} disabled={i === 0} onClick={() => moveEntry(e.id, -1)}><ArrowUp aria-hidden /></Button>
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>{i + 1}</span>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Move entry ${i + 1} down`} disabled={last} onClick={() => moveEntry(e.id, 1)}><ArrowDown aria-hidden /></Button>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs font-semibold text-muted-foreground uppercase">If</span>
                {e.conds.map((c, k) => (<span key={c.id} className="inline-flex items-center gap-1.5">{k > 0 && <span className="text-xs text-muted-foreground uppercase">{e.mode === "all" ? "and" : "or"}</span>}<span className="rounded-md bg-muted px-2 py-0.5 text-sm">{condText(c)}</span></span>))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs font-semibold text-muted-foreground uppercase">Then</span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                {e.target.kind === "robin" && <span className="text-sm text-muted-foreground">take turns:</span>}
                {(e.target.kind === "person" ? [e.target.userId] : e.target.userIds).map((id) => <PersonChip key={id} id={id} meId={meId} />)}
              </div>
            </div>
            <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}><Pencil aria-hidden /> {open ? "Done" : "Edit"}</Button>
          </div>
          {open && (
            <div className="grid gap-5 border-t pt-3 md:grid-cols-2">
              <div><h3 className="mb-2 text-sm font-semibold">Condition</h3><CondRows entry={e} onChange={saveEntry} /></div>
              <div className="space-y-3"><h3 className="text-sm font-semibold">Assign to</h3><TargetEditor target={e.target} onChange={(target) => saveEntry({ ...e, target })} />
                <Button variant="ghost" size="sm" onClick={() => removeEntry(e.id)}><Trash2 aria-hidden /> Delete entry</Button></div>
            </div>
          )}
        </div>
      </div>
      {!last && <div aria-hidden className="mx-auto h-4 w-px bg-border" />}
    </li>
  )
}

function AssignmentTab() {
  const s = useProto()
  const me = useCurrentUser().data?.user
  const dirty = ruleDirty(s)
  const meId = me?.id ?? ""
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Assignment rule</h2>
        <p className="text-sm text-muted-foreground">New web Leads walk down the cards. The first card that matches takes the Lead. Tap a person to mark them Away.</p>
        <p className="mt-1 text-sm"><Link to="/prototype/web-form" className="text-primary underline underline-offset-2">Open the public web form</Link></p>
      </div>
      <ol className="space-y-0" aria-label="Assignment rule entries">
        {s.rule.entries.map((e, i) => <EntryCard key={e.id} e={e} i={i} last={i === s.rule.entries.length - 1} meId={meId} />)}
      </ol>
      <Button variant="outline" className="w-full border-dashed" onClick={() => saveEntry(newEntry())}><Plus aria-hidden /> Add entry</Button>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 md:p-4">
        <span className="text-xs font-semibold text-muted-foreground uppercase">Nothing matched, or everyone was Away</span>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        <label htmlFor="b-fallback" className="text-sm font-medium">Fallback Owner</label>
        <NativeSelect id="b-fallback" className="w-48" value={s.rule.fallbackId} onChange={(e) => setRule({ ...s.rule, fallbackId: e.target.value })}>
          {PEOPLE.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
        <AwayTag id={s.rule.fallbackId} />
      </div>
      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 shadow-md md:bottom-4">
        <span className="text-sm">{dirty ? "You have unpublished changes. The form still uses the published rule." : `Published ${fmtDate(s.publishedAt.slice(0, 10))}. The form uses this rule.`}</span>
        <Button variant="outline" className="ml-auto" disabled={!dirty} onClick={discardRule}>Discard</Button>
        <Button disabled={!dirty} onClick={publishRule}>Publish</Button>
      </div>
      <RecentWebLeads />
    </div>
  )
}

function UserAway({ user }: { user: import("@/sales").User }) {
  const s = useProto()
  const away = isAway(user.id, s)
  const until = s.away[user.id]?.returnOn
  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label={away ? `Away${until ? ` until ${fmtDate(until)}` : ""}. Change` : "Available. Set Away"} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm", away ? "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" : "text-muted-foreground hover:bg-muted")}>
            <span aria-hidden className={cn("size-2 rounded-full", away ? "bg-amber-600 dark:bg-amber-400" : "bg-green-600 dark:bg-green-400")} />
            <span className="hidden md:inline">{away ? `Away${until ? ` until ${fmtDate(until)}` : ""}` : "Available"}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72"><AwayForm userId={user.id} meId={user.id} idPrefix="b-me" /></PopoverContent>
      </Popover>
      <UserAvatar user={user} />
      <span className="hidden text-sm font-medium md:inline" aria-hidden>{user.fullName}</span>
    </div>
  )
}

function RatingColumn({ info }: { info: import("./model").RatingInfo }) {
  if (!info.rating) return <span className="text-sm text-muted-foreground">–</span>
  const Icon = RATING_ICON[info.rating]
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("inline-flex size-7 items-center justify-center rounded-md border", RATING_TONE[info.rating])}><Icon className="size-4" aria-hidden /></span>
      <span className="text-sm">{RATING_LABELS[info.rating]}</span>
      <span className="text-xs text-muted-foreground">{info.source === "hand" ? "by hand" : "auto"}</span>
    </span>
  )
}

function SavedViews({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts: Record<string, number> }) {
  const items = [["all", "All Leads"], ["hot", "Hot"], ["warm", "Warm"], ["cold", "Cold"], ["none", "No Rating"]] as const
  return (
    <div role="group" aria-label="Saved views" className="flex flex-wrap gap-2">
      {items.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)} className={cn("rounded-full border px-3 py-1 text-sm", value === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {label} <span className={value === k ? "opacity-90" : "text-muted-foreground"}>{counts[k] ?? 0}</span>
        </button>
      ))}
    </div>
  )
}

function RatingPanel({ lead, canEdit }: { lead: { id: string; lastName: string }; canEdit: boolean }) {
  const s = useProto()
  const me = useCurrentUser().data?.user
  const info = ratingOf(s, lead)
  const ruleSays = info.score != null ? ratingFromScore(info.score) : null
  return (
    <section role="region" aria-label="Rating" className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Rating</h2>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs", info.source === "hand" ? "border-violet-300 bg-violet-100 text-violet-950 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100" : "text-muted-foreground")}>{info.source === "hand" ? "Set by hand" : "Automatic"}</span>
      </div>
      <div role="radiogroup" aria-label="Rating" className="mt-3 inline-flex flex-wrap gap-1 rounded-lg border p-1">
        {([...RATINGS, null] as (Rating | null)[]).map((r) => {
          const Icon = r ? RATING_ICON[r] : null
          const on = info.rating === r
          return (
            <button key={r ?? "none"} type="button" role="radio" aria-checked={on} disabled={!canEdit} onClick={() => setRating(lead, r, me?.fullName ?? "you")} className={cn("inline-flex items-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-sm disabled:opacity-60", on ? (r ? RATING_TONE[r] : "border-border bg-muted") + " font-medium" : "hover:bg-muted")}>
              {Icon && <Icon className="size-4" aria-hidden />}{r ? RATING_LABELS[r] : "None"}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {ruleSays ? <>The Decision rule "Lead score" says <strong className="text-foreground">{RATING_LABELS[ruleSays]}</strong> (Score {info.score}).</> : "The Decision rule has not scored this Lead."}
        {info.source === "hand" && <> You changed it{info.by ? <> ({info.by})</> : null}. </>}
        {info.source === "hand" && ruleSays && canEdit && <Button variant="link" className="h-auto p-0" onClick={() => resetRating(lead)}>Go back to the rule's Rating</Button>}
      </p>
    </section>
  )
}

export const variantB: Variant = {
  name: "Cards and inline",
  WebForm,
  AssignmentTab,
  UserAway,
  AwayBanner: () => null,
  RatingColumn,
  SavedViews,
  RatingPanel,
}
