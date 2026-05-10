# iOS App Store — First Submission Checklist

This file tracks the state of the Milady iOS Capacitor app (`apps/app/ios/App/`) for App Store submission. It is intended for the engineer driving submission.

The app ships as a thin HTTP client. The default runtime mode (`VITE_MILADY_IOS_RUNTIME_MODE=cloud`) talks to Eliza Cloud; `cloud-hybrid` and `remote-mac` are advanced modes for paired desktops. The bundle does not include Bun, JIT, or downloaded code, and `LlamaCppCapacitor` is excluded from the App Store binary by default (see `scripts/ios-runtime-mode.mjs` and `eliza/packages/app-core/scripts/run-mobile-build.mjs`).

## Privacy Manifest

`apps/app/ios/App/App/PrivacyInfo.xcprivacy` declares:

- `NSPrivacyAccessedAPICategoryUserDefaults` — `CA92.1`, `1C8F.1` (pairing record + plugin state).
- `NSPrivacyAccessedAPICategoryFileTimestamp` — `C617.1`, `3B52.1` (Capacitor + camera/screencapture plugins read attributes of files in the app's own container).
- `NSPrivacyAccessedAPICategoryDiskSpace` — `85F4.1`, `E174.1` (file size readback for captured media).
- `NSPrivacyTracking` — `false`.
- `NSPrivacyTrackingDomains` — empty.
- `NSPrivacyCollectedDataTypes` — declares `NSPrivacyCollectedDataTypeUserContent` linked to identity, used for app functionality only (chat prompts forwarded to the user-configured backend).

The same template lives at `eliza/packages/app-core/platforms/ios/App/App/PrivacyInfo.xcprivacy` and is synced into `apps/app/ios/App/App/` by `run-mobile-build.mjs`. Keep the two files in sync — the build will overwrite the milady copy.

Verify before submission:

```bash
plutil -lint apps/app/ios/App/App/PrivacyInfo.xcprivacy
bun run check:ios:store-readiness
```

If any new third-party SDK is added, regenerate the manifest with that SDK's required-reason categories. Audit candidates: `UIPasteboard`, `kern.boottime` / `systemUptime`, `activeInputModes`. None are in the current source.

## Entitlements — Apple approval needed before first submission

`apps/app/ios/App/App/App.entitlements` requests four privileged entitlements. Each must be granted on the developer account before submission, or the build will fail signing / be rejected at review:

| Entitlement | Granted on default developer account? | Action required |
| --- | --- | --- |
| `com.apple.developer.family-controls` | NO — Apple-granted only | Submit a request to Apple via the developer portal (Account → Capabilities → "Family Controls (Distribution)"). Apple expects a clear use-case write-up: Milady uses FamilyControls + ManagedSettings + DeviceActivity to let the user block apps and websites the agent has been told to block on their behalf. Review can take 1–4 weeks. |
| `com.apple.developer.healthkit` | YES, after the user enables HealthKit capability in the App Store Connect listing and provides a privacy policy URL | Confirm `NSHealthShareUsageDescription` is set in Info.plist (it is) and complete the HealthKit attestation in App Store Connect. |
| `com.apple.developer.healthkit.background-delivery` | YES (paired with `healthkit`) | Same as above. The justification: background sleep/biometric polling powers wake-time and sleep-aware reminders. |
| `aps-environment = $(APS_ENVIRONMENT)` | YES — automatic with a valid push capability | The signing pipeline must inject `development` or `production` via xcconfig depending on the build flavor. Pre-flight: confirm the active configuration sets `APS_ENVIRONMENT`. |
| `com.apple.security.application-groups` (`group.ai.milady.milady`) | YES — automatic | None. Used by the WebsiteBlocker extension and AppBlocker plugin to share state. |

### `WebsiteBlockerContentExtension`

The Safari content blocker extension (`apps/app/ios/App/App/WebsiteBlockerContentExtension/`) ships its own bundle and entitlements. It does NOT need additional Apple approval beyond the developer team's existing app-extension capability, but the extension's bundle id must be a sub-id of the main app (e.g. `ai.milady.milady.WebsiteBlocker`) and must be added to App Store Connect alongside the main app.

## Pre-flight Verification

Run before every submission build:

```bash
# Privacy manifest + entitlement structural checks
bun run check:ios:store-readiness

# Plist syntax
plutil -lint apps/app/ios/App/App/PrivacyInfo.xcprivacy
plutil -lint apps/app/ios/App/App/Info.plist
plutil -lint apps/app/ios/App/App/App.entitlements

# Confirm LlamaCppCapacitor is NOT in the generated Podfile
grep -q LlamaCppCapacitor apps/app/ios/App/Podfile && echo "FAIL: LlamaCppCapacitor present" || echo "OK: llama excluded"

# Build with cloud runtime mode (the App Store target)
bun run build:ios:cloud
```

## Open TODOs Before First Submission

- [ ] Submit `com.apple.developer.family-controls` distribution request to Apple. Block submission until granted.
- [ ] Provide the App Store Connect privacy policy URL (HealthKit attestation requires it).
- [ ] Confirm release `xcconfig` sets `APS_ENVIRONMENT=production` and that the push capability is enabled on the App ID.
- [ ] Re-audit `NSPrivacyCollectedDataTypes` if any analytics SDK or crash reporter is added (currently none).
- [ ] If the App Store target needs to keep on-device inference (`MILADY_IOS_INCLUDE_LLAMA=1`), update this checklist to declare the additional binary footprint and any required-reason APIs the llama.cpp xcframework adds.
