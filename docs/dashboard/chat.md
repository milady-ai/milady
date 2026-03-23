---
title: Chat
sidebarTitle: Chat
description: The core messaging interface for interacting with your Milady agent — voice chat, 3D avatar, conversations, and autonomous monitoring.
---

The Chat tab is the default landing view of the dashboard. It provides the core messaging interface through the `ChatView` component, with a three-column layout: Conversations Sidebar on the left, the Chat View in the center, and the Autonomous Panel on the right.

## Message Area

Messages render through the `MessageContent` component, which supports:

- **Plain text** — standard chat messages with line breaks preserved.
- **Inline plugin config** — `[CONFIG:pluginId]` markers in agent responses render as interactive plugin configuration forms using `ConfigRenderer`.
- **UI Spec rendering** — fenced JSON code blocks containing UiSpec objects render as interactive UI elements via `UiRenderer`.
- **Code blocks** — syntax-highlighted fenced code blocks.
- **Streaming** — agent responses stream in token-by-token with a visible typing indicator. The `chatFirstTokenReceived` flag tracks when the first token arrives.

## Input Area

The chat input area sits at the bottom of the view:

- **Auto-resizing textarea** — grows from 38 px to a maximum of 200 px as you type.
- **Image attachments** — attach images via the file picker button, drag-and-drop onto the chat area, or paste from clipboard. Pending images display as thumbnails above the input.
- **File drops** — drag and drop files into the chat area to share them with the agent. A visual drop zone indicator appears during drag.
- **Send / Stop** — the send button submits the message; while the agent is responding, a stop button appears to cancel generation.

## Voice Chat

Built-in voice chat powered by ElevenLabs or browser TTS/STT:

- Voice configuration loads automatically from the agent's config on mount.
- The `useVoiceChat` hook manages the microphone toggle, agent voice playback, and the speaking state that drives avatar lip-sync.
- Voice config changes in Settings or Character views are synchronized in real-time via a `milady:voice-config-updated` custom DOM event.

## VRM 3D Avatar

A live 3D avatar rendered with Three.js and `@pixiv/three-vrm`:

- The avatar responds to conversation with idle animations and emotes.
- Select from 8 built-in VRM models via the `selectedVrmIndex` state.
- Toggle avatar visibility and agent voice mute via the two control buttons in the Autonomous Panel's Chat Controls section.

<a id="conversations-sidebar-whys" />

## Conversations Sidebar: actions, titles, and modals (WHYs)

The `ConversationsSidebar` component (and the same list in **companion game-modal** / **mobile** full-screen chat) manages multiple threads. Layout is intentionally **narrow** on desktop (`w-48` / `xl:w-60`) and **full-width** in mobile overlay—so actions must stay usable without stealing horizontal space from titles.

### List and navigation

- **Sort order** — conversations are sorted by **most recently updated** (`updatedAt`). **Why:** the list is a recency-driven switcher, not an arbitrary static order.
- **Titles** — each row shows the conversation title (localized placeholder for default names like “New Chat”). **Why:** users recognize threads by topic, not internal IDs.
- **Unread** — an accent dot marks conversations with new messages the user has not opened since the last send. **Why:** multi-tab chat needs lightweight attention signal without toast spam.
- **New Chat** — top button creates a new thread and selects it. **Why:** explicit affordance beats hidden shortcuts for new users.

### Delete (hover ×, confirm)

- On **desktop**, a **×** appears on **row hover** (keyboard: focus-within). On **mobile**, the control stays visible—there is no hover. **Why:** avoid permanent icon clutter; touch users still get a tap target.
- **×** does **not** delete immediately. It expands **Delete?** with **Yes** / **No**. **Why:** destructive actions in a dense list need a second step; mis-taps are common on trackpads and phones.
- Right-click (context menu) → **Delete conversation** follows the same confirm path. **Why:** one mental model for “remove thread.”

**Code:** `ConversationListItem`, `ConversationsSidebar` (`confirmDeleteId`, `handleDeleteConversation`).

### Rename (pencil, context menu, modal)

- **Pencil** on hover (same visibility rules as delete) or **context menu → Rename conversation** opens a **modal** with:
  - Free-text **topic title** (saved with `handleRenameConversation` → `PATCH` without `generate`).
  - **Suggest** — calls `suggestConversationTitle` → `renameConversation(id, "", { generate: true })`, same mechanism as **automatic** title generation after early user messages. **Why:** one server contract for “LLM-derived title from thread context”; users can **edit** the suggestion before **Save**.
