# Milady Nextgen — White-Label Architecture Plan

> Status: **proposal / decision doc** (branch `Milady-nextgen`). No app code yet.
> Grounded in a 3-track code audit of the current Milady + eliza checkout (2026-05-31).

## TL;DR — the decision in one paragraph

The pain we hit all day (slow desktop dev, white screens, connector‑dep leaks, the
startup splash hanging, branding that keeps regressing) all traces to **one thing**:
`apps/app/src/main.tsx:1346` renders **eliza's `<App/>`** (from `@elizaos/app-core`)
and injects ~30 boot‑config "slots" to brand it. Milady is therefore *eliza's app with
paint*, not a white‑label — and in local mode the renderer compiles eliza's **entire
source graph** (thousands of modules, the whole connector/plugin tree).

The fix is **not** a fresh Electrobun app. The Electrobun shell is already a
white‑label‑by‑env shell and is brand‑neutral; forking it buys nothing. The fix is a
**fresh renderer** — Milady's own app shell, onboarding, startup, routing, and web3
surfaces — that (a) runs inside the **existing** Electrobun shell, (b) talks to the
**eliza runtime** (the agent process) over its HTTP/SSE API as a backend, and (c)
consumes the heavy web3 + 3D pieces as **packages**. That is a contained, phased,
shippable project — not a ground‑up rewrite.

---

## 1. Root cause — why it's so coupled today

| Symptom we hit today | Direct cause |
|---|---|
| Desktop dev "takes forever" / huge first load | Renderer compiles eliza's *entire* `@elizaos/*` **source** graph (local mode) |
| White screen (Vite crash on `@snazzah/davey`, `zlib-sync`) | Renderer statically pulls eliza's **connector** graph (Discord/Telegram natives) |
| `sharedSourceDir` "File not found" crash | eliza's desktop tooling assumes it's the monorepo root |
| Splash hangs with no status | Startup is eliza's `startup-coordinator` + onboarding, not Milady's |
| Branding regresses to "ElizaOS" | Branding is **paint over** eliza's app via slots, not Milady‑owned |

`apps/app` today owns almost **no UI code**. The slot components are all eliza plugin
components (`eliza/plugins/plugin-*`, `@elizaos/app-*`); Milady only *wires them in*.
The genuinely Milady‑authored UI is just: `ui/shell/MiladyStartupShell.tsx`, the
branding config (`app.config.ts` / `brand-env.ts` / `app-config.ts`), the
`character-catalog.ts` wrapper, and the voice `PillRoot` in `main.tsx`.

**Conclusion:** the renderer is the only coupled layer. Replace it; reuse everything else.

---

## 2. Target architecture — three layers, one owned

```
┌──────────────────────────────────────────────────────────────┐
│  Electrobun shell        REUSE as-is (white-label by env)      │
│  eliza/packages/app-core/platforms/electrobun                  │
│  window · native RPC · tray · deep links (milady://) · updater │
│  · signing · screenshot · renderer-URL wiring                  │
│  driven by ELIZA_APP_NAME/ID/URL_SCHEME + brand-config.json    │
└───────────────▲───────────────────────────┬──────────────────┘
                │ loads renderer URL          │ injects apiBase + token
┌───────────────┴──────────────┐   ┌──────────▼──────────────────┐
│  Milady renderer  REBUILD     │   │  eliza runtime   REUSE       │
│  (the ONLY owned layer)       │   │  (agent process, separate)   │
│  • own AppShell + routing     │   │  HTTP API :31337 dev / :2138 │
│  • web3-first onboarding      │──▶│  • chat (SSE) · status/auth  │
│  • own startup + status       │   │  • wallet/steward (Zod)      │
│  • companion / chat / wallet  │   │  • models/secrets/provider   │
│  • thin typed runtime client  │   │  • character / avatar        │
│                               │   └──────────────────────────────┘
│  consumes as packages: ───────┼──▶ @elizaos/shared (types/contracts)
│  VRM engine, plugin-wallet,   │    plugin-wallet SDK, app-steward,
│  steward UI, vincent          │    app-vincent  (REUSE, not rebuilt)
└───────────────────────────────┘
```

