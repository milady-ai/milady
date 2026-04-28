# Confidant — secrets vault for elizaOS

Status: design (pre-implementation), 2026-04-28
Package (target): `@elizaos/confidant`
Replaces: `process.env`-based credential storage, `~/.milady/milady.json`'s `env.*` / `env.vars.*` dual-write, the catalog-as-authoritative env-key map, and the `Object.values(config).find(non-empty)` heuristic in the provider-switch save path.

## 1. Statement

Confidant is the single seam at which any AI-provider credential, OAuth token, or third-party API key can be observed inside an Eliza agent. Skills never read `process.env` for credentials; they request credentials from a per-skill Confidant instance that goes through policy + audit. Confidant stores values literally (encrypted at rest) or as references (`op://...`, `pass://...`) into external password managers; password managers are first-class backends, not afterthoughts. Sync, when enabled, is end-to-end encrypted; cloud servers see only ciphertext.

The name reflects function: ELIZA was a confidant — someone trusted with private affairs. Skills *confide* in their Confidant; the Confidant *resolves* without revealing.

## 2. Problems Confidant fixes

These are the failures observed in the current design (Milady code, but elizaOS upstream has the same pattern):

1. **Skill exfiltration.** `process.env.OPENROUTER_API_KEY` is process-global. Any plugin or skill in the runtime can read every credential. There is no boundary.
2. **Two writers.** [`api/plugins-compat-routes.ts:1273-1282`](../../eliza/packages/app-core/src/api/plugins-compat-routes.ts) writes to `config.env[KEY]`. [`api/provider-switch-config.ts:198-215`](../../eliza/packages/agent/src/api/provider-switch-config.ts) `setEnvValue` writes to **both** `config.env[KEY]` and `config.env.vars[KEY]`. Same value lands twice, in two layouts, with one path silently masking the other on read.
3. **Catalog-as-authoritative.** The save heuristic in [`state/usePluginsSkillsState.ts:246-251`](../../eliza/packages/app-core/src/state/usePluginsSkillsState.ts) does `Object.values(config).find(non-empty)` to "find the API key" because the persistence layer never had a real schema seam. A `OnboardingProviderOption.envKey` field exists in the UI catalog precisely because no other layer is authoritative.
4. **Subscription state leaks.** `linkedAccounts.openai-subscription` and `linkedAccounts.anthropic-subscription` track device-bound OAuth tokens via the same `milady.json` blob that holds API keys. Different lifecycles (rotating refresh, device-bound) collide with the file's "last-write-wins JSON" semantics.
5. **Disconnect doesn't clean up.** Disconnecting Eliza Cloud at [`api/server.ts:933-939`](../../eliza/packages/agent/src/api/server.ts) clears `cloud.apiKey` and `serviceRouting.llmText` but leaves `serviceRouting.tts/media/embeddings/rpc` pointing at a now-unauthenticated cloud-proxy. Symptoms: silent 401s for months.
6. **No reveal.** Once a key is saved through `ApiKeyConfig`, the user cannot read it back. They have to open `~/.milady/milady.json` to verify a value. This actively hides save-path bugs from users.
7. **No password-manager integration.** Users with 1Password, Proton Pass, Bitwarden, or even macOS Keychain entries already have their keys somewhere safe. Today, those values must be copy-pasted into a plaintext `.json` file. We can do better.

Each of these has been bug-confirmed in the current Milady runtime. Confidant is the single change that closes all seven.

## 3. Principles

These rules govern every API decision and every implementation:

1. **One seam.** Every credential read in elizaOS goes through `Confidant.resolve(id)`. There are no parallel APIs. The legacy `process.env` path is the migration target, not a permanent escape hatch.
2. **Skill code never sees raw secrets unless explicitly granted.** The runtime hands a `ScopedConfidant` to each skill at construction. That instance enforces per-skill grants on every call. Built-in plugins (`openai`, `anthropic`, `openrouter`, etc.) are skills too — they get the same boundary.
3. **References, not copies, when possible.** If a credential lives in 1Password, Confidant stores `op://...` and resolves at use-time. The byte never touches Milady's disk in plaintext.
4. **Storage is opaque to readers.** A consumer calling `confidant.resolve('llm.openrouter.apiKey')` does not know — and cannot ask — whether the value came from a file, the keyring, 1Password, or the cloud. The interface absorbs the difference.
5. **Lazy resolution at use-time.** HTTP clients accept `() => Promise<string>` token providers, not resolved strings. Secrets do not live in long-lived memory.
6. **Audit by default.** Every `resolve` is recorded: who asked, what they asked for, when, granted or denied. The audit log is local-first and structured.
7. **Cloud sync is opt-in and end-to-end encrypted.** No plaintext credential ever reaches a server we control. Sync is *not* the default.
8. **Subscription tokens are device-bound.** OAuth tokens for ChatGPT/Claude subscriptions stay in the device's OS keychain. Confidant tracks the *fact* of the link in synced metadata; the token itself never syncs.
9. **No backwards-compatibility hacks past the migration window.** When migration is complete, `process.env.X_API_KEY` is empty. The legacy hydration code is deleted, not silenced.
10. **Adoption is a one-liner per call-site.** If migrating a consumer requires more than a single-line change, the interface is wrong — fix the interface.

