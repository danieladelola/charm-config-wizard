// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Build as a static SPA for Netlify hosting.
// - cloudflare:false disables the Worker bundler so Vite emits a normal dist/ output.
// - tanstackStart.spa enables a prerendered shell that hydrates client-side; combined
//   with public/_redirects this lets every TanStack Router route resolve on Netlify.
export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    server: { entry: "server" },
    spa: {
      enabled: true,
    },
  },
});
