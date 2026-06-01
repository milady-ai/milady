# Agent Runtime i18n Audit

User-visible English strings emitted by **the elizaOS agent runtime** —
`eliza/packages/agent/src/`, `eliza/packages/core/src/`, and the
`eliza/plugins/plugin-*/src/` runtimes. Inventory + plan only; no code
changes here.

"User-visible" means a string that a real end-user could see in the UI
or in agent-generated text. This excludes `logger.*` lines, code
internals (variable names, type names, comments), and developer-only
contract errors that should never reach a client.

Companion docs:

- `cloud-shared-i18n-audit.md` — cloud HTTP / email / Stripe strings.
- `cloud-frontend-i18n-audit.md` — cloud dashboard UI strings.
- `whitelabel-i18n-roadmap.md` — top-level brand + locale plan.

---

## Section A — Inventory

Counts are from `rg` against the source tree (excluding `*.test.ts`,
`*.d.ts`, `__tests__/`, `dist/`, `node_modules/`).

### Summary

| Surface | Count | Pattern | Priority |
|---|---|---|---|
| Agent API: `error(res, "...", status)` JSON error responses | **213** call sites across ~30 route files | `eliza/packages/agent/src/api/*.ts` | **HIGH** |
| Agent API: `sendJsonError(res, "...", status)` (lower-level helper) | **35** call sites | `eliza/packages/agent/src/api/*.ts` | **HIGH** |
| Agent API: `json(res, { error: "..." }, status)` (ad-hoc JSON errors) | **9** call sites | mostly `chat-routes.ts`, `server.ts`, `misc-routes.ts` | **HIGH** |
| Agent action `callback({ text: "..." })` literals (replies the user reads in chat) | **20** call sites (literal/template; ~86 total including dynamic) | `eliza/plugins/plugin-agent-orchestrator/src/actions/tasks.ts`, `plugin-shopify/...`, `plugin-mysticism/...` | **HIGH** |
| Agent built-in action `text:` reply literals | **128** lines | `eliza/packages/agent/src/actions/*.ts` (contact, plugin, terminal, database, settings, page-action-groups, compact-conversation, logs, memories) | **HIGH** |
| Localhost OAuth success / error page text | 1 HTML template + 4 plain-text `res.end()` strings | `eliza/packages/agent/src/auth/vendor/pi-oauth/openai-codex-login.ts` | **MED** |
| Chat-language LLM steering fragments (`"Reply in natural English ..."`) | 7 locales already populated | `eliza/packages/agent/src/api/chat-augmentation.ts:40` | **LOW** (already locale-aware) |
| `permission_request` system-prompt fragment | 1 template literal (~55 lines) | `eliza/packages/agent/src/api/permission-request-prompt.ts` | **LOW** (instructs the LLM; not user-visible verbatim) |
| Action `description:` and `similes:` strings | ~hundreds across plugins | every `actions/*.ts` in `plugins/plugin-*/src/` | **LOW** (consumed by the LLM, not shown to the user) |
| `examples: ActionExample[][]` few-shot literals | 82 files in plugins, ~11 files in `packages/agent/src/actions` | already partially handled by `plugin-lifeops` `MultilingualPromptRegistry` (`prompt-registry.ts`) | **MED** (training-data; affects model output quality in non-English) |
| Documents / image fallback prompt | `IMAGE_ONLY_CHAT_FALLBACK_PROMPT = "Please describe the attached image."` | `api/server-helpers.ts:446` (echoed back to the user as the synthesized prompt) | **MED** |
| Binance skill helper user-facing prompts (`"Please provide a token keyword..."`) | 6 strings | `api/binance-skill-helpers.ts:549–595` | **MED** |

### A.1 HIGH — Agent HTTP error strings (213 + 35 + 9 = ~257 call sites)

These are the most direct contract with the dashboard / desktop / mobile
UI. The shape today:

```ts
// packages/agent/src/api/server-helpers.ts:382
function error(res: http.ServerResponse, message: string, status = 400): void {
  sendJsonError(res, message, status);
}

// packages/core/src/api/http-helpers.ts:209
export function sendJsonError(
  res: http.ServerResponse,
  message: string,
  status = 400,
): void {
  writeJsonErrorSafe(res, message, status);
}
```

