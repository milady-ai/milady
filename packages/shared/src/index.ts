/**
 * @miladyai/shared — Browser-safe code shared between agent and app-core.
 * Use subpath imports for granular access (e.g. @miladyai/shared/contracts).
 */
export * from "./env-utils.js";
export * from "./restart.js";
export * from "./connectors.js";
export { migrateLegacyRuntimeConfig } from "./contracts/onboarding.js";
export {
  isMiladySettingsDebugEnabled,
  sanitizeForSettingsDebug,
  settingsDebugCloudSummary,
} from "./settings-debug.js";
export * from "./runtime-env.js";
export { sanitizeSpeechText } from "./spoken-text.js";
