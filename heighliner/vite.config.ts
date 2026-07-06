import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // ephemeral cloudflared quick tunnels for Usul's remote eyeball passes
    allowedHosts: [".trycloudflare.com"],
  },
});
