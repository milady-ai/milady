# Limitations and Non-Equivalents

This is an Electrobun port of a Swift/Apple coding-agent plugin. It intentionally does not pretend every Apple feature exists in Electrobun.

## No direct equivalents

- Foundation Models on-device API.
- App Intents/AppEntity/App Shortcuts/Siri/Spotlight integration.
- WidgetKit/ActivityKit/Live Activities.
- App Clips.
- SwiftUI and Xcode target membership.
- App Store privacy manifests.

## Partial equivalents

- App Intents → typed RPC + command palette + menu/tray/context actions + deep links.
- Widgets/App Clips → small focused windows, tray/floating surfaces, update/deep-link flows.
- SwiftData/Core Data → SQLite/Bun SQL/ORM.
- Keychain → `Bun.secrets`.
- App Store release review → desktop distribution/signing/notarization/privacy docs.

## High-risk areas to verify per project

- Exact Electrobun version and API names.
- Native webview vs CEF renderer behavior on target OSes.
- Linux support for menus/context menus/webview compositing.
- macOS signing/notarization credentials and entitlements.
- Update base URL, artifact upload, and patch retention.
- Cloud AI provider data handling.
