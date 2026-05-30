import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Output goes into the Gradle build dir; processResources folds it into the
// jar's `web/`. Absolute base ("/") so assets resolve from the static root even
// on deep client-side routes like /source/5/popular (BrowserRouter); the Ktor
// `singlePageApplication` host falls back to index.html for those paths.
// Dev server proxies the API + image endpoints to the running inspector backend.
export default defineConfig({
  plugins: [react()],
  base: "/",
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