`sendJsonError` writes `{ error: "<message>" }` with the literal English
string. The client (`eliza/packages/ui/src/...`) reads `error` and
surfaces it verbatim in toasts / form-level errors.

Representative duplication (high-signal targets to migrate first):

| Repeated message | Occurrences | Sample paths |
|---|---|---|
| `"Agent runtime is not available"` / `"Agent runtime not available"` / `"runtime not ready"` / `"Agent is not running"` | **22** | `agent-lifecycle-routes.ts:134`, `conversation-routes.ts:1410,1486,1826,1980,2042`, `memory-routes.ts:360`, `workbench-routes.ts:113,128,185,233`, `workbench-vfs-routes.ts:206,244,261`, `chat-routes.ts:3293,2758,3099`, `inbox-routes.ts:2075`, `character-routes.ts:519`, `misc-routes.ts:631`, `agent-transfer-routes.ts:67,120,136` |
| `"Conversation not found"` | 6 | `conversation-routes.ts:1169,1390,1447,1808,1974,2024` |
| `"Action not found"` | 3 | `misc-routes.ts:688,747,799` |
| `"Account not found"` | 2 | `accounts-routes.ts:947,1067` |
| `"Connector account not found"` | 4 | `connector-account-routes.ts:721,742,764,786` |
| `"Not found"` / `"Forbidden"` / `"Unauthorized"` / `"Method not allowed"` (incl. variants with `.`) | 23 | spread across `server.ts`, `connector-account-routes.ts`, `relationships-routes.ts`, `runtime-plugin-routes.ts`, `chat-routes.ts` |
| `"Todo not found"` | 4 | `workbench-routes.ts:209,247,257,282` |
| `"Discord avatar not found"` / `"No custom avatar found"` / `"No custom background found"` | 5 | `avatar-routes.ts` |
| `"Invalid permission ID"` | 3 | `permissions-routes.ts:267,307,345` |
| `"Invalid connector account id"` | 2 | `connector-account-routes.ts:714,781` |
| `"No active flow ..."` / `"Provide either code or set waitForCallback: true"` / OAuth start/exchange errors | ~10 | `subscription-routes.ts:108,135,229,254,261,280,295,108,186,336`; `accounts-routes.ts:818,846,877,882,886` |
| Bug-report submission errors (`"Too many bug reports..."`, `"Failed to submit bug report"`, `"Unexpected response from GitHub API"`) | 5 | `bug-report-routes.ts:278,300,305,347,352` |
| Avatar upload validation (`"Invalid VRM file: not a valid glTF/GLB file"`, `"Invalid image file: expected PNG, JPEG, or WebP"`, `"Request body is empty or exceeds 50 MB"` / `10 MB`) | 5 | `avatar-routes.ts:111,116,166,192` |
| Misc-routes shell guards (`"Shell access is disabled"`, `"Command exceeds maximum length (4096 chars)"`, `"Missing or empty command"`) | 3 | `misc-routes.ts:349,374,379` |
| Workbench VFS guards (`"Unsupported VFS files method"`, `"VFS route not found"`, `"snapshotId is required"`, `"path query parameter is required"`, `"Cloud coding-container service is not available"`) | ~8 | `workbench-vfs-routes.ts` |
| Generic input validation (`"text is required"`, `"channelType is invalid"`, `"subaction is required"`, `"url is required"`, `"script is required"`, `"Invalid request URL"`, `"Search query (q) is required"`) | many | `chat-routes.ts:1519,1524`, `server.ts:914,975,992,1524`, `memory-routes.ts:403,427`, `registry-routes.ts:131` |

Full enumeration (per file, line, message) — too long to inline; reproducible with:

```bash
rg -n 'error\(res,\s*"[^"]+"' eliza/packages/agent/src/api/ \
  -g '!*.test.ts' -g '!*.d.ts' -g '!__tests__/**'
rg -n 'sendJsonError\(\s*res,\s*"[^"]+"' eliza/packages/agent/src/api/ \
  -g '!*.test.ts' -g '!*.d.ts' -g '!__tests__/**'
rg -n 'json\(res,\s*\{\s*error:\s*"' eliza/packages/agent/src/api/ \
  -g '!*.test.ts' -g '!*.d.ts' -g '!__tests__/**'
```

### A.2 HIGH — Agent action chat-reply literals (128 lines in `packages/agent/src/actions/`)

