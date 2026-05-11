import type { CapacitorConfig } from "@capacitor/cli";
import {
  parseAllowedHostEnv,
  toCapacitorAllowNavigation,
} from "@elizaos/shared/config/allowed-hosts";
import appConfig from "./app.config";

type CapacitorAllowNavigation = NonNullable<
  NonNullable<CapacitorConfig["server"]>["allowNavigation"]
>;

const allowNavigation: CapacitorAllowNavigation = [
  "localhost",
  "127.0.0.1",
  "*.elizacloud.ai",
  "app.milady.ai",
  "cloud.milady.ai",
  "*.milady.ai",
  "rs-sdk-demo.fly.dev",
  "*.fly.dev",
  "hyperscape.gg",
  "*.hyperscape.gg",
  ...toCapacitorAllowNavigation(
    parseAllowedHostEnv(
      process.env.ELIZA_ALLOWED_HOSTS ?? process.env.MILADY_ALLOWED_HOSTS,
    ),
  ),
];

// Live-reload dev mode: when MILADY_LIVE_RELOAD_URL points at a
// reachable Vite dev server (e.g. `http://192.168.1.71:5173`), the
// Capacitor WebView loads the React UI from that URL instead of the
// bundled APK assets. Save a `.tsx` on the host → see it on the
// on-device WebView in ~200 ms via Vite HMR. The agent stays on the
// device on `127.0.0.1:31337`, the ElizaNativeBridge + AOSP plugins
// stay real, llama.cpp keeps running on-device hardware. Only the
// renderer comes from the host.
//
// Production builds leave MILADY_LIVE_RELOAD_URL unset → the WebView
// loads from bundled assets and `cleartext` stays off.
const liveReloadUrl = process.env.MILADY_LIVE_RELOAD_URL?.trim();
const liveReloadEnabled = !!liveReloadUrl;

const config: CapacitorConfig = {
  appId: appConfig.appId,
  appName: appConfig.appName,
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    // Self-hosters add their own domains via MILADY_ALLOWED_HOSTS
    // (build-time env, comma-separated). Listed entries are baseline.
    allowNavigation,
    ...(liveReloadEnabled
      ? {
          url: liveReloadUrl,
          // Vite dev servers default to plain HTTP; allow it for the
          // dev URL only. Production builds have this off (mTLS / https
          // via Capacitor's own scheme).
          cleartext: true,
        }
      : {}),
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    backgroundColor: "#0a0a0a",
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: "#0a0a0a",
    // Mixed-content allowed in live-reload mode so http://<host>:5173
    // can fetch https://localhost subresources without WebView upgrade
    // warnings. Production builds keep mixed-content off.
    allowMixedContent: liveReloadEnabled,
    captureInput: true,
    // WebView Chrome DevTools enabled in live-reload mode so we can
    // chrome://inspect into the device WebView during dev iterations.
    webContentsDebuggingEnabled: liveReloadEnabled,
  },
};

export default config;
