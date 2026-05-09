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
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
