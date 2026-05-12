# Layer 10 — eliza/plugins/* (sample-driven survey)

**Files: 2,575** TypeScript across **99 plugin/app dirs** under `eliza/plugins/`.
**Surveyed: 99 / 99 dirs** (sample-driven; per-dir, not per-file).
**Refactored: 0 / 99.**

> **CAVEAT — survey only.** A true file-by-file audit at this scale is multi-week
> work. This pass is **bulk-driven**: caller-grep, package metadata, registry
> diff, dist/test split, top-K LOC sample. Per-dir status is at the dir level.
> Most dirs are flagged `[?]` (deferred deep audit) by design — the survey's
> job is to identify the dozen-ish dirs worth full audits, not to audit 99
> dirs.

## Walking-order note (why Layer 10 is the bulk sweep)

`eliza/` is a **gitignored, separate git checkout** (CLAUDE.md §"Dependencies on elizaOS"). In the default
`packages` mode Milady resolves `@elizaos/*` from npm — **none of the source files
under `eliza/plugins/` are in the production bundle**. They only matter when:

1. The user runs `bun run eliza:local` to switch to source-priority mode.
2. A Milady contributor patches an upstream plugin.

So Layer 10 is **upstream code Milady consumes**, not Milady's own code. Every
deletion candidate below requires a parallel decision upstream in the
`elizaOS/eliza` monorepo, not just here. That's why this is the bulk sweep
saved for last per the AUDIT.md walking order.

## Dir-level status conventions (survey-mode)

| Status      | Meaning                                                              |
|-------------|----------------------------------------------------------------------|
| `[!]`       | Surveyed; findings recorded; live and used                           |
| `[x]`       | Surveyed; clean / no concerns at the dir level                       |
| `[?]`       | Surveyed superficially; needs deep file-by-file audit                |
| `[-]`       | Deletion candidate (no callers, museum piece, stub, or build leak)   |

## Cross-cutting findings (apply to whole layer)

### F1. Build leak: `eliza/plugins/dist/` (113 files, untracked)

There is a stray `dist/` directory at the **plugins root** containing built
artifacts (`index.js`, `init.js`, `models/`, `providers/`, etc.) whose code
imports `@elizaos/core` and `@google/genai`. Reads as `plugin-google-genai`
build output that escaped one level too high. **Untracked in the eliza repo.**
Safe to `rm -rf` locally; no upstream PR needed since it's not in git.

- Path: `eliza/plugins/dist/`
- File count: 113 (all generated)
- Action: delete locally; investigate the bundler config in the affected plugin
  that wrote here (likely a `outDir: "../dist"` mistake).

### F2. Empty plugin dirs (3) — abandoned scaffolds

Three dirs have **only a `dist/` and `node_modules/`, zero source, no
package.json**, untracked in eliza's git:

- `eliza/plugins/app-form/` — empty (compare to live `eliza/plugins/plugin-form/` — 16 src files; suspicious naming overlap)
- `eliza/plugins/plugin-plugin-manager/` — empty (registry entry `plugin-manager.json` references `@elizaos/plugin-plugin-manager` from npm)
- `eliza/plugins/plugin-robot-voice/` — empty

All three are **local artifacts of a prior `bun install` that hydrated `node_modules` for npm-only packages**. Safe to delete locally. None should be in the source tree.

### F3. 91 nested `dist/` directories — local build output

Every plugin has its own `dist/` after `bun run build`. Total disk: ~150 MB.
None are tracked in git. The largest:

| dist size | plugin                          |
|-----------|---------------------------------|
| 51 MB     | `plugin-vision`                 |
| 36 MB     | `plugin-elevenlabs`             |
| 25 MB     | `plugin-n8n-workflow`           |
| 15 MB     | `app-lifeops`                   |
| 10 MB     | `plugin-pdf`                    |

`plugin-vision`'s 51 MB dist with only **40 source files** suggests model
binaries or tokenizers bundled into output. Worth investigating in the deep
audit of that plugin.

