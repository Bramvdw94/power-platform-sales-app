import { useQuery } from "@tanstack/react-query"
import { useGateway } from "@/hooks/use-gateway"

/** The signed-in user and their direct reports ("My team" = both), loaded once per session. */
export function useCurrentUser() {
  const gateway = useGateway()
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: () => gateway.getCurrentUser(),
    staleTime: Infinity,
  })
}
