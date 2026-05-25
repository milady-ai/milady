# 15 — Apple Swift Plugin Porting Map

This plugin ports patterns, not Apple-only APIs.

| Apple plugin asset | Electrobun equivalent | Port status |
|---|---|---|
| `AGENTS.md` operating contract | `AGENTS.md` for Bun/Electrobun/TypeScript | Ported |
| Foundation Models rule | Provider-neutral ModelRouter with local/BYOK/fallback routes | Ported as pattern |
| App Intents rule | Typed RPC + menu/tray/context/deep-link/command-palette actions | Ported as pattern |
| Fruta architecture | Shared `src/shared`, thin `src/bun`, thin views, reusable domain services | Ported as architecture |
| Swift concurrency | TypeScript strictness, `AbortSignal`, timeouts, cleanup lifecycle | Ported as async-safety rule |
| SwiftData/Core Data | `bun:sqlite`, Bun SQL, ORM only when justified | Ported |
| Keychain | `Bun.secrets` / OS credential store | Ported |
| Widgets/App Clips/Live Activities | Small windows, tray/floating windows, webview surfaces, update/deep-link flows | Partial equivalent only |
| Xcode CI | Bun/Electrobun CI and platform build matrix | Ported |
| App Store review | Desktop release notes, signing/notarization, privacy docs | Ported as distribution review |
| Swift templates | TypeScript/Electrobun templates | Ported |

Do not implement fake SwiftUI, App Intents, WidgetKit, ActivityKit, App Clip, StoreKit, PassKit, or Foundation Models APIs in an Electrobun app.