## 4. Identifiers

Every secret has a stable, hierarchical, lowercase-camelCase identifier:

```
{domain}.{subject}.{field}
```

- `domain` — broad category. Reserved: `llm`, `subscription`, `tts`, `media`, `embeddings`, `connector`, `wallet`, `service`.
- `subject` — provider, account, or resource. Lowercase. Use the canonical short name.
- `field` — the specific value. Examples: `apiKey`, `accessToken`, `refreshToken`, `webhookSecret`, `clientSecret`, `signingKey`, `botToken`.

Examples:

```
llm.openrouter.apiKey
llm.openai.apiKey
llm.openai.embeddingApiKey
llm.anthropic.apiKey
subscription.openai.accessToken
subscription.anthropic.accessToken
tts.elevenlabs.apiKey
connector.telegram.botToken
connector.discord.botToken
service.elizacloud.apiKey
```

Identifiers are stable across renames of underlying env vars, files, or storage backends. They form the user-facing key in audit logs and permission grants. They are independent of any specific implementation.

A registry (`secretSchema`) declares known IDs with metadata: human label, description, expected format, prefix hint, used-by list. Plugins register the IDs they consume at registration time:

```ts
import { defineSecretSchema } from '@elizaos/confidant';

defineSecretSchema({
  'llm.openrouter.apiKey': {
    label: 'OpenRouter API Key',
    formatHint: 'sk-or-v1-...',
    sensitive: true,
    pluginId: '@elizaos/plugin-openrouter',
  },
  'llm.openrouter.largeModel': {
    label: 'OpenRouter Large Model',
    sensitive: false,
    pluginId: '@elizaos/plugin-openrouter',
  },
});
```

The registry replaces the `config: { ... }` block in plugin registry JSON entries. The Settings UI renders fields from this registry. Every claim a UI makes about "this is the API key" comes from `sensitive: true` here. There is no second source of truth.

## 5. Public API

```ts
// @elizaos/confidant

export type SecretId = string;  // 'domain.subject.field'

export type VaultReference = string;
// 'op://Personal/OpenRouter/api-key'        — 1Password
// 'pass://default/openrouter/api-key'       — Proton Pass
// 'keyring://elizaos.llm.openrouter.apiKey' — OS keychain entry
// 'file://'                                  — encrypted in confidant.json
// 'env://OPENROUTER_API_KEY'                 — read-only, migration only

export type VaultSource =
  | 'file' | 'keyring'
  | '1password' | 'protonpass'
  | 'cloud' | 'env-legacy';

export interface SecretDescriptor {
  id: SecretId;
  source: VaultSource;
  isReference: boolean;
  lastModified: number;
  schema?: SecretSchemaEntry;
}

export interface Confidant {
  /** Resolve a secret to its plaintext value. May prompt for biometric. */
  resolve(id: SecretId): Promise<string>;

  /** Lazy resolver — returns a function the consumer calls at use-time. */
  lazyResolve(id: SecretId): () => Promise<string>;

  /** Resolve with metadata. Useful for diagnostics; never log the value. */
  resolveDetailed(id: SecretId): Promise<{
    value: string;
    source: VaultSource;
    cached: boolean;
    promptedUser: boolean;
  }>;

  /** Store a literal value. Encrypted at rest. */
  set(id: SecretId, value: string): Promise<void>;

  /** Store a reference. The actual value lives in the referenced backend. */
  setReference(id: SecretId, ref: VaultReference): Promise<void>;

  /** Existence check. Does NOT reveal the value. */
  has(id: SecretId): Promise<boolean>;

  /** Remove. Idempotent. */
  remove(id: SecretId): Promise<void>;

  /** List known IDs. Optionally filtered by prefix. Does NOT reveal values. */
  list(prefix?: string): Promise<SecretId[]>;

  /** Describe a secret without revealing it. */
  describe(id: SecretId): Promise<SecretDescriptor | null>;

  /** Hand a scoped instance to a skill. Runtime-only API. */
  scopeFor(skillId: string): ScopedConfidant;
}

export interface ScopedConfidant {
  /** Same shape as Confidant.resolve but goes through policy + audit. */
  resolve(id: SecretId): Promise<string>;
  lazyResolve(id: SecretId): () => Promise<string>;
  has(id: SecretId): Promise<boolean>;
}

export interface ConfidantOptions {
  /** Path to the local store. Default: ~/.milady/confidant.json */
  storePath?: string;
  /** Platform keyring service name. Default: 'elizaos' */
  keyringService?: string;
  /** Backends to enable. Default: ['file', 'keyring']. */
  backends?: VaultSource[];
  /** Permission policy provider — runtime supplies it. */
  policy?: PermissionPolicy;
}

export function createConfidant(opts?: ConfidantOptions): Confidant;
```

