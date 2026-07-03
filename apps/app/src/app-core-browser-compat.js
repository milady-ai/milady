export * from "../../../eliza/packages/app-core/src/browser.ts";
// `App` is intentionally kept off the @elizaos/ui browser facade (browser.ts:16
// — exporting it there double-bundles the shell into plugin-host imports), so
// the `export *` above no longer surfaces it. The app shell entry (main.tsx)
// still imports `App` from @elizaos/app-core, so re-export it explicitly.
export { App } from "../../../eliza/packages/ui/src/App.tsx";
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
