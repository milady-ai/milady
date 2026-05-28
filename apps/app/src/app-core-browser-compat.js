export * from "../../../eliza/packages/app-core/src/browser.ts";
export {
  getWindowNavigationPath,
  isAppWindowRoute,
} from "../../../eliza/packages/ui/src/navigation/index.ts";
export {
  applyForceFreshFirstRunReset as applyForceFreshOnboardingReset,
  applyLaunchConnection,
  applyLaunchConnectionFromUrl,
  installDesktopPermissionsClientPatch,
  installForceFreshFirstRunClientPatch as installForceFreshOnboardingClientPatch,
  installLocalProviderCloudPreferencePatch,
  isDetachedWindowShell,
  resolveWindowShellRoute,
  shouldInstallMainWindowFirstRunPatches as shouldInstallMainWindowOnboardingPatches,
  syncDetachedShellLocation,
} from "../../../eliza/packages/ui/src/platform/index.ts";
