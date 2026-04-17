/**
 * Milady — Application Configuration
 *
 * Single source of truth for app identity. Used by:
 * - capacitor.config.ts (mobile builds)
 * - main.tsx (React boot)
 * - run-mobile-build.mjs (native overlay — reads appId/appName via regex)
 * - Electrobun desktop shell (via ELIZA_APP_NAME / ELIZA_APP_ID env vars)
 *
 * To create a new app, copy this file and change the values below.
 */
import type { AppConfig } from "@elizaos/app-core";

interface AppWebConfig {
  shortName: string;
  themeColor: string;
  backgroundColor: string;
  shareImagePath: string;
}

const config = {
  appName: "Milady",
  appId: "com.miladyai.milady",
  orgName: "milady-ai",
  repoName: "milady",
  cliName: "milady",
  description: "Cute agents for the acceleration",
  envPrefix: "MILADY",
  namespace: "milady",

  desktop: {
    bundleId: "com.miladyai.milady",
    urlScheme: "milady",
  },

  web: {
    shortName: "Milady",
    themeColor: "#08080a",
    backgroundColor: "#0a0a0a",
    shareImagePath: "/og-image.png",
  },

  branding: {
    appName: "Milady",
    orgName: "milady-ai",
    repoName: "milady",
    docsUrl: "https://docs.milady.ai",
    appUrl: "https://app.milady.ai",
    bugReportUrl:
      "https://github.com/milady-ai/milady/issues/new?template=bug_report.yml",
    hashtag: "#MiladyAgent",
    fileExtension: ".milady-agent",
    packageScope: "miladyai",
  },
} satisfies AppConfig & { web: AppWebConfig };

export default config;
