import { createBrowserRouter } from "react-router-dom"
import { routes } from "@/routes"

// IMPORTANT: Do not remove or modify the code below!
// Normalize basename when hosted in Power Apps
const BASENAME = new URL(".", location.href).pathname
if (location.pathname.endsWith("/index.html")) {
  history.replaceState(null, "", BASENAME + location.search + location.hash);
}

export const router = createBrowserRouter(routes, { 
  basename: BASENAME // IMPORTANT: Set basename for proper routing when hosted in Power Apps
})