That is the entire public surface. Everything else is implementation detail.

### 5.1 Adoption — what migrating a call-site looks like

Before:

```ts
const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error('Missing OPENROUTER_API_KEY');
const client = new OpenRouter({ apiKey: key });
```

After:

```ts
const client = new OpenRouter({
  apiKey: runtime.confidant.lazyResolve('llm.openrouter.apiKey'),
});
```

One-line change. The lazy form means the secret is fetched on each request, never copied into a long-lived field. If `OpenRouter` doesn't accept `() => Promise<string>`, wrap it.

## 6. The mediation boundary

`ScopedConfidant` is the only Confidant a plugin or skill ever sees. The runtime constructs one per skill at registration and binds it to that skill's identity:

```ts
class RuntimeImpl {
  registerPlugin(plugin: Plugin) {
    const scoped = this.confidant.scopeFor(plugin.id);
    plugin.init({ confidant: scoped, /* ... */ });
  }
}
```

The skill cannot reach the unscoped Confidant. It cannot construct its own. There is no global `getConfidant()` — the function does not exist.

### 6.1 Permission policy

A grant is a triple: `(skillId, secretIdPattern, mode)`.

- `secretIdPattern` is a glob: `llm.openrouter.apiKey` (exact), `llm.openrouter.*` (prefix), `*` (everything — discouraged).
- `mode` is one of:
  - `always` — resolve without prompting.
  - `prompt` — prompt the user the first time per session.
  - `audit` — resolve, but log loudly. (Internal use only.)
  - `deny` — explicit denial; takes precedence.

Default policy: a plugin gets `always` access to secrets whose registered `pluginId` matches the plugin's own ID. Cross-plugin access requires an explicit user grant.

Example: `@elizaos/plugin-openrouter` gets implicit access to `llm.openrouter.*` because it registered those IDs. It does **not** get access to `llm.openai.apiKey` — even though both are LLM provider keys — without an explicit grant.

A user-installed third-party skill that wants `llm.openrouter.apiKey` triggers a permission prompt the first time it tries to resolve. The prompt names the skill, the secret, and the reason (a string the skill provides at request time).

### 6.2 Audit log

Every resolve produces one record:

```jsonl
{"ts":1714330000000,"skill":"weather-bot","secret":"llm.openrouter.apiKey","granted":true,"source":"1password","cached":false}
{"ts":1714330000010,"skill":"@elizaos/plugin-openrouter","secret":"llm.openrouter.apiKey","granted":true,"source":"1password","cached":true}
```

Stored at `~/.milady/audit/confidant.jsonl`. Rotated daily. Settings UI renders the last 30 days as a table grouped by skill.

The log records the **secret ID**, never the value. A leaked audit log reveals which skills used which keys, not the keys themselves.

### 6.3 What the boundary defends against

- A malicious plugin shipped through the registry cannot exfiltrate every credential — only the ones it was granted, and every read is logged.
- A compromised dependency in a plugin (npm supply chain attack) is bounded to that plugin's grants.
- A debugging log that accidentally includes `process.env` reveals nothing — env vars no longer contain credentials post-migration.

### 6.4 What the boundary does not defend against

- A skill granted access to a secret can do whatever it wants with it, including ship it to an attacker. Trust at the boundary, audit afterward.
- Side-channel exfiltration via shared runtime memory (skill A leaks via a global shared with skill B). Mitigation requires worker-level isolation; out of scope for v1.
- Host machine compromise. If root is compromised, OS-keychain access can be granted programmatically. No defense is possible at this layer; this is the OS's threat model.

## 7. Storage

### 7.1 Local store

Path: `~/.milady/confidant.json`, mode `0600`.

