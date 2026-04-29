# @milady/vault

Simple secrets/config vault for Milady. **One** API for sensitive
credentials and non-sensitive configuration.

## Why this exists

Milady's Settings flow had four real bugs that all came from the same
root cause — credentials and config were scattered across multiple
writers, multiple file layouts, and a guess-which-field-is-the-key
heuristic. The vault is the single seam those bugs disappear behind:

1. **Model slug overwrote API key** — the save path used
   `Object.values(config).find(non-empty)` to identify the credential,
   so typing the model field before the API-key field corrupted the
   key. The vault's typed API makes this structurally impossible.
2. **Dual writer** — values landed in `env.X` AND `env.vars.X`. One
   writer, one storage location.
3. **Orphan `tts/media/embeddings/rpc` routes after Eliza Cloud
   disconnect** — fixed at the disconnect-handler level by clearing
   the routes when the account unlinks.
4. **No reveal** — saved values were write-only. `vault.reveal(key)`
   round-trips through the audit log.

## API

```ts
import { createVault } from "@milady/vault";

const vault = createVault();

// Same call signature for sensitive and non-sensitive:
await vault.set("openrouter.apiKey", "sk-or-v1-...", { sensitive: true });
await vault.set("ui.theme", "dark");

// Reads:
await vault.get("openrouter.apiKey");      // → "sk-or-v1-..."
await vault.has("openrouter.apiKey");      // → true
await vault.describe("openrouter.apiKey"); // → { source, sensitive, lastModified }
await vault.reveal("openrouter.apiKey", "settings-ui"); // logged in audit
await vault.list();                         // → all keys, no values
await vault.list("openrouter");             // → prefix-filtered
await vault.remove("openrouter.apiKey");
await vault.stats();                        // → { total, sensitive, nonSensitive, references }

// Password-manager references — value lives there, vault stores reference:
await vault.setReference("openrouter.apiKey", {
  source: "1password",
  path: "Personal/OpenRouter/api-key",
});
```

## Storage

- **Sensitive values** — AES-256-GCM encrypted at rest with the vault
  key as additional authenticated data. Master key in OS keychain
  (cross-platform via `@napi-rs/keyring`: macOS Keychain, Windows
  Credential Manager, Linux libsecret).
- **Non-sensitive values** — plaintext in `~/.milady/vault.json`
  (mode 0600). Atomic-rename writes.
- **References** — stored as `{ source, path }`. The actual value lives
  in 1Password / Proton Pass; resolved at use time via the vendor's
  CLI.

## Sync

Sync = your existing tools. If you want secrets across devices, store
them as 1Password references — 1Password syncs your vault, the
references stay portable, your secrets follow. We don't build a
separate cloud sync.

## Audit log

Every operation appends one JSONL line to
`~/.milady/audit/vault.jsonl`:

```jsonl
{"ts":1714330000000,"action":"set","key":"openrouter.apiKey"}
{"ts":1714330000010,"action":"get","key":"openrouter.apiKey"}
{"ts":1714330000020,"action":"reveal","key":"openrouter.apiKey","caller":"settings-ui"}
```

Records keys, never values. Pass an optional `caller` to `reveal()` so
the log shows who asked.

## Testing

```ts
import { createTestVault } from "@milady/vault/testing";

const test = await createTestVault({
  values:  { "ui.theme": "dark" },
  secrets: { "openrouter.apiKey": "test-key" },
});

await test.vault.set("openai.apiKey", "test-2", { sensitive: true });
const records = await test.getAuditRecords();
await test.dispose();
```

Real vault, real encryption, real audit log — temp dir cleaned up on
`dispose()`. No OS keychain access (uses an in-memory master key).
