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

type AppConfigWithAospPropertyPrefix = Omit<AppConfig, "aosp"> & {
  aosp: NonNullable<AppConfig["aosp"]> & { propertyPrefix?: string };
};

const config = {
  appName: "Milady",
  appId: "ai.milady.milady",
  orgName: "milady-ai",
  repoName: "milady",
  cliName: "milady",
  description: "Cute agents for the acceleration",
  envPrefix: "MILADY",
  namespace: "milady",
  defaultApps: [],

  desktop: {
    bundleId: "ai.milady.milady",
    urlScheme: "milady",
  },

  web: {
    shortName: "Milady",
    themeColor: "#08080a",
    backgroundColor: "#0a0a0a",
    shareImagePath: "/og-image.png",
  },

  android: {
    // MiladyOS AOSP image sets `ro.miladyos.product` via
    // `vendor/milady/milady_common.mk:62`. The framework's
    // `ro.elizaos.product` → `ElizaOS/` marker is always emitted; this
    // adds a Milady-brand marker so the renderer can sniff
    // `isMiladyOS()` separately from generic ElizaOS detection.
    userAgentMarkers: [
      { systemProp: "ro.miladyos.product", uaPrefix: "MiladyOS/" },
    ],
  },

  aosp: {
    // MiladyOS AOSP product variant. Consumed by
    // `eliza/packages/app-core/scripts/aosp/*` (build-aosp, validate,
    // sync-to-aosp, boot-validate, etc.). See `AospVariantConfig` in
    // `@elizaos/app-core` for the schema.
    productLunch: "milady_cf_x86_64_phone-trunk_staging-userdebug",
    vendorDir: "milady",
    // System-property prefix used by init.milady.rc + boot validators.
    // Milady follows the Android distro convention where the property
    // namespace adds an "os" suffix to the brand (lineage→lineageos,
    // calyx→calyxos, milady→miladyos), so propertyPrefix differs from
    // vendorDir. When omitted, AospVariantConfig defaults to vendorDir.
    propertyPrefix: "miladyos",
    variantName: "MiladyOS",
    productName: "milady",
    packageName: "ai.milady.milady",
    appName: "Milady",
    commonMk: "vendor/milady/milady_common.mk",
    modelSourceLabel: "milady-download",
    bootanimationAssetDir: "os/android/vendor/milady/bootanimation",
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
} satisfies AppConfigWithAospPropertyPrefix & { web: AppWebConfig };

export default config;
