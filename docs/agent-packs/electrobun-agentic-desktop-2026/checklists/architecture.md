# Architecture Checklist

- `src/shared` contracts separated from privileged Bun code.
- `src/bun` owns privileged APIs and tools.
- Views own presentation only.
- AgentOrchestrator isolated.
- ModelRouter fallback behavior defined.
- ToolRegistry least-privilege.
- Command palette/menu/tray/deep-link actions route to shared dispatcher.
