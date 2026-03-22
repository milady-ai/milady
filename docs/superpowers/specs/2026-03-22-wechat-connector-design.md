# WeChat Connector Plugin — Design Spec

**Date:** 2026-03-22
**Branch:** `feat/add-wechat-connector` (to be created)
**Approach:** Two-repo split — npm package for plugin source, registration glue in Milady

---

## Overview

Add a WeChat connector to Milady following the same pattern as all 19 existing connectors: the plugin lives in a separate repo published to npm as `@miladyai/plugin-wechat`, and Milady only contains registration glue (connector maps, config detection, tests).

The plugin connects to WeChat via a third-party proxy service (API key + webhook), supports text and image messaging in DMs and group chats, multi-account configuration, and QR code login. It is a full-featured port of [openclaw-wechat](https://github.com/freestylefly/openclaw-wechat) adapted to the elizaOS Plugin interface.

**Important:** The upstream `@elizaos/agent` package owns `CONNECTOR_PLUGINS`, `CONNECTOR_IDS`, and `isConnectorConfigured()`. These maps currently have 19 entries and parity tests enforce they stay in sync. WeChat is added as a Milady-local override only — see [Connector Registration](#connector-registration).

## Two-Repo Architecture

### Repo 1: `milady-ai/plugin-wechat` (separate repo, published to npm)

Contains the full plugin source, forked from openclaw-wechat and adapted to elizaOS:

```
plugin-wechat/
├── package.json              # @miladyai/plugin-wechat
├── tsconfig.json
├── src/
│   ├── index.ts              # Plugin export (name, description, services, actions)
│   ├── proxy-client.ts       # HTTP client for WeChat proxy API
│   ├── callback-server.ts    # Webhook HTTP server for incoming messages
│   ├── channel.ts            # Main channel logic (login, message routing)
│   ├── bot.ts                # Message handler (dedup, routing, reply dispatch)
│   ├── reply-dispatcher.ts   # Outbound message chunking + sending
│   ├── config-schema.ts      # Zod validation for connector config
│   ├── types.ts              # WechatMessageContext, LoginStatus, etc.
│   └── utils/
│       └── qrcode.ts         # QR code terminal display
└── src/__tests__/
    ├── proxy-client.test.ts
    ├── callback-server.test.ts
    ├── bot.test.ts
    ├── reply-dispatcher.test.ts
    └── config-schema.test.ts
```

**Key differences from openclaw-wechat:**
- Adapts to elizaOS `Plugin` interface (not OpenClaw's plugin API)
- Uses Milady's config system (`connectors.wechat` in `eliza.json`)
- No natapp tunneling (users configure their own webhook URL)
- Dependencies: `zod` for config validation

### Repo 2: `milady-ai/milady` (this repo — registration glue only)

Changes in this repo:

| File | Change |
|------|--------|
| `packages/app-core/package.json` | Add `@miladyai/plugin-wechat` dependency |
| `packages/app-core/src/runtime/eliza.ts` | Add to `INTERNAL_CHANNEL_PLUGIN_OVERRIDES` |
| `packages/app-core/src/config/schema.ts` | Wrap upstream `CONNECTOR_IDS` to include `"wechat"` |
| `packages/app-core/src/config/wechat-config.ts` | New: `isWechatConfigured()` helper |
| `packages/app-core/src/config/plugin-auto-enable.ts` | Wrap upstream to add WeChat auto-enable |
| `packages/app-core/src/config/connector-parity.test.ts` | Update for 20th connector |
| `packages/app-core/src/runtime/eliza.test.ts` | Update parity assertion |
| `packages/app-core/src/config/plugin-auto-enable.test.ts` | Update parity assertion |
| `packages/app-core/src/connectors/connector-config.test.ts` | Add WeChat cases |
| `packages/app-core/src/connectors/wechat-connector.test.ts` | New: connector validation test |
| `packages/app-core/src/test-support/test-helpers.ts` | Add `resolveWechatPluginImportSpecifier()` |
| `docs/guides/connectors.md` | Add WeChat section |
| `CLAUDE.md` | Add webhook port to table |

## Connector Registration

### Upstream vs Local Registration

The upstream `@elizaos/agent` package owns three maps that must stay in parity:
- `CONNECTOR_PLUGINS` — maps connector names to package names (19 entries)
- `CONNECTOR_IDS` — array of valid connector IDs (19 entries)
- `isConnectorConfigured()` — per-connector detection logic

Multiple parity tests enforce that these maps stay in sync. Since we cannot modify the upstream package directly, we use the following strategy:

1. **`INTERNAL_CHANNEL_PLUGIN_OVERRIDES`** in `packages/app-core/src/runtime/eliza.ts` — add `wechat: "@miladyai/plugin-wechat"`. Note: existing overrides for `signal` and `whatsapp` are **value overrides** (keys already exist upstream). Adding `wechat` is a **new key**, making `CHANNEL_PLUGIN_MAP` 20 entries while upstream stays at 19.

2. **`LEGACY_INTERNAL_CHANNEL_PLUGIN_NAMES`** — no entry needed (no legacy name to redirect from).

3. **`CONNECTOR_IDS` local wrapper** — update `packages/app-core/src/config/schema.ts` from a bare re-export to a wrapper that extends the upstream array:
   ```typescript
   export { CONNECTOR_IDS as UPSTREAM_CONNECTOR_IDS } from "@elizaos/agent/config/schema";
   export * from "@elizaos/agent/config/schema";
   // Override CONNECTOR_IDS to include Milady-local connectors
   import { CONNECTOR_IDS as upstreamConnectorIds } from "@elizaos/agent/config/schema";
   export const CONNECTOR_IDS = [...upstreamConnectorIds, "wechat"] as const;
   ```
   All Milady code imports from this local re-export, not directly from upstream.

4. **Parity test updates** — four test files need changes:
   - `packages/app-core/src/config/connector-parity.test.ts` — add `MILADY_LOCAL_CONNECTORS` set containing `"wechat"`, adjust size assertions to `upstream count + MILADY_LOCAL_CONNECTORS.size`, update package-name regex to allow `@miladyai/` prefix, add `wechat` to `CONNECTOR_CREDS` fixture
   - `packages/app-core/src/runtime/eliza.test.ts` — update `CHANNEL_PLUGIN_MAP keys match CONNECTOR_IDS` assertion to use local `CONNECTOR_IDS` (which includes wechat)
   - `packages/app-core/src/config/plugin-auto-enable.test.ts` — update `CONNECTOR_PLUGINS keys match CONNECTOR_IDS` assertion to account for local connectors
   - `packages/app-core/src/connectors/connector-config.test.ts` — add `wechat` cases to `isConnectorConfigured` tests (single-account with `apiKey`, multi-account with `accounts`, disabled with `enabled: false`)

5. **Config detection** — the upstream `isConnectorConfigured()` default case must be verified at implementation time. If it returns `true` for unknown IDs with `config.apiKey` set, single-account detection works out of the box. If it returns `false`, the Milady wrapper must intercept `wechat` **before** delegating to upstream. Either way, multi-account detection requires a local `isWechatConfigured()` helper in `packages/app-core/src/config/wechat-config.ts`.

6. **`applyPluginAutoEnable` integration** — update `packages/app-core/src/config/plugin-auto-enable.ts` from a bare re-export to a wrapper that:
   - Calls `isWechatConfigured()` on `config.connectors.wechat` and adds `@miladyai/plugin-wechat` to `plugins.allow` if configured
   - Then delegates to the upstream `applyPluginAutoEnable()` for the remaining 19 connectors

7. **Package name** — `@miladyai/plugin-wechat` (Milady namespace, not `@elizaos`). Parity test regex updated to also allow `@miladyai/` prefixes for local connectors.

### Configuration Shape

Single-account (simple):
```json
{
  "connectors": {
    "wechat": {
      "enabled": true,
      "apiKey": "wc_live_xxx",
      "proxyUrl": "https://...",
      "webhookPort": 18790,
      "deviceType": "ipad",
      "dmPolicy": "open",
      "groupPolicy": "open",
      "historyLimit": 50,
      "textChunkLimit": 2000
    }
  }
}
```

Standard connector fields (`enabled`, `dmPolicy`, `groupPolicy`, `allowFrom`, `groupAllowFrom`, `historyLimit`, `textChunkLimit`, `chunkMode`, `blockStreaming`, `mediaMaxMb`) are all supported via the common connector config base. Fields not shown above use their defaults.

Multi-account:
```json
{
  "connectors": {
    "wechat": {
      "accounts": {
        "main": {
          "enabled": true,
          "apiKey": "wc_live_xxx",
          "proxyUrl": "https://...",
          "deviceType": "ipad"
        },
        "secondary": {
          "enabled": true,
          "apiKey": "wc_live_yyy",
          "proxyUrl": "https://...",
          "deviceType": "mac"
        }
      }
    }
  }
}
```

**Environment variable:** `WECHAT_API_KEY` overrides config file.

### Config Detection Logic

The local `isWechatConfigured()` helper in `packages/app-core/src/config/wechat-config.ts`:

```typescript
export function isWechatConfigured(config: Record<string, unknown>): boolean {
  if (config.enabled === false) return false;
  return Boolean(
    config.apiKey ||
    (config.accounts && typeof config.accounts === "object" &&
      Object.values(config.accounts).some((acc) => {
        if (acc.enabled === false) return false;
        return Boolean(acc.apiKey);
      }))
  );
}
```

## Plugin Package Details (for `milady-ai/plugin-wechat` repo)

### Message Flow

**Inbound (WeChat -> Agent):**
1. Proxy service sends webhook POST to `callback-server.ts` on configured port
2. Callback server normalizes payload into `WechatMessageContext` (sender, content, type, threadId for groups)
3. Message deduplication (30-min window, 1000 entry cap, 5-min cleanup)
4. Bot routes message to elizaOS runtime as a standard message event

**Outbound (Agent -> WeChat):**
1. Agent produces response via elizaOS runtime
2. Reply dispatcher chunks long messages (2000 char default)
3. Proxy client sends via `sendText()` or `sendImage()` to the proxy API

### Message Type Mapping

| WeChat Code | Type | Scope |
|-------------|------|-------|
| `60001` | text | private |
| `80001` | text | group |
| image codes | image | both |
| video/voice/file | logged, ignored (future) | both |

### Feature Flags

All enabled by default, configurable per-connector:

| Feature | Config key | Default |
|---------|-----------|---------|
| Text messages | always on | — |
| Image send/receive | `features.images` | `true` |
| Group chats | `features.groups` | `true` |
| Multi-account | via `accounts` map | — |

### Group Chat Handling

- Group messages identified by type code `80001` and `@chatroom` in sender ID
- `threadId` set to chatroom ID for session isolation
- @mentions preserved in content
- Reply dispatcher sends to group (chatroom ID) instead of individual sender

### QR Code Login Flow

1. On startup, proxy client calls `getStatus()`
2. If not logged in, calls `getQRCode()` and renders a text-based QR code to the terminal using a lightweight pure-JS renderer (no external dependency — use a vendored ~50-line QR text renderer, or print the QR URL for the user to open in a browser as fallback)
3. Polls `checkLogin()` every 5 seconds
4. Handles `need_verify` state (shows verification URL)
5. On success, stores wcId/nickname, registers webhook with proxy service

### Proxy Client API

All requests use headers `X-API-Key` and `X-Account-ID`. Methods:

| Method | Purpose |
|--------|---------|
| `getStatus()` | Account validity, login state, quota |
| `getQRCode()` | Generate QR code URL for login |
| `checkLogin()` | Poll login completion |
| `sendText(to, text)` | Send text message |
| `sendImage(to, path, text?)` | Send image with optional caption |
| `getContacts()` | Retrieve friends and chatroom lists |
| `registerWebhook(url)` | Register webhook for incoming messages |

**Error codes:** `1000` = success, `1001` = login needed, `1002` = success with warnings.

### Error Handling

- **Proxy API errors:** log and retry with exponential backoff (base 1s, max 8s, 3 attempts), then surface to runtime. Respect `Retry-After` header if present.
- **Webhook server crash:** graceful shutdown via `AbortSignal`, auto-restart on next message cycle
- **Login expiry:** detect `1001` (login needed) on any API call, trigger re-login flow
- **Malformed incoming messages:** log warning, skip (don't crash the webhook server)
- **Webhook security:** the callback server validates the `X-API-Key` header on incoming webhooks matches the configured key, rejecting unauthorized requests with 401
- **Health checks:** periodic `getStatus()` poll every 60s to detect login expiry proactively (not just reactively on send failure)

### Inbound Image Handling

When `features.images` is enabled, incoming image messages include a URL from the proxy service. The callback server extracts the image URL and passes it as an attachment on the elizaOS message event. Images are not downloaded or stored locally — the runtime receives the URL and can fetch as needed.

### elizaOS Plugin Interface Mapping

The plugin exports a standard `Plugin` object conforming to the `Plugin` type from `@elizaos/core`. The exact `init` signature and field shapes must match that type — the below is illustrative:

```typescript
const wechatPlugin: Plugin = {
  name: "wechat",
  description: "WeChat messaging via proxy API",
  init: async (config, runtime) => { /* login, start webhook server */ },
  services: [WechatService],    // Background service: health checks, reconnection
  actions: [],                   // No custom actions (messaging handled by service)
  providers: [WechatProvider],   // Injects WeChat context (contacts, login status) into prompts
  events: {
    WECHAT_MESSAGE: [handleIncomingMessage],  // Routes to runtime message handler
  },
};

// Cleanup: plugin.init returns a cleanup function (or the service implements stop())
// that stops the webhook server, clears health-check intervals, and aborts pending login polls.
```

## Testing (Milady repo)

### Connector test (`packages/app-core/src/connectors/wechat-connector.test.ts`)
- Plugin import/export validation (conditional on package being resolvable)
- Config structure validation (single-account, multi-account, disabled)
- Env var recognition (`WECHAT_API_KEY`)

### Test helper (`packages/app-core/src/test-support/test-helpers.ts`)
- `resolveWechatPluginImportSpecifier()` — checks npm package first, then local fallback paths

### Testing (plugin repo — `milady-ai/plugin-wechat`)
- `proxy-client.test.ts` — mock HTTP responses, test all API methods
- `callback-server.test.ts` — test both payload formats (raw + proxy), normalization
- `bot.test.ts` — message dedup, routing logic
- `reply-dispatcher.test.ts` — chunking, error callbacks
- `config-schema.test.ts` — Zod validation cases

### No E2E tests
Proxy service requires real credentials; all tests mock the HTTP layer.

## Webhook Port

Default: `18790`. This is distinct from the Gateway port (`18789`). Add to the project port table:

| Service | Dev Port | Env Override |
|---------|----------|--------------|
| WeChat Webhook | 18790 | `MILADY_WECHAT_WEBHOOK_PORT` |

Multi-account: all accounts share a single callback server instance. The webhook path includes the account ID for routing: `POST /webhook/wechat/:accountId`.

If the port is already in use, the plugin logs an error and fails to start (does not silently fall back).

## Documentation Updates

- Add WeChat section to `docs/guides/connectors.md` with config examples
- Add `wechat` to the supported platforms table in the connectors guide
- Update the port table in `CLAUDE.md`

## Out of Scope

- Natapp tunneling (users configure their own webhook URL/port)
- Voice/video/file message processing (logged but not handled)
- Official WeChat Official Account API (this uses personal account proxy)
- WeChat Pay or mini-program integration
