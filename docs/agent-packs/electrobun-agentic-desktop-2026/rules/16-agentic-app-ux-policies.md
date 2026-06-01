# 16 — Agentic App UX Policies

## Before action

- Tell the user when an action is AI-assisted.
- Show what data will be used.
- Ask confirmation before external side effects, destructive changes, purchases, uploads, account actions, or irreversible writes.

## During action

- Show progress for long-running model/tool work.
- Allow cancellation.
- Use bounded tool budgets.
- Keep partial output clearly marked as draft/intermediate.

## After action

- Show what changed.
- Provide undo where feasible.
- Surface safe error messages without raw provider/tool internals or secrets.
- Do not retain transcripts silently.
