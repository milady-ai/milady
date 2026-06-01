# Milady GenUI Onboarding — Phase 2 Design (wallet-first, generative surfaces)

**Date:** 2026-06-01
**Status:** Design — approved direction, ready for implementation plan
**Builds on:** Phase 1 (`2026-05-30-milady-whitelabel-client-design.md`) — the executive theme + own splash. Phase 2 owns the **onboarding, background, and home surface**.

## Vision

Milady is a web3 crypto agent app, so its first run should be its own: **connect wallet → the agent offers a few generative surfaces tailored to what matters to you → you pick one as your home** — not a blank chat box wearing elizaOS's cloud-sky shell. Surfaces are **generated, not hand-coded screens**: the agent composes them from a catalog of capability widgets, selected by time-of-day and signals.

## Key finding — the engine already exists

elizaOS ships an **A2UI-compatible generative-UI engine**, so this is composition, not invention:

- `eliza/packages/ui/src/genui/types.ts` — `ElizaGenUiSpec` declares `a2uiVersion: "0.9"` (`:5,43`). Flat `components[]` (id/component/children/child/`action.event`), `root`, `data`, `metadata`. Matches the A2UI model (Surface/Component/DataModel/Catalog/Message; client-held trusted catalog; events flow back to the agent).
- `genui/validator.ts` — catalog safety (`unknown_component`, `unsafe_url`, `too_many_components`, size caps).
- Agent side: `agent/src/providers/ui-catalog.ts` + `agent/src/shared/ui-catalog-prompt.ts` — the agent **generates** specs from a catalog.
- Renderer: `genui` renderer + `config-ui/ui-renderer.tsx` + `components/views/DynamicViewLoader.tsx` + `views/view-interact-protocol.ts`.
- **Precedent:** `genui/starter-pack-demo.ts` (`ELIZA_STARTER_PACK_SETUP_SPEC`) already renders a startup `Card` of choice-buttons with `action.event` callbacks (`setup.dismiss`, `model.download.start`, `provider.setup.open`). This is the "a few generative UIs at startup" pattern, proven.

