# Eliza-1 Model Pipeline — Current State

This document maps the **as-built** state of the trajectory → optimization → training →
evaluation → deployment loop. It is the baseline for the gap analysis
([02-gap-analysis.md](02-gap-analysis.md)) and implementation plan
([03-implementation-plan.md](03-implementation-plan.md)).

All paths are relative to the repo root unless prefixed `~/`. The local checkout of
elizaOS lives under `eliza/` and is gitignored in packages mode; in local mode
those files are the source of truth.

---

## 1. End-to-end flow diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            ELIZA-1 PIPELINE — TODAY                          │
└──────────────────────────────────────────────────────────────────────────────┘

  USER → AGENT TURN
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                            AGENT RUNTIME                                 │
  │                                                                          │
  │   should_respond → context_routing → action_planner → action            │
  │   exec → response                                                        │
  │                              │                                           │
  │                              │ LLM calls instrumented                    │
  │                              │ provider gather logged                    │
  │                              │ action exec partially logged              │
  │                              │ sub-agent stdout only                     │
  │                              ▼                                           │
  │                     TrajectoriesService                                  │
  │            (packages/core/src/features/trajectories/                     │
  │             TrajectoriesService.ts)                                      │
  │                              │                                           │
  │              ┌───────────────┴──────────────┐                            │
  │              ▼                              ▼                            │
  │     trajectories table              trajectory_step_index               │
  │     (full JSONB hierarchy)          (routing/filter index)              │
  │                                                                          │
  │   ELIZA_DISABLE_TRAJECTORY_LOGGING=1 → opt-out                           │
  │   NODE_ENV=test                     → silent disable                    │
  │   InMemory adapter                  → silent disable                    │
  └──────────────────────────────────────────────────────────────────────────┘
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       ▼                          ▼                          ▼

  ┌─────────────────┐    ┌─────────────────┐       ┌─────────────────────┐
  │  PROMPT OPTIM   │    │ NIGHTLY EXPORT  │       │ SYNTHETIC SYNTH     │
  │  LOOP (online)  │    │ CRON 03:00      │       │ (offline batch)     │
  │                 │    │                 │       │                     │
  │ TrainingTrigger │    │ Privacy filter  │       │ drive_eliza.py      │
  │ Service         │    │ MANDATORY       │       │ + together_synth.py │
  │ (100/task,12h)  │    │                 │       │ + rule-based synth  │
  │                 │    │ ~/.eliza/       │       │                     │
  │ ↓               │    │  training/      │       │ ~50k records mixed  │
  │ Privacy filter  │    │  datasets/      │       │ rule + LLM + drive  │
  │ MANDATORY       │    │  <YYYY-MM-DD>/  │       │                     │
  │                 │    │  *.jsonl        │       │ writes JSONL to     │
  │ Native backend  │    │                 │       │ training/data/      │
  │ • MIPRO         │    │ (also: 03:05    │       │                     │
  │ • GEPA          │    │  skill scoring) │       │                     │
  │ • bootstrap-fs  │    │                 │       │                     │
  │                 │    │                 │       │                     │
  │ Atropos backend │    │                 │       │                     │
  │   ⚠ ZERO refs   │    │                 │       │                     │
  │   in repo (LARP)│    │                 │       │                     │
  │                 │    │                 │       │                     │
  │ Tinker backend  │    │                 │       │                     │
  │   ⚠ stub        │    │                 │       │                     │
  │                 │    │                 │       │                     │
  │ ↓ JSON artifact │    │                 │       │                     │
  │ ~/.eliza/       │    │                 │       │                     │
  │  optimized-     │    │                 │       │                     │
  │  prompts/       │    │                 │       │                     │
  │  <task>/        │    │                 │       │                     │
  │                 │    │                 │       │                     │
  │ ↓ next boot     │    │                 │       │                     │
  │ OptimizedPrompt │    │                 │       │                     │
  │ Service loads   │    │                 │       │                     │
  │                 │    │                 │       │                     │
  │ ⚠ Only          │    │                 │       │                     │
  │   action_planner│    │                 │       │                     │
  │   actually      │    │                 │       │                     │
  │   injected;     │    │                 │       │                     │
  │   4/5 unused    │    │                 │       │                     │
  └─────────────────┘    └─────────────────┘       └─────────────────────┘
                                  │                          │
                                  └──────────────┬───────────┘
                                                 ▼
                          ┌──────────────────────────────────────┐
                          │       TRAINING PIPELINE              │
                          │                                      │
                          │  eliza/packages/training/            │
                          │                                      │
                          │  Stage 1: SFT  (train_local.py)      │
                          │  • TRL + APOLLO                      │
                          │  • Qwen 2B / 9B / 27B                │
                          │  • Liger fused kernels               │
                          │  • Optional TE FP8                   │
                          │  • Completion-only masking           │
                          │                                      │
                          │  Stage 2: DPO  (train_dpo.py)        │
                          │  • preference pairs from synth       │
                          │    corruptions                       │
                          │                                      │
                          │  Stage 3: GRPO (train_grpo_verl.sh)  │
                          │  • verl + vLLM rollout               │
                          │  • 8× H200 for 27B                   │
                          │  • ⚠ NOT in Vast launcher            │
                          │                                      │
                          │  Format: eliza_native_v1             │
                          │  (vercel_ai_sdk boundaries)          │
                          │  format_for_training.py renders      │
                          │  chat templates                      │
                          │  ⚠ No privacy filter call here       │
                          └──────────────────────────────────────┘
                                                 │
                                                 ▼
                          ┌──────────────────────────────────────┐
                          │           VAST.AI LAUNCHER           │
                          │                                      │
                          │  train_vast.sh (lib/vast.py)         │
                          │  • Pick cheapest $/hr offer          │
                          │  • Provision blackwell6000 (2B/9B)   │
                          │    or b200-2x (27B)                  │
                          │  • Bouncer SSH + port-mapped         │
                          │  • Sync code + data                  │
                          │  • Run training                      │
                          │  • Pull checkpoints                  │
                          │  • Teardown (requires --yes)         │
                          │                                      │
                          │  Preflight gate:                     │
                          │  • lock, pytest, schema,             │
                          │    memory, smoke, CUDA               │
                          │  • timestamp < 1h                    │
                          │                                      │
                          │  ⚠ No budget enforcement             │
                          │  ⚠ Cost not surfaced                 │
                          │  ⚠ GRPO requires separate provision  │
                          └──────────────────────────────────────┘
                                                 │
                                                 ▼
                          ┌──────────────────────────────────────┐
                          │     CHECKPOINTS + EVAL               │
                          │                                      │
                          │  Local artifacts:                    │
                          │  eliza/artifacts/                    │
                          │   cerebras-action-benchmark-*/       │
                          │                                      │
                          │  Benchmarks (32+ in registry.py):    │
                          │  REAL: GAIA, REALM, SWE-bench,       │
                          │  Terminal, LifeOps, BFCL, Mint,      │
                          │  AgentBench, Context-Bench,          │
                          │  Solana, OSWorld, Hyperliquid,       │
                          │  RLM-Bench, ...                      │
                          │                                      │
                          │  ⚠ No MMLU/HumanEval/GSM8K           │
                          │  ⚠ No unified harness                │
                          │  ⚠ No trending dashboard             │
                          │  ⚠ No auto-promote                   │
                          │  ⚠ Only LifeOps gated in CI          │
                          │                                      │
                          │  ⚠ CheckpointSyncAgent missing       │
                          └──────────────────────────────────────┘
                                                 │
                                  ┌──────────────┼──────────────┐
                                  ▼              ▼              ▼

                  ┌──────────────────┐  ┌────────────────┐  ┌──────────────┐
                  │ HF PUBLISH       │  │ VAST INFERENCE │  │ LOCAL INFER  │
                  │                  │  │                │  │              │
                  │ push_model_to_hf │  │ vast-pyworker/ │  │ Ollama       │
                  │ push_dataset_    │  │ worker.py      │  │ (full plugin)│
                  │   to_hf          │  │                │  │              │
                  │                  │  │ llama.cpp      │  │ LM Studio    │
                  │ privacy filter   │  │ Q6_K GGUF      │  │ (env only)   │
                  │ MANDATORY        │  │ from elizalabs │  │              │
                  │                  │  │                │  │ llama.cpp    │
                  │ HF: elizalabs/   │  │ OpenAI-compat  │  │ (mobile FFI) │
                  │   eliza-1-2b     │  │ /v1/chat/...   │  │              │
                  │   eliza-1-9b     │  │                │  │ Auto-download│
                  │   eliza-1-27b-fp8│  │ ⚠ Untested     │  │ logic exists,│
                  │                  │  │   in prod      │  │ untested e2e │
                  │ ⚠ No promote     │  │                │  │              │
                  │   gate           │  │ ⚠ No billing   │  │ Hardware     │
                  │ ⚠ No version     │  │   wiring       │  │ detection ⚠  │
                  │   scheme         │  │                │  │              │
                  │ ⚠ Hardcoded      │  │ vLLM template  │  │ MLX ⚠ ref'd  │
                  │   release set    │  │ exists but     │  │   no impl    │
                  │                  │  │ unused         │  │              │
                  └──────────────────┘  └────────────────┘  └──────────────┘
                          │                    │                    │
                          └────────────────────┼────────────────────┘
                                               ▼
                          ┌──────────────────────────────────────┐
                          │  PROVIDER SWITCHING + ROUTING        │
                          │                                      │
                          │  eliza/packages/agent/src/api/       │
                          │    provider-switch-config.ts         │
                          │                                      │
                          │  Anthropic | OpenAI | Google |       │
                          │  Groq | Ollama | Cloud               │
                          │                                      │
                          │  packages/cloud-routing/src/         │
                          │    resolve.ts                        │
                          │  local-key (wins) → cloud-proxy →    │
                          │    disabled                          │
                          │                                      │
                          │  Local-only mode UX exists           │
                          │  Hybrid mode (local LLM +            │
                          │    cloud RPC) partial                │
                          │                                      │
                          │  ⚠ Main agent local-only model       │
                          │    not supported (only sub-agent     │
                          │    via PARALLAX_OPENCODE_LOCAL)      │
                          └──────────────────────────────────────┘
                                               │
                                               └──── back to AGENT TURN
