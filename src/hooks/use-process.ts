import { useQuery } from "@tanstack/react-query"
import type { ProcessDefinitions } from "@/data/gateway"
import { isRetired, versionOf, type Lead, type Opportunity, type ProcessKind } from "@/sales"
import type { ProcessDefinition, ProcessRow, ProcessVersionRow } from "@/sales/engine"
import { useGateway } from "./use-gateway"

/**
 * The published Processes of a table, loaded once per session (the query is never
 * invalidated by record changes; builders change them rarely).
 */
export function useProcessDefinitions(table: ProcessKind) {
  const gateway = useGateway()
  return useQuery<ProcessDefinitions>({
    queryKey: ["processes", table],
    queryFn: () => gateway.getProcessDefinitions(table),
    staleTime: 5 * 60_000,
  })
}

export type RecordProcess =
  | { status: "loading" }
  /** The record follows no Process, or the engine is off: it behaves as in v1. */
  | { status: "none" }
  | {
      status: "following"
      process: ProcessRow
      version: ProcessVersionRow
      definition: ProcessDefinition
      retired: boolean
      /** The other published, not retired Processes a record could switch to. */
      alternatives: ProcessRow[]
      definitions: ProcessDefinitions
    }

/** Which Process a Lead or Opportunity follows, if any. */
export function useRecordProcess(table: ProcessKind, record: Lead | Opportunity): RecordProcess {
  const { data, isPending } = useProcessDefinitions(table)
  if (isPending) return record.processVersionId ? { status: "loading" } : { status: "none" }
  if (!data?.engineEnabled || !record.processVersionId) return { status: "none" }
  const version = versionOf(record, data.versions)
  const process = version && data.processes.find((p) => p.id === version.processId)
  if (!version || !process) return { status: "none" }
  return {
    status: "following",
    process,
    version,
    definition: version.definition,
    retired: isRetired(version, data.processes),
    alternatives: data.processes.filter((p) => !p.retired && p.latestVersionId),
    definitions: data,
  }
}
