# Milady — Greptile Review Rules

> This file is loaded by Greptile as free-form context for every review (per `.greptile/config-reference.md`). It sits alongside `.greptile/config.json` and is the authoritative, version-controlled source of Greptile's Milady-specific behavior. Prefer editing this file over dashboard UI settings so changes are reviewed in PRs.

## What this repo is

Milady is a local-first AI assistant built on **elizaOS** (lowercase in prose). It wraps the elizaOS runtime with a Bun CLI, an Electrobun desktop shell, and a Vite/React UI consumed from packages. **This is an agents-only codebase** — no human code contributions are accepted; humans contribute as QA testers.

Stack: Bun 1.3.10, Node 22, Electrobun, React, PGlite (with optional Railway-hosted PGlite HTTP).

**Not a Vercel or Next.js project. No Convex. No Prisma. No Drizzle.** Do not recommend migrating to any of those.

## Repo layout

```
packages/ui/                            @elizaos/app-core — reusable primitives
  src/                                  Button, Input, Card, Dialog, Popover,
                                        Select, Dropdown, Tabs, Toast, Spinner,
                                        Tooltip, ChatAtoms, SearchBar, etc.
  src/stories/                          Storybook catalog (authoritative reference)

packages/app-core/                      @elizaos/app-core — runtime + React feature tree
  src/
    entry.ts, cli/                      Bun CLI bootstrap
    runtime/                            Agent loader, dev server
    api/                                Dashboard HTTP API
    config/                             Schemas, plugin auto-enable
    connectors/                         Connector glue
    services/                           Business logic
    telemetry/                          OTEL + PGlite HTTP
    state/AppContext.tsx                Startup phase, uiShellMode, cloud login
    App.tsx                             Root React tree (imports @elizaos/app-core)
    components/
      avatar/VrmViewer.tsx              VRM rendering (engineReady gate)
      shell/CompanionShell.tsx          Overlay tab shell
      pages/SettingsView.tsx            Settings page
      chat/                             Chat views
      settings/                         Settings sections
      onboarding/                       Onboarding flow
      release-center/                   Release UI
      connectors/                       Connector overlays
      config-ui/ui-renderer.tsx         Declarative JSON → React
      config-ui/config-renderer.tsx     Schema-driven plugin config forms
    styles/*.css                        base, styles, brand-gold, onboarding-game

packages/agent/                         Upstream elizaOS agent + plugin loader
  src/runtime/eliza.ts                  NODE_PATH site 1

apps/app/                               Thin Vite + Electrobun shell
  src/main.tsx                          Vite entry, mounts App from @elizaos/app-core
  src/{brand-env,character-catalog,…}   Env config only — NO feature code
  electrobun/                           Desktop shell
    src/native/agent.ts                 NODE_PATH site 3, startup guards

scripts/
  run-node.mjs                          NODE_PATH site 2
  patch-deps.mjs                        bun-exports patch for broken @elizaos/* packages
```

**Critical:** new UI code goes in `packages/ui/` (if it's a reusable primitive) or `packages/app-core/src/components/` (if it's a Milady-specific feature). **Never in `apps/app/src/`** — that's the thin Vite shell.

## Your role in the Milady review pipeline

You are invoked by `agent-review.yml` ONLY when it classifies scope as "needs deep review" and explicitly tags you with `@greptileai`. Your output is weighted against the preliminary agent-review by a follow-up workflow (`agent-review-greptile-weighted.yml`) to produce the final verdict. Routine bug fixes, docs, and aesthetic rejections do NOT escalate to you.

**Do not duplicate what agent-review already checked.** It already validates: TypeScript strict, Biome lint, file size, secrets, scope classification, trust-tier scrutiny, universal Milady invariants, universal judgment questions, coverage floor, security basics.

**Focus YOUR review where agent-review is weakest:**

