// PROTOTYPE (throwaway, never merge): variant A, "Table and dialogs": ordinary list pages, edits in dialogs.

import { useState } from "react"
import { ArrowDown, ArrowUp, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { RecordSection } from "@/components/records/record-page"
import { UserAvatar } from "@/components/shell/user-badge"
import { useCurrentUser } from "@/hooks/use-current-user"
import { AwayForm } from "./away-form"
import {
  PEOPLE, RATINGS, ratingOf, type RatingInfo, RATING_LABELS, discardRule, fmtDate, isAway, moveEntry, newEntry, personName, publishRule, ratingFromScore, removeEntry, resetRating, ruleDirty, saveEntry, setRating, setRule, useProto, type Entry, type Rating,
} from "./model"
import { Avatar, AwayTag, CompanyPage, CondRows, ConsentRow, Field, Honeypot, RatingChip, RecentWebLeads, TargetEditor, Turnstile, condText, fieldProps, sourceText, useWebForm } from "./shared"
import type { Variant } from "./types"

function WebForm() {
  const f = useWebForm()
  const submit = (e: React.FormEvent) => { e.preventDefault(); f.submit() }
  return (
    <CompanyPage>
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold tracking-tight">Talk to us</h1>
        <p className="mt-2 text-muted-foreground">Tell us a little about your company and what you need. We answer within one working day.</p>
        {f.done ? (
          <div role="status" className="mt-8 rounded-lg border p-6 text-center">
            <CheckCircle2 className="mx-auto size-10 text-green-700 dark:text-green-400" aria-hidden />
            <h2 className="mt-3 text-xl font-semibold">Thank you{f.v.firstName ? `, ${f.v.firstName}` : ""}</h2>
            <p className="mt-1 text-muted-foreground">We received your message and one of our team will be in touch soon.</p>
            <Button variant="outline" className="mt-5" onClick={f.reset}>Send another message</Button>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="relative mt-8 space-y-4">
            <Honeypot f={f} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="a-first" label="First name"><Input {...fieldProps("a-first")} autoComplete="given-name" value={f.v.firstName} onChange={(e) => f.set("firstName")(e.target.value)} /></Field>
              <Field id="a-last" label="Last name" required error={f.errors.lastName}><Input {...fieldProps("a-last", f.errors.lastName)} autoComplete="family-name" value={f.v.lastName} onChange={(e) => f.set("lastName")(e.target.value)} /></Field>
            </div>
            <Field id="a-email" label="Email" required error={f.errors.email}><Input {...fieldProps("a-email", f.errors.email)} type="email" autoComplete="email" value={f.v.email} onChange={(e) => f.set("email")(e.target.value)} /></Field>
            <Field id="a-company" label="Company" required error={f.errors.company}><Input {...fieldProps("a-company", f.errors.company)} autoComplete="organization" value={f.v.company} onChange={(e) => f.set("company")(e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="a-phone" label="Phone"><Input {...fieldProps("a-phone")} type="tel" autoComplete="tel" value={f.v.phone} onChange={(e) => f.set("phone")(e.target.value)} /></Field>
              <Field id="a-job" label="Job title"><Input {...fieldProps("a-job")} autoComplete="organization-title" value={f.v.jobTitle} onChange={(e) => f.set("jobTitle")(e.target.value)} /></Field>
            </div>
            <Field id="a-msg" label="Message" required error={f.errors.message}><Textarea {...fieldProps("a-msg", f.errors.message)} rows={4} value={f.v.message} onChange={(e) => f.set("message")(e.target.value)} /></Field>
            <ConsentRow f={f} id="a-consent" />
            <Turnstile f={f} />
            <Button type="submit" size="lg" disabled={f.sending}>{f.sending ? "Sending…" : "Send message"}</Button>
          </form>
        )}
      </div>
    </CompanyPage>
  )
}

function EntryDialog({ entry, isNew, onClose }: { entry: Entry; isNew: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState(entry)
  const problem = draft.conds.some((c) => c.op !== "isBlank" && !c.value.trim())
    ? "Fill in every condition value."
    : draft.target.kind === "robin" && draft.target.userIds.length === 0
      ? "Pick at least one person for the round robin."
      : ""
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "New entry" : "Edit entry"}</DialogTitle>
          <DialogDescription>When a new web Lead matches the condition, it goes to the target.</DialogDescription>
        </DialogHeader>
        <section className="space-y-2"><h3 className="text-sm font-semibold">Condition</h3><CondRows entry={draft} onChange={setDraft} /></section>
        <section className="space-y-2"><h3 className="text-sm font-semibold">Assign to</h3><TargetEditor target={draft.target} onChange={(target) => setDraft({ ...draft, target })} /></section>
        {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        <DialogFooter className="sm:justify-between">
          {!isNew ? <Button variant="ghost" onClick={() => { removeEntry(entry.id); onClose() }}><Trash2 aria-hidden /> Delete entry</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!!problem} onClick={() => { saveEntry(draft); onClose() }}>Save entry</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AssignmentTab() {
  const s = useProto()
  const me = useCurrentUser().data?.user
  const [editing, setEditing] = useState<{ entry: Entry; isNew: boolean } | null>(null)
  const dirty = ruleDirty(s)
  const rule = s.rule
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-64 flex-1">
          <h2 className="text-lg font-semibold">Assignment rule</h2>
          <p className="text-sm text-muted-foreground">Decides who owns a new web Lead. The first entry that matches wins. Leads made by hand or imported are not touched.</p>
          <p className="mt-1 text-sm"><Link to="/prototype/web-form" className="text-primary underline underline-offset-2">Open the public web form</Link></p>
        </div>
        <span className={dirty ? "rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" : "rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"}>
          {dirty ? "Draft changes" : `Published ${fmtDate(s.publishedAt.slice(0, 10))}`}
        </span>
        <Button variant="outline" disabled={!dirty} onClick={discardRule}>Discard</Button>
        <Button disabled={!dirty} onClick={publishRule}>Publish</Button>
      </div>

      <div className="rounded-md border">
        <Table aria-label="Assignment rule entries">
          <TableHeader>
            <TableRow><TableHead className="w-10">#</TableHead><TableHead>When</TableHead><TableHead>Assign to</TableHead><TableHead className="w-40 text-right"><span className="sr-only">Actions</span></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rule.entries.map((e, i) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{i + 1}</TableCell>
                <TableCell className="whitespace-normal">{e.conds.map(condText).join(e.mode === "all" ? " and " : " or ")}</TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {e.target.kind === "person" ? (<><Avatar id={e.target.userId} size={6} />{personName(e.target.userId)}<AwayTag id={e.target.userId} /></>) : (
                      <><span className="text-muted-foreground">Round robin</span>{e.target.userIds.map((id) => <span key={id} className="inline-flex items-center gap-1"><Avatar id={id} size={6} /><span className="text-sm">{personName(id).split(" ")[0]}</span></span>)}</>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" aria-label={`Move entry ${i + 1} up`} disabled={i === 0} onClick={() => moveEntry(e.id, -1)}><ArrowUp aria-hidden /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Move entry ${i + 1} down`} disabled={i === rule.entries.length - 1} onClick={() => moveEntry(e.id, 1)}><ArrowDown aria-hidden /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Edit entry ${i + 1}`} onClick={() => setEditing({ entry: e, isNew: false })}><Pencil aria-hidden /></Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40">
              <TableCell className="text-muted-foreground">–</TableCell>
              <TableCell className="whitespace-normal">No entry matches</TableCell>
              <TableCell colSpan={2}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Fallback Owner</span>
                  <NativeSelect aria-label="Fallback Owner" className="w-48" value={rule.fallbackId} onChange={(e) => setRule({ ...rule, fallbackId: e.target.value })}>
                    {PEOPLE.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </NativeSelect>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div className="border-t p-2"><Button variant="ghost" size="sm" onClick={() => setEditing({ entry: newEntry(), isNew: true })}><Plus aria-hidden /> Add entry</Button></div>
      </div>

      <section className="space-y-2" aria-label="Team availability">
        <h3 className="text-sm font-semibold">Away</h3>
        <p className="text-sm text-muted-foreground">Away people are skipped by round robin, and entries that name only them are skipped. You can set it for yourself and your team.</p>
        <div className="rounded-md border">
          <Table aria-label="Team availability">
            <TableHeader><TableRow><TableHead>Salesperson</TableHead><TableHead>Status</TableHead><TableHead>Away</TableHead></TableRow></TableHeader>
            <TableBody>
              {PEOPLE.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><span className="inline-flex items-center gap-2"><Avatar id={p.id} size={6} />{p.name}</span></TableCell>
                  <TableCell className="text-muted-foreground">{isAway(p.id, s) ? <AwayTag id={p.id} /> : "Available"}</TableCell>
                  <TableCell>{me && <AwayForm userId={p.id} meId={me.id} idPrefix="a-team" compact />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <RecentWebLeads />
      {editing && <EntryDialog entry={editing.entry} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  )
}

function UserAway({ user }: { user: import("@/sales").User }) {
  const s = useProto()
  const away = isAway(user.id, s)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${user.fullName}, ${away ? "Away" : "Available"}. Open availability`} className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-muted">
          <span className="relative"><UserAvatar user={user} />{away && <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-background bg-amber-500" />}</span>
          <span className="hidden text-sm font-medium md:inline">{user.fullName}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <AwayForm userId={user.id} meId={user.id} idPrefix="a-me" />
      </PopoverContent>
    </Popover>
  )
}

function RatingPanel({ lead, canEdit }: { lead: { id: string; lastName: string }; canEdit: boolean }) {
  const s = useProto()
  const me = useCurrentUser().data?.user
  return <RatingSection lead={lead} canEdit={canEdit} byName={me?.fullName ?? "you"} state={s} />
}
function RatingSection({ lead, canEdit, byName, state }: { lead: { id: string; lastName: string }; canEdit: boolean; byName: string; state: ReturnType<typeof useProto> }) {
  const info: RatingInfo = ratingOf(state, lead)
  const ruleSays = info.score != null ? ratingFromScore(info.score) : null
  return (
    <RecordSection title="Rating">
      <div className="flex flex-wrap items-center gap-3">
        <RatingChip info={info} />
        <p className="text-sm text-muted-foreground">{sourceText(info)}</p>
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="a-rating" className="text-sm font-medium">Change Rating</label>
            <NativeSelect id="a-rating" className="w-40" value={info.rating ?? ""} onChange={(e) => setRating(lead, (e.target.value || null) as Rating | null, byName)}>
              <option value="">No Rating</option>
              {RATINGS.map((r) => <option key={r} value={r}>{RATING_LABELS[r]}</option>)}
            </NativeSelect>
          </div>
          {info.source === "hand" && ruleSays && <Button variant="outline" onClick={() => resetRating(lead)}>Use the rule's Rating ({RATING_LABELS[ruleSays]})</Button>}
        </div>
      )}
    </RecordSection>
  )
}

function SavedViews({ value, onChange }: { value: string; onChange: (v: string) => void; counts: Record<string, number> }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="a-saved" className="text-sm text-muted-foreground">Saved view</label>
      <NativeSelect id="a-saved" className="w-44" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All Leads</option>
        <option value="hot">Hot Leads</option>
        <option value="warm">Warm Leads</option>
        <option value="cold">Cold Leads</option>
        <option value="none">No Rating</option>
      </NativeSelect>
    </div>
  )
}

export const variantA: Variant = {
  name: "Table and dialogs",
  WebForm,
  AssignmentTab,
  UserAway,
  AwayBanner: () => null,
  RatingColumn: ({ info }) => <RatingChip info={info} />,
  SavedViews,
  RatingPanel: ({ lead, canEdit }) => <RatingPanel lead={lead} canEdit={canEdit} />,
}
