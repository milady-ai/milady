# M10 — End-to-end Simulator: user types "hello", model replies

**Owner:** TBD
**Status:** Not started
**Predecessors:** M09
**Successors:** M11

## Goal

`bun run ios:simulator` from a clean checkout, on an Apple Silicon Mac, builds + code-signs + launches the iPhone Simulator with the Milady app, agent boots, model loads, user types "hello", reply streams in.

This is "iOS local agent fully working end to end" per the original product ask.

## Acceptance Criteria

- [ ] `bun run ios:simulator` is a single command, defined in `package.json` at the repo root.
- [ ] Behind the scenes it runs:
  1. `node eliza/packages/app-core/scripts/run-mobile-build.mjs ios-local`
  2. `bun run build:mobile-bundle --target=ios`
  3. `cd apps/app/ios/App && pod install`
  4. `xcodebuild -workspace App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 15 Pro' build`
  5. `xcrun simctl boot 'iPhone 15 Pro' || true`
  6. `xcrun simctl install 'iPhone 15 Pro' apps/app/ios/build/.../App.app`
  7. `xcrun simctl launch --console 'iPhone 15 Pro' com.miladyai.milady`
- [ ] The app launches in <30 seconds (build cached).
- [ ] First-time cold launch takes <60 seconds (model load).
- [ ] Chat UI loads, shows "Ready" indicator after agent boot.
- [ ] User types "hello" → reply streams in within 5 seconds (first token).
- [ ] Conversation persists across app restart (PGlite at `Documents/.milady/db.pglite`).
- [ ] No console errors during normal use (warnings ok).
- [ ] Reproducible on a fresh Mac with only Xcode + bun + bun install run.

## Pre-flight checks

Before claiming M10 done:

1. **Test on three different Mac configs** if possible: M1, M2, M3. Each may have subtle Simulator quirks.
2. **Test with cold start (DB wiped)** and **warm start (DB populated)**. Both should work.
3. **Test with airplane mode on.** Local agent should still work — that's the whole point.
4. **Test app backgrounding.** Background for 10s, foreground. Conversation state intact.
5. **Test app force-quit.** Restart. Conversation state intact.

## What this milestone proves

- The Bun port is real, not theoretical.
- The agent runtime is the same code that runs on desktop + Android.
- `bun:ffi` to static `libllama.a` works.
- PGlite persists across launches.
- The Capacitor app + WKWebView + Bun-loopback HTTP architecture holds together.

## What this milestone does NOT prove

- Performance on device. M11.
- Battery / thermal. M11.
- App Review viability. M12.
- Talk Mode / voice. Phase 2.
- App Intents / Siri. Phase 2.
- Background tasks. Phase 2.

## Effort estimate

- Nominal: 2 weeks
- With "discovered surprises": 3 weeks
