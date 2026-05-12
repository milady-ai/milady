import type { CapacitorConfig } from "@capacitor/cli";
import {
  parseAllowedHostEnv,
  toCapacitorAllowNavigation,
} from "@elizaos/app-core/config/allowed-hosts";
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
    // Live-reload dev mode: MILADY_LIVE_RELOAD_URL=http://<host>:<port>
    // points the on-device WebView at a running vite dev server on the
    // host machine. The APK native layer (agent, llama, bridge) stays
    // on-device; only the React renderer is served remotely. Build with
    // `MILADY_LIVE_RELOAD_URL=http://192.168.x.x:5173 bun run build:android`.
    ...(liveReloadEnabled
      ? {
          url: liveReloadUrl,
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
    // Allow mixed content when doing live-reload dev (vite serves over plain
    // HTTP from the host LAN; the APK shell loads it over cleartext).
    allowMixedContent: liveReloadEnabled,
    captureInput: true,
    // Enable WebContents debugging in live-reload mode so Chrome DevTools can
    // attach to the on-device WebView while developing.
    webContentsDebuggingEnabled: liveReloadEnabled,
  },
};

export default config;
