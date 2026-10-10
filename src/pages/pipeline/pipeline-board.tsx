import { useState, type DragEvent } from "react"
import { formatEuro, STAGE_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"
import { OPEN_STAGES, isOpenStage, pipelineValue, type Opportunity, type Stage } from "@/sales"
import { ExpectedCloseDate } from "../opportunities/expected-close-date"
import { OpportunityLink, OwnerInitials, StagePicker, StageTotals, type MoveTo, type PipelineViewProps } from "./pipeline-parts"

const CLOSED_STAGES = ["closedWon", "closedLost"] as const

/**
 * The Board: a column per open Stage, and Closed Won and Closed Lost drop
 * zones. Dragging a card moves it; dropping on a closed zone opens the Close
 * dialog; dragging a closed card back to an open column reopens it. Cards the
 * user may not change don't drag. Touch screens use the Stage picker instead.
 */
export function PipelineBoard({ opportunities, stages, totals, isEditable, moveTo }: PipelineViewProps) {
  const [dragged, setDragged] = useState<Opportunity | null>(null)
  const [over, setOver] = useState<Stage | null>(null)
  const showClosed = stages.some((s) => !isOpenStage(s))

  const endDrag = () => {
    setDragged(null)
    setOver(null)
  }
  const dropZone = (stage: Stage) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragged) return
      e.preventDefault()
      setOver(stage)
    },
    onDragLeave: () => setOver((s) => (s === stage ? null : s)),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      if (dragged) moveTo(dragged, stage)
      endDrag()
    },
  })
  const card = (opportunity: Opportunity) => (
    <PipelineCard
      key={opportunity.id}
      opportunity={opportunity}
      editable={isEditable(opportunity)}
      dragging={dragged?.id === opportunity.id}
      onDragStart={() => setDragged(opportunity)}
      onDragEnd={endDrag}
      moveTo={moveTo}
    />
  )

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
      <div className="flex gap-3">
        {OPEN_STAGES.map((stage) => {
          const cards = opportunities.filter((o) => o.stage === stage)
          return (
            <section
              key={stage}
              aria-label={STAGE_LABELS[stage]}
              {...dropZone(stage)}
              className={cn(
                "flex min-w-52 flex-1 basis-0 flex-col gap-2 rounded-lg bg-muted/60 p-2 transition-colors",
                over === stage && "bg-accent ring-2 ring-ring/40",
              )}
            >
              <header className="px-1">
                <h2 className="text-sm font-semibold">{STAGE_LABELS[stage]}</h2>
                <StageTotals total={totals[stage]} />
              </header>
              {cards.map(card)}
              {cards.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">No Opportunities</p>}
            </section>
          )
        })}
        <div className="flex w-48 shrink-0 flex-col gap-3">
          {CLOSED_STAGES.map((stage) => {
            const won = stage === "closedWon"
            const cards = showClosed ? opportunities.filter((o) => o.stage === stage) : []
            return (
              <section
                key={stage}
                aria-label={STAGE_LABELS[stage]}
                {...dropZone(stage)}
                className={cn(
                  "flex flex-1 flex-col gap-2 rounded-lg border-2 border-dashed p-2 transition-colors",
                  won ? "border-emerald-500/50" : "border-destructive/40",
                  over === stage && (won ? "bg-emerald-500/10" : "bg-destructive/10"),
                )}
              >
                <header className="px-1">
                  <h2 className="text-sm font-semibold">{STAGE_LABELS[stage]}</h2>
                  {showClosed ? (
                    <StageTotals total={totals[stage]} />
                  ) : (
                    <p className="text-xs text-muted-foreground">Drop here to close</p>
                  )}
                </header>
                {cards.map(card)}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PipelineCard({
  opportunity,
  editable,
  dragging,
  onDragStart,
  onDragEnd,
  moveTo,
}: {
  opportunity: Opportunity
  editable: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  moveTo: MoveTo
}) {
  return (
    <article
      aria-label={opportunity.name}
      draggable={editable}
      onDragStart={(e) => {
        // Firefox only starts a drag that carries data.
        e.dataTransfer?.setData("text/plain", opportunity.id)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "flex flex-col gap-1 rounded-md border bg-card p-2.5 text-sm shadow-xs",
        editable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <OpportunityLink opportunity={opportunity} />
      <div className="text-xs text-muted-foreground">{opportunity.accountName}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="font-semibold tabular-nums">{formatEuro(pipelineValue(opportunity))}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{opportunity.probability}%</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <ExpectedCloseDate opportunity={opportunity} />
        <OwnerInitials name={opportunity.ownerName} />
      </div>
      {editable && <StagePicker opportunity={opportunity} disabled={false} moveTo={moveTo} className="mt-1 w-full pointer-fine:hidden" />}
    </article>
  )
}
