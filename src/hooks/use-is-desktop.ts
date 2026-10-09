import { useSyncExternalStore } from "react"

/** Tailwind's `md` breakpoint: from here up the app shows the sidebar, below it the bottom tabs. */
export const DESKTOP_QUERY = "(min-width: 768px)"

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_QUERY).matches)
}
