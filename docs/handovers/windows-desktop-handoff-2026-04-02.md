# Windows Desktop Handoff

Date: 2026-04-02
Branch: `codex/v2.0.5-fixes`

## Scope

This handoff covers Windows Electrobun desktop work around:

- microphone permission spam
- false-positive Windows permission state in onboarding/settings
- talkmode fallback behavior when Whisper is unavailable
- shutdown splash timing
- desktop camera/webcam routing in media settings

## Implemented

### Mic / talkmode

- Stopped renderer-side permission probing from overriding Windows desktop permission state.
- Changed Windows desktop permissions to default to `not-determined` instead of fake `granted`.
- Prevented browser speech-recognition auto-restart on Windows Electrobun.
- Fixed native talkmode false-success behavior:
  native start without Whisper now falls through instead of pretending voice is working.
- Added persistent talkmode diagnostics to:
  `%APPDATA%\\Milady\\milady-startup.log`

### Windows permissions UX

- Windows mic/camera actions now say `Open Privacy Settings` instead of implying direct per-app grant.
- Settings/onboarding copy now explains that Windows privacy pages are advisory and the real check is whether capture works in Milady.
- Windows onboarding no longer blocks on a synthetic macOS-style granted state.
  It can proceed after the privacy step instead of looping on `Grant Permissions`.

### Webcam / camera

- Fixed desktop camera plugin lookup to prefer `MiladyCamera`.
- Desktop media camera actions now use the real camera plugin instead of stub Electrobun camera RPCs for:
  - device enumeration
  - permission request/check
  - preview
  - switch camera
  - capture photo
  - start/stop recording
- Added a real preview host element in the media settings camera panel.

### Shutdown splash

- Added renderer shutdown overlay.
- Moved quit/relaunch splash behavior into `DesktopManager` so multiple app-exit paths can show it before the process exits.

## Files in this handoff

- `apps/app/electrobun/src/index.ts`
- `apps/app/electrobun/src/native/agent.ts`
- `apps/app/electrobun/src/native/desktop.ts`
- `apps/app/electrobun/src/native/permissions-win32.ts`
- `apps/app/electrobun/src/native/talkmode.ts`
- `apps/app/electrobun/src/rpc-schema.ts`
- `apps/app/plugins/swabble/electrobun/src/index.ts`
- `apps/app/plugins/talkmode/electrobun/src/index.js`
- `apps/app/plugins/talkmode/electrobun/src/index.ts`
- `apps/app/test/app/talkmode-electrobun-rpc.test.ts`
- `packages/app-core/src/App.test.ts`
- `packages/app-core/src/App.tsx`
- `packages/app-core/src/bridge/native-plugins.ts`
- `packages/app-core/src/components/settings/MediaSettingsSection.desktop.test.tsx`
- `packages/app-core/src/components/settings/PermissionsSection.tsx`
- `packages/app-core/src/components/settings/media-settings-providers.tsx`
- `packages/app-core/src/components/settings/permission-controls.tsx`
- `packages/app-core/src/components/settings/permission-types.ts`
- `packages/app-core/src/hooks/useVoiceChat.ts`
- `packages/app-core/src/hooks/useVoiceChat.test.ts`
- `packages/app-core/src/state/useChatLifecycle.ts`
- `packages/app-core/test/app/PermissionsOnboarding.test.tsx`
- `packages/app-core/test/app/PermissionsSection.test.tsx`

## Validated

- `bunx vitest run packages/app-core/src/App.test.ts`
- `bunx vitest run packages/app-core/src/components/settings/MediaSettingsSection.desktop.test.tsx packages/app-core/test/app/PermissionsSection.test.tsx packages/app-core/test/app/PermissionsOnboarding.test.tsx`
- `bunx vitest run apps/app/test/app/talkmode-electrobun-rpc.test.ts packages/app-core/src/hooks/useVoiceChat.test.ts packages/app-core/src/components/settings/VoiceConfigView.desktop.test.tsx`
- `git diff --check`

## Remaining risks / next checks

- Verify shutdown splash appears for every real Windows exit path:
  app menu quit, renderer desktop quit, relaunch, tray/context quit if present.
- Verify media settings camera panel on Windows with a real webcam:
  devices list, preview, capture photo, record/stop.
- If camera still fails:
  determine whether the failure is device enumeration, `getUserMedia`, preview attach, or recorder/canvas behavior.
- If voice still fails after no-spam behavior:
  inspect `%APPDATA%\\Milady\\milady-startup.log` for `TalkMode` lines.

## Important note

The repo worktree also contains unrelated dirty files outside this Windows desktop handoff. Those should be reviewed separately and are intentionally not part of this handoff commit.