A2UI references: [Google A2UI](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) · [spec v0.9](https://a2ui.org/specification/v0.9-a2ui/) · [github.com/google/A2UI](https://github.com/google/a2ui) · [AG-UI](https://docs.ag-ui.com/introduction).

## Signal layer — LifeOps

LifeOps already answers "what matters to the user": `useLifeOpsActivitySignals` (page/app/desktop/health signals) → activity profile with **time buckets** (`LATE_NIGHT, EARLY_MORNING, MORNING, MIDDAY, AFTERNOON, EVENING, NIGHT` — `activity-profile/analyzer.ts`) → bucketed occurrences/goals/reminders/inbox + a connector-capability status. Those time buckets drive **which contextual template** to show; the capability status drives **which widgets are available**.

## The two-layer template model

### Layer 1 — Capability widgets (atomic catalog components)

Each widget = a genui component type in the agent's UI catalog + a data binding to a capability/provider. The agent composes these into surfaces; the renderer maps them to Milady components.

| widget | shows | data source | ownership |
|---|---|---|---|
| `weather` | current + short forecast | weather provider | catalog (upstream) + provider |
| `news` | headline feed | news/search capability | catalog + provider |
| `websearch` | query box + results | web-search capability | catalog + provider |
| `wallet` | balances / holdings | connected wallet + chain RPC | **Milady (web3)** |
| `pnl` | portfolio P/L + sparkline | wallet + price feed | **Milady (web3)** |
| `price` / `watchlist` | token prices, change | price feed | **Milady (web3)** |
| `positions` | DeFi positions (LP/lend/stake) | chain data | **Milady (web3)** |
| `calendar` | today's agenda | LifeOps calendar | LifeOps (exists) |
| `inbox` | unified messages preview | LifeOps inbox | LifeOps (exists) |
| `reminders` | due tasks/reminders | LifeOps | LifeOps (exists) |

### Layer 2 — Contextual surface templates (compositions)

Each template = an `ElizaGenUiSpec` (a `Card`/`Column` of widgets), selected by LifeOps time-bucket or signal. The agent *personalizes* the seed (ordering, which tokens, copy) but the seed renders even on a weak/local model.

| template | when (trigger) | composes |
|---|---|---|
| `morning` | EARLY_MORNING/MORNING, first open | greeting · weather · today's calendar · overnight `pnl` · `news` |
| `lunch` | MIDDAY | `pnl` · `news` · `reminders` · `websearch` |
| `night-cap` | EVENING/NIGHT | day `pnl` summary · tomorrow's calendar · market close · wind-down |
| `alert` | signal-triggered (price move, urgent inbox, event) | the alerting widget (e.g. `price`/`inbox`) + 1–2 context widgets |

Extensible (e.g. `focus`, `trading`, `weekend`) — the menu is data, not code.

## Onboarding flow

1. **Wallet connect** — Milady-owned first-run step (web3 identity). Replaces the generic elizaOS "choose your setup" as step one.
2. **Signal read** — agent reads on-chain (holdings/positions/chains) + LifeOps signals (time bucket, connectors) → a quick profile.
3. **Generative surface picker** — agent emits 3–5 candidate surfaces (seeded templates, personalized) as preview cards; user picks. `action.event` (`surface.select`) returns the choice.
4. **Home = the picked surface** — a generated dashboard, not a chat box. The contextual template auto-rotates by time bucket (morning → lunch → night-cap); `alert` interrupts on signal. Chat stays one tap away.

## Mapping to the existing engine

| need | mechanism | status |
|---|---|---|
| surface format | `ElizaGenUiSpec` (a2uiVersion 0.9) | exists |
| agent generates surfaces | `ui-catalog` provider + `ui-catalog-prompt` | exists; **extend catalog** with web3 widgets |
| render surfaces | genui renderer + `DynamicViewLoader` | exists; **add Milady widget components** |
| choice / interaction | `action.event` → action handlers (`ElizaGenUiActionTarget`) | exists; **add `surface.select`, `wallet.connect`** |
| "what matters" | LifeOps signals + time buckets | exists |
| startup surface slot | the `startupShell` slot (Phase 1) + first-run slot | Phase 1 done; **add first-run/home slot** |

## Reuse vs. net-new

- **Reuse:** genui spec/renderer/validator, agent UI-catalog + prompt, action-event loop, starter-pack precedent, LifeOps signals, the Phase 1 theme/slots.
- **Net-new (the build):**
  1. **Wallet-connect first-run step** (Milady-owned).
  2. **Web3 capability widgets** (`wallet`/`pnl`/`price`/`positions`) — components + data providers + catalog entries.
  3. **Capability providers** for `weather`/`news`/`websearch` (or map to existing connectors).
  4. **Template seeds** (`morning`/`lunch`/`night-cap`/`alert`) as `ElizaGenUiSpec` literals (like the starter pack).
  5. **Surface picker UX** + signal-driven template selection.
  6. Milady background/voice from Phase 2 branding under it.

## Build phases

- **P2a — Catalog + templates (mostly upstream genui):** extend the agent UI-catalog with the capability widgets; author the template seeds; add the Milady widget components to the renderer. Verifiable with the genui validator + render tests, no wallet needed.
- **P2b — Wallet step (Milady-owned):** the web3 connect-wallet first-run + `wallet`/`pnl` data wiring.
- **P2c — Picker + signals:** the surface picker UX; wire LifeOps time-bucket → template selection; `alert` triggering.

## Verification

- genui validator passes on every template seed; render tests for each widget + template.
- `bun run --cwd apps/app build` + `bun run verify` (packages mode) for committable pieces.
- Desktop dev render of the onboarding flow (wallet → picker → home) once a model provider is configured (the picker's seeded templates render without one).

## Out of scope (this phase)

- Real trading/transaction execution from widgets (read-only first; wallet acts only if the user later grants it).
- A bespoke provider for every capability — start with `wallet`/`pnl`/`calendar`/`inbox` (data we have) + stub `weather`/`news`/`websearch` behind one provider seam.

## Risks / caveats

- **Model provider** — the agent must generate/personalize surfaces, so it needs a provider; mitigated by **template-seeded** surfaces (render + are pickable with no/weak model; the LLM only personalizes).
- **Upstream split** — the genui engine + catalog live in `@elizaos/ui` + `@elizaos/agent` (upstream); wallet step + Milady widgets + template seeds + picker can be Milady-owned. Same committable/upstream split as Phase 1.
- **Catalog safety** — web3 widgets that show balances/PnL must bind to validated data paths only (genui `unsafe_field`/`unsafe_url` checks); no raw agent-authored URLs/keys.
