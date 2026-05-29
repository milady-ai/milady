# Runtime App Core Post-Change Review: Local Voice Contract

## Changed Files

- `eliza/packages/ui/src/components/shell/useShellController.ts`
- `eliza/packages/ui/src/first-run/voice-readiness.ts`
- `eliza/packages/ui/src/first-run/voice-readiness.test.ts`
- `eliza/packages/ui/src/voice/local-asr-capture.ts`
- `eliza/packages/ui/src/voice/voice-capture-factory.ts`
- `eliza/packages/ui/src/voice/voice-capture-factory.test.ts`
- `eliza/plugins/plugin-local-inference/src/services/manifest/schema.ts`
- `eliza/plugins/plugin-local-inference/tsconfig.json`

`eliza/plugins/plugin-local-inference/native/omnivoice.cpp` is also dirty in the nested checkout, but it is the pre-existing submodule pointer issue from the current branch setup and is not part of this voice-contract slice.

## Affected Layers

- `Shared UI And First Run`: voice capture backend selection, first-run voice readiness, shell voice capture errors, local ASR cleanup diagnostics, UI voice tests.
- `Plugins Local Inference And App Management`: manifest schema Zod import shape and plugin-local-inference TypeScript alias coverage for transitive UI source imports.

The slice stays out of `Runtime App Core` launch policy. It changes renderer voice behavior so packaged desktop no longer treats browser `SpeechRecognition` as the default truth, while local inference remains the model/ASR readiness owner.

## Risk

Risk is moderate and localized to voice capture startup/stop paths. The default desktop behavior now attempts local ASR even when browser primitives report unavailable, so packaged desktop failures surface as capture errors instead of silently selecting browser speech. Web fallback remains available outside Electrobun.

The root graph diff overlay reports no changed files because `eliza/` is a nested checkout ignored by the root Git tree. Manual graph mapping puts the touched files in `Shared UI And First Run` and `Plugins Local Inference And App Management`.

## Verification

- `bunx @biomejs/biome check packages/ui/src/voice/voice-capture-factory.ts packages/ui/src/voice/voice-capture-factory.test.ts packages/ui/src/first-run/voice-readiness.ts packages/ui/src/first-run/voice-readiness.test.ts packages/ui/src/voice/local-asr-capture.ts packages/ui/src/components/shell/useShellController.ts plugins/plugin-local-inference/src/services/manifest/schema.ts plugins/plugin-local-inference/tsconfig.json`
- `git diff --check`
- `rg -n "catch\s*\{\s*\}|\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)|console\.(warn|error|info|debug)" ...` on the touched source files returned no matches.
- `bun ./node_modules/.bin/vitest run packages/ui/src/voice/voice-capture-factory.test.ts packages/ui/src/first-run/voice-readiness.test.ts packages/ui/src/voice/local-asr-capture.test.ts --environment jsdom`: 3 files, 11 tests passed.
- `bun ./node_modules/.bin/vitest run plugins/plugin-local-inference/src/services/readiness.test.ts plugins/plugin-local-inference/src/runtime/embedding-warmup-policy.test.ts plugins/plugin-local-inference/src/routes/local-inference-asr-route.test.ts --environment node`: 3 files, 7 tests passed.
- `bun run --cwd packages/ui typecheck`: passed.
- `bun run --cwd plugins/plugin-local-inference typecheck`: passed.
- `node .understand-anything/tmp/build-architecture-debt-report.mjs`: completed.
- `node .understand-anything/tmp/run-understand-consumers.mjs`: completed.

Local dependency repair required `bun install --frozen-lockfile --ignore-scripts` in `eliza/` because `eliza/node_modules` was missing and package-local tests could not resolve declared dependencies.

## Next Prompt

Run `07-packaged-startup-verification.md` next if the goal is runtime proof. The prior blocker was disk space during desktop staging; the current volume has enough free space to retry, but that prompt should be run as a separate startup-verification slice.
