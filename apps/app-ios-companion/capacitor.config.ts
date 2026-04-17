import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Milady iOS companion — Capacitor config.
 *
 * appId is stable across envs. Web contents debugging is enabled so we can
 * attach Safari Web Inspector during development; disable for release builds
 * via the Xcode scheme or an env-gated override before archiving.
 */
const isDev = process.env.NODE_ENV !== "production";

const config: CapacitorConfig = {
  appId: "com.milady.companion",
  appName: "Milady Companion",
  webDir: "dist",
  server: {
    iosScheme: "https",
    allowNavigation: [
      "localhost",
      "127.0.0.1",
      "*.elizacloud.ai",
      "*.milady.ai",
    ],
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    backgroundColor: "#0a0a0a",
    allowsLinkPreview: false,
    webContentsDebuggingEnabled: isDev,
  },
};

export default config;
