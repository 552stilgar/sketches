import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  // Code City is a single static page (index.html + its own module script), not an SPA with
  // client-side routing — so the dev server's default SPA fallback (any unmatched GET rewritten
  // to index.html with 200) is wrong here: it makes a genuinely-missing /city.json look like a
  // 200 instead of a 404, silently disabling src/main.ts's mock-fallback branch in dev. 'mpa'
  // serves index.html/app assets normally but returns a real 404 for missing static files.
  appType: "mpa",
  build: {
    outDir: "dist",
  },
});
