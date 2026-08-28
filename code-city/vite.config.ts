import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  // Code City is a single static page (index.html + its own module script), not an SPA with
  // client-side routing — so the dev server's default SPA fallback (any unmatched GET rewritten
  // to index.html with 200) is wrong here: it makes a genuinely-missing /city.json look like a
  // 200 instead of a 404, silently disabling src/main.ts's mock-fallback branch in dev. 'mpa'
  // serves index.html/app assets normally but returns a real 404 for missing static files.
  appType: "mpa",
  server: {
    // This dev server runs on the fenrir VPS but is viewed from Usul's machines over the tailnet,
    // so Vite's host check (DNS-rebinding protection, on by default since 5.4.12) rejects the
    // tailnet hostname. Allowlist that one host by name — never `true`, which would disable the
    // protection entirely and let any hostname resolving here reach the dev server.
    allowedHosts: ["fenrir-vps.komodo-deneb.ts.net"],
  },
  build: {
    outDir: "dist",
  },
});
