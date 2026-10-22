import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocation } from "react-router-dom"
import type { Id } from "@/sales"
import { useGateway } from "./use-gateway"

/** The bell is polled once a minute, and again whenever the user moves to another page. */
export const NOTIFICATION_POLL_MS = 60_000

const UNREAD = ["notifications", "unread"] as const
const LIST = ["notifications", "list"] as const

/** How many of my Notifications are unread: the number on the bell. */
export function useUnreadNotificationCount() {
  const gateway = useGateway()
  const queryClient = useQueryClient()
  const { pathname } = useLocation()
  const query = useQuery({
    queryKey: UNREAD,
    queryFn: () => gateway.countUnreadNotifications(),
    refetchInterval: NOTIFICATION_POLL_MS,
  })
  // Moving between pages refreshes the bell, and the list behind it when it has been opened.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] })
  }, [pathname, queryClient])
  return query
}

/** My latest Notifications, newest first. Only loaded while `enabled` (the bell is open). */
export function useNotifications(enabled = true) {
  const gateway = useGateway()
  return useQuery({
    queryKey: LIST,
    queryFn: () => gateway.listNotifications(),
    enabled,
    refetchInterval: enabled ? NOTIFICATION_POLL_MS : false,
  })
}

export function useMarkNotificationRead() {
  const gateway = useGateway()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: Id) => gateway.markNotificationRead(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  })
}

export function useMarkAllNotificationsRead() {
  const gateway = useGateway()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => gateway.markAllNotificationsRead(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  })
}
