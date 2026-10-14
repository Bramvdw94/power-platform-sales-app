// PROTOTYPE (throwaway, never merge). Variant B, "Steps": a full page that walks through the rule one step at a time.

import { useState } from "react"
import { ArrowLeft, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { NameField, SaveBar, useDraft, type EditorProps } from "./editor-common"
import { answersOf, questionSummary, untrustedInputs, INPUT_FIELDS } from "./model"
import { AnswersSection, InputsSection, QuestionSection, SafetySection, TriggerSection, TrySection, tableOf, triggerSentence } from "./sections"

const STEPS = ["When", "Inputs", "Question", "Actions", "Safety", "Try & publish"] as const

export function VariantB(props: EditorProps) {
  const { draft, edit } = useDraft(props.rule)
  const [step, setStep] = useState(0)
  const t = tableOf(draft)

  const summary: string[] = [
    triggerSentence(draft),
    `${draft.inputs.length} inputs${untrustedInputs(draft).length ? `, ${untrustedInputs(draft).length} untrusted` : ""}`,
    draft.question.text ? `${questionSummary(draft.question)}` : "No question yet",
    `${answersOf(draft.question).reduce((n, a) => n + (draft.branches[a.key]?.length ?? 0), 0)} Actions over ${answersOf(draft.question).length} answers`,
    `${draft.threshold}% threshold · reviewer ${draft.reviewer}`,
    draft.lastTried ? `Tried ${draft.lastTried}` : "Not tried yet",
  ]

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={props.onClose}>
          <ArrowLeft aria-hidden /> Decision rules
        </Button>
        <h2 className="text-lg font-semibold">{props.isNew ? `New ${t.noun} Decision rule` : draft.name || "Untitled rule"}</h2>
        <span className="text-sm text-muted-foreground">{draft.status === "published" ? "Published" : "Draft"}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Steps" className="min-w-0">
          <ol className="flex gap-1 overflow-x-auto md:grid md:gap-1 md:overflow-visible">
            {STEPS.map((s, i) => (
              <li key={s} className="shrink-0">
                <button
                  type="button"
                  aria-current={step === i ? "step" : undefined}
                  onClick={() => setStep(i)}
                  className={cn("flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted", step === i && "bg-muted")}
                >
                  <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs", i < step && "border-primary bg-primary text-primary-foreground", step === i && "border-primary")}>
                    {i < step ? <Check className="size-3" aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{s}</span>
                    <span className="hidden text-xs text-foreground/70 md:block">{summary[i]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="grid min-w-0 grid-cols-1 content-start gap-4 rounded-lg border p-4">
          <h3 className="text-base font-semibold">
            {step + 1}. {STEPS[step]}
          </h3>
          {step === 0 && (
            <>
              <NameField draft={draft} edit={edit} />
              <TriggerSection rule={draft} edit={edit} />
            </>
          )}
          {step === 1 && <InputsSection rule={draft} edit={edit} />}
          {step === 2 && <QuestionSection rule={draft} edit={edit} />}
          {step === 3 && <AnswersSection rule={draft} edit={edit} />}
          {step === 4 && <SafetySection rule={draft} edit={edit} />}
          {step === 5 && (
            <>
              <dl className="grid gap-1 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
                <dt className="text-muted-foreground">When</dt>
                <dd>{triggerSentence(draft)}</dd>
                <dt className="text-muted-foreground">Reads</dt>
                <dd>{INPUT_FIELDS[draft.table].filter((f) => draft.inputs.includes(f.key)).map((f) => f.label).join(", ") || "Nothing yet"}</dd>
                <dt className="text-muted-foreground">Asks</dt>
                <dd>{draft.question.text || "No question yet"}</dd>
                <dt className="text-muted-foreground">Answers</dt>
                <dd>{answersOf(draft.question).map((a) => `${a.label} (${draft.branches[a.key]?.length ?? 0})`).join(" · ")}</dd>
              </dl>
              <TrySection rule={draft} edit={edit} />
              <SaveBar draft={draft} props={props} />
            </>
          )}
          {step < 5 && (
            <div className="flex justify-between gap-2 border-t pt-3">
              <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={!draft.name.trim()} onClick={() => props.onSave(draft)}>
                  {draft.status === "published" ? "Save" : "Save draft"}
                </Button>
                <Button onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]}</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