### F4. Registry-only plugins (27) — npm-resolved, source not in checkout

Plugins listed under `eliza/packages/app-core/src/registry/entries/plugins/`
but **without** a sibling dir in `eliza/plugins/`:

```
auto-trader, blooio, browser, clipboard, code, copilot-proxy, directives,
eliza-classic, evm (→ plugin-wallet), experience, gmail-watch, goals,
hedera, localdb, memory, moltbook, n8n, prose, rss, s3-storage, scheduling,
trajectory-logger, trust, tts, twilio, vercel-ai-gateway, webhooks
```

These are **not dead** — they're upstream npm packages Milady consumes via
`@elizaos/plugin-<name>`. They live in separate `elizaos-plugins/*` repos.
Out of Layer 10 scope; flagged here only to clarify the registry/dir gap.

### F5. Dir-only plugins (34) — connector / provider plugins not in registry

Plugins with a checkout dir but **no `<name>.json` registry entry**. These
are the chat / messaging connectors and a few utility plugins:

```
action-bench, bluebubbles, bluesky, browser-bridge, calendly,
claude-code-workbench, discord, executecode, farcaster, feishu, google-chat,
google-meet-cute, imessage, instagram, line, matrix, nostr, nvidiacloud,
robot-voice, shopify, signal, slack, sql, streaming, suno, telegram,
twitch, vertex, wallet, web-search, wechat, whatsapp, x, xmtp
```

**Connectors** (discord, telegram, x, slack, etc.) are wired through the
**channel-keyed** auto-enable map at `eliza/packages/agent/src/config/plugin-auto-enable.ts`,
not the dashboard registry. That's correct — the registry is for
user-toggleable plugins; connectors enable per-onboarding.

The handful of utility plugins in this list (`action-bench`, `executecode`,
`browser-bridge`, etc.) **do** have callers and load through other paths. Not
dead.

### F6. eliza/cloud overlap (informational)

`eliza/cloud/` has parallel implementations for the connector-style plugins
(discord, telegram, slack, x, mcp, wallet) under `cloud/services/gateway-*`,
`cloud/apps/api/v1/*`, and `cloud/packages/lib/services/*`. **This is by design:**

- `eliza/plugins/plugin-discord` — runtime plugin loaded into a local Eliza agent (DM/channel handling).
- `eliza/cloud/services/gateway-discord` — cloud-hosted webhook gateway that bridges Discord events into hosted agents.

Different deployment surfaces, different code, same external API. **Not
collisions, not dedup candidates.** Flag noted to prevent a future agent from
"consolidating" them.

### F7. `app-lifeops` test-fixture mass — not runtime code

`app-lifeops` total file count is 400, but **84 of those are test files** under
`test/scenarios/` and `scenarios/`. The actual runtime source is **~316
files / ~200 K LOC** — still the largest single plugin/app by an order of
magnitude. Treat as a deep-audit candidate in its own right.

### F8. No v1/v2/legacy subdir splits

`find -name v1 -o -name v2 -o -name legacy -o -name old` across Layer 10
returns **nothing**. Versioning happens via `version` in `package.json`
(`2.0.0-alpha.536` is the modal version), not via in-tree branches. Good.

### F9. No `*.generated.ts` files

Zero generated source files. All `.d.ts` and `.js` build output is properly
contained under `dist/`. Good.

## Sample LOC table (top 25 by source LOC)

Computed `wc -l` on `*.ts`/`*.tsx`, excluding `node_modules`, `dist`, `.d.ts`,
`.test.*`. Calls "loc" loosely — includes blank/comment lines. For top 10, the
test split is also shown.

