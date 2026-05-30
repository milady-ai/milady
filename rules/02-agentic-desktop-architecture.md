# 02 — Agentic Desktop Architecture

Use this default architecture for new agentic Electrobun features:

```text
HTML/CSS/TS view + command palette + menu/tray/deep link boundary
  -> Electroview typed RPC client
  -> BrowserView.defineRPC handlers in Bun main process
  -> AgentOrchestrator service
  -> ModelRouter + ToolRegistry + SafetyPolicy + PermissionBroker
  -> Domain services/repositories
  -> Bun/Electrobun/OS APIs, SQLite, network, filesystem, updater
```

## AgentOrchestrator responsibilities

- Select a model route: deterministic/local/BYOK cloud, with explicit consent for cloud.
- Keep system/developer instructions static and separate from untrusted user content.
- Attach only task-relevant tools.
- Enforce tool budget, timeout, cancellation, confirmation, and permission gates.
- Compact context; do not persist raw transcripts by default.
- Map model/tool errors to UI-safe states.
- Stream progress through typed events or request/response messages.

## Tool policy

Every tool must define: purpose, typed input, typed output, runtime validation, read/write class, permission gate, user confirmation requirements, timeout, cancellation behavior, error cases, tests, logging policy, and privacy impact.
