---
title: "Conversations API"
sidebarTitle: "Conversations"
description: "REST API endpoints for managing web-chat conversations — CRUD, messaging, and streaming."
---

The conversations API manages the agent's web-chat interface. Each conversation has its own room in the runtime's memory system, allowing independent message histories. The API supports both streaming (SSE) and synchronous message delivery.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/conversations` | List all conversations |
| POST | `/api/conversations` | Create a new conversation |
| GET | `/api/conversations/:id/messages` | Get messages for a conversation |
| POST | `/api/conversations/:id/messages` | Send a message (synchronous) |
| POST | `/api/conversations/:id/messages/stream` | Send a message (SSE streaming) |
| POST | `/api/conversations/:id/greeting` | Generate a greeting message |
| PATCH | `/api/conversations/:id` | Update conversation metadata |
| DELETE | `/api/conversations/:id` | Delete a conversation |

---

### GET /api/conversations

List all conversations, sorted by most recently updated first.

**Response**

```json
{
  "conversations": [
    {
      "id": "uuid",
      "title": "Morning Chat",
      "roomId": "uuid",
      "createdAt": "2025-06-01T10:00:00.000Z",
      "updatedAt": "2025-06-01T12:30:00.000Z"
    }
  ]
}
```

---

### POST /api/conversations

Create a new conversation with its own room.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Conversation title (default `"New Chat"`) |

**Response**

```json
{
  "conversation": {
    "id": "uuid",
    "title": "New Chat",
    "roomId": "uuid",
    "createdAt": "2025-06-01T12:00:00.000Z",
    "updatedAt": "2025-06-01T12:00:00.000Z"
  }
}
```

---

### GET /api/conversations/:id/messages

Retrieve up to 200 messages for a conversation, sorted oldest first. Messages with empty text content (such as action-log memories) are automatically filtered out.

**Response**

```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "text": "Hello!",
      "timestamp": 1718000000000
    },
    {
      "id": "uuid",
      "role": "assistant",
      "text": "Hey there! How can I help?",
      "timestamp": 1718000001000
    },
    {
      "id": "uuid",
      "role": "user",
      "text": "What's going on in Discord?",
      "timestamp": 1718000002000,
      "source": "discord",
      "from": "Alice",
      "fromUserName": "alice#1234",
      "avatarUrl": "https://cdn.discordapp.com/avatars/..."
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `messages[].role` | string | `user` or `assistant` |
| `messages[].text` | string | Message text content |
| `messages[].timestamp` | number | Unix timestamp (ms) when the message was created |
| `messages[].source` | string\|undefined | Connector source identifier (e.g. `discord`, `telegram`). Omitted for web-chat messages |
| `messages[].from` | string\|undefined | Display name of the sender entity, when available |
| `messages[].fromUserName` | string\|undefined | Username or handle of the sender (e.g. Discord username), when the connector provides one |
| `messages[].avatarUrl` | string\|undefined | Sender avatar URL when the connector can provide one |

**Errors**

| Status | Condition |
|--------|-----------|
| 404 | Conversation not found |

---

### POST /api/conversations/:id/messages

Send a message and get the agent's response synchronously (non-streaming).

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | User message text |
| `channelType` | string | No | Channel type override |
| `images` | array | No | Attached image data |

**Response**

```json
{
  "text": "Here's what I think...",
  "agentName": "Milady"
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| 404 | Conversation not found |
| 503 | Agent is not running |

---

### POST /api/conversations/:id/messages/stream

Send a message and receive the agent's response via Server-Sent Events (SSE). Each token is streamed as it is generated, followed by a final `done` event.

**Request Body**

Same as `POST /api/conversations/:id/messages`.

**SSE Events**

Token events (append semantics — each text chunk extends the reply):
```
data: {"type":"token","text":"Here's"}
data: {"type":"token","text":" what"}
data: {"type":"token","text":" I think..."}
```

Snapshot events (replace semantics — used when action callbacks update the reply in-place):
```
data: {"type":"token","fullText":"Here's what I think...\n\nSearching for track..."}
```

When a `fullText` field is present, it is authoritative and the client should replace the entire assistant message text rather than appending.

Final event:
```
data: {"type":"done","fullText":"Here's what I think...","agentName":"Milady"}
```

The conversation title is auto-generated in the background if it is still `"New Chat"`, and a `conversation-updated` WebSocket event is broadcast. If AI title generation fails, the title falls back to the first five words of the user's message.

<Info>
Action callbacks (e.g. from music playback, wallet flows) use **replace** semantics: each successive callback replaces the callback portion of the message rather than appending. This matches the progressive-message pattern used on Discord and Telegram. See [Action callbacks and SSE streaming](/runtime/action-callback-streaming) for details.
</Info>

**Error recovery**

If the model provider fails **after** tokens have already been streamed to the client, the server preserves the streamed text. The `done` event's `fullText` contains the text that was already delivered rather than a generic error message. This prevents the client from losing a partially complete reply.

If the failure occurs **before** any text is streamed, the `done` event's `fullText` contains a fallback error description (e.g. provider connectivity issue) so the user still receives feedback.

In both cases, an `error` SSE event may also be emitted if the reply cannot be persisted:

```
data: {"type":"error","message":"Failed to persist message"}
```

---

### POST /api/conversations/:id/greeting

Generate a greeting message for a new conversation. Picks a random `postExample` from the agent's character definition — no model call, no latency. The greeting is stored as an agent message for persistence.

**Response**

```json
{
  "text": "gm. ready to go viral today or what.",
  "agentName": "Milady",
  "generated": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | The greeting text (empty if no post examples exist) |
| `agentName` | string | Agent's display name |
| `generated` | boolean | `true` if post examples were available |

---

### PATCH /api/conversations/:id

Update conversation metadata (currently supports renaming).

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | New conversation title |

**Response**

```json
{
  "conversation": {
    "id": "uuid",
    "title": "Updated Title",
    "roomId": "uuid",
    "createdAt": "2025-06-01T10:00:00.000Z",
    "updatedAt": "2025-06-01T14:00:00.000Z"
  }
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| 404 | Conversation not found |

---

### DELETE /api/conversations/:id

Delete a conversation. Messages remain in the runtime memory but the conversation metadata is removed.

**Response**

```json
{
  "ok": true
}
```


## Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_REQUEST` | Request body is malformed or missing required fields |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication token |
| 404 | `NOT_FOUND` | Requested resource does not exist |
| 404 | `CONVERSATION_NOT_FOUND` | Conversation with specified ID does not exist |
| 503 | `SERVICE_UNAVAILABLE` | Agent service is not currently running |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
