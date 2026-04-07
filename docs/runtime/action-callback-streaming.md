---
title: Action callbacks and SSE streaming
description: Why Milady replaces (not concatenates) action callback text in dashboard chat, and how it matches Discord-style progressive messages.
---

# Action callbacks and SSE streaming

Milady’s dashboard chat uses **Server-Sent Events (SSE)** to stream the assistant reply. Two different kinds of text arrive on the same stream:

1. **LLM tokens** — the model’s streamed reply (`onStreamChunk`).
2. **Action callbacks** — text returned from `HandlerCallback` while an action runs (e.g. `PLAY_AUDIO`, wallet flows, Binance skill fallbacks).

This page explains **how those are merged** and **why** that design matches platforms like Discord and Telegram.

---

## The problem we solved

On **Discord**, `@elizaos/plugin-discord` uses a **progressive message**: one channel message is created, then **edited in place** as status updates arrive (“Looking up track…”, “Searching…”, “Now playing: …”).

On **web**, each `callback({ text })` was previously fed through the same merge path as arbitrary streamed chunks. Unrelated status strings do not share a prefix with each other, so the merge heuristic often **concatenated** them:

```text
🔍 Looking up track...🔍 Searching for track...✨ Setting up playback...Now playing: **Song**
```

That is correct for **token deltas** that extend the same answer, but wrong for **successive statuses** that should **replace** the previous status.

**Why it matters:** Users expect **live, in-place updates** (web2-style realtime), not a growing pile of status fragments. Plugins should not need a second transport (WebSocket, custom events) just to get Discord parity.

---

## The Milady behavior

Inside `generateChatResponse` (`packages/agent/src/api/chat-routes.ts`):

- **LLM chunks** still use **append** semantics via `appendIncomingText` → `resolveStreamingUpdate` → `onChunk`.
- **Action callbacks** use **`replaceCallbackText`**:
  - On the **first** callback in a turn, the server snapshots whatever was already streamed (`preCallbackText` — usually the LLM’s partial or final text).
  - Each **subsequent** callback sets the visible reply to:

    `preCallbackText + "\n\n" + latestCallbackText`

  - So the **callback segment** is **replaced** each time; the LLM prefix is preserved.

The HTTP layer emits a **snapshot** (`onSnapshot`) so the SSE event carries the **full** new `fullText`. The client already treats `fullText` as authoritative and **replaces** the assistant bubble’s text — no UI change was required.

**Why snapshot:** The frontend’s SSE parser uses `fullText` when present; replacing the whole assistant message is O(1) for the UI and matches “edit message body” mentally.

**Why separate LLM vs callback paths:** LLM streaming is genuinely incremental (append). Action progress is **state replacement** (latest status wins). Mixing both through one merge function blurred those semantics.

---

## Plugin contract (unchanged)

Plugins should keep using the **elizaOS** `HandlerCallback` shape:

```typescript
await callback({ text: "🔍 Searching…", source: message.content.source });
await callback({ text: "Now playing: **Track**", source: message.content.source });
```

No extra fields, no Milady-specific APIs, no runtime attachment. Helpers like `ProgressiveMessage` in `plugin-music-player` remain a thin wrapper over `callback`.

**Why preserve the contract:** Discord and other connectors already rely on this API; Milady’s job is to interpret repeated callbacks correctly in the **API chat** path, not to fork the plugin surface.

---

## Where it applies

`replaceCallbackText` is wired for:

- The main `messageService.handleMessage` action callback.
- `executeFallbackParsedActions` (parsed action recovery).
- Direct Binance skill dispatch (`maybeHandleDirectBinanceSkillRequest`).
- Wallet execution fallback and similar paths that invoke actions with callbacks.

**Not** used for `onStreamChunk` — that stays append-only.

---

## Related code and docs

- **Implementation:** `packages/agent/src/api/chat-routes.ts` — `replaceCallbackText`, `preCallbackText`.
- **Example helper:** `packages/plugin-music-player/src/utils/progressiveMessage.ts`.
- **UI streaming:** [Dashboard — Chat](/dashboard/chat) (SSE / typing indicator).
- **Changelog:** [Changelog](/changelog) — search for “action callback” or the ship date.

---

## Future / roadmap

Possible follow-ups (not shipped as requirements here):

- Optional **metadata** on callback content to distinguish “append” vs “replace” for exotic plugins (only if a real use case appears).
- **Persistence** of intermediate statuses (today the final persisted turn text follows normal chat persistence rules).

See `docs/ROADMAP.md` in the repository for high-level product direction.
