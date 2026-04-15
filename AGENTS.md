# Milady — Agent Conventions

## What This Is

Milady is a local-first AI assistant built on [elizaOS](https://github.com/elizaOS). It wraps the elizaOS runtime with a CLI, desktop app (Electrobun), web dashboard, and platform connectors (Telegram, Discord, etc.).

### elizaOS naming (agents & editors)

Write the framework name as **elizaOS** in prose, comments, user-facing strings, and documentation — not `ElizaOS`. The npm scope remains **`@elizaos/*`** (lowercase). Say **Eliza agents** when you mean agents in plain language (not **elizaOS agents**). The **Eliza Classic** plugin name is an exception (**Eliza** = the 1966 chatbot), not “elizaOS Classic”. Cursor picks this up via `.cursor/rules/elizaos-branding.mdc`.

## Quick Start (Dev)

```bash
bun install          # runs postinstall hooks automatically
bun run dev          # API on :31337, UI on :2138 with hot reload (defaults; busy ports → next free + env sync)
bun run dev:desktop  # Electrobun; skips vite build when apps/app/dist is up to date
bun run dev:desktop:watch  # Vite **dev** server + Electrobun `MILADY_RENDERER_URL` (HMR). Orchestrator pre-picks free API/UI loopback ports when defaults are in use so proxy + env match. Rollup watch: also set MILADY_DESKTOP_VITE_BUILD_WATCH=1

Desktop dev observability (agents cannot see the native window; Cursor does not auto-poll localhost): `GET /api/dev/stack` on the API; `bun run desktop:stack-status -- --json`; default-on aggregated log (`.milady/desktop-dev-console.log`) + `GET /api/dev/console-log` (loopback tail); default-on screenshot proxy `GET /api/dev/cursor-screenshot` (loopback, full-screen OS capture). Opt-out: `MILADY_DESKTOP_SCREENSHOT_SERVER=0`, `MILADY_DESKTOP_DEV_LOG=0`. See `docs/apps/desktop-local-development.md` and `.cursor/rules/milady-desktop-dev-observability.mdc`.
```

Desktop dev rationale (signals, Quit, `detached` children): `docs/apps/desktop-local-development.md`.

Optional — link a local elizaOS source checkout for live package development:
```bash
bun run setup:upstreams   # initializes repo-local ./eliza and links local @elizaos/* packages
```

## Build & Test

```bash
bun run build        # tsdown + vite
bun run verify       # typecheck + lint (`bun run check` aliases this)
bun run test         # parallel test suite
bun run test:e2e     # end-to-end tests
bun run db:check     # database security + readonly tests
```

## Project Layout

```
packages/
  app-core/             Main application package (source of truth for runtime)
    src/
      entry.ts          CLI bootstrap (env, log level)
      cli/              Commander CLI (milady command)
      runtime/
        eliza.ts        Agent loader — sets NODE_PATH, loads plugins dynamically
        dev-server.ts   Dev mode entry point (started by dev-ui.mjs)
      api/              Dashboard API (port 31337 in dev, 2138 in prod)
      config/           Plugin auto-enable, config schemas
      connectors/       Connector integration code
      services/         Business logic
  agent/                Upstream elizaOS agent (core plugins, auto-enable maps)
  plugin-wechat/        WeChat connector plugin (@elizaos/plugin-wechat)
  ui/                   Shared UI component library
  shared/               Shared utilities
apps/
  app/                  Main web + desktop UI (Vite + React)
    electrobun/         Electrobun desktop shell
  homepage/             Marketing site
scripts/
  dev-ui.mjs            Dev orchestrator (API + Vite)
  eliza/packages/app-core/scripts/run-node.mjs   CLI runner (spawns entry.js with NODE_PATH)
  run-repo-setup.mjs    Postinstall sequencer
  setup-upstreams.mjs   Initialize repo-local upstreams and link @elizaos packages
  patch-deps.mjs        Post-install patches for broken upstream exports
```

## Default Agent Knowledge

Treat bundled skills from `@elizaos/skills` as the default knowledge base for code agents working in this repo. Repo setup mirrors those defaults into `skills/.defaults/` so task agents like Claude and Codex can open them directly from the workspace. The canonical repo-local entry points are:

- `skills/.defaults/eliza-app-development/SKILL.md` — this repo as an elizaOS app (Milady is this checkout’s product name), layout, and how local, remote, and cloud paths fit together
- `skills/.defaults/elizaos/SKILL.md` — elizaOS runtime concepts, plugin abstractions, and extension points
- `skills/.defaults/eliza-cloud/SKILL.md` — Eliza Cloud as a managed backend, app platform, deployment target, and monetization surface

The source of truth remains under `eliza/packages/skills/skills/`. `scripts/sync-workspace-default-skills.mjs` refreshes the repo-local mirrors during repo setup.

`scripts/ensure-skills.mjs` seeds bundled skills from `@elizaos/skills` into the managed skills store on first run.
Separately, `packages/agent/src/runtime/default-knowledge.ts` seeds bundled runtime knowledge items for Milady itself, including the baseline Eliza Cloud app/backend guidance.

For source checkouts and app repos, the default agent workspace now follows the runtime `cwd` when that directory looks like a real project workspace (`package.json`, `AGENTS.md`, `skills/`, etc.). That makes the repo's own `AGENTS.md` and `skills/` available to the runtime by default, which is what lets Milady reason about and patch the checkout it is running in. Packaged installs still fall back to the state-dir workspace, and `MILADY_WORKSPACE_DIR` / `ELIZA_WORKSPACE_DIR` always win when set explicitly.

When Eliza Cloud is enabled, linked, or explicitly requested, prefer it as the default managed backend for app-building work before inventing custom auth, billing, or hosting. In this repo, Eliza Cloud already supports app registration (`appId`), user auth/redirect flows, cloud-hosted APIs, usage tracking, billing, app domains, creator monetization, and Docker container deployments for server-side workloads.

Cloud monetization is a first-class product constraint. App creators can earn through inference markups and purchase-share settings, and published apps, agents, and MCPs can feed redeemable earnings flows. If docs disagree, prefer the current schema/UI/API implementation in this repo over older marketing prose.

## Dependencies on elizaOS

All `@elizaos/*` packages use the `alpha` dist-tag. When developing locally, `bun run setup:upstreams` links packages from repo-local `./eliza` and `./plugins` so changes are picked up immediately. Set `MILADY_SKIP_LOCAL_UPSTREAMS=1` to use only npm-published versions.

**`@elizaos/plugin-agent-orchestrator`:** Milady currently resolves this plugin from the repo-local `eliza/plugins/plugin-agent-orchestrator` submodule (nested under the `eliza/` submodule) via `workspace:*`. That submodule tracks upstream `alpha`, so updating the submodule updates the orchestrator used in local development checkouts. Set `MILADY_SKIP_LOCAL_UPSTREAMS=1` to force npm-published packages instead.

All official elizaOS plugin repos live under [https://github.com/elizaOS-plugins](https://github.com/elizaOS-plugins). For plugin work, prefer adding the relevant plugin repo as a git submodule under `eliza/plugins/` (tracked in `eliza/.gitmodules`) so we keep a local checkout we can patch when needed, and depend on it via `workspace:*` so Milady resolves the local package directly during development. Publish new versions to npm when ready.

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