// PROTOTYPE (throwaway, never merge). Variant C, "Flow + Try": the rule drawn as a flow (When, Inputs, Question,
// one branch per answer, Needs review); click a box to edit it on the right. Try drops the records onto their branch.

import { useState, type ReactNode } from "react"
import { ArrowDown, ArrowLeft, Bot, ShieldAlert, UserRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { NameField, SaveBar, useDraft, type EditorProps } from "./editor-common"
import { actionSentence, answersOf, INPUT_FIELDS, questionSummary, untrustedInputs, type TryResult } from "./model"
import {
  ActionsList,
  ConfidenceBar,
  InputsSection,
  QuestionSection,
  SafetySection,
  TriggerSection,
  TryPicker,
  TryResults,
  tableOf,
  triggerSentence,
  useTry,
} from "./sections"

type Node = "when" | "inputs" | "question" | `answer:${string}` | "review" | "try"

function Box({ id, selected, onSelect, title, children, className }: { id: Node; selected: Node; onSelect: (n: Node) => void; title: string; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected === id}
      onClick={() => onSelect(id)}
      className={cn("grid w-full gap-1 rounded-lg border bg-card p-3 text-left text-sm shadow-xs hover:border-foreground/40 aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary/30", className)}
    >
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</span>
      {children}
    </button>
  )
}

const Arrow = () => (
  <div className="flex justify-center text-muted-foreground" aria-hidden>
    <ArrowDown className="size-4" />
  </div>
)

function Landed({ results }: { results: TryResult[] }) {
  if (results.length === 0) return null
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {results.map((r) => (
        <Badge key={r.sample.id} variant="outline" className="max-w-full gap-1.5 font-normal">
          <span className="truncate">{r.sample.label.split(" · ")[0]}</span>
          <span className="tabular-nums text-muted-foreground">{r.confidence}%</span>
        </Badge>
      ))}
    </span>
  )
}

export function VariantC(props: EditorProps) {
  const { draft, edit } = useDraft(props.rule)
  const [selected, setSelected] = useState<Node>("question")
  const tryState = useTry(draft, edit)
  const t = tableOf(draft)
  const answers = answersOf(draft.question)
  const results = tryState.results ?? []
  const untrusted = untrustedInputs(draft)

  const inspector = (() => {
    if (selected === "when")
      return (
        <>
          <NameField draft={draft} edit={edit} />
          <TriggerSection rule={draft} edit={edit} />
        </>
      )
    if (selected === "inputs") return <InputsSection rule={draft} edit={edit} compact />
    if (selected === "question") return <QuestionSection rule={draft} edit={edit} />
    if (selected === "review") return <SafetySection rule={draft} edit={edit} />
    if (selected === "try")
      return (
        <>
          <TryPicker t={tryState} />
          {tryState.results && <TryResults results={tryState.results} rule={draft} />}
        </>
      )
    const a = answers.find((x) => `answer:${x.key}` === selected)
    return a ? (
      <>
        <p className="text-sm text-muted-foreground">Only set a field, assign, create a Task or notify. Actions are normal saves, so Business rules still apply.</p>
        <ActionsList rule={draft} answer={a} edit={edit} />
      </>
    ) : null
  })()

  const inspectorTitle =
    selected === "when" ? "When" : selected === "inputs" ? "Inputs" : selected === "question" ? "Question" : selected === "review" ? "Needs review and safety" : selected === "try" ? "Try" : `When Jev answers ${answers.find((x) => `answer:${x.key}` === selected)?.label ?? ""}`

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={props.onClose}>
          <ArrowLeft aria-hidden /> Decision rules
        </Button>
        <h2 className="text-lg font-semibold">{props.isNew ? `New ${t.noun} Decision rule` : draft.name || "Untitled rule"}</h2>
        <span className="text-sm text-muted-foreground">{draft.status === "published" ? "Published" : "Draft"}</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSelected("try")}>
          <Bot aria-hidden /> Try
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-2 rounded-lg border bg-muted/30 p-3 sm:p-4">
          <Box id="when" selected={selected} onSelect={setSelected} title="When">
            <span>{triggerSentence(draft)}</span>
          </Box>
          <Arrow />
          <Box id="inputs" selected={selected} onSelect={setSelected} title={`Inputs · ${draft.inputs.length} of 10`}>
            <span className="flex flex-wrap gap-1">
              {INPUT_FIELDS[draft.table]
                .filter((f) => draft.inputs.includes(f.key))
                .map((f) => (
                  <Badge key={f.key} variant={f.freeText ? "outline" : "secondary"} className={cn("font-normal", f.freeText && "border-amber-500/60 text-amber-800 dark:text-amber-300")}>
                    {f.freeText && <ShieldAlert aria-hidden />}
                    {f.label}
                  </Badge>
                ))}
            </span>
          </Box>
          <Arrow />
          <Box id="question" selected={selected} onSelect={setSelected} title={`Question · ${questionSummary(draft.question)}`} className="border-primary/40">
            <span className="font-medium">{draft.question.text || "No question yet"}</span>
            {untrusted.length > 0 && <span className="text-xs text-muted-foreground">+ injection check (untrusted input)</span>}
          </Box>
          <Arrow />
          <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
            {answers.map((a) => {
              const actions = draft.branches[a.key] ?? []
              const here = results.filter((r) => !r.needsReview && r.answer?.key === a.key)
              return (
                <Box key={a.key} id={`answer:${a.key}`} selected={selected} onSelect={setSelected} title="Answer">
                  <span className="font-medium">{a.label}</span>
                  {actions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No Actions</span>
                  ) : (
                    <ul className="grid gap-0.5 text-xs text-muted-foreground">
                      {actions.map((x) => (
                        <li key={x.id}>• {actionSentence(x)}</li>
                      ))}
                    </ul>
                  )}
                  <Landed results={here} />
                </Box>
              )
            })}
            <Box id="review" selected={selected} onSelect={setSelected} title="Needs review" className="border-dashed bg-transparent">
              <span className="flex items-center gap-1.5 font-medium">
                <UserRound className="size-4" aria-hidden /> Below {draft.threshold}%
              </span>
              <span className="text-xs text-muted-foreground">or injection check, Jev unreachable, cap reached. Owner or {draft.reviewer} decides.</span>
              <Landed results={results.filter((r) => r.needsReview)} />
            </Box>
          </div>
          {tryState.results && (
            <div className="mt-2 grid gap-1 rounded-md border bg-card p-2.5 text-xs">
              <p className="font-medium">Last Try</p>
              {results.map((r) => (
                <p key={r.sample.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{r.sample.label}</span>
                  <span>{r.needsReview ? "Needs review" : r.answer?.label}</span>
                  <ConfidenceBar value={r.confidence} threshold={draft.threshold} />
                </p>
              ))}
            </div>
          )}
        </div>

        <aside aria-label="Edit" className="grid min-w-0 grid-cols-1 content-start gap-3 rounded-lg border p-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
          <h3 className="text-base font-semibold">{inspectorTitle}</h3>
          {inspector}
          <div className="border-t pt-3">
            <SaveBar draft={draft} props={props} compact />
          </div>
        </aside>
      </div>
    </div>
  )
}