These are strings the LLM emits to the user verbatim via
`callback({ text: "..." })` or the action's returned `Content.text`.
Examples (sample):

| File:line | String | Note |
|---|---|---|
| `actions/compact-conversation.ts:219,232,264,300` | `"There is not enough prior conversation to compact yet."`, `"Only the recent tail is available, so there is nothing safe to compact."`, `"Compaction did not produce a usable ledger."`, `` `Compacted ${boundary} older message(s); preserved the latest ${messages.length - boundary}.` `` | User-visible chat replies. |
| `actions/settings-actions.ts:658,669,680` | `"Switched AI provider to Anthropic. Restart the agent to load the new provider."`, `"Capability wallet is now disabled."`, `"Auto-training is now enabled (threshold 100, cooldown 12h)."` | Settings-change confirmations. |
| `actions/terminal.ts:215,307,398,412` | terminal-output summaries; `"Permission denied: only the owner may run terminal commands."` | Permission denial is user-facing. |
| `actions/plugin.ts:186,210,248,277,303,329,404,540,616,709` | install/uninstall/update/sync/eject/enable/disable confirmations like `"Plugin … installed successfully. The agent will restart to load it."` | All shown to the user. |
| `actions/contact.ts:517,542,767,901,1124,1130,1166,1172,1253,1259,1297,1478,1494,1712,1819` | contact-search summaries, link/unlink/follow-up confirmations | All shown to the user. |
| `actions/database.ts:420,437,475,498,510,523,558,570,592,662,686` | DB action operator messages (`"tableName is required for op:get_table."`, `` `Returned ${result.rows.length} row(s)…` ``) | User-visible if the user invoked the DB action. |
| `actions/page-action-groups.ts:222,230,243,250,266,302,317,332` | `"PAGE_DELEGATE requires a page parameter (one of: …)"`, `"Routing to BROWSER for navigation."`, `"Pulling wallet balances."`, `"Pulling tomorrow's events."` | The routing confirmations land in the chat. |
| `actions/logs.ts:179,196,211,231` | `"Please specify a valid log level: …"`, `` `Log level changed to **${level.toUpperCase()}** for this room.` `` | Owner-only but user-visible. |
| `actions/memories.ts:138,263,…` | `` `Stored memory ${memoryId}.` ``, `` `Updated memory ${memoryId}.` `` | User-visible. |

`examples:` entries inside the same files are training/prompt few-shots
(LLM-only); they should remain English unless we route them through a
locale registry — see Section A.3.

### A.3 MED — Action `examples: ActionExample[][]` few-shot literals

These are NOT directly visible to the user, but they are baked into the
system prompt as conversational examples. In non-English deployments,
English-only examples drag model output toward English. **One plugin
(`plugin-lifeops`) already solved this** with a registry pattern:

```ts
// eliza/plugins/plugin-lifeops/src/lifeops/i18n/prompt-registry.ts
export type PromptLocale =
  | "en" | "es" | "fr" | "ja" | "ko" | "pt" | "tl" | "vi" | "zh-CN";

export interface PromptExampleEntry {
  exampleKey: string;       // e.g. "OWNER_ROUTINES.example.0"
  locale: PromptLocale;
  user: ActionExample;
  agent: ActionExample;
}

export interface MultilingualPromptRegistry {
  register(entry: PromptExampleEntry): void;
  getPair(exampleKey, locale): readonly [ActionExample, ActionExample] | null;
  // ...
}
```

The runtime resolves the user's locale from `OwnerFactStore.locale` and
asks the registry for the localized pair when building prompts.

**Plugins that have `examples:` arrays but no `MultilingualPromptRegistry`
integration (82 files):** `plugin-agent-orchestrator`, `plugin-shopify`,
`plugin-mysticism`, `plugin-app-control`, `plugin-github`, `plugin-form`,
`plugin-computeruse`, `plugin-mcp`, `plugin-streaming`, `plugin-wallet`,
`plugin-coding-tools`, `plugin-workflow`, `plugin-music`, `plugin-linear`,
`plugin-minecraft`, `plugin-anthropic-proxy`, `plugin-calendly`,
`plugin-benchmarks`, `plugin-browser`, `plugin-agent-skills`,
`plugin-scape`, `plugin-local-inference`, `plugin-vision`, `plugin-tunnel`,
`plugin-native-macosalarm`. Built-in actions in `packages/agent/src/actions/`
(plugin.ts, terminal.ts, contact.ts, database.ts, page-action-groups.ts,
compact-conversation.ts, settings-actions.ts, trigger.ts) also embed
English `examples`.

