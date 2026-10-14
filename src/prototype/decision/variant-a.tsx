// PROTOTYPE (throwaway, never merge). Variant A, "Dialog": one long editor dialog, like the Business rules editor.

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { NameField, SaveBar, useDraft, type EditorProps } from "./editor-common"
import { AnswersSection, InputsSection, QuestionSection, SafetySection, TriggerSection, TrySection, tableOf } from "./sections"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

export function VariantA(props: EditorProps) {
  const { draft, edit } = useDraft(props.rule)
  const t = tableOf(draft)
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{props.isNew ? `New ${t.noun} Decision rule` : `Edit Decision rule “${props.rule.name}”`}</DialogTitle>
          <DialogDescription>Jev answers one question about the {t.noun}; the Actions for its answer run after the save.</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <NameField draft={draft} edit={edit} />
            {draft.status === "published" && (
              <label className="flex items-center gap-2 pb-1.5 text-sm">
                <Switch aria-label="Switched on" checked={draft.enabled} onCheckedChange={(enabled) => edit({ enabled })} />
                {draft.enabled ? "Switched on" : "Switched off"}
              </label>
            )}
          </div>
          <Section title="When">
            <TriggerSection rule={draft} edit={edit} />
          </Section>
          <Section title="Inputs">
            <InputsSection rule={draft} edit={edit} />
          </Section>
          <Section title="Question">
            <QuestionSection rule={draft} edit={edit} />
          </Section>
          <Section title="Then, per answer">
            <AnswersSection rule={draft} edit={edit} />
          </Section>
          <Section title="Safety">
            <SafetySection rule={draft} edit={edit} />
          </Section>
          <section aria-label="Try" className="grid gap-2 rounded-md border bg-muted/30 p-3">
            <h3 className="text-sm font-semibold">Try it</h3>
            <TrySection rule={draft} edit={edit} />
          </section>
          <SaveBar draft={draft} props={props} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