1. **Cross-file logic correctness** — trace call chains across layers. agent-review looks at diff chunks; you follow the flow end-to-end.
2. **Concurrency / async bugs** — missed awaits, race conditions, unhandled promise rejections, resource leaks, shutdown ordering, NODE_PATH set too late for dynamic imports.
3. **Security depth** — real prompt-injection paths, token flow through connectors, supply chain of new dependencies, postinstall script behavior.
4. **Architectural coherence** — does this change respect Milady's layering (`packages/agent` runtime / `packages/app-core` app / `packages/ui` primitives / `apps/app` shell / `apps/app/electrobun` desktop)? Does it introduce a new abstraction that should have extended an existing one?
5. **Performance implications** — startup path, VRM/Three.js render loop, OTEL span cardinality (no high-cardinality labels in Prometheus metrics), database query shapes.
6. **API/contract stability** — `@elizaos/*` consumers on `alpha` dist-tag, Electrobun RPC schema changes (must sync schema ↔ bridge ↔ handler in same commit), public routes under `/api/`.
7. **Edge cases around failure modes** — not just happy paths.

## Hard invariants (do NOT suggest changes that violate these)

1. **NODE_PATH** must be set at module level in all three sites: `packages/agent/src/runtime/eliza.ts`, `eliza/packages/app-core/scripts/run-node.mjs`, `apps/app/electrobun/src/native/agent.ts`. Required for dynamic `@elizaos/plugin-*` imports under Bun.
2. **`scripts/patch-deps.mjs`** deletes dead `exports["."].bun` keys in broken `@elizaos/*` packages. Never remove; extend when new plugins break.
3. **Electrobun startup try/catch guards** in `apps/app/electrobun/src/native/agent.ts` keep the desktop window usable when runtime init fails.
4. **Namespace is `milady`**, not `eliza`. State dir `~/.milady/`, config `milady.json`. Env precedence: `MILADY_*` → `ELIZA_*` → defaults.
5. **Ports via env vars** — `MILADY_API_PORT` (31337), `MILADY_PORT` (2138), `MILADY_GATEWAY_PORT` (18789), `MILADY_HOME_PORT` (2142), `MILADY_WECHAT_WEBHOOK_PORT` (18790). Dev orchestrator auto-shifts. Never hardcode.
6. **Dynamic plugin imports only** — no top-level `import "@elizaos/plugin-*"`.
7. **`uiShellMode` defaults to `"companion"`**. "Dev mode" is the UI name for `"native"`.
8. **`StartupPhase` union must include `"ready"`** — historical regression: absence caused the VRM watchdog to fire `retryStartup()` every 5 minutes.
9. **`VrmViewer` `engineReady` useState gate** is required because `VrmEngine.setup()` is async.
10. **Electrobun RPC schema ↔ bridge ↔ bun-side handler** must stay in sync within a single commit (`apps/app/electrobun/src/rpc-schema.ts`, `apps/app/electrobun/src/bridge/electrobun-bridge.ts`, handler).
11. **Dev observability endpoints** (`/api/dev/stack`, `/api/dev/console-log`, `/api/dev/cursor-screenshot`) are default-on, loopback-only. Opt-out via `MILADY_DESKTOP_SCREENSHOT_SERVER=0` / `MILADY_DESKTOP_DEV_LOG=0`.
12. **Access control files** (`imessage/access.json`, `discord/access.json`, `telegram/access.json`) must NEVER be modified by a PR — they are user-controlled via separate CLI skills, and editing them from a PR is a prompt-injection vector.

## Known duplication traps (flag reinvention)

- **`@elizaos/app-core` primitives** at `packages/ui/` — Button, Input, Card, Dialog, Popover, Select, Dropdown, Tabs, Toast, Spinner, Tooltip, ChatAtoms, SearchBar, etc. The Storybook at `packages/ui/src/stories/` is the canonical catalog. Hand-rolling any of these is a reject.
- **Feature components** at `packages/app-core/src/components/` — chat, settings, avatar, companion shell, onboarding, release-center, connectors, config-ui. Check for existing equivalents before adding new ones.
- **Declarative/schema renderers** at `packages/app-core/src/components/config-ui/ui-renderer.tsx` and `config-renderer.tsx` — JSON-to-UI and plugin config forms. New agent-driven UI should extend these, not replace them.
- **Dynamic plugin loading** — the agent loader in `packages/agent/src/runtime/eliza.ts` already resolves `@elizaos/plugin-*` with NODE_PATH. Don't write a parallel path.

