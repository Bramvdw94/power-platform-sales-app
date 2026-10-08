// PROTOTYPE: builds the pipeline board prototype as a static page (no Power Apps host).
import { defineConfig } from "vite"
import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  define: { "import.meta.env.VITE_PROTOTYPE": JSON.stringify("1") },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    outDir: "dist-prototype",
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, "prototype-pipeline-board.html") },
  },
})
