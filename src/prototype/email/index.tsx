/* eslint-disable react-refresh/only-export-components */
// PROTOTYPE (throwaway, never merge): mounts the variants of #154 on the real
// record pages and Home, switched with ?variant=A|B|C.

import type { ReactNode } from "react"
import { RecordSection } from "@/components/records/record-page"
import type { RecordRef, Task } from "@/sales"
import { PrototypeSwitcher, useVariant } from "./prototype-switcher"
import { VARIANTS } from "./shared"
import { HomeCardsA, TimelineA } from "./variant-a"
import { HomeTopB, TimelineB } from "./variant-b"
import { AgendaCardC, TimelineC, ToLinkTableC } from "./variant-c"

const KEYS = VARIANTS.map((v) => v.key)

export function ProtoTimeline(props: { record: RecordRef; canAdd: boolean }) {
  const v = useVariant(KEYS)
  return v === "B" ? <TimelineB {...props} /> : v === "C" ? <TimelineC {...props} /> : <TimelineA {...props} />
}

export function ProtoSwitcher() {
  return <PrototypeSwitcher variants={VARIANTS} current={useVariant(KEYS)} />
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => <RecordSection title={title}>{children}</RecordSection>

/** Home slots: above the cards, the tasks card (C swaps it), extra cards in the grid, and below the grid. */
export function useProtoHome() {
  const v = useVariant(KEYS)
  return {
    top: v === "B" ? <HomeTopB /> : null,
    tasksCard: (tasks: Task[], fallback: ReactNode) => (v === "C" ? <AgendaCardC tasks={tasks} Section={Section} /> : fallback),
    cards: v === "A" ? <HomeCardsA Section={Section} /> : null,
    bottom: v === "C" ? <ToLinkTableC /> : null,
  }
}
