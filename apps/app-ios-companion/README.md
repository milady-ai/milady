# Milady iOS companion (T8c skeleton)

Capacitor-wrapped iOS companion for Milady. Implements the skeleton defined in
`docs/plan-unified-scenario-matrix.md` §6.11.

## What ships in this skeleton

- Capacitor 6-compatible iOS shell (`appId: com.milady.companion`).
- Vite + React UI with two screens: pairing-code entry and chat mirror.
- Native `MiladyIntentPlugin` (Swift) exposing three methods:
  - `scheduleAlarm({ timeIso, title, body })` — `UNUserNotificationCenter`.
  - `receiveIntent(intent)` — device-bus intent dispatch.
  - `getPairingStatus()` — reads pairing record from `UserDefaults`.
- TypeScript facade + web fallback (`src/plugins/milady-intent.ts`).
- APNs registration in `AppDelegate.swift`, gated on `MILADY_APNS_ENABLED=1`.

The web build is the dev loop: the web fallback is explicitly absent (rejects
native-only calls, reports `paired: false`), so you cannot accidentally ship a
stubbed success path.

## Deferred to T9c (iOS remote companion — full UX)

- VNC viewer + input relay.
- Push-triggered session start (needs APNs key provisioning).
- Full chat mirror (SSE stream wiring, conversation hydration, composer).
- Pairing QR handshake against the desktop app.

## Build and run

### Web-only (no simulator)

```bash
bun install
bun run dev        # vite dev server on :2139
bun run build      # vite build → dist/
bun run test       # vitest: web-fallback suite
bun run typecheck
```

The web build succeeds without Xcode, without a simulator, and without Apple
Developer credentials. This is the supported fast path for iterating on the UI
and the TypeScript facade.

### iOS simulator / device

```bash
export MILADY_E2E_APPLE_TEAM_ID=<your Apple Developer team ID>
export MILADY_E2E_APPLE_APNS_KEY_ID=<key id>           # only needed for push
export MILADY_E2E_APPLE_APNS_KEY_P8=<base64 PEM>       # only needed for push
export MILADY_E2E_APPLE_APNS_TOPIC=com.milady.companion # only needed for push

bun run build:ios   # builds web, runs `cap sync ios`, opens Xcode
```

Then in Xcode: select the `App` scheme, choose a simulator or signed device,
and hit Run.

To enable APNs registration at runtime:

```bash
VITE_MILADY_APNS_ENABLED=1 bun run build && bunx cap sync ios
```

Set `MILADY_APNS_ENABLED=1` in `Info.plist` (either manually or via an Xcode
build setting that mirrors the Vite env) so `AppDelegate` registers for remote
notifications.

### Required env vars

See `docs/scenario-credentials.md` for canonical definitions:

- `MILADY_E2E_APPLE_TEAM_ID` — Apple Developer team ID used for signing.
- `MILADY_E2E_APPLE_APNS_KEY_ID` — APNs auth-key identifier.
- `MILADY_E2E_APPLE_APNS_KEY_P8` — Base64-encoded APNs `.p8` PEM.
- `MILADY_E2E_APPLE_APNS_TOPIC` — APNs topic, matches the `appId`.
- `VITE_MILADY_AGENT_URL` — HTTPS URL of the paired agent (for the chat mirror
  fallback when no paired record exists).
- `VITE_MILADY_APNS_ENABLED` — set to `1` to opt into APNs registration.

## Status

- Web build: passes (`bun run build`, `bun run typecheck`, `bun run test`).
- iOS simulator build: requires Xcode + Apple Developer provisioning and is not
  exercised by CI in this skeleton. The Swift plugin compiles under Capacitor's
  standard plugin integration; project generation (`cap add ios`) is performed
  on demand by `scripts/build-ios.sh`.