```json
{
  "version": 1,
  "masterKey": {
    "ref": "keyring://elizaos.confidant.masterKey"
  },
  "secrets": {
    "llm.openrouter.apiKey": {
      "kind": "reference",
      "source": "1password",
      "ref": "op://Personal/OpenRouter/api-key",
      "lastModified": 1714330000000
    },
    "llm.anthropic.apiKey": {
      "kind": "literal",
      "source": "file",
      "ciphertext": "v1:base64-iv:base64-tag:base64-ct",
      "lastModified": 1714330000000
    },
    "subscription.anthropic.accessToken": {
      "kind": "reference",
      "source": "keyring",
      "ref": "keyring://elizaos.subscription.anthropic.accessToken",
      "deviceBound": true,
      "lastModified": 1714330000000
    }
  },
  "permissions": {
    "weather-bot": {
      "grants": [
        {
          "pattern": "llm.openrouter.apiKey",
          "mode": "always",
          "grantedAt": 1714329000000,
          "reason": "User approved at installation"
        }
      ]
    }
  }
}
```

The `permissions` section is canonical. Skills cannot modify their own grants.

### 7.2 Encryption at rest (FileBackend)

Literal values stored in the file are encrypted with **AES-256-GCM**. Per-secret 12-byte nonce (random). 16-byte authentication tag. Versioned ciphertext format `v1:nonce:tag:ct` (all base64).

The encryption key (the **master key**) is a 32-byte random value generated on first run, stored as a single keyring entry: `keyring://elizaos.confidant.masterKey`. The keyring entry is the encryption root. If the keyring is unavailable (e.g., headless Linux without a keyring agent), the user is prompted to enter a passphrase and the master key is derived via Argon2id (params: `t=3, m=64MiB, p=1`, 16-byte salt persisted alongside the file).

Master key rotation: re-encrypt all literals under a new key, atomic-rename the file, then delete the old keyring entry. Implemented behind a `confidant rotate` CLI subcommand. Not in v1.

### 7.3 Why not just store everything in the keyring?

Three reasons:
1. Per-secret keyring entries on macOS show up as separate Keychain Access items. After 30 secrets it's a mess and users start questioning what's there.
2. Keyring access on Linux is platform-dependent (libsecret + a running secret-service agent). Many headless setups don't have one. The file fallback lets Milady run with `0600` + an Argon2id-derived key.
3. The descriptor metadata (`lastModified`, `source`, `permissions`) needs structured storage. Keyrings store opaque blobs.

The keyring holds the **master key only** (one entry). All structured data lives in the file. The file is encrypted at the field level for literals.

References (`op://`, `pass://`) are stored as plaintext URIs in the file — they are not secrets. The thing the URI refers to is the secret, and that lives in 1Password / Proton Pass / etc.

### 7.4 Reference URI scheme

| Scheme | Resolver | Notes |
|---|---|---|
| `keyring://service.path` | `KeyringBackend` | Single OS-keychain entry. Used for the master key and for device-bound subscription tokens. |
| `file://` | `FileBackend` | Encrypted in `confidant.json`. The "default" backend when no password manager is configured. |
| `op://vault/item/field` | `OnePasswordBackend` | Calls `op read $URI` via `Bun.spawn`. User must have `op` CLI installed and authenticated. |
| `pass://vault/item/field` | `ProtonPassBackend` | Calls Proton Pass SDK or CLI. |
| `env://VAR_NAME` | `EnvLegacyBackend` | **Migration-only**. Reads `process.env[VAR_NAME]`. Used during phases 0-5; removed in phase 6. |
| `cloud://path` | `CloudBackend` | E2E-encrypted Eliza Cloud sync. Phase 7+. |

A reference URI is parsed by `parseReference(ref)` which dispatches to the backend matching its scheme.

## 8. Backends

Each backend implements one method:

```ts
interface VaultBackend {
  scheme: string;  // 'op', 'keyring', etc.
  resolve(ref: VaultReference): Promise<string>;
  store?(id: SecretId, value: string): Promise<VaultReference>;
  remove?(ref: VaultReference): Promise<void>;
}
```

Backends with no `store` (e.g., 1Password — values are entered through 1Password UI, not Milady) cannot be the target of a literal write. The Settings UI shows them as read-only.

### 8.1 FileBackend

- `resolve(ref)` — `ref` must equal `'file://'`; reads the entry from `confidant.json`, AES-GCM-decrypts.
- `store(id, value)` — encrypts, writes to `confidant.json`.
- Always available.

### 8.2 KeyringBackend

- macOS: `security find-generic-password` / `add-generic-password` via `Bun.spawn`.
- Windows: Credential Manager via `wincred` FFI.
- Linux: libsecret via D-Bus.
- Argv-array spawn, no shell interpolation.
- Used for the master key and for device-bound subscription OAuth tokens.

