# Understand Explain: use-first-run-controller.ts

Target: `file:eliza/packages/ui/src/first-run/use-first-run-controller.ts`

## Role

use-first-run-controller.ts is a typescript source file in the Milady codebase. It contains 12 functions, 13 imports.

Layer: Shared UI And First Run — Shared React UI package, shell components, first-run setup, voice/chat surfaces, state hooks, and frontend runtime adapters.

## Internal Structure

- `isFirstRunBrowserSpeechRecognitionSupported` (function) — isFirstRunBrowserSpeechRecognitionSupported is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.
- `resolveFirstRunAsrProvider` (function) — resolveFirstRunAsrProvider is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.
- `isFirstRunVoiceInputSupported` (function) — isFirstRunVoiceInputSupported is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.
- `isFirstRunVoiceOutputSupported` (function) — isFirstRunVoiceOutputSupported is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.
- `resolveFirstRunVoiceLocale` (function) — resolveFirstRunVoiceLocale is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.
- `formatFirstRunVoiceError` (function) — formatFirstRunVoiceError is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.
- `readSyncOnDeviceAgentBearer` (function) — readSyncOnDeviceAgentBearer is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.
- `startMobileLocalAgent` (function) — startMobileLocalAgent is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.
- `startLocalRuntime` (function) — startLocalRuntime is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.
- `waitForAgentApi` (function) — waitForAgentApi is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.
- `normalizeRemoteTarget` (function) — normalizeRemoteTarget is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.
- `useFirstRunController` (function) — useFirstRunController is a function defined in eliza/packages/ui/src/first-run/use-first-run-controller.ts.

## External Connections

Imports:
- `eliza/packages/ui/src/api/index.ts` — index.ts is a typescript source file in the Milady codebase.
- `eliza/packages/ui/src/bridge/index.ts` — index.ts is a typescript source file in the Milady codebase.
- `eliza/packages/ui/src/config/boot-config.ts` — boot-config.ts is a typescript source file in the Milady codebase.
- `eliza/packages/ui/src/first-run/auto-download-recommended.ts` — auto-download-recommended.ts is a typescript source file in the Milady codebase. It contains 5 functions, 4 imports.
- `eliza/packages/ui/src/first-run/first-run.ts` — first-run.ts is a typescript source file in the Milady codebase. It contains 24 functions, 4 imports.
- `eliza/packages/ui/src/first-run/mobile-runtime-mode.ts` — mobile-runtime-mode.ts is a typescript source file in the Milady codebase. It contains 9 functions, 2 imports.
- `eliza/packages/ui/src/first-run/reload-into-first-run-runtime.ts` — reload-into-first-run-runtime.ts is a typescript source file in the Milady codebase. It contains 3 functions, 1 imports.
- `eliza/packages/ui/src/first-run/voice-readiness.ts` — voice-readiness.ts is a typescript source file in the Milady codebase. It contains 3 functions, 6 imports.
- `eliza/packages/ui/src/platform/init.ts` — init.ts is a typescript source file in the Milady codebase. It contains 11 functions, 3 imports.
- `eliza/packages/ui/src/state/index.ts` — index.ts is a typescript source file in the Milady codebase.
- `eliza/packages/ui/src/utils/index.ts` — index.ts is a typescript source file in the Milady codebase.
- `eliza/packages/ui/src/voice/index.ts` — index.ts is a typescript source file in the Milady codebase.
- `eliza/packages/ui/src/voice/local-asr-capture.ts` — local-asr-capture.ts is a typescript source file in the Milady codebase. It contains 11 functions.

Imported by:
- `eliza/packages/ui/src/first-run/FirstRunScreen.tsx` — FirstRunScreen.tsx is a typescript source file in the Milady codebase. It contains 1 function, 3 imports.

## Data Flow

The controller sits between the first-run React shell and platform/runtime services. It gathers user setup input, coordinates speech and transcription state, validates the setup draft, and drives completion back into persisted first-run state.

## Patterns Worth Knowing

- React control primitives detected in source: useMemo, useState, useRef, useEffect, useCallback.
- The file is in the `Shared UI And First Run` layer, so it should orchestrate UI state and service calls but avoid owning packaged-runtime process management.
- It is one of the main places where voice/text setup behavior can accidentally race with TTS playback or backend readiness, so changes here should be verified with first-run UI and voice tests.