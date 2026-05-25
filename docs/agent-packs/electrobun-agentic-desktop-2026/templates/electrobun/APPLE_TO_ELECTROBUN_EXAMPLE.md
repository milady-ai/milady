# Example: Porting an Apple App Intent Tool to Electrobun

Apple pattern:

```swift
struct SummarizeNoteIntent: AppIntent { ... }
```

Electrobun pattern:

1. Add `notes.search` or `agent.run` to `AppCommandId`.
2. Add request/response types to `src/shared/rpc.ts`.
3. Implement the handler in Bun with `BrowserView.defineRPC`.
4. Expose it in command palette, application menu, or tray.
5. Gate permissions and confirmation in the Bun main process.
6. Add Bun tests for validation and denial cases.

Do not emulate Siri/App Intents. Use native desktop surfaces.