### 8.3 OnePasswordBackend

- `op read $ref` for resolves. Spawned synchronously within the resolve call (it's fast — `op` caches the session locally).
- If `op` isn't installed: error "1Password CLI not found. Install from https://developer.1password.com/docs/cli." Surfaced in Settings UI.
- If `op` is installed but locked: `op` returns a non-zero exit; we surface "1Password is locked. Unlock the desktop app or run `eval $(op signin)`."
- We do not store the user's 1Password credentials. We rely on `op`'s own session management, which is the user's existing trust relationship with 1Password.
- `store(id, value)` — out of scope for v1. Users add items via 1Password's UI.

### 8.4 ProtonPassBackend

- Identical shape to OnePasswordBackend, using `protonpass-cli` (currently in beta) or the Proton Pass SDK if a stable Node binding is available. Treat as a v1 stretch goal.

### 8.5 EnvLegacyBackend

- `resolve('env://VAR_NAME')` returns `process.env[VAR_NAME]`.
- Read-only. There is no `store`.
- Exists solely for migration. The credential resolver (`credential-resolver.ts`) populates Confidant entries with `env://`-references at boot during phases 0-5, so legacy code paths can still resolve through Confidant without disturbing whatever populated `process.env`.
- **Removed in phase 6.** When the last call-site migrates off it, the file is deleted and any `env://`-typed entry in `confidant.json` becomes invalid (resolves throw).

### 8.6 CloudBackend (deferred to phase 7)

E2E encryption design:
- User provides a passphrase at first sync setup.
- Master key for cloud sync is derived: `cloudKey = Argon2id(passphrase, salt, t=3, m=64MiB, p=1)`.
- Each secret value is encrypted with AES-256-GCM under `cloudKey`.
- Server stores: `(secretId, ciphertext, nonce, tag, lastModified)`. Server **never** sees `cloudKey`, passphrase, or plaintext.
- Salt is fetched from the server at first sync per-account (not derivable from the passphrase, prevents rainbow tables); salt itself is non-secret.
- Conflict resolution: last-write-wins by `lastModified`. If two clients write within a 60s window, both versions are stored; the local Confidant surfaces a conflict the user resolves by picking one.
- Subscription tokens (`deviceBound: true`) **never sync**. Only the metadata "this account exists" syncs.

Phase 7 is large. Do not block on it.

## 9. Migration plan

Strangler fig. Each phase is independently shippable, ends with a passing test suite, and deletes legacy code as it goes.

### Phase 0 — package and contract (no behavior change)

- New package `eliza/packages/confidant/` with the public API, types, `FileBackend`, `KeyringBackend`, `EnvLegacyBackend`, audit log, permission policy.
- Tests cover encryption, permission denial, audit log shape, all backend resolves.
- The package is published as `@elizaos/confidant@2.0.0-alpha.1`.
- Nothing in the runtime calls it yet.
- **Exit criterion:** `bun run test` for the package passes; published artifact loadable.

### Phase 1 — runtime initializes Confidant

- elizaOS runtime constructs a `Confidant` at boot, before plugin registration.
- A new `runtime.confidant` field is exposed.
- Existing `process.env` hydration in `credential-resolver.ts` continues to run unchanged, but its results are *also* mirrored into Confidant as `env://` references for every known credential ID.
- Plugins still read `process.env` directly. No call-sites migrated.
- **Exit criterion:** `runtime.confidant.list()` returns the same set of credential IDs that exist in `process.env` after `credential-resolver` runs.

### Phase 2 — single canonical writer

- Replace both writers (`plugins-compat-routes.ts` save, `provider-switch-config.ts` `setEnvValue`) with `runtime.confidant.set(id, value)`.
- The legacy `env.*` and `env.vars.*` blocks in `milady.json` are no longer written. On read, the runtime imports them on first boot post-upgrade and migrates them into Confidant.
- The `Object.values(config).find(...)` heuristic in `usePluginsSkillsState.ts:246-251` is **deleted**. The save form has structured field names; we use them.
- **Exit criterion:** `milady.json` after a fresh save no longer contains `env.*` or `env.vars.*` blocks; `confidant.json` contains the migrated values.

### Phase 3 — built-in AI providers migrate to Confidant reads

- `@elizaos/plugin-openrouter`, `-openai`, `-anthropic`, `-google-genai`, `-elizacloud` switch to `runtime.confidant.lazyResolve(id)` for every credential read.
- For each plugin migrated, its env-var hydration is removed from `credential-resolver.ts` (one less hardcoded env-var name).
- `EnvLegacyBackend` references for that provider become orphan and are pruned from `confidant.json` on next save.
- **Exit criterion:** every built-in AI plugin's `resolveProviderCredential` path goes through Confidant; `credential-resolver.ts` no longer special-cases that provider.

### Phase 4 — password manager backends

- `OnePasswordBackend` ships with the `op` CLI integration.
- Settings UI grows a "Storage" picker per-secret: File / OS Keychain / 1Password (if `op` detected). Picking 1Password rewrites the entry from a literal to `op://` reference.
- `ProtonPassBackend` ships when their CLI/SDK is stable enough; until then, behind a feature flag.
- **Exit criterion:** a user who has all three of (literal-in-file, keyring entry, 1Password reference) can configure each as their `llm.openrouter.apiKey` and resolves succeed transparently.

### Phase 5 — third-party plugins migrate

- Plugin authors update their plugins to read from `runtime.confidant` instead of `process.env`.
- Plugins that don't migrate continue to work via `EnvLegacyBackend`, but emit a deprecation warning at registration time naming the env vars they read.
- A plugin lint rule (in `@elizaos/cli doctor`) flags `process.env.*_API_KEY` reads in plugin source and points to Confidant.
- **Exit criterion:** all `@elizaos/plugin-*` packages in this monorepo have migrated; deprecation warnings catalog any third-party laggards.

### Phase 6 — close the boundary

- The credential resolver stops hydrating env vars. `process.env.OPENROUTER_API_KEY` is `undefined` at runtime.
- `EnvLegacyBackend` is **deleted**.
- Any plugin that hadn't migrated breaks loudly (clear error: "Plugin X reads `process.env.Y_API_KEY`; this is no longer populated. Migrate to `runtime.confidant.resolve('domain.subject.field')`.").
- The skill exfiltration boundary is now closed.
- **Exit criterion:** running the test suite with `process.env.*_API_KEY` cleared at process start is green; runtime logs do not contain any `*_API_KEY` env reads.

### Phase 7 (optional, separable) — Cloud sync

- Implement `CloudBackend`. New design doc at design-time of phase 7.
- Settings UI gains "Sync via Eliza Cloud" toggle, passphrase setup, conflict resolution.

The plan deliberately ships value at every phase: phase 1 fixes the duplicate `env.*` / `env.vars.*` write. Phase 2 fixes the API-key-overwritten-by-model-slug bug. Phase 3 makes the built-in providers safe. Phase 4 unblocks 1Password. Phase 6 closes the security hole. Phase 7 is opt-in sync.

## 10. In-app browser autofill

The Electrobun in-app browser's existing wallet shim ([`BrowserWorkspaceView.tsx:751-865`](../../eliza/packages/app-core/src/components/pages/BrowserWorkspaceView.tsx)) provides the precedent. The autofill bridge is structurally identical:

```
Page DOM
  └─ window.__confidantAutofill (preload-injected helper)
       └─ __electrobunSendToHost({ type: '__confidantAutofill', ... })
              └─ host-message event in BrowserWorkspaceView
                    └─ runtime.confidant.findCredentialsForDomain(domain)
                          └─ user consent prompt (first time per domain per session)
                                └─ confidant.resolve(matchedId)
                                      └─ webview.executeJavascript(`window.__confidantReply(...)`)
                                            └─ Page DOM filled
```

### 10.1 Preload bridge (page side)

Appended to `BROWSER_TAB_PRELOAD_SCRIPT` ([`browser-tabs-renderer-registry.ts:54`](../../eliza/packages/app-core/src/utils/browser-tabs-renderer-registry.ts)) and to `TRUSTED_ELIZA_WINDOW_PRELOAD` for the cloud-auth window:

```js
(() => {
  const pending = new Map();
  window.__confidantAutofill = {
    async request(kind /* 'username' | 'password' | 'totp' */) {
      const id = crypto.randomUUID();
      const promise = new Promise((resolve) => pending.set(id, resolve));
      window.__electrobunSendToHost({
        type: '__confidantAutofill',
        id,
        // domain is NOT sent — server derives it from the tab's actual URL
        kind,
      });
      return promise;
    },
  };
  window.__confidantReply = (id, payload) => {
    pending.get(id)?.(payload);
    pending.delete(id);
  };
})();
```

Key invariant: the page never tells the bridge what domain it is on. The bun side derives the domain from `BrowserWorkspaceManager.getTab(tabId).url`. A page cannot trick the bridge into autofilling credentials for a different origin.

### 10.2 Bun-side handler

```ts
async function handleAutofillRequest(tabId: string, msg: { id: string; kind: 'username' | 'password' | 'totp' }) {
  const tab = browserWorkspace.getTab(tabId);
  if (!tab) return;
  const realDomain = new URL(tab.url).hostname;

  const consented = await consentStore.checkOrPrompt(realDomain, tab.partition);
  if (!consented) return;

  const matches = await confidant.findCredentialsForDomain(realDomain);
  if (matches.length === 0) return reply(null);

  const choice = matches.length === 1
    ? matches[0]
    : await ui.promptMatchPick(matches);
  if (!choice) return reply(null);

  // Different secret IDs per kind:
  //   credentials.<domain>.<account>.username
  //   credentials.<domain>.<account>.password
  //   credentials.<domain>.<account>.totpSecret
  const secretId = secretIdForCredential(choice, msg.kind);
  const value = msg.kind === 'totp'
    ? generateTotp(await confidant.resolve(secretId))  // never fill the secret itself
    : await confidant.resolve(secretId);

  webviewForTab(tabId).executeJavascript(
    `window.__confidantReply(${JSON.stringify(msg.id)}, ${JSON.stringify({ value, kind: msg.kind })})`
  );
}
```

### 10.3 Form detection

The preload also installs a content script that watches for `<input type="password">` and labeled username fields. When a password field gains focus, an inline overlay icon appears; clicking it triggers `__confidantAutofill.request('password')`. This is the standard password-manager UX pattern.

For OAuth provider login flows (logging into OpenAI to grant subscription, etc.), the trigger fires as soon as the page's login form is detected — same as 1Password's extension.

### 10.4 Threat-model rules for the bridge

These are non-negotiable:

1. **Never trust the page-claimed domain.** The bridge does not accept a domain field from the page. The bun side derives it from the tab's URL.
2. **Per-vault-provider partition.** Logging into 1password.com inside the in-app browser uses a separate partition (`persist:milady-vault-1password`) that doesn't intersect the user's regular browsing session.
3. **Origin-check the cloud-auth-window's existing close-bridge** ([`cloud-auth-window.ts:62-82`](../../eliza/packages/app-core/platforms/electrobun/src/cloud-auth-window.ts)). It currently has no origin validation. Tighten before adding the autofill bridge to that window.
4. **Argv-array spawn, always.** Vault CLI calls (`op`, `protonpass-cli`) use `Bun.spawn(["op", "read", uri])` with validated argv. No string interpolation, ever.
5. **DOM-level leak is the accepted cost of autofill.** Once a credential is in the page's JS context, anything in the page can read it. This is industry-standard and unavoidable. We do not autofill into pages we did not navigate to.

## 11. Threat model summary

| Threat | Defended | How | Residual risk |
|---|---|---|---|
| Plugin reads `process.env` to exfiltrate keys | Yes (post phase 6) | Env vars no longer contain credentials | Plugins explicitly granted access to a secret can still leak it |
| Plugin reads another plugin's secrets | Yes | Per-skill grants enforced on every resolve | A skill granted broad `*` access bypasses per-secret control |
| Disk-image leak (laptop stolen) | Yes | AES-GCM at rest with master key in OS keychain (biometric-gated) | If the OS user is unlocked at theft time, all bets off |
| Cloud server compromise | Yes (phase 7) | E2E encryption, server sees only ciphertext | If user's passphrase is weak, brute-force is feasible |
| Phishing site requests autofill | Yes | Bun side derives domain from tab URL, ignores page-claimed | User can still type their password into a phishing form (out of autofill scope) |
| Malicious 1Password CLI (`op` binary swapped) | No | We trust `op`'s signature; if a compromised binary is on PATH, it has all 1Password access regardless of Milady | Recommend users install `op` via official installer |
| Side-channel via shared runtime memory | No | All plugins share a process and a JS heap | Mitigation requires worker-level isolation; future work |
| Compromised dependency in a plugin | Partial | Bounded to that plugin's grants and audited | Supply-chain security is a separate problem |
| User runs malicious skill they explicitly granted access to | Accepted | Trust at boundary, audit afterward | The grant prompt is the only line of defense |

## 12. Failure modes

| Failure | Behavior | Recovery |
|---|---|---|
| `confidant.json` corrupt | Refuse to start. Log path. | Restore from backup or delete to reset (loses all secrets). |
| Master keyring entry missing | Prompt for passphrase recovery. If unset, refuse. | Re-run setup, re-enter all secrets. |
| `op` binary missing | Resolves of `op://` refs throw with installation hint. | User installs `op`. Other backends unaffected. |
| `op` CLI locked | Resolves throw with "unlock 1Password" hint. | User unlocks 1Password app or runs `op signin`. |
| Permission denied | Resolve throws `PermissionDeniedError(skillId, secretId)`. | User opens Settings → Permissions, approves. |
| Plugin reads `process.env` post-phase-6 | Plugin breaks loudly; clear migration error in log. | Plugin author migrates to Confidant or user removes plugin. |
| Cloud sync conflict (phase 7) | Both versions stored locally, UI prompts user. | User picks one. |
| Cloud sync passphrase forgotten (phase 7) | Sync stops; local secrets unaffected. | User clears cloud sync, re-onboards with new passphrase. |

## 13. Observability

- **Audit log**: `~/.milady/audit/confidant.jsonl`, one JSON object per resolve. Daily rotation. Settings UI surfaces.
- **Metrics**: counters per `(skill, secret, granted)` tuple via the existing OTEL stack. No values, IDs only.
- **Structured logs**: every Confidant log line uses the structured logger with `[Confidant]` prefix; values are never logged, only IDs and source.
- **Log redaction**: the existing logger redaction layer adds patterns for `sk-or-v1-*`, `sk-ant-*`, `sk-*`, etc. — defense in depth in case anything bypasses Confidant.

## 14. Out of scope (named, so we don't accidentally drift in)

- **Browser-extension autofill outside the in-app browser.** We are not shipping a Chrome/Firefox extension.
- **HSM / hardware token integration.** No FIDO2, no YubiKey storage. Out of scope.
- **Multi-user / team vaults.** Confidant is single-user. Sharing happens through 1Password / Proton Pass team features, not through Confidant.
- **Encrypted full-disk backup of `confidant.json`.** Use OS-level backup (Time Machine, etc.).
- **Secrets versioning / history.** `lastModified` is the only timestamp. No prior values are kept.
- **Field-level access audit beyond resolve count.** We log resolves, not what the value was used for.

## 15. Open questions

These need a decision before phase 1 implementation begins.

1. **Where does the package live?** `eliza/packages/confidant/` (elizaOS upstream, available to all consumers) or `packages/confidant/` (Milady-only first, upstream later)? Recommendation: elizaOS upstream from day one — this is a foundational primitive.
2. **Permission grant UI**: a modal at first-resolve, or a Settings preregistration step? Recommendation: modal at first resolve, with "remember this decision" defaulting to checked. Lower friction.
3. **Glob granularity**: do we allow `llm.*` grants, or require provider-level `llm.openrouter.*`? Recommendation: provider-level minimum. `*` is reserved for first-party migration tooling only.
4. **Subscription token sync metadata**: when phase 7 ships, should the *list* of linked subscription accounts sync (so device 2 sees "you've linked Claude on device 1" and can prompt to link too)? Recommendation: yes, sync the metadata only; tokens stay device-local.
5. **Audit log retention**: 30 days, 90 days, forever? Recommendation: 90 days local, no upload. User can extend.
6. **How does Confidant interact with the existing `services/account-pool.ts`?** That module is the per-account resolver for OAuth-style subscriptions. Recommendation: account-pool keeps its lifecycle role; it stores the actual OAuth tokens via Confidant under `subscription.{provider}.{accountId}.accessToken`. Confidant becomes the storage; account-pool keeps the rotation.

## 16. Definition of done

Confidant is "done" when all of these are true:

- All built-in `@elizaos/plugin-*` packages resolve credentials through `runtime.confidant`.
- `process.env.*_API_KEY` is empty at runtime; `EnvLegacyBackend` is deleted.
- `~/.milady/milady.json` no longer contains `env.*` or `env.vars.*` blocks for credentials.
- The `Object.values(config).find(...)` heuristic does not exist in the codebase.
- The Settings UI's "Reveal" toggle for an API key works (round-trips through Confidant).
- A user can store any provider key as a 1Password reference and resolves succeed.
- Disconnecting Eliza Cloud also clears the orphan `serviceRouting.tts/media/embeddings/rpc` routes.
- `op://` references are first-class in Settings (not behind a feature flag).
- The in-app browser autofill bridge resolves credentials through Confidant for both first-party providers (OpenAI/Anthropic OAuth) and third-party sites.
- Permission denial logs are visible in Settings → Permissions for the last 90 days.
- A plugin author who reads `process.env.X_API_KEY` gets a deprecation warning at registration with a one-line migration path.
- The skill exfiltration boundary is testable: a unit test verifies that a plugin without a grant cannot resolve a secret it didn't register.

When every item in that list is true, the seven problems in §2 are closed and Confidant is the only place credentials live or pass through.