| Rank | Plugin                       | Source files | Test files | LOC      | Cross-monorepo callers |
|------|------------------------------|-------------:|-----------:|---------:|----------------------:|
| 1    | `app-lifeops`                |          363 |         84 |  200,826 |                    50 |
| 2    | `plugin-wallet`              |          187 |         20 |   49,236 |                    21 |
| 3    | `plugin-agent-orchestrator`  |           79 |          3 |   35,994 |                    38 |
| 4    | `plugin-discord`             |           68 |          9 |   28,797 |                    64 |
| 5    | `plugin-sql`                 |           85 |         69 |   19,422 |                   160 |
| 6    | `app-steward`                |           56 |          5 |   17,795 |                    30 |
| 7    | `plugin-x`                   |           53 |          2 |   13,924 |                    54 |
| 8    | `plugin-n8n-workflow`        |           60 |         25 |   13,797 |                    25 |
| 9    | `app-companion`              |           60 |          1 |   11,187 |                    43 |
| 10   | `app-2004scape`              |           58 |          1 |    8,709 |                    16 |

Notable: `app-lifeops` is **5×** the next-largest. `plugin-sql` is the
canonical bridge into the runtime (160 callers, mostly internal eliza test
suites). `app-2004scape` has 8.7 K LOC for **a museum-piece game demo** — see
deletion candidates below.

## Deletion candidates (top 10)

**Hard rule:** all of these are decisions for the **upstream `elizaOS/eliza`
repo**, not Milady. Milady's choice is whether to **stop tracking them in the
registry / docs / scaffolds**. Local deletion of `eliza/plugins/<name>/` is
fine in either mode.

### Confirmed-dead (zero monorepo callers + non-essential)

1. **`plugin-action-bench`** — 0 callers, 28 src files, "action benchmarking"
   harness. Not in registry, not in auto-enable, not imported. Likely an
   internal eliza eval tool that doesn't belong in the plugin tree.
2. **`plugin-calendly`** — 0 callers, 9 src files. No registry entry, no
   auto-enable. Likely a hackathon/half-built integration.
3. **`plugin-google-meet-cute`** — 0 callers, 16 src files. Joke name, no
   wiring. Pure dead weight.
4. **`plugin-nvidiacloud`** — 0 callers, 11 src files. Not in registry, not
   in auto-enable. Superseded by `plugin-openrouter` / `plugin-vertex`.
5. **`plugin-vertex`** — 0 callers, 13 src files. Same story; not in
   registry. Superseded by `plugin-google-genai`.
6. **`plugin-web-search`** — 0 callers, 5 src files. Package name uses old
   scope `@elizaos-plugins/*` (not `@elizaos/*`) — clearly an artifact from
   pre-migration era.
7. **`plugin-xmtp`** — 0 callers, 5 src files. XMTP messaging connector;
   neither in registry nor in any auto-enable map.

### Build/scaffold leaks (not source code at all)

8. **`eliza/plugins/dist/`** — F1 above. 113 generated files. Delete locally.
9. **`eliza/plugins/app-form/`** — F2 above. Empty hydration shell.
10. **`eliza/plugins/plugin-plugin-manager/` + `plugin-robot-voice/`** —
    F2 above. Empty hydration shells.

### Museum-piece "demo apps" (need product call before deleting)

`app-2004scape`, `app-defense-of-the-agents`, `app-clawville`,
`app-hyperscape`, `app-babylon`, `app-screenshare` — these look like
elizaOS demo / game / hackathon apps. They have low caller counts (7-18,
mostly each other or scaffolds) and high LOC for what they do. **Defer to
product:** are these shipped, are they marketing demos, are they being
used to validate the orchestrator?

If the answer is "no" for any of them, they're 50-100 K LOC of dead weight
each with a `dist/` to match.

## Deep-audit candidates (top 10)

Live, complex, high caller-count, and exposed to Milady's runtime contract.
These warrant a real file-by-file audit before any further refactor of the
layers above touches them.

1. **`plugin-sql`** (85 src / 19 K LOC / **160 callers**) — the SQL/Drizzle
   bridge. Used by every test suite and many runtime paths. Schema changes
   here cascade everywhere.
2. **`plugin-anthropic`** (21 src / **66 callers**) — primary LLM provider for
   Milady (Opus 4.7 default per CLAUDE.md). Any change to model defaults,
   prompt-cache headers, or provider switch lives here.