### A.4 HIGH — Plugin action chat replies (sample of 20 literal sites)

Same pattern as A.2 but in plugin sources:

| File:line | String |
|---|---|
| `plugin-agent-orchestrator/src/actions/tasks.ts:1264,1373` | `"ACP service is not available."` |
| `…:1426,1554,1963` | `"Workspace Service is not available."` |
| `…:1588` | `` `Workspace ${workspaceId} not found.` `` |
| `…:1597` | `"No changes to commit in this workspace."` |
| `…:1665` | `` `Failed to finalize workspace: ${errorMessage}` `` |
| `…:1791,1838,1852,1889,1903,1919` | `"Issue title is required for create."`, `"Issue number is required."`, `"Issue number and labels are required."` |
| `…:1829` | `` `Issues in ${repo}:\n${summary}` `` |
| `…:1940` | `` `Issue operation failed: ${errorMessage}` `` |
| `plugin-shopify/src/actions/manage-orders.ts:190` | `"Unsupported order action."` |
| `plugin-shopify/src/actions/manage-inventory.ts:138,256` | `"No locations found in the store."`, `"Unsupported inventory action."` |
| `plugin-shopify/src/actions/manage-products.ts:239` | `"Unsupported product action."` |
| `plugin-mysticism/src/actions/reading-op.ts:402` | `` `Let me look more deeply at the **${cardName}**...` `` |
| `plugin-agent-skills/src/actions/sync-catalog.ts:77` | `` `Error syncing catalog: ${errorMsg}` `` |
| `plugin-agent-skills/src/actions/get-skill-details.ts:127` | `` `Error getting skill details: ${errorMsg}` `` |

Many more dynamic templates exist (`text: \`…${var}…\``) — count includes
all 86 callback-text occurrences across `plugins/plugin-*/src/`.

### A.5 MED — Localhost OAuth callback page

The only HTML returned to a real browser during agent-side OAuth flows:

```ts
// auth/vendor/pi-oauth/openai-codex-login.ts:30
const SUCCESS_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authentication successful</title>
</head>
<body>
  <p>Authentication successful. Return to your terminal to continue.</p>
</body>
</html>`;

// :253,258,264,273
res.end("Not found");
res.end("State mismatch");
res.end("Missing authorization code");
res.end("Internal error");
```

Renders directly in the user's browser at `http://localhost:1455/auth/callback`.
Single file, 5 strings. Self-contained migration target.

### A.6 LOW — System-prompt fragments (LLM-only)

| File:line | String | Why LOW |
|---|---|---|
| `api/chat-augmentation.ts:40` (7-entry locale map) | `"Reply in natural English unless the user explicitly requests another language."` (and zh-CN, ko, es, pt, vi, tl variants) | Already locale-aware in source. Add `ja` to match `UI_LANGUAGES`. |
| `api/chat-augmentation.ts:288,289,459–461` | document-augmentation system instructions (`"Extract up to 3 short semantic-search queries…"`, `"Answer the user request using the contextual documents below…"`) | LLM input, not user-visible. |
| `api/permission-request-prompt.ts:19` | `PERMISSION_REQUEST_PROMPT_FRAGMENT` — a 55-line `permission_request` action documentation block. | LLM-only; would only need translation if a non-English LLM struggles with English instructions (rare with Claude / GPT-class models). |

Action `description:` and `similes:` are the same category — see
[whitelabel-i18n-roadmap.md](whitelabel-i18n-roadmap.md) which already
acknowledges this is LLM-only and not in scope for end-user i18n.

### A.7 MED — Helper-emitted prompts that land in the user-visible message

