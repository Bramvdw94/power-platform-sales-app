// PROTOTYPE: standalone entry so the board can be shared as a static page, outside Power Apps.
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import PipelineBoardPrototype from "."

// Follow the viewer's light/dark setting.
const root = document.documentElement
const mq = matchMedia("(prefers-color-scheme: dark)")
const apply = () => {
  const forced = root.getAttribute("data-theme")
  root.classList.toggle("dark", forced ? forced === "dark" : mq.matches)
}
apply()
mq.addEventListener("change", apply)
new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ["data-theme"] })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="min-h-dvh bg-background text-foreground mx-auto max-w-7xl"><PipelineBoardPrototype /></div>
  </StrictMode>,
)
