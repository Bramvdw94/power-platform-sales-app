// PROTOTYPE (throwaway): canned "AI" text built from the real record on screen. No model is called.

import type { SalesGateway } from "@/data/gateway"
import { formatDate, formatEuro, STAGE_LABELS } from "@/lib/format"
import { fullName, type Activity, type RecordRef, type Stage } from "@/sales"
import type { Lang } from "./store"

export type Ctx = {
  kind: "account" | "opportunity" | "contact" | "lead"
  id: string
  /** "Opportunity · Pilot rollout" for the usage log. */
  label: string
  name: string
  accountName?: string
  stage?: Stage
  probability?: number
  value?: number
  closeDate?: string
  nextStep?: string
  contactName?: string
  contactEmail?: string
  openOpps: { name: string; stage: Stage; value: number; closeDate: string }[]
}

export async function loadCtx(gateway: SalesGateway, ref: RecordRef): Promise<Ctx> {
  if (ref.type === "opportunity") {
    const d = await gateway.getOpportunity(ref.id)
    const o = d.opportunity
    return {
      kind: "opportunity",
      id: o.id,
      label: `Opportunity · ${o.name}`,
      name: o.name,
      accountName: d.account.name,
      stage: o.stage,
      probability: o.probability,
      value: o.estimatedValue,
      closeDate: o.expectedCloseDate,
      nextStep: o.nextStep,
      contactName: d.primaryContact ? fullName(d.primaryContact) : undefined,
      contactEmail: d.primaryContact?.email,
      openOpps: [],
    }
  }
  if (ref.type === "account") {
    const d = await gateway.getAccount(ref.id)
    const open = d.opportunities.filter((o) => o.stage !== "closedWon" && o.stage !== "closedLost")
    const c = d.contacts[0]
    return {
      kind: "account",
      id: d.account.id,
      label: `Account · ${d.account.name}`,
      name: d.account.name,
      accountName: d.account.name,
      contactName: c ? fullName(c) : undefined,
      contactEmail: c?.email,
      openOpps: open.map((o) => ({ name: o.name, stage: o.stage, value: o.estimatedValue, closeDate: o.expectedCloseDate })),
    }
  }
  if (ref.type === "contact") {
    const d = await gateway.getContact(ref.id)
    return {
      kind: "contact",
      id: d.contact.id,
      label: `Contact · ${fullName(d.contact)}`,
      name: fullName(d.contact),
      accountName: d.account?.name,
      contactName: fullName(d.contact),
      contactEmail: d.contact.email,
      openOpps: [],
    }
  }
  const d = await gateway.getLead(ref.id)
  const l = d.lead
  return {
    kind: "lead",
    id: l.id,
    label: `Lead · ${fullName(l)}`,
    name: fullName(l),
    accountName: l.company,
    contactName: fullName(l),
    contactEmail: l.email,
    openOpps: [],
  }
}

export type Summary = { headline: string; bullets: string[]; focus: string }

const daysSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000))
const dateOf = (a: Activity) => (a.kind === "phoneCall" ? a.date : a.createdOn)
const isOpenItem = (a: Activity) => (a.kind === "task" || a.kind === "phoneCall") && !a.completed

const FOCUS: Record<string, { en: string; nl: string }> = {
  qualification: {
    en: "Book a discovery call to confirm budget, timing and who decides.",
    nl: "Plan een kennismakingsgesprek om budget, timing en de beslisser te bevestigen.",
  },
  needsAnalysis: {
    en: "Finish the needs analysis and agree what the proposal must cover.",
    nl: "Rond de behoefteanalyse af en spreek af wat de offerte moet bevatten.",
  },
  proposal: {
    en: "Get the proposal in front of the decision maker and agree a date to answer.",
    nl: "Leg de offerte voor aan de beslisser en spreek af wanneer er antwoord komt.",
  },
  negotiation: {
    en: "Settle the open points on price and scope, then ask for a signature date.",
    nl: "Reken de open punten over prijs en scope af en vraag om een datum voor ondertekening.",
  },
}

