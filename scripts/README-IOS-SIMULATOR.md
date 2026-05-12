# `scripts/run-ios-simulator.mjs`

One-shot iOS Simulator runner for the Milady app. Builds the on-device
agent JS bundle, overlays the Capacitor iOS project, installs Pods,
compiles for the iPhone 15 Pro Simulator, boots the Simulator, installs
the `.app`, and launches it with a streamed console.

## TL;DR

```bash
bun run ios:simulator
```

Equivalent to `node scripts/run-ios-simulator.mjs`.

## What it does

11 numbered steps printed as `[ios-sim] [step N/11] ...`:

1. Verifies Xcode + at least one iOS Simulator runtime.
2. Verifies the first-light GGUF model is staged at
   `apps/app/ios/App/App/agent/models/<MODEL_FILENAME>` (skippable —
   see env vars).
3. Ensures workspace deps are installed (`bun install` only if
   `node_modules/` is missing).
4. Builds the agent bundle for `ios-jsc`:
   `bun run build:ios-jsc` inside `eliza/packages/agent/`.
5. Builds the JSContext polyfill prefix (when
   `native/ios-bun-port/polyfill/package.json` exists) and
   re-stitches `polyfill-prefix.js + agent-bundle-ios.js` so the
   final bundle the native bridge loads has the polyfill on top.
   Skipped if either file is missing or the stitch sentinel is
   already in the bundle.
6. Runs the iOS overlay step
   (`run-mobile-build.mjs ios-overlay`).
7. Stages the agent bundle, `manifest.json`, and PGlite assets
   under `apps/app/ios/App/App/agent/`.
8. `pod install` inside `apps/app/ios/App/`.
9. `xcodebuild -workspace App.xcworkspace -scheme App -configuration
   Debug -destination 'platform=iOS Simulator,name=iPhone 15
   Pro,OS=latest' build` (with `CODE_SIGNING_ALLOWED=NO`).
10. `simctl boot 'iPhone 15 Pro'` (idempotent — already-booted is
    fine) and brings the Simulator app forward.
11. Locates the freshly built `App.app` in DerivedData, installs it
    via `simctl install booted`, then launches with `simctl launch
    --console-pty booted com.miladyai.milady`. Ctrl-C tears down the
    launch session.

Every step fails loud with a clear `[ios-sim] FAIL: ...` line and a
non-zero exit code.

## Pre-flight checks

On a fresh Mac, do these once:

1. **Xcode**: install from the App Store. `xcode-select --install` is
   not enough — you need the full Xcode bundle.
2. **Xcode CLI selected**: `sudo xcode-select -s /Applications/Xcode.app`.
3. **Simulator runtime**: Xcode → Settings → Platforms → install an iOS
   runtime (most recent is fine).
4. **CocoaPods**: `sudo gem install cocoapods` (or `brew install
   cocoapods`).
5. **Repo deps**: `bun install` at the repo root.
6. **First-light model**: `bun
   native/ios-bun-port/models/download-first-light.sh`. This downloads
   ~398 MB into `apps/app/ios/App/App/agent/models/`.

## Environment variables

| Variable                    | Default                              | Purpose                                                                                          |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `MILADY_IOS_SIM_DEVICE`     | `iPhone 15 Pro`                      | Simulator device name passed to `xcodebuild -destination` and `simctl boot`.                     |
| `MILADY_IOS_APP_ID`         | `com.miladyai.milady`                | Bundle ID used for `simctl install` / `launch`.                                                  |
| `MILADY_IOS_SCHEME`         | `App`                                | Xcode scheme name.                                                                               |
| `MILADY_MODEL_NAME`         | `qwen2.5-0.5b-instruct-q4_k_m.gguf`  | Expected GGUF filename under `apps/app/ios/App/App/agent/models/`.                               |
| `MILADY_SKIP_MODEL_CHECK`   | unset                                | Set to `1` to bypass the model check (useful for cloud-only smoke tests).                        |

## Troubleshooting

**`Xcode command-line tools not found`**
→ Install full Xcode and run `sudo xcode-select -s /Applications/Xcode.app`.

**`No iOS Simulator runtime found`**
→ Open Xcode → Settings → Platforms → iOS → click `Get` next to a runtime.

**`First-light model missing`**
→ Run `bun native/ios-bun-port/models/download-first-light.sh` (or set
`MILADY_SKIP_MODEL_CHECK=1` for cloud-only testing).

**`agent bundle not found at .../agent-bundle-ios.js`**
→ The `bun run build:ios-jsc` step failed silently. Run it directly
inside `eliza/packages/agent/` to see the full error:
```bash
cd eliza/packages/agent && bun run build:ios-jsc
```

**`pod install` is extremely slow on first run**
→ Expected. CocoaPods downloads the entire spec repo. Subsequent runs
hit a warm cache.

**`xcodebuild` fails with code-signing errors**
→ The script passes `CODE_SIGNING_ALLOWED=NO` which is the right knob
for Simulator. If it still fails, open `apps/app/ios/App/App.xcworkspace`
in Xcode once to let Xcode pick a development team for the project.

**`could not find App.app under DerivedData`**
→ Custom DerivedData location. Either point Xcode back at the default
(Xcode → Settings → Locations → Derived Data → `Default`) or run
`xcrun simctl install booted <path-to-your-App.app>` manually.

**App launches but goes straight to the cloud picker**
→ The iOS runtime mode is resolved at build time via
`VITE_MILADY_IOS_RUNTIME_MODE`. For the local-agent path the overlay
step has to be invoked with mode `local`. See
`scripts/ios-runtime-mode.mjs` for the dev-mode flow; the simulator
script uses the `ios-overlay` target which does not pre-pin a mode.

## Known gaps

- The script assumes the Capacitor plugin
  `@elizaos/capacitor-bun-runtime` has been built. Its build output
  lives at
  `eliza/packages/native-plugins/bun-runtime/dist/` and is produced by
  `bun run build` inside that package (or by `bun install` triggering
  the package's `prepublishOnly` hook — varies by workspace setup).
- `MILADY_IOS_RUNTIME_MODE=local` is not yet wired into the `ios-overlay`
  target — the renderer currently picks cloud by default. To force the
  local-agent boot path during dev, set
  `VITE_MILADY_IOS_RUNTIME_MODE=local` in the environment before running
  the script (it flows into Vite via `import.meta.env`).
