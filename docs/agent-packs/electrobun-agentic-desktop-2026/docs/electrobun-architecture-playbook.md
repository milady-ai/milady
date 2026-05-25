# Electrobun Architecture Playbook

## Recommended repository shape

```text
.
├── package.json
├── bun.lock
├── tsconfig.json
├── electrobun.config.ts
├── src/
│   ├── bun/
│   │   ├── index.ts
│   │   ├── windows.ts
│   │   ├── agent/
│   │   ├── storage/
│   │   └── system/
│   ├── shared/
│   │   ├── rpc.ts
│   │   ├── validation.ts
│   │   └── domain.ts
│   └── mainview/
│       ├── index.html
│       ├── index.ts
│       └── style.css
├── tests/
├── scripts/
└── artifacts/       # generated; never source-edit
```

## Main process

The Bun main process owns privileged actions:

- Window/view creation.
- RPC handlers.
- Tool execution.
- Filesystem/network/database access.
- Model provider calls.
- Menu/tray/context actions.
- Updates and release lifecycle.

## View process

Views own presentation:

- UI rendering.
- Input collection.
- Command palette.
- Progress display.
- Accessibility/focus behavior.
- Browser-side RPC client.

Views should not own secrets, database handles, unrestricted file paths, update application, or model provider keys.

## Shared contracts

Keep RPC and tool contracts in shared TypeScript modules. Every cross-boundary payload should be serializable and validated. The absence of runtime validation is acceptable only for hardcoded internal messages that never cross a trust boundary.
