# 07 — Data, Persistence, and Agent Memory

Separate memory classes.

| Memory | Storage | Policy |
|---|---|---|
| Session transcript | In-memory orchestrator/session | Bounded; compacted; not persisted by default. |
| User content | SQLite/files/app data directory | User-visible; exportable/deletable. |
| Search index | Rebuildable SQLite FTS/vector/cache | Reconstructable; avoid sensitive over-indexing. |
| Secrets/tokens | `Bun.secrets` / OS credential store | Never in source, logs, prompts, SQLite, localStorage, or tests. |
| Preferences | JSON config/user settings | Low-sensitivity only. |
| Eval data | Synthetic fixtures | No private user data. |

## Persistence rules

- Prefer `bun:sqlite` for local structured app data when the project is lightweight.
- Use Bun SQL, Drizzle, Prisma, or another ORM only when schema/migration requirements justify the dependency.
- Do not store raw prompts/transcripts unless the product defines consent, retention, export, and deletion behavior.
- Avoid localStorage/IndexedDB for secrets or sensitive agent state.
- Redact before logs and crash reports.
