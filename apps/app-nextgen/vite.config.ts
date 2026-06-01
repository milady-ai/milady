import { defineConfig } from "vite";

/**
 * Milady Nextgen renderer — deliberately minimal.
 *
 * No `@elizaos/*` source aliasing, no connector graph, no native stubs — the
 * coupling that made the old `apps/app` dev load thousands of modules. This app
 * talks to the eliza runtime over HTTP/SSE (see src/runtime/client.ts).
 *
 * React JSX runs through esbuild's automatic runtime, so the Phase 0 skeleton
 * needs no @vitejs/plugin-react (no Fast Refresh yet — added in Phase 1 once
 * the app is a real workspace member with its own install).
 */
// Honor the desktop orchestrator's assigned UI port (dev-platform.mjs sets
// ELIZA_PORT), so the Electrobun shell's ELIZA_RENDERER_URL points here. Falls
// back to 5174 for standalone `vite` runs — inside the runtime's auto-allowed
// loopback CORS range (5174–5200) so the browser dev path reaches :31337 too.
const port =
  Number(process.env.ELIZA_PORT || process.env.ELIZA_UI_PORT) || 5174;

export default defineConfig({
  // Bind IPv4 loopback explicitly. Vite 7 otherwise binds `localhost` → ::1
  // (IPv6), but the desktop orchestrator's waitForPort + the agent CORS gate
  // both speak 127.0.0.1, so an IPv6-only bind hangs the launch.
  server: { host: "127.0.0.1", port, strictPort: true },
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client"] },
});