- **Layer 1 — Electrobun shell: REUSE, do not fork.** It already reads
  `ELIZA_APP_NAME`/`ELIZA_APP_ID`/`ELIZA_URL_SCHEME`/`ELIZA_RELEASE_URL` + a
  `brand-config.json`, and its own comments name the "whitelabel wrapper nesting the
  eliza clone (e.g. Milady)" layout as first‑class. Forking ~130 brand‑neutral native
  files (RPC, updater, signing, screencapture, voice, steward sidecar) buys nothing and
  costs perpetual upstream maintenance. Nextgen just points the shell at the new
  renderer (`ELIZA_RENDERER_URL` in dev, `apps/app-nextgen/dist` in prod) and supplies
  Milady brand env/assets.
- **Layer 2 — Milady renderer: REBUILD. This is the project.** A new Vite+React app
  that owns the shell/onboarding/startup/routing and renders only Milady's surfaces. It
  talks to the runtime through a **thin typed client** (see §4) instead of importing
  `@elizaos/app-core`'s `<App/>`. It does **not** statically import the agent/connector
  graph — which is exactly why dev becomes fast and the white‑screen class disappears.
- **Layer 3 — eliza runtime: REUSE as a backend.** The agent already runs as its own
  process exposing one HTTP origin (the model you've been describing). Nextgen consumes
  it over HTTP/SSE. The web3 SDKs (`plugin-wallet`, `app-steward`, `app-vincent`) and the
  VRM engine are consumed as **packages**, never re‑authored.

---

## 3. Surface inventory — KEEP (own) / REUSE (depend) / DROP

`KEEP` = Milady rebuilds the UI in its own shell (talks to runtime). `REUSE` = embed
eliza's component/engine as a dependency. `DROP` = eliza‑generic, out of scope for a
web3 companion.

### Core — the ~8 surfaces Milady must own (KEEP)
| Surface | Verdict | Note |
|---|---|---|
| Startup splash + branding | **KEEP** (already Milady‑owned) | Port `MiladyStartupShell` + `app.config.ts`; add real status text |
| Web3‑first onboarding | **KEEP** | New: wallet connect/create + avatar/style pick + provider/Cloud connect |
| Companion shell (avatar stage + emotes) | **KEEP** shell / **REUSE** engine | Own the layout/UX; **REUSE** the VRM/Three engine (`plugin-companion` `VrmEngine`, animation/camera controllers, vector‑browser renderer) |
| Chat | **KEEP** | Minimal conversation UI over the SSE stream endpoint |
| Wallet / inventory | **KEEP** (lean) or **REUSE** `InventoryView` to ship fast | tokens / NFTs / balances; multi‑chain |
| Steward (approval queue + tx history) | **KEEP** | The on‑chain sign‑off loop — Milady's core behavior; consume steward API |
| Character identity & catalog | **KEEP** | VRM roster + style presets + focused editor |
| Home / voice presence | **KEEP** | Companion backdrop + the Milady voice `PillRoot` |

### Reuse as packages (don't rebuild)
VRM/Three rendering engine · vector‑browser 3D · `plugin-wallet` SDK (EVM+Solana,
x402, swap, LP, escrow, identity) · `app-steward` backend + sidecar · `app-vincent`
(delegated trading) · inference‑status plumbing · `@elizaos/shared` types/contracts.

### Drop (≈70% of current surface — eliza‑generic)
LifeOps (day‑runner, ~35 components) · app/website blockers · Phone (dialer/SMS/
contacts) · Browser workspace · Stream · Automations/triggers/workflows · Views/Apps
launcher grid · coding‑agent orchestration + PTY console · fine‑tuning/training UI ·
knowledge‑document management · the generic Settings sprawl (keep only wallet RPC/keys
+ provider config). Vincent is a **defer‑to‑v2** judgment call.

---

## 4. The runtime contract — the backend boundary

One origin, one port (`:31337` dev / `:2138` prod). Single‑agent. Treat
`@elizaos/shared` types + `eliza/packages/shared/src/contracts/*` (Zod) as the
**canonical contract** — don't re‑derive from handlers.

**Connect**
- `apiBase` = `http://127.0.0.1:31337` (dev) / `:2138` (prod), or the desktop‑injected
  local origin. In the Electrobun shell the base + token are injected onto `window` and
  via RPC; a plain web build sets `apiBase` directly.
- Headers on every request: `Authorization: Bearer <token>` + `X-ElizaOS-Client-Id: <uuid>`.
  Loopback‑local typically returns `required:false` from `/api/auth/status` (no token).
  Remote: mint via `POST /api/auth/pair {code}`. The bearer path uses **no CSRF**.
- A hosted web origin must be added to `ELIZA_ALLOWED_ORIGINS`; loopback ports are
  auto‑allowed by `server-cors.ts`.

**Minimum viable contract (web3 companion = chat + wallet + avatar + provider config)**
- Status/auth: `GET /api/auth/status`, `GET /api/status` (poll), `GET /api/health`.
- Chat (SSE): `GET /api/conversations`, `POST /api/conversations`,
  `GET /api/conversations/:id/messages`,
  `POST /api/conversations/:id/messages/stream` (SSE `token`/`done`/`error` events),
  `POST /api/turns/:roomId/abort`. `/ws` is **optional** (ambient events only).
- Provider/model config: `GET /api/models`, `POST /api/provider/switch`,
  `GET/PUT /api/secrets` (and/or `GET /api/config` + `/config/schema`, `/api/accounts*`).
  **This is the in‑app "connect a provider" flow** — the thing today's app couldn't do
  because it hung before onboarding.
- Wallet/web3: `GET /api/wallet/{addresses,balances,nfts}`, `GET/PUT /api/wallet/config`,
  `POST /api/wallet/generate`; steward loop: `GET /api/wallet/steward-status`,
  `/steward-pending-approvals`, `POST /steward-approve-tx` / `/steward-deny-tx`;
  optional browser‑wallet signing relay.
- Avatar/character: `GET/PUT /api/character`, `POST /api/avatar/vrm`,
  `POST /api/avatar/background`, `POST /api/emote`.

Client method shapes already exist in `eliza/packages/ui/src/api/client-*.ts` — the
nextgen thin client can mirror just the MVP subset (and reuse `@elizaos/shared` types).

---

## 5. Web3 architecture (Milady's core — all package‑provided)

- **Agent wallets** (`eliza/packages/agent/src/runtime/agent-wallets.ts`): per‑agent
  EVM+Solana keypairs, AES‑GCM in the vault, OS‑keychain master key. Runtime concern —
  **REUSE** unchanged; surface addresses/balances via the wallet API.
- **`plugin-wallet` SDK**: chains (ethereum/base/bsc/polygon/arbitrum + solana), backend
  seam (`LocalEoaBackend` / `StewardBackend` / auto via `ELIZA_WALLET_BACKEND`), x402
  agent‑pays‑for‑API, swap, concentrated‑liquidity/yield, escrow, ERC‑8004 identity.
  **REUSE** — this is the substance of the web3 product.
- **Steward** (`plugin-steward-app`): the human‑in‑the‑loop transaction approval queue +
  signing service; runs as a child sidecar managed by the Electrobun shell
  (`platforms/electrobun/src/native/steward.ts`). **REUSE** backend; **KEEP** (own) the
  approval/history UI.
- **Vincent** (`plugin-vincent`): OAuth delegated trading dashboard (Hyperliquid/
  Polymarket). **REUSE**; defer the UI to v2.

Milady owns only the **UI + slot wiring**, not web3 business logic.

---

## 6. Build sequence (each phase shippable)

- **Phase 0 — Skeleton loop (prove the boundary).** New `apps/app-nextgen` (Vite+React),
  pointed at by the existing Electrobun shell via `ELIZA_RENDERER_URL`. Implement the
  thin runtime client + connect/auth + `GET /api/status`. Render Milady's startup shell
  with **real status** ("starting agent…", "connecting…"), then a placeholder home.
  Exit criteria: desktop boots to a Milady screen in seconds, no eliza `<App/>`, fast dev.
- **Phase 1 — Startup + web3 onboarding (the surfaces that hurt).** Own startup → if no
  provider, route to onboarding (connect Eliza Cloud or enter a key via `/api/secrets`),
  wallet create/connect, avatar/style pick. Fixes "hangs with no status" + "requires a
  provider to start."
- **Phase 2 — Companion + chat.** Embed the VRM engine (REUSE), build the avatar stage +
  emotes UX, and the chat UI over the SSE stream. The product becomes usable.
- **Phase 3 — Wallet + steward (web3 core).** Inventory (tokens/NFTs/balances) + the
  steward approval queue + tx history. Milady's differentiator lands.
- **Phase 4 — Settings + polish + cutover.** Provider/model config, wallet RPC/keys,
  theme. Flip `build:desktop`/`dev:desktop` to the nextgen renderer; retire the old
  `apps/app` slot wiring.

The old app keeps working until Phase 4 cutover — no big‑bang.

---

## 7. What this fixes (closes today's whole class of bugs)

- **Fast dev:** the renderer is small and stops compiling eliza's source graph → the
  "forever" first load goes away.
- **No connector leaks / white screen:** the renderer never imports the agent/connector
  tree → the `optimizeDeps`/native‑dep failures (Discord, etc.) can't happen.
- **Own startup with real status:** Milady controls the splash→app transition and shows
  progress; it no longer waits on eliza's coordinator.
- **Starts without a provider:** onboarding is a Milady surface, reached regardless of
  provider; the user connects one *in‑app*.
- **No branding regressions:** Milady owns the UI; branding isn't paint over eliza.
- **Clean white‑label:** Milady = its own app on the eliza runtime, exactly the model
  you described ("agent runs in its own process; the UI is ours").

---

## 8. Risks & open decisions

- **Runtime is still the eliza clone (local mode) for the embedded agent.** That's fine —
  the renderer no longer compiles it; it talks over HTTP. (Remote/Cloud runtime works the
  same way: just a different `apiBase`.)
- **VRM/companion engine:** REUSE the package (rebuilding a VRM pipeline is months). If
  the package's API is unstable, pin it / vendor the engine module specifically.
- **How much chat to own vs embed:** start by owning a thin chat (SSE) — small. Only
  embed eliza's `ChatView` if richer features are needed fast.
- **Vincent / advanced DeFi:** defer to v2; not needed for the core companion.
- **Type/contract drift:** depend on `@elizaos/shared` contracts so runtime changes
  surface as type errors, not silent breakage.
- **Decision needed:** confirm the v1 product scope = avatar + chat + wallet + steward +
  provider onboarding (this doc's assumption). If broader, Phase ordering changes.

---

## Appendix — key file references

- Current coupling: `apps/app/src/main.tsx` (`<App/>` render ~line 1346; slots 311–358)
- Milady‑owned today: `apps/app/src/ui/shell/MiladyStartupShell.tsx`, `app.config.ts`,
  `brand-env.ts`, `app-config.ts`, `character-catalog.ts`
- Electrobun shell (REUSE): `eliza/packages/app-core/platforms/electrobun/`
  (`electrobun.config.ts`, `src/index.ts`, `src/preload.js`, `src/native/`,
  `src/screenshot-dev-server.ts`); build: `eliza/packages/app-core/scripts/desktop-build.mjs`
- Runtime client (mirror MVP subset): `eliza/packages/ui/src/api/client-*.ts`
- Canonical contracts/types: `eliza/packages/shared/src/contracts/*`, `@elizaos/shared`
- Web3: `eliza/packages/agent/src/runtime/agent-wallets.ts`,
  `eliza/plugins/plugin-wallet/src/`, `eliza/plugins/plugin-steward-app/src/`,
  `eliza/plugins/plugin-vincent/src/`
- CORS / origins: `eliza/packages/app-core/src/api/server-cors.ts`
