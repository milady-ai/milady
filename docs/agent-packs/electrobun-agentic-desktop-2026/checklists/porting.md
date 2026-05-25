# Apple-to-Electrobun Porting Checklist

- Apple-only APIs excluded.
- Foundation Models pattern mapped to ModelRouter.
- App Intents pattern mapped to typed actions/RPC/surfaces.
- Fruta shared architecture mapped to `src/shared` + thin main/view boundaries.
- Keychain mapped to `Bun.secrets`.
- SwiftData/Core Data mapped to SQLite/Bun SQL.
- Widgets/App Clips mapped only to partial desktop equivalents.