- **Why a modal instead of inline edit:** inline inputs in a ~12–15rem rail truncate badly, blur on accidental click-away, and fight delete/rename affordances in one row. A modal gives space for helper copy and **Suggest** without redesigning the whole shell.

### Long titles — width-based ellipsis and tooltip

- Titles **ellipsis** based on **available flex width** (`min-w-0`, `truncate`, `flex-1` on the label region), not a fixed character count. **Why:** sidebar width changes (`xl:w-60`, game-modal rail, mobile); character caps look wrong on retina vs. low-DPI or after localization.
- When the label is **actually clipped** (`scrollWidth > clientWidth`), hovering shows a **tooltip** with the **full** title. **Why:** no redundant tooltips on short names; `ResizeObserver` + window resize re-measure when the rail width changes.

**Code:** `TruncatingConversationTitle` in `ConversationListItem.tsx`; `TooltipProvider` wraps the sidebar list so Radix tooltips have a provider. **Why:** tooltips require a provider ancestor; wrapping once avoids per-row providers.

### Rename modal stacking (why `createPortal` + high z-index)

- **Symptom:** only the **dimmed** backdrop appeared; the **form** was invisible.
- **Cause:** **stacking contexts**. Examples: mobile chat wraps the sidebar in **`fixed inset-0 z-[120]`** (`App.tsx`); companion **game-modal** uses **`z-[100]`** shells. Radix `Dialog` defaulted to **`z-50`**, so overlay/content could paint **under** those layers while still dimming content below—depending on portal target and paint order.
- **Fix:** `ConversationRenameDialog` portals to **`document.body`** with an explicit **large `z-index`** and plain visibility (no Radix **enter animation** on this dialog). **`@miladyai/ui` `Dialog`** uses raised **`z-[160]` / `z-[170]`** so **other** app modals stay above the same shells.
- **Vitest:** when **`VITEST`** is set, the dialog renders **inline** (no `createPortal` to `document.body`). **Why:** `react-test-renderer` does not support mixing its tree with a DOM portal to `body`.

**Code:** `ConversationRenameDialog.tsx`, `packages/ui/src/components/ui/dialog.tsx`.

## Autonomous Panel

Displayed on the right side of the Chat tab, the `AutonomousPanel` component provides real-time visibility into autonomous operations:

- **Current state** — shows the latest "Thought" (from assistant/evaluator streams) and latest "Action" (from action/tool/provider streams).
- **Event Stream** — a collapsible, reverse-chronological feed of the last 120 events, color-coded by type:

| Event Type | Color |
|------------|-------|
| Heartbeat events | Accent |
| Error events | Red (danger) |
| Action, tool, provider events | Green (success) |
| Assistant thoughts | Accent |
| Other events | Muted gray |

- **Workbench Tasks** — active tasks the agent is working on, displayed as a checklist.
- **Triggers** — scheduled triggers (interval, cron, one-time) with their type, enabled status, and run count.
- **Todos** — task items tracked by the agent, displayed as a checklist.
- **Chat Controls** — at the bottom, avatar visibility toggle and agent voice mute toggle, plus a VRM avatar preview window (260-420 px tall depending on viewport).

## Emote Picker

Trigger VRM avatar emotes with the keyboard shortcut **Cmd+E** (macOS) or **Ctrl+E** (Windows/Linux). The picker provides 29 emotes across 6 categories:

| Category | Emotes |
|----------|--------|
| **Greeting** | Wave, Kiss |
| **Emotion** | Crying, Sorrow, Rude Gesture, Looking Around |
| **Dance** | Dance Happy, Dance Breaking, Dance Hip Hop, Dance Popping |
| **Combat** | Hook Punch, Punching, Firing Gun, Sword Swing, Chopping, Spell Cast, Range, Death |
| **Idle** | Idle, Talk, Squat, Fishing |
| **Movement** | Float, Jump, Flip, Run, Walk, Crawling, Fall |

Each emote is represented by a clickable icon button. Categories are displayed as filterable tabs within the picker.

## Context Menu

Right-click messages to access a context menu for saving commands or performing custom actions.
