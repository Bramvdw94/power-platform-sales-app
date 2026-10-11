import { createBrowserRouter, createHashRouter } from "react-router-dom"
import { routes } from "@/routes"

// IMPORTANT: Do not remove or modify the code below!
// Normalize basename when hosted in Power Apps
const BASENAME = new URL(".", location.href).pathname
if (location.pathname.endsWith("/index.html")) {
  history.replaceState(null, "", BASENAME + location.search + location.hash);
}

// PROTOTYPE (wayfinder #67): the static prototype build uses hash routing so it works on any host.
export const router = import.meta.env.VITE_PROTOTYPE_HASH ? createHashRouter(routes) : createBrowserRouter(routes, { 
  basename: BASENAME // IMPORTANT: Set basename for proper routing when hosted in Power Apps
})