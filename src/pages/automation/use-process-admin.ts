import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useGateway } from "@/hooks/use-gateway"
import type { Id, ProcessKind } from "@/sales"

export function useProcessList(table: ProcessKind) {
  const gateway = useGateway()
  return useQuery({ queryKey: ["process-admin", "list", table], queryFn: () => gateway.listProcessAdmin(table) })
}

export function useProcessAdmin(id: Id) {
  const gateway = useGateway()
  return useQuery({ queryKey: ["process-admin", "one", id], queryFn: () => gateway.getProcessAdmin(id) })
}

/** Engine errors are the builders' to read; for anyone else nothing is asked. */
export function useEngineErrors(processId: Id) {
  const gateway = useGateway()
  const canBuild = useCanBuild()
  return useQuery({
    queryKey: ["process-admin", "errors", processId],
    queryFn: () => gateway.listEngineErrors(processId),
    enabled: canBuild,
    retry: false,
  })
}

/** Whether the signed-in user may build: only a Process builder; everyone else reads. */
export function useCanBuild(): boolean {
  return useCurrentUser().data?.user.isProcessBuilder === true
}

/** After a change to a Process: the admin views, and the published definitions the process bar reads. */
export function useRefreshProcesses() {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["process-admin"] }),
      queryClient.invalidateQueries({ queryKey: ["processes"] }),
    ])
  }
}
