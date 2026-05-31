export * from "../../../eliza/packages/app-core/src/browser.ts";
export {
  applyForceFreshFirstRunReset as applyForceFreshOnboardingReset,
  installForceFreshFirstRunClientPatch as installForceFreshOnboardingClientPatch,
  shouldInstallMainWindowFirstRunPatches as shouldInstallMainWindowOnboardingPatches,
} from "../../../eliza/packages/ui/src/platform/index.ts";
