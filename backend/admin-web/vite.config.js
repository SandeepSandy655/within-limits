import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "vercel" ? "/" : "/admin/",
  build: {
    outDir: resolve(projectDir, mode === "vercel" ? "dist" : "../public/admin"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
  },
  server: {
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
}));
