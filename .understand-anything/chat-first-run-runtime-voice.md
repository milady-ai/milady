# Understand Chat Answer

Query: How does first-run desktop startup connect the UI to local runtime and voice?

## Answer

The graph shows the first-run path crossing three layers: `Product Entry And Desktop Shell`, `Runtime App Core`, and `Shared UI And First Run`, with local voice/inference in the plugin layer.

Key nodes:
- `file:apps/app/src/main.tsx` (apps/app/src/main.tsx): main.tsx is a typescript source file in the Milady codebase. It contains 50 functions, 8 imports.
- `file:eliza/packages/app-core/platforms/electrobun/src/native/agent.ts` (eliza/packages/app-core/platforms/electrobun/src/native/agent.ts): agent.ts is a typescript source file in the Milady codebase. It contains 56 functions, 1 class, 10 imports.
- `file:eliza/packages/ui/src/components/shell/FirstRunShell.tsx` (eliza/packages/ui/src/components/shell/FirstRunShell.tsx): FirstRunShell.tsx is a typescript source file in the Milady codebase. It contains 10 functions, 2 imports.
- `file:eliza/packages/ui/src/first-run/use-first-run-controller.ts` (eliza/packages/ui/src/first-run/use-first-run-controller.ts): use-first-run-controller.ts is a typescript source file in the Milady codebase. It contains 12 functions, 13 imports.
- `file:eliza/packages/ui/src/first-run/first-run.ts` (eliza/packages/ui/src/first-run/first-run.ts): first-run.ts is a typescript source file in the Milady codebase. It contains 24 functions, 4 imports.
- `file:eliza/plugins/plugin-local-inference/src/runtime/embedding-warmup-policy.ts` (eliza/plugins/plugin-local-inference/src/runtime/embedding-warmup-policy.ts): embedding-warmup-policy.ts is a typescript source file in the Milady codebase. It contains 3 functions.
- `file:eliza/plugins/plugin-local-inference/src/services/voice/types.ts` (eliza/plugins/plugin-local-inference/src/services/voice/types.ts): types.ts is a typescript source file in the Milady codebase.

The practical ownership split is: `apps/app/src/main.tsx` boots the branded renderer, Electrobun `agent.ts` starts the packaged sidecar/runtime, `FirstRunShell` renders setup, and `use-first-run-controller.ts` coordinates text/voice setup state against runtime readiness. Local ASR/TTS and model readiness belong under `plugin-local-inference`, not the browser `SpeechRecognition` surface.