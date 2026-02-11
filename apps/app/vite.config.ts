import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));
const milaidyRoot = path.resolve(here, "../..");

// The dev script sets MILAIDY_API_PORT; default to 31337 for standalone vite dev.
const apiPort = Number(process.env.MILAIDY_API_PORT) || 31337;

export default defineConfig({
  root: here,
  base: "./",
  publicDir: path.resolve(here, "public"),
  plugins: [tailwindcss(), react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      /**
       * Map @milaidy/capacitor-* packages directly to their TS source.
       * This bypasses resolution issues with local workspace symlinks and
       * outdated bundle exports in the plugins' dist folders.
       */
      {
        find: /^@milaidy\/capacitor-(.*)/,
        replacement: path.resolve(here, "plugins/$1/src/index.ts"),
      },
      // Allow importing from the milaidy src (but NOT @milaidy/capacitor-* plugin packages)
      {
        find: /^@milaidy(?!\/capacitor-)/,
        replacement: path.resolve(milaidyRoot, "src"),
      },
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
    ],
  },
  build: {
    outDir: path.resolve(here, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      input: {
        main: path.resolve(here, "index.html"),
      },
    },
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  server: {
    host: true,
    port: 2138,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://localhost:${apiPort}`,
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[vite] proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[vite] Proxying request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[vite] Received response:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
    fs: {
      // Allow serving files from the app directory and milaidy src
      allow: [here, milaidyRoot],
    },
  },
});