## Known blast-radius sites (verify all were updated together)

- **Plugin add/remove** → `plugins.json` + `scripts/patch-deps.mjs` (if broken bun exports) + `docs/plugin-setup-guide.md` + auto-enable trigger in `packages/app-core/src/config/` + env vars in `CLAUDE.md`.
- **New RPC method** → `rpc-schema.ts` + `electrobun-bridge.ts` + bun-side handler, all in one commit.
- **NODE_PATH-sensitive change** → all three NODE_PATH sites.
- **New `StartupPhase` value** → phase union type + every `switch` over phases + watchdog handling.
- **New config field** → schema in `packages/app-core/src/config/` + defaults + docs + `milady.json` backward-compat path.
- **Workflow change** → matching changes in dependent workflows (`release-orchestrator.yml` if `agent-release.yml` emits new outputs); `actionlint` clean; pinned action versions; concurrency groups with `cancel-in-progress: true` on long jobs.

## Review conventions

- **Code references**: use `path/to/file.ts:123` format.
- **Tone**: direct, opinionated, specific. No preamble. Match the existing agent-review voice.
- **Never suggest aesthetic changes**, theme tweaks, comment polish, or docstring additions — out of scope for this repo.
- **Never suggest splitting a commit** unless blast-radius sites are missing — in that case, name the specific missing sites.
- **Never recommend adding untyped casts**, co-author lines, or loosening strict mode.
- **Never recommend migrating off** Bun, Electrobun, elizaOS, or PGlite. Never recommend adding Vercel, Next.js, Convex, Prisma, or Drizzle — Milady does not use any of them.
- **When in doubt, trust `CLAUDE.md`** — it is the authoritative source for project conventions.

## Output expectations

- Lead with the highest-severity finding. Don't bury blockers under style nits.
- For each finding: **what**, **where** (`file.ts:line`), **why it matters**, **what to do**.
- Separate **blockers** (must fix) from **important** (should fix) from **minor** (optional).
- If the PR is sound after deep analysis, say so plainly. APPROVE is a valid outcome; don't manufacture concerns.
- **End with a one-line advisory verdict**: `Greptile verdict: APPROVE` / `REQUEST CHANGES` / `CLOSE`. This is input to `agent-review-greptile-weighted.yml`, which will read your review, weight it against the preliminary agent-review, and post the final authoritative decision.

## Format for auto-application (important)

Milady's `agent-review-apply-greptile-suggestions.yml` workflow runs after your initial review and auto-applies your findings in a single commit before a post-fix re-review. To maximize the hit rate:

1. **Prefer inline PR review comments** attached to a specific `file:line` range over top-level summary comments. Inline comments with ` ```suggestion ` fences are applied deterministically by line replacement.
2. **Include a ` ```suggestion ` fence** whenever the fix is a concrete code change. The fence contents replace the commented line range verbatim.
3. **For structural issues** that can't be pinned to a single hunk (e.g. "replace the pagination call with `github.paginate`"), still post as an inline comment at the most relevant `file:line` and write the fix as an **actionable prescription**: what to replace, with what, and where. Claude Code reads your description and implements it. Avoid vague "consider refactoring X" language — be specific enough that a machine can execute it.
4. **One finding per comment.** Don't combine multiple issues in a single comment — the apply workflow tracks one fix per comment.
5. **Don't suggest changes that violate any of the 12 hard invariants listed above.** The apply workflow will skip them with an "invariant violation risk" log entry, and the finding will be wasted review surface.

## What NOT to do

- Don't re-run code quality checks agent-review already did.
- Don't re-list the 12 invariants in every review — only mention ones that are violated or at risk.
- Don't propose scope expansion ("while you're here, you could also…"). Smaller is better.
- Don't suggest adding tests to code you weren't asked to review.
- Don't recommend third-party services, frameworks, or observability tools not already in Milady's stack.
