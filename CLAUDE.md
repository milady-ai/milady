# Milady — Agent Conventions

Local-first AI assistant on [elizaOS](https://github.com/elizaOS). CLI + desktop (Electrobun) + web dashboard + connectors.

Architecture commandments, QA protocol, git workflow: [AGENTS.md](AGENTS.md). Sandbox/distribution: [docs/sandbox-mode.md](docs/sandbox-mode.md).

## Naming

Write **elizaOS** (not `ElizaOS`). npm scope `@elizaos/*`. Plain language: **Eliza agents**. Exception: **Eliza Classic** plugin keeps `Eliza` (the 1966 chatbot).

## Cloud frontend visual review (REQUIRED for any UI change)

For ANY change in `packages/cloud-frontend/` (or any shared package whose UI bleeds into cloud-frontend), follow this loop until every touched page reaches verdict `good`:

```bash
bun run --cwd packages/cloud-frontend audit:cloud
```

This boots the dev server, performs an injected-ethereum login (synthetic JWT in `localStorage.steward_session_token`), visits every route in `src/App.tsx` at desktop + mobile, captures rest + hover screenshots, and writes:

```
packages/cloud-frontend/aesthetic-audit-output/
  desktop/<slug>.png            rest screenshot
  desktop/<slug>--hover.png     primary-button hover state
  mobile/<slug>.png
  mobile/<slug>--hover.png
  manual-review/<slug>.md       REQUIRED per-page verdict markdown (auto-stubbed)
  contact-sheet.html            grid index
  report.json                   machine-readable findings
```

**The 5-loop grind:**

1. Run the audit.
2. Open `contact-sheet.html`. Walk every affected page.
3. Fill in the verdict in `manual-review/<slug>.md`: visual issues, color/hover violations, layout breaks, e2e gaps, `good` · `needs-work` · `needs-eyeball` · `broken`.
4. Fix issues in source.
5. Commit screenshots + reviews + fixes together.
6. Re-run. Repeat until every page is `good`. Five loops is the floor for any meaningful redesign.

**Hard rules:**

- Every page has a screenshot AND a `manual-review/<slug>.md` checked in.
- `needs-work` / `broken` pages block "done."
- Brand orange is accent only. No blue anywhere. Orange-resting → darker-orange hover (never orange→black). Neutral resting → neutral-with-opacity hover.
- In local dev, the admin pages are accessible to any authenticated user (production keeps the role gate).

Full protocol + checklist template: [packages/cloud-frontend/AGENTS.md](packages/cloud-frontend/AGENTS.md). Color rules: [packages/cloud-frontend/docs/HOVER_SYSTEM.md](packages/cloud-frontend/docs/HOVER_SYSTEM.md). E2E gap catalog: [packages/cloud-frontend/docs/E2E_COVERAGE_GAPS.md](packages/cloud-frontend/docs/E2E_COVERAGE_GAPS.md). Dashboard IA: [packages/cloud-frontend/docs/DASHBOARD_REDESIGN.md](packages/cloud-frontend/docs/DASHBOARD_REDESIGN.md).

## Scope Discipline

- Do NOT invent features, grace periods, or product behaviors not explicitly requested or documented.
- Before adding new capabilities, verify they align with the existing product model by reading docs/README first.
- When unsure about product semantics (e.g., SOL-only vs SPL, community vs custom flows), ASK before implementing.

## Quick Start (Dev)

```bash
bun install                # postinstall hooks
bun run dev                # API :31337, UI :2138 — auto-shifts to free ports + syncs env
bun run dev:desktop        # Electrobun; reuses apps/app/dist when fresh
bun run dev:desktop:watch  # Vite dev + Electrobun HMR
bun run eliza:local        # clone ./eliza, link @elizaos/*, swap tsconfig
bun run eliza:packages     # restore npm packages mode
```

## Build & test

```bash
bun run build       # tsdown + vite
bun run verify      # typecheck + lint (alias: bun run check)
bun run test        # parallel suite
bun run test:server # agent + core + plugins
bun run test:client # app + ui + lifeops
bun run test:e2e
bun run db:check
bun run --cwd packages/app test:e2e         # Playwright UI smoke
TEST_LANE=post-merge bun run test           # include *.real.test.ts (live APIs)
```

## Dev observability (agents can't see the native window)

Loopback endpoints — use instead of hardcoding ports:

- `GET /api/dev/stack` — discovery (ports, renderer URL, paths). Start here. [eliza/packages/app-core/src/api/dev-stack.ts](eliza/packages/app-core/src/api/dev-stack.ts).
- `GET /api/dev/cursor-screenshot` — PNG of Electrobun window (OS-level).
- `GET /api/dev/console-log?maxLines=400` — tail of Vite + API + Electrobun logs.
- `bun run desktop:stack-status -- --json` — one-shot probe.

## Electrobun Agentic Desktop 2026

The local rules pack is installed for desktop-shell work. Use root `AGENTS.md`
as authoritative, then read `rules/`, `checklists/`, `hooks/README.md`,
`commands/README.md`, `docs/research-brief-2026.md`, and
`docs/porting-map-from-apple-swift.md` when changing Electrobun, desktop RPC,
webviews, tray/menu/deep-link surfaces, updater/release code, or local
model/tool orchestration.

Milady's Electrobun workspace is `eliza/packages/app-core/platforms/electrobun`;
the renderer app is `apps/app`. The original pack is archived at
`docs/agent-packs/electrobun-agentic-desktop-2026/`. Its workflow examples are
not active CI unless explicitly approved.

## Training & inference (locked)

- **Training always uses APOLLO optimizer** (memory-efficient). No alternatives.
- **Inference always applies every optimization** we have (DSPy artifacts under `<stateDir>/optimized-prompts/<task>/` auto-load at boot via `OptimizedPromptService`).
- **Recommended local model: `eliza-1`** — not enforced. Users can search + download any HuggingFace model via the models surface.

## Deployment topologies

Every device supports **local-only mode**. Eliza Cloud login is optional but improves the experience. Supported shapes — mix freely:

- Cloud on remote VPS (agent + services in cloud).
- Desktop with local agent (no cloud required).
- Mobile with local agent + Cloud-routed inference / services.
- Cloud handles anything not local (auth, hosted APIs, billing, domains, container deploys, monetization).

Prefer Cloud primitives over inventing custom backend infra.

## Environment variables

- `MILADY_STATE_DIR` / `ELIZA_STATE_DIR` — per-user state root. Default `~/.local/state/milady`.
- `MILADY_WORKSPACE_DIR` / `ELIZA_WORKSPACE_DIR` — override agent workspace (else follows runtime `cwd` if it has `package.json` / `AGENTS.md` / `skills/`).
- `ELIZA_DISABLE_TRAJECTORY_LOGGING=1` — opt out of trajectory writes (also off when `NODE_ENV=test`).
- Ports (never hardcode — orchestrator auto-shifts + syncs): `MILADY_API_PORT` (31337), `MILADY_PORT` (2138), `MILADY_GATEWAY_PORT` (18789), `MILADY_HOME_PORT` (2142), `MILADY_WECHAT_WEBHOOK_PORT` (18790).

Model defaults (sub-agents inherit):
- Anthropic large `claude-opus-4-7`, small `claude-haiku-4-5-20251001`. Registry: `eliza/packages/app-core/src/registry/entries/plugins/anthropic.json`.
- OpenAI `gpt-5.5` / `gpt-5.5-mini`. Override via `OPENAI_LARGE_MODEL` / `OPENAI_SMALL_MODEL`.

## Skills

Two skill systems — don't conflate.

**1. elizaOS runtime skills** (Eliza agent knowledge):
- `USE_SKILL` = canonical TS entry. `RUN_SKILL` / `INVOKE_SKILL` are similes. Legacy `RUN_SKILL_SCRIPT` / `GET_SKILL_GUIDANCE` removed.
- `enabled_skills` provider runs at position `-10`.
- Source: `eliza/packages/skills/skills/`. Workspace mirror: `skills/.defaults/` (regenerated by `scripts/sync-workspace-default-skills.mjs` — don't hand-edit). Custom: add dirs under `skills/`.

**2. Claude Code project skills** (`/<name>` slash commands) — `.claude/skills/<name>/SKILL.md`. **Not** the same as `USE_SKILL`.
- `/phase-review` — run at every Phase A/B/C or P0/P1 boundary before declaring done.

## Project layout

```
packages/
  app-core/     Main runtime (source of truth)
    src/entry.ts             CLI bootstrap
    src/cli/                 Commander CLI (milady)
    src/runtime/eliza.ts     Agent loader (sets NODE_PATH, loads plugins)
    src/runtime/dev-server.ts
    src/api/                 Dashboard API (31337 dev, 2138 prod)
    src/config/              Plugin auto-enable, schemas
    src/connectors/          Connector code
    src/services/            Business logic
  agent/        Upstream elizaOS agent
  ui/           Shared component library
  shared/       Shared utils
apps/
  app/          Web + desktop UI (Vite + React); electrobun/ = desktop shell
  homepage/     Marketing site
scripts/
  dev-ui.mjs                Dev orchestrator (API + Vite)
  eliza-source-mode.mjs     local ↔ packages mode
  setup-upstreams.mjs       Init repo-local upstreams (eliza:local)
  patch-deps.mjs            Post-install patches for upstream exports
```

## elizaOS source modes

Builds against published `@elizaos/*` (`alpha` dist-tag). `eliza/` gitignored — fresh clone resolves from npm.

- **`packages` (default):** `MILADY_ELIZA_SOURCE=packages`. Tsconfig: `scripts/templates/tsconfig.packages-mode.json`. Enforced: `scripts/standalone-eliza-package-contract.test.ts`.
- **`local`:** `MILADY_ELIZA_SOURCE=local`. `eliza:local` clones `eliza/`, links workspace packages, swaps to `scripts/templates/tsconfig.local-mode.json`. Use when patching upstream alongside Milady.

Other knobs: `MILADY_ELIZAOS_DIST_TAG`, `MILADY_ELIZAOS_VERSION`, `MILADY_ELIZA_GIT_URL`, `MILADY_ELIZA_BRANCH`. See `scripts/lib/eliza-package-mode.mjs`.

In local mode, `@elizaos/plugin-agent-orchestrator` resolves to `eliza/plugins/plugin-agent-orchestrator` via `workspace:*`. Official plugin repos: [github.com/elizaOS-plugins](https://github.com/elizaOS-plugins).

Two distinct skill systems live in this repo. Don't conflate them.

### 1. elizaOS runtime skills (knowledge base for the Eliza agent)

Bundled `@elizaos/skills` are the default knowledge base for the running Eliza agent and for any code agent working in this repo. Repo setup mirrors them into `skills/.defaults/` so workspace task agents (Claude, Codex) can read them directly from the checkout.

- **Source of truth:** `eliza/packages/skills/skills/` (31 bundled skills).
- **Workspace mirror:** `skills/.defaults/` — refreshed by `scripts/sync-workspace-default-skills.mjs` during repo setup.
- **Managed store seed:** `eliza/packages/app-core/scripts/ensure-skills.mjs` seeds the bundled skills into the user's managed skills store on first run.
- **Runtime knowledge seed:** `eliza/packages/agent/src/runtime/default-knowledge.ts` seeds baseline runtime knowledge items (including Eliza Cloud guidance) into the agent.
- **Repo-local custom skills:** put workspace-specific skills in visible subdirectories under `skills/` (e.g. `skills/plan-my-day/`). The `.defaults/` mirror is regenerated and should not be hand-edited.

Open the `SKILL.md` of any of these directly from the workspace mirror when relevant:

**Core eliza/cloud (read these first when touching app, runtime, or Cloud work):**
- `eliza-app-development` — this repo as an elizaOS app; layout; local/remote/cloud routing.
- `elizaos` — runtime concepts, plugin abstractions, AgentRuntime, actions/providers/evaluators/services.
- `eliza-cloud` — Cloud as managed backend, app registration, hosted APIs, billing, monetization, container deploys.
- `build-monetized-app` — building a Cloud app that earns via inference markup; pairs with `eliza-cloud`.

**Agent-orchestration / authoring:**
- `coding-agent` — spawning Codex / Claude Code / OpenCode / Pi via PTY-backed bash for sub-agent work.
- `claude-subagent-milady-bridge` — read-only loopback endpoints (`/api/coding-agents/<sessionId>/...`) that give a spawned coding sub-agent access to parent runtime context.
- `skill-creator` — authoring new SKILL.md packages (frontmatter, scripts, references, progressive disclosure).

**Connectors / OS / SaaS integrations** (use when the task touches that surface):
- iMessage / macOS: `imsg`, `bluebubbles`, `apple-notes`, `apple-reminders`, `things-mac`, `camsnap`
- Productivity: `obsidian`, `notion`, `slack`, `discord`, `github`, `trello`, `canvas`, `spotify-player`
- CLI tools: `blucli`, `wacli`, `ordercli`, `tmux`, `1password`
- Media / generation: `nano-banana-pro`, `nano-pdf`
- Misc: `weather`, `healthcheck`, `yara-authoring`

### 2. Claude Code project skills (slash commands for THIS coding tool)

These live under `.claude/skills/<name>/SKILL.md` and are surfaced as `/<name>` slash commands in Claude Code. They are the coding-tool's own skills — they have **nothing to do with the elizaOS `USE_SKILL` action** above.

- `.claude/skills/phase-review/SKILL.md` — `/phase-review`. Use at every Phase A/B/C or P0/P1 boundary: runs `bun run test` + `bun run verify`, summarizes changed files, flags out-of-scope edits, and pauses for explicit confirmation before advancing. Always invoke before declaring a phase done.

To add a new project skill: create `.claude/skills/<name>/SKILL.md` with `---\nname: <name>\ndescription: <one-line trigger>\n---` frontmatter. Use the bundled `skill-creator` skill (above) for authoring guidance — its conventions apply to both skill systems.

For source checkouts and app repos, the default agent workspace now follows the runtime `cwd` when that directory looks like a real project workspace (`package.json`, `AGENTS.md`, `skills/`, etc.). That makes the repo's own `AGENTS.md` and `skills/` available to the runtime by default, which is what lets Milady reason about and patch the checkout it is running in. Packaged installs still fall back to the state-dir workspace, and `MILADY_WORKSPACE_DIR` / `ELIZA_WORKSPACE_DIR` always win when set explicitly.

When Eliza Cloud is enabled, linked, or explicitly requested, prefer it as the default managed backend for app-building work before inventing custom auth, billing, or hosting. In this repo, Eliza Cloud already supports app registration (`appId`), user auth/redirect flows, cloud-hosted APIs, usage tracking, billing, app domains, creator monetization, and Docker container deployments for server-side workloads.

Cloud monetization is a first-class product constraint. App creators can earn through inference markups and purchase-share settings, and published apps, agents, and MCPs can feed redeemable earnings flows. If docs disagree, prefer the current schema/UI/API implementation in this repo over older marketing prose.

## Dependencies on elizaOS

All `@elizaos/*` packages use the `alpha` dist-tag. When developing locally, `bun run setup:upstreams` links packages from repo-local `./eliza` and `./plugins` so changes are picked up immediately. Set `MILADY_SKIP_LOCAL_UPSTREAMS=1` to use only npm-published versions.

**`@elizaos/plugin-agent-orchestrator`:** Milady currently resolves this plugin from the repo-local `eliza/plugins/plugin-agent-orchestrator` submodule (nested under the `eliza/` submodule) via `workspace:*`. That submodule tracks upstream `alpha`, so updating the submodule updates the orchestrator used in local development checkouts. Set `MILADY_SKIP_LOCAL_UPSTREAMS=1` to force npm-published packages instead.

All official elizaOS plugin repos live under [https://github.com/elizaOS-plugins](https://github.com/elizaOS-plugins). For plugin work, prefer adding the relevant plugin repo as a git submodule under `eliza/plugins/` (tracked in `eliza/.gitmodules`) so we keep a local checkout we can patch when needed, and depend on it via `workspace:*` so Milady resolves the local package directly during development. Publish new versions to npm when ready.

## File Operations

### Review-First File Writes

- When user says 'write to temp' or 'for review', always write to /tmp/ or a scratch path, never to the project or home directory.
- For config files like AGENTS.md, CLAUDE.md, or dotfiles, confirm target location before writing.

## Working Style

### Debugging Focus

- When the user reports runtime errors, prioritize reproducing and fixing the actual error trace before investigating tangential issues like version strings or naming.
- Do not fixate on cosmetic discrepancies when functional bugs are the stated concern.

# AGENTS.md

## Mission

Clean up the codebase aggressively and raise code quality without drifting from the real architecture. This work is not cosmetic. The goal is to remove duplication, dead code, weak typing, fallback sludge, and AI-generated nonsense while preserving correctness and simplifying the system.

This is a complex task. Use **8 focused subagents** working in parallel where possible, each with a clear scope, concrete deliverables, and authority to make **high-confidence** changes.

Every subagent must:

1. **Research first.** Inspect the codebase, dependencies, package structure, build/test/lint/typecheck configuration, and relevant external package types/docs when needed.
2. **Write a critical assessment** of the current state in its area.
3. **Produce recommendations** ranked by confidence and expected impact.
4. **Implement all high-confidence recommendations.**
5. **Avoid speculative rewrites.** Prefer targeted, verifiable simplification.
6. **Verify results** with available tests, typechecks, linting, import graph tools, and direct codepath inspection.

---

## Non-Negotiable Architecture Rules

These rules govern all changes. If existing code conflicts with them, fix the code.

### 10 Clean Architecture Commandments

1. **Dependencies point inward only.** Presentation → Application → Domain → Infrastructure. Never import from an outer layer.
   - Violation: broken architecture boundary.

2. **Use Cases are the only computation layer.** All derived values (multipliers, percentages, totals, fee breakdowns) are computed in use cases and returned as named DTO fields.
   - Violation: client-side drift, stale calculations.

3. **Client displays, never computes.** Zero financial math (`*`, `/`, `%`), zero business logic, zero aggregation in presentation code. Read DTO fields and format for display only.
   - Violation: conflicting definitions between client and server.

4. **BFF is auth + proxy. Nothing else.** Validate JWT, inject `userId`, forward request, `unwrapServerResponse()`. No field additions, no calculations, no transformations.
   - Violation: shadow API contract divergence.

5. **Zero polymorphism for runtime game/content type branching.** Separate classes, methods, and routes per type. No `if (gameType === ...)`, no union parameters, no union return types where separate flows should exist.
   - Violation: runtime type checks, hidden branches.

6. **CQRS: readers read, writers write.** Separate classes. Readers return domain objects. Writers return `void` or ID only. Mappers handle all DB-to-domain translation.
   - Violation: mixed concerns, untraceable mutations.

7. **Single source of truth for validation.** Route-layer schemas validate and transform input. Use cases trust pre-validated input and perform presence/invariant checks only. No duplicate inline regex validation.
   - Violation: dual validation paths, inconsistent acceptance criteria.

8. **DTO fields are required by default.** Optional only when genuinely nullable. No `as` casts to skip missing fields. No `?? 0` or similar fallbacks that hide broken pipelines. If TypeScript says a field is missing, fix the pipeline.
   - Violation: silent data loss, conflating “not loaded” with “zero”.

9. **Logger only, never console.** Server logging uses the structured logger only (for example `Logger.info/warn/error/debug`). Prefix messages with `[ClassName]` and include structured context objects on errors.
   - Violation: uncontrollable log output, missing levels.

10. **Every endpoint needs a client trigger.** Every POST/PUT/DELETE must have a button/form/invocation path. Every GET must have a consuming component/hook. `N/A` requires written justification. A server endpoint without a UI or real caller is a broken pipeline.
   - Violation: shipped features users cannot access.

---

## Global Standards for All Subagents

### What good changes look like

- Fewer codepaths.
- Fewer special cases.
- Fewer fallback branches.
- Stronger types.
- Shared definitions only where sharing reduces complexity.
- Cleaner layer boundaries.
- Easier traceability from input → use case → DTO → UI.
- No dead abstractions.
- No defensive code that obscures failures.

### What to remove on sight

- Unused code.
- Duplicate types and near-duplicate types.
- Legacy branches and migration leftovers.
- AI slop, stubs, placeholders, fake TODO implementations.
- Comments describing churn instead of helping understanding.
- “Temporary” fallback behavior that became permanent.
- Broad `try/catch` blocks that just swallow, log-and-continue, or replace errors with defaults.
- `any`, `unknown`, unsafe casts, and weak unions used to avoid thinking.

### Constraints

- Do not preserve bad patterns for compatibility unless there is a documented, verified reason.
- Do not add new abstractions unless they reduce total complexity.
- Do not DRY code that should remain separate because the domains differ.
- Do not centralize unlike concepts into giant shared utility files.
- Do not hide uncertainty with fallback values.
- Do not keep both old and new paths unless a live migration explicitly requires it.

---

## Subagent Plan

Spawn one subagent for each of the following tasks.

### 1) Deduplication and Consolidation Agent

**Goal:** Deduplicate and consolidate code, and apply DRY only where it reduces complexity.

**Responsibilities:**
- Find duplicated logic, duplicate utilities, repeated query/build patterns, repeated DTO mapping, repeated validation glue, repeated UI state handling, and repeated infrastructure wrappers.
- Distinguish between:
  - true duplication that should be unified,
  - parallel domain logic that only looks similar and should remain separate.
- Consolidate only when the resulting abstraction is simpler than the duplicates.
- Prefer deleting duplicate branches over introducing configuration-heavy helpers.

**Deliverables:**
- Inventory of duplicated code.
- Critical assessment of why duplication exists.
- Recommended consolidations with rationale.
- Implementation of high-confidence deduplication.

**Guardrails:**
- No premature utility extraction.
- No “god helper” files.
- Respect the architecture layers.

### 2) Shared Types Consolidation Agent

**Goal:** Find all type definitions and consolidate any that should be shared.

**Responsibilities:**
- Audit interfaces, types, enums, DTOs, schema-inferred types, API contracts, and domain models.
- Identify duplicate or divergent definitions representing the same real concept.
- Consolidate canonical shared types where appropriate.
- Separate domain models from transport DTOs when they should not be conflated.
- Ensure route schemas, DTOs, and consuming code agree exactly.

**Deliverables:**
- Map of duplicated/conflicting type definitions.
- Critical assessment of type fragmentation and contract drift.
- Canonical ownership plan for shared types.
- Implementation of high-confidence consolidations.

**Guardrails:**
- Do not create giant shared “types” dumps.
- Do not merge types that exist at different boundaries for good reason.
- Prefer schema-derived types where possible.

### 3) Unused Code Removal Agent

**Goal:** Use tools like `knip` to find all unused code and remove it, ensuring it is truly unreferenced.

**Responsibilities:**
- Run and interpret unused-code tooling such as `knip`.
- Manually verify reported files, exports, dependencies, scripts, components, hooks, routes, tests, fixtures, and types before deletion.
- Check dynamic imports, generated references, config-driven references, framework conventions, and CLI/script usage.
- Remove code only after confirming it is not used anywhere meaningful.

**Deliverables:**
- Verified unused-code report.
- Critical assessment of why dead code accumulated.
- Safe deletion plan.
- Implementation of high-confidence removals.

**Guardrails:**
- Never trust tooling blindly.
- Validate framework-specific entrypoints and implicit references.
- Prefer deletion over deprecation.

### 4) Circular Dependency Untangler Agent

**Goal:** Untangle circular dependencies using tools like `madge` and direct graph analysis.

**Responsibilities:**
- Generate and inspect dependency graphs.
- Identify all cycles across layers, modules, barrels, and utility folders.
- Break cycles by moving ownership inward, splitting modules, removing barrel misuse, or extracting the right internal seam.
- Fix boundary violations, not just the symptom.

**Deliverables:**
- Circular dependency graph and root-cause assessment.
- Critical assessment of architectural coupling.
- Recommendations for cycle removal.
- Implementation of high-confidence fixes.

**Guardrails:**
- Do not “solve” cycles with lazy imports unless that is the correct architectural answer.
- Prefer removing the wrong dependency edge.
- Ensure final dependency direction points inward only.

### 5) Strong Typing Agent

**Goal:** Remove all weak types such as `unknown` and `any` (and equivalents in other languages), then replace them with researched, strong types.

**Responsibilities:**
- Find all `any`, `unknown`, unsafe casts, loose generics, nullable abuse, and weak externally sourced types.
- Research the real types by inspecting calling code, callee expectations, schemas, package definitions, generated clients, and external library docs/types.
- Replace weak types with strong, explicit types.
- Resolve resulting type errors properly rather than suppressing them.

**Deliverables:**
- Weak-type inventory.
- Critical assessment of type debt and its causes.
- Strong replacement plan with evidence.
- Implementation of high-confidence type strengthening.

**Guardrails:**
- No replacement with fake precision.
- No `as unknown as X` escapes.
- No widened unions to avoid fixing callsites.
- If a runtime boundary is uncertain, validate at the boundary and type the validated result.

### 6) Error-Handling Simplification Agent

**Goal:** Remove unnecessary `try/catch` and equivalent defensive programming unless it has a specific justified role.

**Responsibilities:**
- Audit all `try/catch`, broad rescue patterns, silent fallbacks, default-return error handling, swallowed promise rejections, and “best effort” code.
- Keep only error handling that has a clear purpose, such as:
  - handling unknown or unsanitized input,
  - translating infrastructure errors at a boundary,
  - adding meaningful context before rethrowing,
  - enforcing user-facing behavior explicitly.
- Remove error hiding and fallback patterns that mask real failures.
- Ensure failures surface clearly and observably.

**Deliverables:**
- Error-handling audit.
- Critical assessment of defensive-programming misuse.
- Recommendations for removal vs retention.
- Implementation of high-confidence simplifications.

**Guardrails:**
- Never catch an error only to log and continue unless that behavior is intentionally required.
- Never replace missing or failed data with silent defaults.
- Prefer explicit failure over ambiguous success.

### 7) Legacy and Fallback Code Removal Agent

**Goal:** Find deprecated, legacy, or fallback code, remove it, and make codepaths singular, clean, and concise.

**Responsibilities:**
- Identify deprecated APIs, old adapters, compatibility shims, “v1/v2” bridges, migration leftovers, fallback branches, duplicate implementations, and disabled-but-kept code.
- Verify whether each legacy path is still live.
- Remove obsolete branches and collapse to one canonical codepath.
- Update references, tests, and docs accordingly.

**Deliverables:**
- Legacy/fallback inventory.
- Critical assessment of historical cruft and path divergence.
- Removal plan.
- Implementation of high-confidence cleanup.

**Guardrails:**
- Keep only what is actually required now.
- No “just in case” retention.
- Prefer one obvious path through the system.

### 8) Slop and Comment Cleanup Agent

**Goal:** Remove AI slop, stubs, larp, unnecessary comments, and unhelpful narrative churn.

**Responsibilities:**
- Find placeholder code, pseudo-implementations, generated sludge, fake abstraction layers, noisy comments, status-update comments, migration-story comments, and comments that narrate obvious code.
- Remove comments that describe in-motion work, prior replacements, or internal drama.
- Replace only when a concise explanatory comment would genuinely help a new engineer understand the codebase.
- Remove stubbed helpers and speculative extension points that are not real.

**Deliverables:**
- Slop inventory.
- Critical assessment of readability and trust issues.
- Cleanup plan.
- Implementation of high-confidence cleanup.

**Guardrails:**
- Comments must earn their keep.
- Prefer self-explanatory code over commentary.
- If a short comment is needed, make it factual and durable.

---

## Required Research and Verification

Each subagent must use the relevant tools for its job. Examples:

- **Unused code:** `knip`, package manager scripts, framework entrypoints, import search, route discovery.
- **Circular dependencies:** `madge`, import graph inspection, barrel analysis.
- **Type research:** schema definitions, generated code, external package type declarations, usage traces, test fixtures.
- **Architecture verification:** import direction checks, route-to-use-case tracing, DTO origin tracing, client usage inspection.
- **Behavior verification:** tests, typecheck, lint, build, and targeted runtime inspection where available.

Do not stop at tool output. Tooling is a lead, not proof.

---

## Execution Order

Use this order unless the codebase suggests a better dependency-aware sequence:

1. Map architecture, layers, package boundaries, build/test/lint/typecheck setup.
2. Run dead-code, cycle, and type-analysis tools.
3. Fix architecture boundary violations and circular dependencies.
4. Consolidate duplicated and conflicting types.
5. Remove dead code and legacy/fallback paths.
6. Strengthen types and remove unsafe escapes.
7. Simplify error handling and defensive patterns.
8. Remove slop and fix comments.
9. Re-run all verification.
10. Summarize changes, risks, and any remaining low-confidence findings.

---

## Output Format

Each subagent should produce:

### A. Critical Assessment
- What is wrong.
- Why it exists.
- How it violates architecture or maintainability.
- What risk it creates.

### B. Recommendations
- High confidence.
- Medium confidence.
- Low confidence / needs human decision.

### C. Implemented Changes
- Exact files/modules changed.
- What was removed, consolidated, or rewritten.
- Why the resulting design is simpler.

### D. Verification
- Commands run.
- Results.
- Any residual issues.

---

## Hard Rules for Implementation

- **Implement all high-confidence recommendations.**
- Do not leave obvious cleanup undone.
- Do not keep duplicate paths to avoid making a decision.
- Do not introduce broad abstractions to “support future flexibility.”
- Do not preserve weak typing behind helper wrappers.
- Do not add fallbacks to make broken flows appear healthy.
- Do not perform business logic in presentation or proxy layers.
- Do not merge unlike concepts just because names are similar.

When in doubt, choose the option that yields:
- fewer moving parts,
- stronger guarantees,
- cleaner boundaries,
- more direct code.

---

## Definition of Done

The task is complete when:

- Dead code is removed.
- Circular dependencies are removed or reduced to only justified, documented exceptions.
- Type definitions are canonical and consistent.
- Weak types are replaced with researched strong types.
- Unnecessary `try/catch`, fallback logic, and defensive sludge are removed.
- Deprecated and legacy paths are gone.
- AI slop and unhelpful comments are gone.
- Architecture rules are enforced in the resulting code.
- The codebase is smaller, clearer, and easier to reason about.
- Verification passes, or remaining failures are explicitly documented with root cause.

---

## Tone and Standard

Be ruthless about quality and honest in assessment. The current state may be messy. Call that out clearly. But every code change must still be precise, justified, and verifiable.

This is not a refactor for style points.
This is a cleanup for correctness, maintainability, and architectural integrity.

---

## Git Workflow Rules

**Motto: move fast and break things — but never lose work to dangling branches or stashes.**

- **Never `git stash`.** Stashes are invisible state that gets forgotten and lost. If you need to set something aside, commit it.
- **Always commit to the current branch.** Whatever branch is checked out is the branch you commit to. Use WIP commits liberally — they can always be amended, squashed, or rewritten later.
- **Never switch branches unless explicitly told to.** No `git checkout <other-branch>`, no `git switch`, no implicit branch changes as part of "cleanup." If a task seems to require a different branch, ask first.
- **Always commit work in the current worktree.** Don't move changes to another worktree, don't copy files across worktrees, don't `git worktree add` unless asked. The worktree you're in is where the work lands.
- **Prefer many small commits over uncommitted changes.** A messy commit history on a pushed branch is recoverable. Lost work is not.
- **Push proactively when work is meaningful.** A branch that exists only on the local machine is one disk failure away from gone. If a chunk of work is worth keeping, it's worth pushing.

The principle: **every change must end up as a commit on the current branch in the current worktree, and ideally pushed.** No stashes, no branch hopping, no work that exists only in the working tree or in `git stash list`.