| File:line | String |
|---|---|
| `api/server-helpers.ts:446` | `IMAGE_ONLY_CHAT_FALLBACK_PROMPT = "Please describe the attached image."` — substituted into user-side message content when an image is sent without text. |
| `api/server-helpers.ts:449–469` | Image validation messages returned to the client verbatim (`"Each image must be an object"`, `"Image data must be raw base64, not a data URL"`, `` `Image too large (max ${MAX_IMAGE_DATA_BYTES / 1_048_576} MB per image)` ``, `"Image data contains invalid base64 characters"`, `"Each image must have a mimeType string"`, `` `Unsupported image type: ${mimeType}` ``, `"Each image must have a name string"`). |
| `api/binance-skill-helpers.ts:549,566,572,589,595` | `"Please provide a token keyword, symbol, or contract address for binance-query-token-info."`, `"Please specify the chain for that contract address: BSC, Base, Ethereum, or Solana."`, etc. Sent as chat replies. |
| `api/server.ts:2469`, `misc-routes.ts:184`, `services/plugin-installer.ts:423,746` | `"Restarting..."`, `"Installing dependencies..."`, `"Restarting agent to load new plugin..."` — surfaced through admin status responses. |

---

## Section B — Recommended Pattern

The agent runtime is multi-tenant and stateless about UI locale: a single
agent instance can have its dashboard open in `en` while the
desktop-app user has `ja` set. **The server cannot reliably know the
recipient's locale on every request**, so server-side string
localization is the wrong layer. Two complementary patterns cover the
real surfaces.

### B.1 HTTP error responses — error codes + client-side translation

For all 257 `error(res, "…", status)` / `sendJsonError` / inline
`{ error: "…" }` call sites:

1. Promote `error` / `sendJsonError` to also accept a **stable error
   code**:
   ```ts
   // packages/core/src/api/http-helpers.ts
   export function sendJsonError(
     res: http.ServerResponse,
     code: AgentApiErrorCode,            // e.g. "agent.runtime.unavailable"
     status = 400,
     opts?: { fallback?: string; details?: Record<string, unknown> },
   ): void {
     writeJsonErrorSafe(res, {
       error: opts?.fallback ?? defaultEnglishFor(code),
       code,
       details: opts?.details,
     }, status);
   }
   ```
   The JSON wire shape becomes `{ error, code, details? }`. Existing
   English `error` field is preserved as a graceful default for
   pre-update clients, but `code` is the new source of truth.

2. Define `AgentApiErrorCode` as a string-literal union in
   `packages/core/src/api/error-codes.ts`. Group by surface:
   `"agent.runtime.unavailable"`, `"conversation.notFound"`,
   `"connectorAccount.notFound"`, `"workbench.todo.notFound"`,
   `"avatar.discord.invalidPath"`, `"oauth.flow.notFound"`,
   `"chat.text.required"`, …