3. **`plugin-discord`** (68 src / 28 K LOC / **64 callers**) — largest
   connector; the cloud/local-runtime overlap (F6) means contract changes
   need both surfaces to agree.
4. **`plugin-x`** (53 src / 13 K LOC / **54 callers**) — second-largest social
   connector; high churn historically.
5. **`app-lifeops`** (363 src / 200 K LOC / 50 callers) — the scaffolded
   "personal OS" app; its sheer size means it could hide architectural
   violations that bleed into shared infra.
6. **`app-companion`** (60 src / 11 K LOC / 43 callers) — the desktop
   companion app entrypoint.
7. **`plugin-agent-orchestrator`** (79 src / 36 K LOC / 38 callers) —
   spawns Codex/Claude/OpenCode sub-agents (per CLAUDE.md). Critical path for
   the coding-agent product surface.
8. **`plugin-elizacloud`** (49 src / **45 callers**) — the Cloud SDK
   integration. Auth, billing, app-domain, monetization touch this.
9. **`plugin-telegram`** (15 src / **48 callers**) — high callers for a small
   plugin suggests heavy boundary surface; quick win to deep-audit.
10. **`plugin-openai`** (25 src / **114 callers**) — second LLM provider
    by default. Mirror of plugin-anthropic concerns.

## Per-dir status table

Format: `[status] dir-name  src-files | LOC | callers | one-liner`

(For dirs marked `[?]` the survey did NOT inspect source files. Bulk metadata
only. Promote to `[!]` after a deep audit.)

### Apps (`app-*`, 25 dirs)

- [?] `app-2004scape`  58 | 8709 | 16 | Old-school RuneScape clone demo. Museum-piece candidate.
- [?] `app-babylon`  7 | – | 18 | Babylon.js sample app. Demo.
- [?] `app-browser`  9 | – | 7 | In-app browser surface. Low callers.
- [?] `app-clawville`  6 | – | 14 | Game demo (`@clawville/app-clawville`). Museum.
- [!] `app-companion`  60 | 11187 | 43 | Desktop companion app. **Deep-audit.**
- [?] `app-contacts`  8 | – | 12 | Contacts surface.
- [?] `app-defense-of-the-agents`  6 | – | 16 | Game demo. Museum candidate.
- [?] `app-elizamaker`  11 | – | 20 | Eliza-maker scaffold UI.
- [-] `app-form`  0 | 0 | – | **Empty hydration shell. Delete.**
- [?] `app-hyperliquid`  11 | – | 14 | Hyperliquid trading UI.
- [?] `app-hyperscape`  5 | – | 18 | 3D scape demo.
- [?] `app-knowledge`  6 | – | 11 | Knowledge-base app.
- [!] `app-lifeops`  363 | 200826 | 50 | Personal-OS app. **Deep-audit (largest).**
- [?] `app-phone`  24 | – | 15 | Phone surface.
- [?] `app-polymarket`  15 | – | 16 | Polymarket UI.
- [?] `app-scape`  43 | – | 14 | Scape app variant.
- [?] `app-screenshare`  5 | – | 9 | Screen share. Museum candidate.
- [?] `app-shopify`  13 | – | 25 | Shopify storefront app.
- [!] `app-steward`  56 | 17795 | 30 | Property steward. **Deep-audit.**
- [?] `app-task-coordinator`  25 | – | 19 | Task coordination.
- [?] `app-training`  52 | – | 34 | Training UI; pairs with Layer 8 trajectory persistence.
- [?] `app-vincent`  16 | – | 25 | Vincent surface.
- [?] `app-wallet`  17 | – | 20 | Wallet UI app.
- [?] `app-wifi`  8 | – | 13 | WiFi surface.
- [?] `app-workflow-builder`  3 | – | 7 | Workflow builder stub.

### Plugins (`plugin-*`, 73 dirs)

