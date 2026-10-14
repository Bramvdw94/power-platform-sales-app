/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): mounts the three variants of the AI assist look (#166) on the real Account and
// Opportunity pages, switched with ?variant=A|B|C. The "AI" is canned text; nothing calls a model.

import { cloneElement, type ReactElement } from "react"
import { ActivityTimeline, type TimelineProto } from "@/components/records/activity-timeline"
import type { Activity, RecordRef } from "@/sales"
import { DraftControl, MeetingRow, targetOf } from "./followup"
import { SummaryCardC, SummaryDrawerB, SummaryPanelA } from "./summary"
import { useAiState } from "./store"
import { useProtoVariant } from "./switcher"
import { WrittenWithAi } from "./ui"

export { ProtoNextStep } from "./nextstep"
export { AiSettingsPage } from "./settings"
export { ProtoSwitcher } from "./switcher"

export function ProtoTimeline({ record, canAdd }: { record: RecordRef; canAdd: boolean }) {
  const variant = useProtoVariant()
  const ai = useAiState()
  const proto: TimelineProto = {
    top: variant === "A" ? <SummaryPanelA record={record} /> : undefined,
    badge: (activity: Activity) => (activity.kind === "note" && ai.aiNotes.includes(activity.id) ? <WrittenWithAi /> : null),
    rowExtras: (activity: Activity) => {
      const target = targetOf(activity)
      return target ? <DraftControl variant={variant} target={target} slot="extras" /> : null
    },
    trailing: (activity: Activity) => {
      const target = targetOf(activity)
      return target ? <DraftControl variant={variant} target={target} slot="trailing" /> : null
    },
    // A sample held Meeting, right after the open items, so Draft follow-up can be tried on a Meeting too.
    inject: (rows: ReactElement[], activities: Activity[]) => {
      const firstDone = activities.findIndex((a) => !((a.kind === "task" || a.kind === "phoneCall") && !a.completed))
      const at = firstDone === -1 ? rows.length : firstDone
      const meeting = <MeetingRow key="proto-meeting" variant={variant} record={record} />
      return [...rows.slice(0, at), cloneElement(meeting), ...rows.slice(at)]
    },
  }
  return <ActivityTimeline record={record} canAdd={canAdd} proto={proto} />
}

/** B: the Summarise button in the record header. */
export function ProtoHeaderAction({ record }: { record: RecordRef }) {
  return useProtoVariant() === "B" ? <SummaryDrawerB record={record} /> : null
}

/** C: the summary card on top of the record. */
export function ProtoRecordTop({ record }: { record: RecordRef }) {
  return useProtoVariant() === "C" ? <SummaryCardC record={record} /> : null
}