/** What the Timeline summary says, from the record and the Activities the real timeline already loaded. */
export function summaryFor(ctx: Ctx, activities: Activity[], lang: Lang): Summary {
  const nl = lang === "nl"
  const recent = activities.filter((a) => daysSince(dateOf(a)) <= 90).slice(0, 30)
  const open = recent.filter(isOpenItem)
  const done = recent.filter((a) => !isOpenItem(a))
  const last = [...done].sort((a, b) => (dateOf(b) > dateOf(a) ? 1 : -1))[0]
  const lastText = last
    ? nl
      ? `Laatste contact ${daysSince(dateOf(last))} dagen geleden (${last.kind === "note" ? last.title || "Notitie" : last.subject}).`
      : `Last contact ${daysSince(dateOf(last))} days ago (${last.kind === "note" ? last.title || "Note" : last.subject}).`
    : nl
      ? "Er is de afgelopen 90 dagen niets vastgelegd."
      : "Nothing was logged in the past 90 days."
  const counts = nl
    ? `${recent.length} activiteiten in 90 dagen, waarvan ${open.length} nog open (taken, geplande gesprekken en afspraken).`
    : `${recent.length} Activities in 90 days, ${open.length} still open (Tasks, planned Calls and Meetings).`
  const latestNote = recent.find((a) => a.kind === "note")
  const noteText = latestNote && latestNote.kind === "note" ? latestNote.text : undefined

  if (ctx.kind === "account") {
    const total = ctx.openOpps.reduce((sum, o) => sum + o.value, 0)
    const n = ctx.openOpps.length
    return {
      headline: nl
        ? `${ctx.name} heeft ${n} open ${n === 1 ? "opportunity" : "opportunities"} met samen ${formatEuro(total)}.`
        : `${ctx.name} has ${n} open ${n === 1 ? "Opportunity" : "Opportunities"} worth ${formatEuro(total)} in total.`,
      bullets: [
        ...ctx.openOpps.map((o) =>
          nl
            ? `${o.name}: ${STAGE_LABELS[o.stage]}, ${formatEuro(o.value)}, verwacht ${formatDate(o.closeDate)}.`
            : `${o.name}: ${STAGE_LABELS[o.stage]}, ${formatEuro(o.value)}, expected ${formatDate(o.closeDate)}.`,
        ),
        counts,
        lastText,
        ...(noteText ? [nl ? `Laatste notitie: “${noteText}”` : `Latest Note: “${noteText}”`] : []),
      ],
      focus: nl
        ? "Houd het contact warm: er staat nog niets gepland met de belangrijkste contactpersoon."
        : "Keep the relationship warm: nothing is planned yet with the main contact.",
    }
  }
  const stage = ctx.stage ?? "qualification"
  return {
    headline: nl
      ? `${ctx.name} voor ${ctx.accountName} staat in ${STAGE_LABELS[stage]} (${ctx.probability}%), ter waarde van ${formatEuro(ctx.value ?? 0)} en verwacht op ${formatDate(ctx.closeDate ?? "")}.`
      : `${ctx.name} for ${ctx.accountName} is in ${STAGE_LABELS[stage]} (${ctx.probability}%), worth ${formatEuro(ctx.value ?? 0)}, expected to close ${formatDate(ctx.closeDate ?? "")}.`,
    bullets: [
      ctx.contactName ? (nl ? `Hoofdcontact: ${ctx.contactName}.` : `Primary Contact: ${ctx.contactName}.`) : nl ? "Nog geen hoofdcontact." : "No Primary Contact yet.",
      ctx.nextStep ? (nl ? `Volgende stap: ${ctx.nextStep}` : `Next step: ${ctx.nextStep}`) : nl ? "Er is nog geen volgende stap." : "No Next step is set.",
      counts,
      lastText,
      ...(noteText ? [nl ? `Laatste notitie: “${noteText}”` : `Latest Note: “${noteText}”`] : []),
    ],
    focus: (FOCUS[stage] ?? FOCUS.qualification)[lang],
  }
}

export const summaryAsText = (s: Summary, lang: Lang) =>
  `${s.headline}\n\n${s.bullets.map((b) => `• ${b}`).join("\n")}\n\n${lang === "nl" ? "Aandachtspunt" : "Suggested focus"}: ${s.focus}`

export type FollowUp = { to: { name: string; email: string }[]; subject: string; body: string }

/** The Follow-up draft for a logged Phone Call or a held Meeting. */
export function followUpFor(ctx: Ctx, what: { subject: string; date: string; text?: string; meeting: boolean }, sender: string, lang: Lang): FollowUp {
  const nl = lang === "nl"
  const first = ctx.contactName?.split(" ")[0] ?? (nl ? "allemaal" : "there")
  const when = formatDate(what.date)
  const recap = what.text ?? (nl ? "de belangrijkste punten" : "the main points")
  const step = ctx.nextStep
  const body = nl
    ? `Hoi ${first},\n\nBedankt voor ${what.meeting ? "de afspraak" : "ons gesprek"} van ${when}. Kort samengevat: ${recap}\n\n${
        step ? `Als volgende stap: ${step}\n\n` : ""
      }Laat het me weten als ik iets heb gemist.\n\nMet vriendelijke groet,\n${sender}`
    : `Hi ${first},\n\nThanks for ${what.meeting ? "meeting" : "talking"} on ${when}. To recap: ${recap}\n\n${
        step ? `As a next step: ${step}\n\n` : ""
      }Let me know if I missed anything.\n\nKind regards,\n${sender}`
  return {
    to: ctx.contactEmail && ctx.contactName ? [{ name: ctx.contactName, email: ctx.contactEmail }] : [],
    subject: nl ? `Opvolging: ${what.subject}` : `Follow-up: ${what.subject}`,
    body,
  }
}

export type Suggestion = { text: string; why: string }

export function nextStepFor(ctx: Ctx, activityCount: number, lang: Lang): Suggestion {
  const nl = lang === "nl"
  const who = ctx.contactName ?? (nl ? "de contactpersoon" : "the contact")
  const stage = ctx.stage ?? "qualification"
  const text = {
    qualification: {
      en: `Call ${who} this week to confirm budget, timing and who decides.`,
      nl: `Bel ${who} deze week om budget, timing en de beslisser te bevestigen.`,
    },
    needsAnalysis: {
      en: `Plan a 60-minute workshop with ${who} to write down the requirements.`,
      nl: `Plan een workshop van 60 minuten met ${who} om de eisen vast te leggen.`,
    },
    proposal: {
      en: `Send the Quote to ${who} and book a call for next Tuesday to walk through it.`,
      nl: `Stuur de offerte naar ${who} en plan volgende dinsdag een gesprek om hem door te nemen.`,
    },
    negotiation: {
      en: `Agree the final price with ${who} and ask for a signature before ${formatDate(ctx.closeDate ?? "")}.`,
      nl: `Stem de eindprijs af met ${who} en vraag om ondertekening voor ${formatDate(ctx.closeDate ?? "")}.`,
    },
    closedWon: { en: "", nl: "" },
    closedLost: { en: "", nl: "" },
  }[stage][lang]
  return {
    text,
    why: nl
      ? `Gebaseerd op de richtlijn van de stap ${STAGE_LABELS[stage]} en ${activityCount} recente activiteiten.`
      : `Based on the ${STAGE_LABELS[stage]} Step's Guidance and ${activityCount} recent Activities.`,
  }
}
