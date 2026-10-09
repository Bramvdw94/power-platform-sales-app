import { DESKTOP_QUERY } from "@/hooks/use-is-desktop"

/** jsdom has no layout: pretend the window is desktop- or phone-wide for useIsDesktop. */
export function setViewport(kind: "desktop" | "phone") {
  window.matchMedia = (query: string) =>
    ({
      matches: query === DESKTOP_QUERY ? kind === "desktop" : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