```

---

## 2. Subsystem summary

### 2.1 Trajectory capture
- **Service.** `packages/core/src/features/trajectories/TrajectoriesService.ts` writes
  to `trajectories` + `trajectory_step_index`. Both stored as JSONB with full nested
  step hierarchy (LLM calls, provider accesses, action results).
- **High fidelity.** LLM calls capture prompt, completion, reasoning, tokens,
  latency, cache stats, model metadata, temperature.
- **Medium fidelity.** Provider access (`enabled_skills`, etc.) — name, purpose,
  input/output as unstructured blobs.
- **Partial.** Action execution lifecycle is logged but inputs/outputs are not.
  Skill invocations are listed by name only.
- **Sub-agent.** Claude Code / Codex / OpenCode / Pi / Aider / Shell — all capture
  **stdout only**. No reasoning blocks, no tool-call structure, no token usage.
  Parent-child link is via `MILADY_PARENT_TRAJECTORY_STEP_ID` env var; the
  sub-agent's own trajectory file is *separate*, not merged into the parent.
- **Eval signals captured.** `reward_components_json`
  (environmentReward / userReward / custom), `status`, `metrics.finalStatus`,
  cache stats. No user feedback/rating field. AI-judge fields exist in schema but
  are never written.
- **Opt-out.** `ELIZA_DISABLE_TRAJECTORY_LOGGING=1`. Also silently disabled by
  `NODE_ENV=test` and by use of the in-memory adapter.

### 2.2 Privacy filter
Two distinct things named "privacy" live in the repo:

1. **Account privacy levels.** `packages/core/src/connectors/privacy.ts`. Defines
   privacy levels for account data display. **Not** a trajectory redactor.

2. **Trajectory anonymizer.** `eliza/plugins/app-training/src/core/privacy-filter.ts`.
   Anonymizes `(platform, handle)` pairs to opaque entity IDs, drops trajectories
   marked `privacy: "private"`, redacts `sk-*` and `Bearer *` and env-var-style
   secrets and GitHub/AWS tokens, strips geo to `[REDACTED_GEO]`. **Mandatory** on
   the nightly export cron and the on-demand training trigger.

   It is **not** invoked on the trajectory write path itself (so the DB stores raw
   PII), and there is no evidence it is applied inside
   `eliza/packages/training/scripts/format_for_training.py`. Verification on every
   write/export path is incomplete.

### 2.3 Prompt optimization
- **Service.** `packages/core/src/services/optimized-prompt.ts`
  (`OptimizedPromptService`). Loads JSON artifacts from
  `~/.eliza/optimized-prompts/<task>/` at boot, exposes a runtime cache.
- **Backends.**
  - **Native** — real implementations of MIPRO-style instruction-search,
    GEPA-style prompt-evolution, and bootstrap-fewshot. Runs in-process. Dispatches
    JSONL trajectory data, writes JSON artifacts.
  - **Atropos** — **zero references** in the repo. Documented in `CLAUDE.md` and
    referenced via `ATROPOS_BIN` / `ATROPOS_DATA_DIR` env vars, but no integration
    code exists. LARP.
  - **Tinker** — stub. Cloud-API surface only, untested.
- **Tasks optimized.** Five hard-coded tasks: `should_respond`, `context_routing`,
  `action_planner`, `response`, `media_description`. **Only `action_planner` is
  injected into the runtime loop today.** The other four artifacts are written
  but never consumed.
- **Trigger.** `TrainingTriggerService` — 100 trajectories per task with 12h
  cooldown. Configurable via `/api/training/auto/config` and the Settings →
  Auto-Training UI.
- **Scoring.** Token-overlap agreement (Jaccard similarity) plus special-token
  extraction for planner. ~24× model calls per instruction-search run. No token
  budget cap.
- **Promotion.** None. Artifacts are written directly. No A/B against baseline,
  no rollback path, no version pinning. Hardcoded baselines.

### 2.4 Synthetic trajectory generation
Two tracks today:

1. **Rule-based synthesis** (~90% of output). Domain-specific scripts
   (`synthesize_action_pairs.py`, `synthesize_core_prompts.py`, etc.) generate
   ~50k+ records from hardcoded scenario pools and prompt registries.
   Deterministic; no LLM during synthesis.

2. **Simulation-driven synthesis**.
   - `eliza/packages/training/scripts/synth/drive_eliza.py` (232 lines) posts
     scenarios to a running eliza benchmark server and captures the full agent
     trajectory.
   - `eliza/packages/training/scripts/synth/together_synth.py` (170 lines) calls
     Together API (Qwen 235B) with static TOON prompts — single-turn, no agent
     orchestration.

**Missing.** No multi-turn projects, no adaptive (failure-driven) loop, no
sub-agent spawning during synth, no LLM judge filtering synth output before it
hits the training set, no benchmark-driven coverage steering.

### 2.5 Benchmarks + evaluation
- **Registry.** `eliza/packages/benchmarks/registry.py` lists 32+ benchmarks
  with command builders, result locators, score extractors.
- **Real and runnable.** GAIA, REALM-Bench, SWE-bench, Terminal-Bench, LifeOps,
  BFCL, Mint, AgentBench, Context-Bench, Solana, OSWorld, Hyperliquid, RLM-Bench,
  Vending-Bench, Webshop, OpenClaw, Social-Alpha.
- **Bridge.** Python benchmarks evaluate against the running agent through
  `eliza/packages/app-core/src/benchmark/server.ts` HTTP bridge (1,200+ LOC).
- **Standard LLM benchmarks.** No MMLU, HumanEval, GSM8K, ARC, HellaSwag,
  TruthfulQA, or BIG-bench. Only SWE-bench from the academic set.
- **Comparison harness.** None. Each benchmark runs in isolation. Results land
  as JSON in `benchmarks/benchmark_results/` and `artifacts/`. No trending DB.
- **CI gating.** Only LifeOps. Everything else is manual dispatch.
- **Trajectory replay.** Only LifeOps replays ground-truth trajectories.
- **Action benchmarks.** `eliza/packages/app-core/src/benchmark/` runs the
  action planner against a curated task set. Cerebras runs are evident in
  `eliza/artifacts/cerebras-action-benchmark-*`.

### 2.6 Sub-agent reasoning capture
Coverage matrix:

| Sub-agent   | Capture     | Loss                                                     |
|-------------|-------------|----------------------------------------------------------|
| Claude Code | stdout      | `.claude/session-logs/` JSON never read; reasoning lost  |
| Codex       | stdout      | Approval decisions not logged; reasoning_content lost    |
| OpenCode    | stdout      | Open-source; could stream JSON, but parser not present   |
| Gemini      | stdout      | `.gemini/` config not introspected                       |
| Pi          | stdout      | Anthropic cache metadata lost                            |
| Aider       | stdout      | Diff blocks not extracted                                |
| Shell       | stdout      | Exit codes captured; command audit unstructured          |

- PTY service at `eliza/plugins/plugin-agent-orchestrator/src/services/pty-service.ts`
  injects `PARALLAX_SESSION_ID` + `MILADY_PARENT_TRAJECTORY_STEP_ID` envs and
  captures stdout/stderr.
- `DECISION:` channel is parsed via regex
  (`eliza/plugins/plugin-agent-orchestrator/src/services/trajectory-feedback.ts`)
  but depends on agent compliance — pure LARP.
- Bridge HTTP endpoints `/api/coding-agents/<sessionId>/{parent-context,memory,
  active-workspaces}` are **read-only**: sub-agent pulls context, parent does
  not push state.
- Workspace logs (`~/.milady/workspaces/<sessionId>/.claude/session-logs/`) are
  **written by the sub-agent and never read by the parent**. This is the
  single biggest capture gap.

### 2.7 Training pipeline (Vast.ai)
- **SFT.** `eliza/packages/training/scripts/training/train_local.py` — TRL
  `SFTTrainer` + APOLLO optimizer. Full-parameter fine-tune (not LoRA). Liger
  fused kernels. Optional TE FP8. Selective activation checkpointing.
- **Model registry.** `eliza/packages/training/model_registry.py` defines
  `qwen3.5-2b`, `qwen3.5-9b`, `qwen3.6-27b`.
- **DPO.** `train_dpo.py` — preference pairs from synthesized corruptions.
  Working, tested. 2B: 10min, 9B: 5h, 27B: 12h.
- **GRPO.** `train_grpo_verl.sh` — verl + vLLM rollout servers. Working but
  **not integrated into the Vast.ai launcher** — must provision separately.
- **Launcher.** `eliza/packages/training/scripts/train_vast.sh` (600+ LOC):
  provision → sync → run → pull-checkpoints → teardown. Bouncer SSH proxy
  preferred, port-mapped fallback. Idempotent. `FORCE_REPROVISION=1` override.
- **Offer selection.** `eliza/packages/training/lib/vast.py` picks cheapest
  `$/hr` offer. Default 2B/9B target = blackwell6000-1x (96 GB). 27B target =
  b200-2x (~366 GB dual GPU + FSDP).
- **Preflight gate.** Requires `.preflight.ok` timestamp < 1h (lock, pytest,
  schema, memory, smoke, CUDA checks).
- **HF bootstrap.** Optional `--bootstrap hf` flag skips local rsync, downloads
  base + data from HuggingFace.

### 2.8 HuggingFace integration
- **Download.** 4 hardcoded eliza-1 models from `elizalabs/*` repos with SHA256
  validation. Stored in `~/.eliza/local-inference/`.
- **Upload.** `eliza/packages/training/scripts/push_model_to_hf.py` and
  `push_dataset_to_hf.py`. Privacy filter mandatory on the dataset path.
- **No release automation.** No code promotes a candidate to `latest`. No
  version scheme. No semver tagging. No release notes. The "publish improved
  to eliza-1 repo" loop is **not wired** beyond the upload scripts.

### 2.9 Cloud serving
- **Template.** `eliza/cloud/scripts/vast/upsert-template.ts` defines a llama-server
  (OpenAI-compatible) template. Port 8080. Untested in production.
- **Worker.** `eliza/packages/training/scripts/vast-pyworker/worker.py` runs
  llama.cpp serverless behind a Q6_K GGUF from `elizalabs/eliza-1-27b-fp8`.
- **vLLM dual runtime** supported via manifest, but unused in default path.
- **Speculative decoding** supported by template (DFLASH drafter) but not
  integrated at runtime.
- **Eliza Cloud routing.** `packages/cloud-routing/src/resolve.ts` resolves
  per-service: `local-key` (wins) → `cloud-proxy` → `disabled`. Hybrid mode is
  partial — RPC routing is global, not per-call.

### 2.10 Local inference
- **Ollama.** `eliza/plugins/plugin-ollama/` — full plugin, auto-enables when
  `OLLAMA_BASE_URL` is set.
- **LM Studio.** Env-only via `PARALLAX_OPENCODE_BASE_URL`, no plugin.
- **llama.cpp mobile.** FFI via bun. HuggingFace download wiring exists.
- **MLX.** Referenced in docs/config but no plugin implementation.
- **Auto-download.** `auto-download-recommended.ts` selects per hardware; logic
  exists but is not exercised end-to-end.
- **Provider switch.** `eliza/packages/agent/src/api/provider-switch-config.ts`
  handles Anthropic / OpenAI / Google / Groq / Ollama / Cloud routing. OS-keychain
  storage for API keys. Env vars cleared on switch.
- **Local-only mode UX.** Provider dropdown + "Use local only" button in the
  Settings UI. Modes: `local`, `local-only`, `cloud`, `remote`.

### 2.11 End-to-end training loop (the prompt-optim loop, fully working)
1. Action executes → trajectory recorded
2. `TrainingTriggerService` increments per-task counter
3. Threshold + cooldown check → `triggerTraining()`
4. Privacy filter applied (mandatory)
5. Trajectories bucketized to per-task JSONL
6. Native backend optimizer runs (MIPRO / GEPA / bootstrap-fewshot)
7. JSON artifact written to `~/.eliza/optimized-prompts/<task>/`
8. `OptimizedPromptService` picks up on next boot (or hot reload)
9. **Only the `action_planner` artifact is read by the runtime**

### 2.12 End-to-end model loop (not fully wired)
1. Trajectories accumulate → nightly export cron at 03:00 writes per-day JSONL
2. (Manual) `bash train_vast.sh provision-and-train --registry-key qwen3.5-9b`
3. Vast.ai provisioned, code+data sync'd, training runs
4. Checkpoints saved on remote
5. (Manual) `bash train_vast.sh pull-checkpoints --latest-only`
6. (Manual) evaluation — but **no unified benchmark harness**
7. (Manual) `push_model_to_hf.py` to publish
8. (Manual) update `~/.eliza/local-inference/` registry to point at new GGUF
9. **No automated promotion gate, no comparison vs current best, no release notes.**

---

## 3. Implementation status table

| Subsystem                              | Status        | Notes                                            |
|----------------------------------------|---------------|--------------------------------------------------|
| Trajectory recording (native LLM)      | working       | Rich capture                                     |
| Trajectory recording (provider gather) | partial       | Unstructured I/O                                 |
| Trajectory recording (action exec)     | partial       | Lifecycle only, no I/O                           |
| Trajectory recording (skills)          | partial       | Names only                                       |
| Trajectory recording (sub-agents)      | stdout-only   | Reasoning + tool structure lost                  |
| Privacy filter (export)                | working       | Mandatory                                        |
| Privacy filter (write-time)            | missing       | Raw PII in DB                                    |
| Privacy filter (training format step)  | unverified    | No proof it runs on `format_for_training.py`     |
| Prompt optim — native (MIPRO/GEPA/BS)  | working       | Real implementations                             |
| Prompt optim — atropos                 | LARP          | 0 references in code                             |
| Prompt optim — tinker                  | stub          | Cloud surface only                               |
| Prompt optim — runtime injection       | partial       | Only `action_planner` consumed                   |
| Prompt optim — A/B + promote           | missing       | No gate                                          |
| TrainingTriggerService                 | working       | 100/task, 12h cooldown                           |
| Auto-Training UI + API                 | working       | `/api/training/auto/*`                           |
| Nightly export cron 03:00              | working       | Per-day JSONL                                    |
| Synth — rule-based                     | working       | ~50k records                                     |
| Synth — drive_eliza.py                 | working       | Records real agent trajectories                  |
| Synth — together_synth.py              | working       | Single-turn only                                 |
| Synth — multi-turn projects            | missing       | One-shot only today                              |
| Synth — adaptive (failure-driven)      | missing       | No feedback loop                                 |
| Synth — LLM judge filter               | missing       | Reward fn exists but only post-hoc              |
| Synth — sub-agent spawning             | missing       | Single-LLM-call only                             |
| Benchmarks — internal (32+)            | working       | All runnable                                     |
| Benchmarks — MMLU/HumanEval/GSM8K      | missing       | None integrated                                  |
| Benchmark harness (unified)            | missing       | Per-benchmark isolation                          |
| Benchmark trending DB                  | missing       | JSON files only                                  |
| Benchmark CI gating                    | partial       | LifeOps only                                     |
| Trajectory replay benchmarks           | partial       | LifeOps only                                     |
| SFT pipeline (TRL+APOLLO)              | working       | 2B / 9B / 27B                                    |
| DPO pipeline                           | working       | All sizes tested                                 |
| GRPO pipeline                          | partial       | Works but not in Vast launcher                   |
| Vast.ai provision/run/pull/teardown    | working       | Idempotent, programmatic                         |
| Vast.ai budget enforcement             | missing       | No cost surfaced                                 |
| Preflight gate                         | working       | 6 checks                                         |
| CheckpointSyncAgent (eval gating)      | missing       | Referenced, not present                          |
| HF download (4 hardcoded eliza-1)      | working       | SHA256 validated                                 |
| HF upload (model)                      | working       | Manual                                           |
| HF upload (dataset)                    | working       | Privacy-filtered                                 |
| HF release automation (promote/tag)    | missing       | No version scheme                                |
| Vast.ai serving (llama.cpp template)   | untested      | Template only                                    |
| Vast.ai serving (vLLM)                 | template-only | Manifest support, not used                       |
| Speculative decoding                   | template-only | DFLASH supported, not enabled                    |
| Cloud routing / hybrid mode            | partial       | RPC routing is global                            |
| Ollama plugin                          | working       | Auto-enables                                     |
| LM Studio                              | env-only      | No plugin                                        |
| llama.cpp mobile FFI                   | working       | Bun FFI + HF download                            |
| MLX (Apple Silicon)                    | missing       | Doc references only                              |
| Auto-download (per hardware)           | untested e2e  | Logic exists                                     |
| Main agent local-only model            | missing       | Only sub-agent local supported                   |
| Provider switcher                      | working       | 6 providers, keychain                            |
| Settings local-only UX                 | working       | Dropdown + button                                |

---

## 4. Top-of-mind orienting facts

- The **prompt optimization** loop is the closest thing to closed today, but only
  one of five tasks is actually being used at runtime.
- The **model training** loop is mechanically complete (Vast.ai + TRL + DPO) but
  the **promotion / eval / publish** legs are not glued together.
- **Sub-agent capture is the single largest data-quality gap** — Eliza-1 training
  on agent reasoning needs structured traces, and today we get stdout only.
- **No standard LLM benchmarks** means we can't track Eliza-1 progress against
  the public state-of-the-art.
- **Atropos is documented but does not exist in code.** Either remove the
  reference or build it.
- The local-inference UX exists but the **main agent's planner/action model is
  not yet routable to a local model** — only sub-agents are.

Continue to [02-gap-analysis.md](02-gap-analysis.md) for the ranked weakness inventory.