3. The client (`eliza/packages/ui/src/...`) adds an
   `errors/<locale>.json` table keyed on the code, with the existing
   English values seeded from the current literals. The `useApiError`
   hook reads `code` and falls back to the wire `error` string when no
   translation exists. This mirrors the existing `t(key, defaultValue)`
   pattern already used for UI strings (see
   [whitelabel-i18n-roadmap.md](whitelabel-i18n-roadmap.md) "61 missing
   keys repaired").

4. **Templated messages** (e.g. `` `Table "${name}" not found` ``) become
   `code = "db.table.notFound", details = { name }` and the client
   formats with `t("db.table.notFound", { name })`.

5. Migration is purely additive on the server (existing English `error`
   field stays), so it can roll out in batches without breaking older
   clients.

### B.2 Chat-reply text — locale-aware action callbacks

Built-in actions and plugin actions need to read the **owner's locale**
(`OwnerFactStore.locale`, already used by `plugin-lifeops`) and either:

1. Generate the response **through the LLM** (already locale-steered
   via `CHAT_LANGUAGE_INSTRUCTION` in `chat-augmentation.ts`), letting
   the LLM produce the locale-appropriate phrasing. Operator/system
   strings like `"Plugin installed."` should be re-architected to be
   LLM-generated summaries of a structured result, not hardcoded.
2. Use a per-action **message catalog** keyed by `actionName +
   messageKey + locale`, parallel to `MultilingualPromptRegistry` but
   for response text. Smaller surface and zero-LLM-overhead for actions
   where deterministic phrasing matters (compaction, plugin install,
   permission denied).

A single new `ActionMessageRegistry` service registered on the runtime
covers both built-in `packages/agent/src/actions/` and any plugin that
opts in. The registry should reuse the same `PromptLocale` union from
`plugin-lifeops/src/lifeops/i18n/prompt-registry.ts` — promote that union
to a shared location (`packages/core/src/i18n/locale.ts`) so both
registries import it.

### B.3 Action `examples:` — extend the existing registry

`plugin-lifeops` already proved the model. Recommended:

1. Move `MultilingualPromptRegistry` from
   `plugin-lifeops/src/lifeops/i18n/prompt-registry.ts` into a runtime
   package (`packages/core/src/i18n/prompt-registry.ts` or
   `packages/agent/src/i18n/prompt-registry.ts`) so it is not coupled to
   lifeops.
2. Add an `exampleKey?: string` field to `ActionExample` (or a
   sibling `ActionExampleRef` type) so authors can write
   `{ exampleKey: "PLUGIN.install.0", user: …, agent: … }`.
3. Plugins register locale packs the same way lifeops does today.
4. The planner / prompt builder asks the registry for the user-locale
   pair, falling back to `en`.

This is medium priority — non-English speakers already get an English
example contaminating their model context, but the model usually
recovers because the `CHAT_LANGUAGE_INSTRUCTION` overrides at the system
level.

### B.4 OAuth callback page — minimal locale switch

`auth/vendor/pi-oauth/openai-codex-login.ts` already returns
`<html lang="en">`. Switch the lang attribute + 5 body strings off a
simple lookup table keyed on `Accept-Language` (the only locale signal
available at that point — the user's browser, not the agent runtime).
Single file, low risk, fully self-contained.

### B.5 System-prompt fragments — out of scope

Per [whitelabel-i18n-roadmap.md](whitelabel-i18n-roadmap.md) and the
audit prompt, `permission_request` and document-augmentation prompt
fragments stay English. They steer the LLM, not the user, and modern
LLMs follow English instructions while emitting localized output.

`CHAT_LANGUAGE_INSTRUCTION` (`chat-augmentation.ts:40`) is the only
LLM-facing string already keyed by locale. Add `ja` to match
`UI_LANGUAGES`.

---

## Section C — Concrete Next-PR Proposal

**Goal:** migrate the 30 highest-impact HTTP error strings to the
code-based shape from B.1 without breaking any existing client. Single
PR, scoped to the server side; the client patch can follow.

### C.1 PR title

`feat(agent/api): emit stable error codes alongside English messages`

### C.2 Server changes

1. **Add `eliza/packages/core/src/api/error-codes.ts`** — string-literal
   union + `defaultEnglishFor(code)` lookup. Seed 30 codes:

   | Code | Default English |
   |---|---|
   | `agent.runtime.unavailable` | `"Agent runtime is not available"` |
   | `agent.notRunning` | `"Agent is not running"` |
   | `conversation.notFound` | `"Conversation not found"` |
   | `connectorAccount.notFound` | `"Connector account not found"` |
   | `connector.providerInvalid` | `"Invalid connector provider"` |
   | `account.notFound` | `"Account not found"` |
   | `account.credentialMissing` | `"No credential available"` |
   | `action.notFound` | `"Action not found"` |
   | `workbench.todo.notFound` | `"Todo not found"` |
   | `workbench.runtime.unavailable` | `"Agent runtime is not available"` |
   | `vfs.snapshotIdRequired` | `"snapshotId is required"` |
   | `vfs.routeNotFound` | `"VFS route not found"` |
   | `vfs.pathRequired` | `"path query parameter is required"` |
   | `vfs.cloudContainerUnavailable` | `"Cloud coding-container service is not available"` |
   | `vfs.unsupportedMethod` | `"Unsupported VFS files method"` |
   | `avatar.discord.invalidPath` | `"Invalid Discord avatar path"` |
   | `avatar.discord.notFound` | `"Discord avatar not found"` |
   | `avatar.custom.notFound` | `"No custom avatar found"` |
   | `avatar.background.notFound` | `"No custom background found"` |
   | `avatar.upload.tooLarge` | `"Request body is empty or exceeds 50 MB"` (templated by route) |
   | `avatar.upload.invalidVrm` | `"Invalid VRM file: not a valid glTF/GLB file"` |
   | `avatar.upload.invalidImage` | `"Invalid image file: expected PNG, JPEG, or WebP"` |
   | `chat.text.required` | `"text is required"` |
   | `chat.channelType.invalid` | `"channelType is invalid"` |
   | `oauth.flow.notFound` | `"OAuth flow not found"` |
   | `oauth.state.missing` | `"Missing OAuth state"` |
   | `oauth.flow.startFailed` | `"Failed to start OAuth flow"` |
   | `oauth.flow.noActive` | `"No active flow accepts a code submission"` |
   | `permission.idInvalid` | `"Invalid permission ID"` |
   | `auth.unauthorized` | `"Unauthorized"` / `auth.forbidden` → `"Forbidden"` |

2. **Extend `sendJsonError`** in
   `packages/core/src/api/http-helpers.ts` to accept a code-or-string
   overload:
   - keep the existing `(res, message: string, status?)` signature for
     back-compat,
   - add `(res, { code, status, fallback?, details? })` overload.

3. **Refactor the 30 high-impact `error(res, "...", N)` call sites** to
   pass `{ code, status }`. The default English from the table preserves
   the wire `error` field, so existing clients keep working.

4. **No client changes in this PR.** Wire-shape is purely additive
   (`code` is a new field).

### C.3 Test plan

- `eliza/packages/agent/src/api/__tests__/` — add a unit test asserting
  that each migrated route emits `{ error, code }` with the expected
  code.
- Bun snapshot the JSON body for `GET /agent/conversation/<bogus>` and
  the like to lock the new shape.
- `bun run test` + `bun run verify`.

### C.4 Follow-up PRs (separate, in order)

1. **Client (`eliza/packages/ui`)**: add `errors/<locale>.json` for all
   8 supported locales seeded from the 30 codes; route `useApiError`
   through `t(code, { defaultValue: serverMessage })`.
2. **Round 2**: migrate the next ~50 HTTP messages (avatar uploads,
   workbench, subscriptions, bug-report).
3. **Built-in action chat replies**: introduce
   `ActionMessageRegistry` (B.2). Start with
   `compact-conversation.ts`, `settings-actions.ts`, `terminal.ts`
   (~30 strings).
4. **Plugin action chat replies**: same registry, starting with
   `plugin-agent-orchestrator` (15 strings — densest cluster).
5. **OAuth localhost page**: small standalone PR (B.4).
6. **Promote `PromptLocale`** out of plugin-lifeops and extend examples
   coverage (B.3). Lowest priority — model usually compensates.

### C.5 Out-of-scope for this initiative

- LLM-facing system-prompt fragments (`permission-request-prompt.ts`,
  `chat-augmentation.ts` document instructions, action `description:` /
  `similes:`). These remain English by design.
- Default character bio / system prompt (handled upstream by the
  StateSetup brand-leakage fixes — see
  [whitelabel-i18n-roadmap.md](whitelabel-i18n-roadmap.md)).
- Log messages.

---

## Appendix — Files touched by this audit (no code changes)

Reference list. Reproduce searches with:

```bash
# Agent HTTP error sites
rg -n 'error\(res,\s*"' eliza/packages/agent/src \
  -g '!*.test.ts' -g '!*.d.ts' -g '!__tests__/**'
rg -n 'sendJsonError\(' eliza/packages/agent/src \
  -g '!*.test.ts' -g '!*.d.ts' -g '!__tests__/**'

# Agent action chat replies
rg -n 'text:\s*[`"]' eliza/packages/agent/src/actions \
  -g '!*.test.ts' -g '!*.d.ts'

# Plugin action chat replies
rg -n 'callback\(\s*\{\s*text:\s*[`"]' eliza/plugins \
  -g 'plugin-*/src/**/*.ts' -g '!*.test.ts' -g '!*.d.ts' -g '!dist/**'

# Action examples (LLM few-shots, MED priority)
rg -ln 'examples:\s*\[' eliza/plugins \
  -g 'plugin-*/src/**/*.ts' -g '!*.test.ts' -g '!*.d.ts' -g '!dist/**'

# OAuth localhost page
rg -n '<title>|res\.end\(' eliza/packages/agent/src/auth \
  -g '*.ts' -g '!*.d.ts'

# LLM steering / system-prompt fragments (LOW)
rg -n 'CHAT_LANGUAGE_INSTRUCTION|PERMISSION_REQUEST_PROMPT_FRAGMENT' \
  eliza/packages/agent/src -g '*.ts' -g '!*.d.ts'
```
