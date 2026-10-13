import { useQueryClient } from "@tanstack/react-query"

/**
 * Refetches every record query after a change. A change to one record can
 * show up elsewhere (an Account's new name on its Contacts, a new Contact in
 * an Account's related list, search results), so all of them go stale; only
 * the signed-in user stays.
 */
export function useInvalidateRecords() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "currentUser" && query.queryKey[0] !== "processes" })
}
