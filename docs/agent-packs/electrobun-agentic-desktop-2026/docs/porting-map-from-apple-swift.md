# Porting Map from Apple Agentic Swift Plugin

## What was ported directly

- Operating contract: inspect first, small changes, tests, privacy, accessibility, release readiness.
- Hooks: pre-bash, pre-edit, post-edit, post-bash, stop checklist.
- Slash command cadence: plan → architecture/RPC/tool → test → security/privacy → release.
- Automations: doctor, validate, security audit, build/test, release audit, prompt/tool eval runner.
- Agentic architecture: orchestrator, model router, tool registry, safety policy, typed boundaries.
- Secrets/persistence concepts: Keychain → `Bun.secrets`; SwiftData/Core Data → `bun:sqlite`/Bun SQL.

## What was translated conceptually

### Foundation Models → ModelRouter

Apple’s on-device Foundation Models pattern becomes a provider-neutral ModelRouter:

- `local` provider if the app integrates a local model service.
- `byok-cloud` provider only with explicit consent and OS-stored keys.
- `deterministic` fallback for non-AI workflows.
- Typed structured output validation replaces guided generation.

### App Intents → Actions/RPC/System Surfaces

App Intents become a unified action system exposed through:

- Typed RPC.
- Command palette.
- Application menu.
- Context menu.
- Tray menu.
- Deep links where supported.

### Fruta shared architecture → Electrobun shared domain

Fruta’s shared domain/services/views pattern becomes:

```text
src/shared/     # typed contracts, domain types, validation, constants
src/bun/        # privileged main process, windows, tools, storage, updater
src/mainview/   # UI view, Electroview client, command palette
src/*view/      # optional additional isolated views
src/bun/agent/  # orchestrator, model routes, tool registry, policy
tests/          # Bun tests and evals
```

### Widgets/App Clips → Desktop surfaces

There is no true App Clip/widget equivalent. Closest practical equivalents:

- Focused lightweight window.
- Tray/floating widget window.
- Deep link entry point.
- Sandboxed embedded webview.
- Static update/release flow for low-friction distribution.

## What must not be ported literally

- `FoundationModels`, `LanguageModelSession`, `AppIntent`, `AppEntity`, `WidgetKit`, `ActivityKit`, `AppClip`, `StoreKit`, `PassKit`, SwiftUI syntax, Xcode target membership, or Apple privacy manifest files unless the Electrobun project also has Apple-native companion targets.
