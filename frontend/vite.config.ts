import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Output goes into the Gradle build dir; processResources folds it into the
// jar's `web/`. Relative base so assets resolve under Ktor's static root.
// Dev server proxies the API + image endpoints to the running inspector backend.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: resolve(__dirname, "../build/frontend"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/img": "http://localhost:8080",
    },
  },
});
