# QA Findings — 2026-06-01 smoke pass

Scope: apps (`apps/app` desktop + Electrobun, `apps/homepage`, `eliza/packages/cloud-frontend`) + 8 messaging connectors. Depth: automated suites + manual smoke.

Branch: `qa/2am-2026-06-01` off `develop` at commit `765e547d4` ("chore: remove obsolete voice shims").

---

## Phase 0 — Clean state

| Step | Status | Notes |
|------|--------|-------|
| Discard dirty files (`bun.lock`, `scripts/lib/install-env.test.ts`) | ✅ | Working tree clean |
| Fresh pull on `develop` | ✅ | Fast-forwarded 83 commits to `765e547d4` |
| `bun install` | ✅ | 1739 installs across 1959 packages, all patches applied or already-applied. Exit 0. |
| Create `.env` with `ANTHROPIC_API_KEY` | ✅ | `.env` confirmed gitignored (line 7 of `.gitignore`) |
| `bun run doctor` | ❌ **Finding #1** | See below |

### Finding #1 — `bun run doctor` fails with `Module not found "eliza.mjs"`

- **Command:** `bun run doctor` (alias of `bun run milady:doctor`)
- **What happens:** `tsdown` build phase succeeds (rebuilds `dist/entry.js`, `dist/eliza.js`, `dist/server.js`, `dist/index.js`, and 20 chunks totalling 7.6 MB). Then the doctor script invocation fails:
  ```
  error: Module not found "eliza.mjs"
  error: script "milady:doctor" exited with code 1
  error: script "doctor" exited with code 1
  ```
- **Invocation chain:** `package.json` → `bun run milady:doctor` → `node scripts/run-eliza-app-core-script.mjs run-node.mjs doctor`. The `run-node.mjs doctor` step is what resolves to `eliza.mjs`, which is missing.
- **Severity:** medium. Build artifacts produced successfully, so deps and patches are healthy. The doctor subcommand alone is broken, which blocks anyone using it as the documented "is my setup OK?" check.
- **Repro:** clean clone, `bun install`, `bun run doctor`.

---

## Phase 1 — Automated test sweep

_(pending)_

---

## Phase 2 — App smoke tests

_(pending)_

### 2.1 apps/app (web + Electrobun)

### 2.2 apps/homepage

### 2.3 eliza/packages/cloud-frontend visual audit

---

## Phase 3 — Connector verification

_(pending)_

| Connector | Test status | Notes |
|-----------|-------------|-------|
| Discord | | |
| Telegram | | |
| WhatsApp | | |
| Signal | | |
| WeChat | | |
| iMessage | | |
| Bluesky | | |
| Farcaster | | |

---

## Summary

_(filled at end of pass)_
