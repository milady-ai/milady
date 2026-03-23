---
title: "Platform secure store (design)"
sidebarTitle: "Platform secure store"
description: "Cross-platform design for wallet and agent secrets: macOS Keychain, Windows Credential Manager, Linux Secret Service, namespacing for multi-agent isolation, and signing without fan-out to child processes."
---

This document defines how Milady should store **high-value secrets** (especially **chain private keys**) using each OS’s native secret store, while staying compatible with **multi-agent** workflows (per-agent state, coding swarms / PTY workers).

**Status:** architecture — implementation is phased; today wallet keys may still live in config `env` (see [Wallet & Crypto](./wallet.md)).

## Goals

1. **At rest:** Private keys and comparable secrets are **not** persisted in plaintext `milady.json` / `eliza.json` when the user opts in (or by default on supported desktops).
2. **Namespaced:** Secrets are **scoped per Milady agent instance** (state directory / agent identity), so two profiles on one machine do not collide.
3. **Multi-agent safe:** **Swarm / PTY / subprocess** agents do **not** receive raw key material in environment variables; they use **host-mediated signing** (existing [RemoteSigningService](./wallet.md#remote-signing-service) direction).
4. **Cross-platform:** One **abstract API** with **platform backends** and explicit **fallback** behavior.
5. **Operable:** Headless `milady start`, desktop Electrobun, and CI have documented behavior (including “store unavailable”).

## Non-goals (for this layer)

- Replacing Eliza **Secrets Manager** (DB + encryption) for arbitrary plugin API keys — that remains **per-agent** application storage. The platform store is for **machine-bound** secrets (keys you would otherwise put in `env` on disk).
- Hardware wallets / MPC — orthogonal; can still sit behind the same **signing façade**.

## Conceptual model: `PlatformSecureStore`

A single capability surface (implemented per OS):

| Operation | Purpose |
|-----------|---------|
| **Get** | Read secret bytes/string for a `(vaultId, secretKind)` |
| **Set** | Write or overwrite |
| **Delete** | Remove (e.g. on wallet wipe / reset) |
| **Probe** | Whether the backend is available (e.g. Secret Service not running) |

**Returns** must distinguish: `not_found`, `denied` (user cancelled / ACL), `unavailable` (no daemon), `error` (transient).

TypeScript contract: `packages/app-core/src/security/platform-secure-store.ts`.

## Vault ID (`vaultId`) — multi-profile and multi-agent

**Problem:** A generic keychain item named `Milady/EVM_PRIVATE_KEY` would be shared by every profile and unsafe.

**Rule:** Every stored item is keyed by a **`vaultId`**: a **stable, opaque string** derived from the **canonical agent state root** (e.g. resolved `ELIZA_STATE_DIR` / config home for this Milady process).

**Requirements:**

- **Stable** across restarts for the same profile.
- **Distinct** for different `ELIZA_STATE_DIR` values.
- **Not reversible** to a full filesystem path in the stored label (use a short hash prefix in service/account fields; optional human label `"Milady wallet"` for prompts only).

**Suggested derivation (normative for implementers):**

```
canonicalPath = realpath(normalize(ELIZA_STATE_DIR or equivalent))
vaultId = "mldy1-" + base64url(sha256(utf8(canonicalPath)))[0:16]
```

Version prefix `mldy1-` allows future algorithm changes without colliding.

**Per-secret account string** (within the OS item) should include **`secretKind`** (e.g. `wallet.evm_private_key`, `wallet.solana_private_key`) so one vault can hold multiple keys without ambiguity.

## Platform backends

| OS | Primary backend | Typical API / library | User-visible store |
|----|-----------------|------------------------|--------------------|
| **macOS** | Keychain | `security` CLI from main process, or Security.framework | Keychain Access |
| **Windows** | Credential Manager | Credential Manager APIs (`CredRead` / `CredWrite`) | Credential Manager |
| **Linux** | Secret Service | `libsecret` via D-Bus (GNOME Keyring / KWallet) | Keyring / Wallet UI |

**Service / target naming convention** (examples):

- **Service:** `ai.milady.agent.vault` (fixed product id).
- **Account:** `{vaultId}:{secretKind}` (max length within OS limits; shorten hash if needed).

Exact spelling is implementation-defined but must stay **consistent** per release (document migrations if it changes).

## Fallback ladder (especially Linux)

When the native store is **unavailable** (headless server, no Secret Service, user denied access):

1. **Degrade explicitly:** report `unavailable` to the wallet UI / logs; do not silently fall back to plaintext without user consent.
2. **Optional consenting fallback:** encrypted-at-rest file under the **state dir** with a key derived from **machine + user** (DPAPI on Windows; similar pattern only where well-supported), **or** require user to keep keys in `env` (current behavior).

Document the chosen fallback in release notes and [Wallet](./wallet.md).

## Where code runs: desktop vs CLI vs workers

| Runtime | Reads OS store? | Notes |
|---------|----------------|-------|
| **Electrobun main process** | **Yes** (preferred) | Native `security` / FFI / future bundled helper; reuse patterns from `apps/app/electrobun/src/native/credentials.ts` (today: third-party CLI OAuth), extended for Milady-owned vault items. |
| **Embedded API / Node child** | **Via bridge** | Renderer or CLI child asks main/native holder for **set/get/delete** over IPC, or receives **signed payloads** only. |
| **`milady start` (Node only)** | **Yes** if linked to platform APIs | On Linux without GUI, often `unavailable` — acceptable if documented. |
| **PTY / swarm child** | **No** | Must not receive `EVM_PRIVATE_KEY` / `SOLANA_PRIVATE_KEY`; use **RemoteSigningService** (or equivalent IPC) on the host. |

This preserves the **multi-agent** property: many logical agents can **request** signatures; **one** trusted component holds or retrieves key material.

## Resolution order (read path)

When loading wallet keys into the signing layer:

1. **Platform store** for `(vaultId, wallet.*)` if feature enabled and backend available.
2. **Existing config** `env.EVM_PRIVATE_KEY` / `SOLANA_PRIVATE_KEY` (legacy).
3. **`process.env`** (shell / container), unchanged precedence vs today.

**Write path** (import / generate): after successful write to platform store, **remove** corresponding keys from persisted config (or replace with a marker like `"os-store://wallet.evm_private_key"` if the runtime needs a sentinel — prefer **absence** + flag file).

## Migration and backup

- **Backup:** OS store is **not** in `export agent` zip by default. Offer explicit **“Export wallet secrets”** (already sensitive) or document **manual keychain backup** (platform-specific).
- **Restore:** Re-import keys or restore keychain backup; align `vaultId` with **same** `ELIZA_STATE_DIR` or document re-keying.
- **Reset agent:** Delete platform entries for this `vaultId` when user confirms full wipe (same as clearing config `env` today).

## Phased implementation (suggested)

1. **Contract + noop** — ship `PlatformSecureStore` interface and a **no-op / env-only** implementation; wire wallet resolution order behind a flag.
2. **macOS (Electrobun main)** — implement Keychain get/set/delete for `wallet.*` kinds; IPC from renderer/API child.
3. **Windows** — Credential Manager from packaged binary / main process.
4. **Linux** — libsecret + clear `unavailable` path.
5. **Default on** for new installs on supported desktops; **migrate** prompt for existing plaintext config.

## Testing

- **Unit:** mock store, resolution order, `vaultId` derivation (golden vectors for path normalization).
- **Integration:** optional macOS CI job or manual checklist; never commit real keys.
- **Security review:** ensure logs never print values; audit bridge IPC auth (loopback token, etc.).

## macOS Node implementation: `security` CLI and argv exposure {#macos-keychain-cli-argv}

The current **Node** backend (`packages/app-core/src/security/platform-secure-store-node.ts`, class `MacOSKeychainPlatformSecureStore`) shells out to Apple’s **`security`** tool.

### Writes (`add-generic-password -w <secret>`)

**Issue:** The private key (or other secret) is passed as a **command-line argument** to `security`. While the `execFile` call is short-lived, the value can appear **momentarily in process listings** (`ps`, Activity Monitor, etc.) for the same user and for **root** — a known limitation of invoking CLI tools that only accept secrets via `-w`.

**Contrast (Linux):** `secret-tool store` receives the secret on **stdin** (`secretToolStoreWithStdin`), so it does not sit in argv.

**Mitigations today:** keep using the store only from trusted contexts; avoid `ps` scraping on shared admin sessions; treat this as **defense-in-depth** alongside “no plaintext in config.”

**Follow-up (recommended):** replace CLI writes with **Security.framework** (Objective-C/Swift) or **Bun FFI** to the Keychain APIs so the secret never crosses argv. Reads use `find-generic-password -w` where `-w` means “write password to stdout” — the **secret bytes are not duplicated in argv** for that subcommand; only the **set** path is argv-sensitive.

### Reads and deletes

- **Read:** `find-generic-password … -w` — `-w` requests stdout output; arguments are service/account identifiers only.
- **Delete:** `delete-generic-password` — no secret material on the command line.

### Accepted residual risk — Node `security` **writes** (until native helper)

Code review (**PR #1239**) flagged that **`add-generic-password -w <secret>`** places the raw key on the **`security` child argv**, briefly visible to **`ps`** for the same macOS user (and root). We **document** this rather than pretending temp files or shell wrappers remove argv exposure: any pattern that ends in `security … -w …` still passes the secret as an argument unless we call **Security.framework** directly.

**Threat model we accept today:** local, same-user “shoulder surf” or automation scraping `ps` during the **milliseconds** the child runs — not remote attackers. **Linux** in the same module uses **stdin** and does **not** have this argv class.

**Follow-up (blocking-class hardening):** ship a tiny **native** helper (Swift / ObjC / FFI) that calls **SecItemAdd** / **SecItemUpdate** so the secret never crosses argv.

## Screenshot dev token (separate concern)

The Electrobun **loopback** screenshot server (`apps/app/electrobun/src/screenshot-dev-server.ts`) authenticates with **`Authorization: Bearer …` only**. Query-string tokens were **not** used by the Milady API proxy (`/api/dev/cursor-screenshot`); support for `?token=` was removed **because** it could leak into server logs, Referer, and browser history. See [Desktop local development](../apps/desktop-local-development.md#full-screen-png--get-apidevcursor-screenshot).

## Related

- [Wallet & Crypto — Security model](./wallet.md#security-model)
- [Coding swarms](./coding-swarms.md) — subprocess boundaries
- [Secrets Manager plugin](../plugin-registry/secrets-manager.md) — per-agent DB secrets (complementary)