- [-] `plugin-action-bench`  28 | – | **0** | **0 callers. Delete candidate.**
- [!] `plugin-agent-orchestrator`  79 | 35994 | 38 | Sub-agent spawner. **Deep-audit.**
- [!] `plugin-agent-skills`  28 | – | 36 | USE_SKILL mechanism (per CLAUDE.md).
- [!] `plugin-anthropic`  21 | – | **66** | Default LLM provider. **Deep-audit.**
- [!] `plugin-app-control`  26 | – | 6 | APP create/load. Auditable today (used by orchestrator).
- [?] `plugin-bluebubbles`  16 | – | 11 | iMessage bridge.
- [?] `plugin-bluesky`  17 | – | 16 | Bluesky connector.
- [!] `plugin-browser-bridge`  8 | – | 32 | High caller count for 8 files.
- [-] `plugin-calendly`  9 | – | **0** | **0 callers. Delete candidate.**
- [?] `plugin-claude-code-workbench`  10 | – | 16 | Claude Code workbench surface.
- [?] `plugin-cli`  6 | – | 17 | CLI plugin.
- [?] `plugin-commands`  12 | – | 19 | Commands plugin.
- [?] `plugin-computeruse`  35 | – | 24 | Computer-use plugin.
- [!] `plugin-discord`  68 | 28797 | **64** | Largest connector. **Deep-audit.**
- [?] `plugin-edge-tts`  9 | – | 24 | Edge TTS.
- [?] `plugin-elevenlabs`  4 | – | 22 | ElevenLabs TTS. **51 MB dist** — investigate.
- [!] `plugin-elizacloud`  49 | – | **45** | Cloud SDK. **Deep-audit.**
- [?] `plugin-executecode`  5 | – | 2 | EXECUTE_CODE action.
- [?] `plugin-farcaster`  35 | – | 20 | Farcaster connector.
- [?] `plugin-feishu`  15 | – | 17 | Feishu connector.
- [?] `plugin-form`  16 | – | 11 | Form runtime (compare to **dead** `app-form/`).
- [?] `plugin-github`  14 | – | 15 | GitHub plugin.
- [?] `plugin-google-chat`  11 | – | 14 | Google Chat connector.
- [!] `plugin-google-genai`  17 | – | 45 | Gemini provider.
- [-] `plugin-google-meet-cute`  16 | – | **0** | **0 callers. Delete candidate.**
- [!] `plugin-groq`  7 | – | 47 | Groq provider.
- [?] `plugin-imessage`  16 | – | 22 | iMessage plugin.
- [?] `plugin-inmemorydb`  9 | – | 10 | In-memory DB; check vs `plugin-sql`.
- [?] `plugin-instagram`  15 | – | 13 | Instagram connector.
- [?] `plugin-line`  13 | – | 15 | LINE connector.
- [?] `plugin-linear`  29 | – | 3 | Linear plugin. Low callers.
- [?] `plugin-local-ai`  15 | – | 10 | Local AI provider.
- [!] `plugin-local-embedding`  9 | – | **47** | Embedding provider. High caller count.
- [?] `plugin-local-storage`  6 | – | 1 | Local storage. Low callers.
- [?] `plugin-matrix`  9 | – | 17 | Matrix connector.
- [!] `plugin-mcp`  34 | – | 18 | MCP server plugin. Cloud overlap.
- [?] `plugin-minecraft`  20 | – | 3 | Minecraft plugin.
- [?] `plugin-music-library`  47 | – | 9 | Music library.
- [?] `plugin-music-player`  39 | – | 8 | Music player.
- [?] `plugin-mysticism`  32 | – | 3 | Mysticism plugin (low callers).
- [!] `plugin-n8n-workflow`  60 | 13797 | 25 | n8n workflow integration.
- [?] `plugin-nostr`  11 | – | 17 | Nostr connector.
- [-] `plugin-nvidiacloud`  11 | – | **0** | **0 callers. Delete candidate.**
- [!] `plugin-ollama`  16 | – | 35 | Ollama local provider.
- [!] `plugin-openai`  25 | – | **114** | Second-most-cited plugin. **Deep-audit.**
- [!] `plugin-openrouter`  20 | – | 40 | OpenRouter provider.
- [?] `plugin-pdf`  10 | – | 26 | PDF plugin. **10 MB dist** — fonts? investigate.
- [-] `plugin-plugin-manager`  0 | 0 | – | **Empty hydration shell. Delete.**
- [?] `plugin-rlm`  8 | – | 3 | RLM plugin. Low callers.
- [?] `plugin-roblox`  16 | – | 7 | Roblox plugin.
- [-] `plugin-robot-voice`  0 | 0 | – | **Empty hydration shell. Delete.**
- [!] `plugin-shell`  28 | – | 23 | Shell action.
- [?] `plugin-shopify`  14 | – | 7 | Shopify plugin.
- [!] `plugin-signal`  16 | – | 29 | Signal connector.
- [?] `plugin-simple-voice`  11 | – | 6 | Voice plugin.
- [!] `plugin-slack`  22 | – | 21 | Slack connector.
- [?] `plugin-social-alpha`  43 | – | 3 | Social-alpha plugin (low callers for 43 files).
- [!] `plugin-sql`  85 | 19422 | **160** | Drizzle/SQL bridge. **Deep-audit (highest callers).**
- [?] `plugin-streaming`  4 | – | 20 | Streaming plugin.
- [?] `plugin-suno`  6 | – | 6 | Suno music plugin.
- [?] `plugin-tailscale`  12 | – | 1 | Tailscale plugin (1 caller).
- [?] `plugin-tee`  18 | – | 3 | TEE plugin.
- [!] `plugin-telegram`  15 | – | **48** | Telegram connector. **Deep-audit (high callers / small).**
- [?] `plugin-twitch`  11 | – | 16 | Twitch connector.
- [-] `plugin-vertex`  13 | – | **0** | **0 callers. Delete candidate.**
- [?] `plugin-video`  5 | – | 7 | Video plugin.
- [?] `plugin-vision`  40 | – | 17 | Vision plugin. **51 MB dist (largest)** — investigate.
- [!] `plugin-wallet`  187 | 49236 | 21 | Wallet plugin (#2 by LOC).
- [-] `plugin-web-search`  5 | – | **0** | **0 callers, old `@elizaos-plugins/*` scope. Delete.**
- [?] `plugin-wechat`  10 | – | 18 | WeChat connector.
- [?] `plugin-whatsapp`  32 | – | 24 | WhatsApp connector.
- [!] `plugin-x`  53 | 13924 | **54** | X (Twitter) connector. **Deep-audit.**
- [!] `plugin-xai`  7 | – | 33 | xAI provider.
- [-] `plugin-xmtp`  5 | – | **0** | **0 callers. Delete candidate.**

### Top-level

- [-] `dist/`  113 | – | – | **Build leak. Delete locally.**

## Promotion criteria

A `[?]` dir promotes to `[!]` (deep-audited) only after:

1. Reading every source file in the dir.
2. Mapping its inbound and outbound dependency edges to other layers.
3. Applying the eight AGENTS.md axes per file.
4. Recording per-file findings in this document (would expand it 50-100x).

A `[?]` dir promotes to `[-]` (deletion) only after:

1. Verifying the cross-monorepo grep is correct (no dynamic imports under
   `enabled_plugins` config or registry strings missed by package-name grep).
2. Confirming no scaffolding template (in `eliza/templates/`) or test fixture
   references it.
3. Getting upstream sign-off (the file lives in `elizaOS/eliza`, not Milady).

## What this enables

Phase 3 (Electrobun decomposition) and Phase 4 (chat fallback honesty) do
**not** touch this layer — they're confined to Layers 1–9. Layer 10 is
inventory + cleanup-debt tracking. The 7 hard deletion candidates and 4 build
leaks are safe Milady-side cleanup independent of upstream coordination.
