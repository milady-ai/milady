# 06 — Bun, TypeScript, and Async Safety

New code should be strict TypeScript and cancellation-aware.

## TypeScript

- Keep `strict` enabled.
- Avoid `any`; use `unknown` at trust boundaries and validate before narrowing.
- Keep shared DTO/RPC/tool types serializable.
- Separate compile-time types from runtime validation functions.
- Prefer small modules over giant main-process files.

## Async practices

- Use `AbortController`/`AbortSignal` for model, network, tool, and long-running operations.
- Add explicit timeouts around model/tool/network calls.
- Avoid long synchronous CPU/file/database work in the UI path.
- Use Bun workers, subprocesses, streaming, or chunking for expensive work.
- Cleanup on `before-quit` through Electrobun lifecycle events.
- Do not use unbounded intervals/background loops; use explicit scheduling and user-visible controls.
