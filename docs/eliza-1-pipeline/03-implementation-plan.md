# Eliza-1 Pipeline — Swarm Implementation Plan

Designed to be executed by a swarm of AI agents (Claude Code / Codex / OpenCode)
dispatched in waves. Each job is self-contained: a sub-agent should be able to
read just that job spec and the cited research notes ([01](01-current-state.md),
[02](02-gap-analysis.md)) and execute.

**Cross-cutting rules for every job**
1. Adhere to AGENTS.md architecture commandments (especially CQRS, no fallback
   sludge, strong typing, no `any`).
2. Every new feature lands behind a feature flag if it can break production.
3. Privacy filter coverage is a tripwire — any new dataset writer MUST call
   `applyPrivacyFilter()` and be unit-tested for that.
4. Every new public function gets a unit test; every new endpoint gets an
   integration test; every cross-subsystem change gets an e2e test.
5. No new hardcoded model names, no new hardcoded `task` names; both must come
   from a registry. See A4, A8 in [gap analysis](02-gap-analysis.md).

**Job ID convention.** `WX-{S}{n}` where X is wave number, S is the subsystem
prefix:

- `T` trajectories
- `P` prompt optimization
- `D` training / vast.ai
- `B` benchmarks
- `H` HF / publish
- `S` synth
- `I` inference / serving / local
- `R` runtime / routing
- `X` cross-cutting

---

## Wave 0 — Preliminary (alignment + scaffolding)

**Goal.** Lock contracts and remove LARP before parallel build. Low parallelism
(decisions matter), ~5 agent jobs.

**Exit criteria.**
- All hardcoded LARP references removed or planned for build.
- Promotion contract, eval-suite definition, and version scheme decided.
- Empty scaffolds for new services exist in the codebase with stub tests
  passing.
- Build wave can fan out to 25+ agents without coordination collisions.

### W0-X1 Decide contracts + version scheme — Plan agent
**Scope.** Resolves architectural concerns A1–A8.
**Deliverables.** A `docs/eliza-1-pipeline/04-contracts.md` doc:
- Training format versioning — commit to `eliza_native_v1` or schedule a v2
- Model promotion lifecycle: `developing → candidate → stable → retired`
- HF branches: `main` (latest), `candidate` (pending eval), `stable` (prod)
- Eval suite definition: which benchmarks gate promotion + minimum scores
- Cost-tracking schema: `(provider, model, in_tok, out_tok, $/call, ts)`
- Standard model-id registry shape

**Dependencies.** None.
**Exit.** Doc reviewed, contract diagrams in place. No code yet.

### W0-X2 Delete Nebius dead code — code agent [CLOSED]
**Status.** Both portions closed. C2 (atropos) closed first; M37 (Nebius)
closed in `chore/training-remove-nebius`. The deprecated upstream Nebius
fallback — scripts, env vars, README snippets, and registry entries — was
removed wholesale from the active codebase. No consumer broke; the path
was already dead.
**Exit.** `rg -i nebius` returns zero hits in the active codebase.

### W0-X3 Promotion registry schema + empty service — code agent
**Scope.** Scaffolds C3, M2, M20.
**Files.**
- New file `eliza/plugins/app-training/src/services/promotion-service.ts`.
- New SQLite (or postgres) table `model_scores` with `(model_id, benchmark,
  score, dataset_version, code_commit, ts)`.
- New `model_versions` table with the lifecycle states.

**Deliverables.** Empty service + migration + unit tests proving the schema
roundtrips. No real promotion logic yet (that's W1-H1).
**Dependencies.** W0-X1.
**Exit.** Migration green; service registers in DI container; tests pass.

### W0-X4 Sub-agent capture decision + memo — Plan agent
**Scope.** Locks C1 approach.
**Deliverables.** Append to `04-contracts.md`: chosen capture strategy (A:
post-session session-log read; B: PTY-level TOOL_CALL: protocol; C: native
telemetry; D: structured DECISION protocol). Default recommendation: A for
Claude Code + Codex (most reliable, no upstream coordination); D layered for
OpenCode + Pi where we can dictate.
**Dependencies.** None.
**Exit.** Decision logged.

### W0-X5 Bench trending DB scaffolding — code agent
**Scope.** Scaffolds M2.
**Files.**
- New file `eliza/packages/benchmarks/lib/results_store.py` (or TS equivalent).
- New table `benchmark_runs (model_id, benchmark, score, ts, dataset_ver, code_commit, raw_json)`.
- Tiny API at `/api/training/benchmarks/scores` for read.

**Deliverables.** Empty store + roundtrip tests. No data written yet.
**Dependencies.** W0-X1.
**Exit.** Schema migration, store unit-tested.

---

## Wave 1 — Build (max parallelism, ~25–30 agent jobs)

**Goal.** Close every CRITICAL gap and the high-value MAJOR gaps. Run all jobs
in parallel where dependencies permit.

**Exit criteria.**
- All C-tagged gaps from [02](02-gap-analysis.md) addressed in code (tests
  may still be in W2).
- Half of the M-tagged gaps addressed.
- Promotion path can execute end-to-end *if* manually scored.

### Trajectory & capture (T)

### W1-T1 Read Claude Code session logs post-session — code agent
**Scope.** C1.
**Files.**
- `eliza/plugins/plugin-agent-orchestrator/src/services/pty-service.ts`
- New `eliza/plugins/plugin-agent-orchestrator/src/services/session-log-reader.ts`
- `eliza/packages/agent/src/runtime/trajectory-storage.ts`
- `eliza/plugins/plugin-agent-orchestrator/src/services/spawn-trajectory.ts`

**Approach.**
1. On `task_complete` event, locate `~/.milady/workspaces/<sessionId>/.claude/session-logs/`.
2. Parse each file (JSONL of message + tool blocks).
3. Normalize to the parent's trajectory step shape: per tool call → step,
   per reasoning block → reasoning sub-step.
4. Append as child steps to the parent step pointed to by
   `MILADY_PARENT_TRAJECTORY_STEP_ID`.
5. Privacy-filter before merging.

**Deliverables.** New module + integration test that spawns Claude Code in a
fixture workspace, completes a task, asserts merged trajectory has reasoning
blocks and tool calls. End-to-end runs nightly.
**Dependencies.** W0-X4.
**Exit.** Trajectory viewer renders child steps; benchmark sample shows
tool-call structure preserved.

### W1-T2 Codex `--output-last-message` + reasoning capture — code agent
**Scope.** C1 for Codex.
**Files.** Same as W1-T1, plus a Codex-specific parser.
**Approach.** Codex CLI emits the final message to a path. If using
`codex exec`, additionally capture the stream-events file. Normalize to the
trajectory shape.
**Deliverables.** Parser + tests with recorded Codex fixtures.
**Dependencies.** W0-X4.
**Exit.** Codex sessions produce structured trajectory.

### W1-T3 OpenCode JSON streaming capture — code agent
**Scope.** C1 for OpenCode.
**Approach.** OpenCode supports streaming JSON via flag. Enable it, parse
incrementally, write per-event into a temp JSONL during the session, merge
to trajectory on completion.
**Deliverables.** Streaming reader, fixture test.
**Dependencies.** W0-X4.
**Exit.** OpenCode trajectories show step-level detail.

### W1-T4 Capture action exec inputs/outputs — code agent
**Scope.** M12, A1.
**Files.**
- `eliza/packages/core/src/runtime/trajectory-recorder.ts`
- Action runtime invocation seam.

**Approach.** Add `input`, `output`, `error` to the action step. Cap each at
N bytes with a structured `truncated: true` marker.
**Deliverables.** Schema change + recorder + unit tests asserting cap behavior.
**Dependencies.** None.
**Exit.** New columns populated; sample trajectory shows action I/O.

### W1-T5 Capture skill invocations — code agent
**Scope.** M13.
**Approach.** Same shape as W1-T4 but at the skill seam. Per-skill record
includes input args, output result, duration.
**Dependencies.** None.
**Exit.** Per-skill step type renders in viewer.

### W1-T6 Evaluator step type — code agent
**Scope.** M14.
**Approach.** New `StepType.EVALUATOR` + evaluator name field. Evaluator
runtime hook emits this step.
**Dependencies.** None.
**Exit.** Evaluators distinguished from action LLM calls.

### W1-T7 Trajectory search — code agent
**Scope.** M16.
**Approach.** Postgres full-text index on `prompt`, `completion`, `action_name`.
Wire `TrajectoryListOptions.search` to it.
**Dependencies.** None.
**Exit.** UI search returns results.

### W1-T8 User feedback field + UI hook — code agent
**Scope.** M17.
**Approach.** New `user_feedback` JSONB column. Connect existing thumbs UI (or
add minimal one) to write into it.
**Dependencies.** None.
**Exit.** Per-trajectory rating recorded; surfaced in viewer.

### W1-T9 Move trajectory steps to dedicated table — code agent
**Scope.** M41, M42.
**Approach.** Migration: extract `steps` JSONB into `trajectory_steps` rows.
Read path paginates. Backfill job. Drop the 4096 cap on `script`.
**Dependencies.** None.
**Exit.** Existing trajectories unchanged from caller's view; reads paginated.

### W1-T10 Sub-agent cost + model tracking — code agent
**Scope.** M30.
**Approach.** After W1-T1/T2/T3 land, extract model + token usage from the
parsed session logs and surface as trajectory step metadata.
**Dependencies.** W1-T1, W1-T2, W1-T3.
**Exit.** Per-sub-agent cost rolled up.

### W1-T11 Privacy filter in format_for_training.py — code agent
**Scope.** C9.
**Files.**
- `eliza/packages/training/scripts/format_for_training.py`
- `eliza/plugins/app-training/src/core/privacy-filter.ts` (port logic if needed)

**Decision.** Raw PII in the trajectory DB is intentional — it's the user's
data on their machine. Redaction applies *only* on the outbound path. So no
write-time hook; just enforce filtering at the training-format step.

**Approach.**
1. Port (or wrap) the TS privacy filter for Python use in `format_for_training.py`.
2. Make filter mandatory; fail the run if it's bypassed.
3. Unit test: no `sk-*`, `Bearer `, GitHub PAT prefixes, AWS access keys,
   geo coords land in output JSONL.

**Dependencies.** None.
**Exit.** Tests prove no PII patterns in formatted output.

### Prompt optimization (P)

### W1-P1 Wire optimized prompts for the remaining 4 tasks — code agent
**Scope.** C4.
**Approach.** For each of `should_respond`, `context_routing`, `response`,
`media_description`:
1. Find the call site that builds the prompt.
2. Look up the artifact via `OptimizedPromptService`.
3. Substitute the instruction prefix and (optionally) the few-shot examples.
4. Add a feature flag `OPTIMIZED_PROMPT_DISABLE` per task for emergency revert.

**Deliverables.** Each task wired + a per-task unit test that asserts the
artifact is read when present and bypassed when absent.
**Dependencies.** None.
**Exit.** All 5 task artifacts have a consumer.

### W1-P2 A/B promotion gate for prompts — code agent
**Scope.** M3.
**Approach.** Before writing an artifact as `current`, run candidate vs
incumbent on a held-out trajectory replay set, score both. Promote only on
improvement above noise threshold.
**Dependencies.** W0-X3.
**Exit.** Promotion rejected on regressions in unit tests.

### W1-P3 Rollback for optimized prompts — code agent
**Scope.** M4.
**Approach.** Symlink-style `current → vN`, `previous → vN-1`. CLI:
`eliza training rollback-prompt <task>`. Stored history of last 5.
**Dependencies.** W1-P2.
**Exit.** Rollback flips, runtime reads previous, next reload uses it.

### W1-P4 Remove tinker backend stub — code agent
**Scope.** M21.
**Approach.** Delete. Document in changelog.
**Dependencies.** None.
**Exit.** Backend selector shows only `native`.

### Training / Vast.ai (D)

### W1-D1 GRPO integration into train_vast.sh — code agent
**Scope.** C8.
**Approach.** Add `--pipeline sft|dpo|grpo`. GRPO branch provisions 8× H200
(b200 fallback), runs verl rollout cluster.
**Files.**
- `eliza/packages/training/scripts/train_vast.sh`
- `eliza/packages/training/lib/vast.py` (GPU SKU selection)

**Dependencies.** None.
**Exit.** Single command spins up GRPO end-to-end and tears down.

### W1-D2 CheckpointSyncAgent + promotion gate — code agent
**Scope.** C3, C7.
**Approach.**
1. After Vast pull-checkpoints, register the candidate in `model_versions`.
2. Run the eval suite (W0-X3 contract).
3. Compare against current `stable` for each gating benchmark.
4. If gates pass → mark `candidate`; if user/CI approves → mark `stable`,
   publish to HF.

**Files.**
- New `eliza/packages/training/lib/promotion.py`
- Cron / CI workflow that runs this.

**Dependencies.** W0-X3, W1-H2, W1-B1.
**Exit.** End-to-end run: trains → evals → produces a `candidate` row.

### W1-D3 Vast.ai budget + cost surfacing — code agent
**Scope.** M9.
**Approach.** `MILADY_VAST_MAX_USD` per-job soft cap; auto-teardown at hard cap.
`train_vast.sh status` shows running cost. Training UI panel.
**Dependencies.** None.
**Exit.** Runs that exceed budget are killed; cost surfaced live.

### W1-D4 Vast.ai serving deploy — code agent
**Scope.** M10.
**Approach.** Deploy the 27B Q6_K GGUF to one Vast.ai instance using the
`upsert-template.ts` script. Wire `/v1/chat/completions` through the
cloud-routing resolver. Document the routing path.
**Dependencies.** Existing template.
**Exit.** A real endpoint URL serves requests through the routing layer;
benchmark suite runnable against it.

### W1-D5 Validate privacy filter inside format_for_training.py — code agent
**Scope.** C9 (training-side).
**Approach.** Covered as part of W1-T11; placeholder for testing only.
**Dependencies.** W1-T11.

### W1-D6 Reduce seq_len default for 27B — code agent
**Scope.** M35.
**Approach.** Default 64k for 27B in `model_registry.py`. Document override.
**Dependencies.** None.
**Exit.** Default reduced; sweep test confirms no regression at smaller seq.

### Benchmarks (B)

### W1-B1 Adapters: MMLU + MMLU-Pro + HumanEval + MBPP + GSM8K + MATH + ARC + HellaSwag + TruthfulQA + MT-Bench — code agent (split into sub-jobs)
**Scope.** C6.
**Approach.** Use existing community runners (lm-eval-harness, BigCodeBench)
where possible. Each adapter wraps the runner and emits results in the registry
shape. New entries in `eliza/packages/benchmarks/registry.py`.
**Files.** New `eliza/packages/benchmarks/standard/` subdirectory.
**Dependencies.** None.
**Exit.** Each benchmark runnable via `python -m benchmarks.run <name>
--model-endpoint <url>`; results stored in W0-X5 store.

### W1-B2 Unified comparison harness — code agent
**Scope.** M1.
**Approach.** `python -m benchmarks.compare --candidate <url-or-id>
--baseline <url-or-id> --suite <suite-name>`. Emits a report.
**Dependencies.** W0-X5, W1-B1.
**Exit.** Side-by-side report for any two endpoints.

### W1-B3 Trending dashboard — code agent
**Scope.** M2.
**Approach.** Read from W0-X5 store. Tiny chart at
`/api/training/benchmarks/trend`. UI panel in Training view.
**Dependencies.** W0-X5.
**Exit.** Time-series chart of any (model, benchmark) pair.

### W1-B4 Trajectory-replay benchmark (cross-suite) — code agent
**Scope.** M5, M12.
**Approach.** Take a fixed set of historical trajectories. Replay each against
candidate model; compare action sequences, final state. Score via
`eliza_reward_fn.py`.
**Dependencies.** None.
**Exit.** Regression-detection signal usable in promotion gate.

### W1-B5 CI gates for SWE-bench + BFCL + Terminal-Bench — code agent
**Scope.** M27.
**Approach.** GitHub Actions workflow that runs the three suites against
the dev branch model endpoint on PRs touching the agent or training code.
**Dependencies.** W1-B1.
**Exit.** Required-check on PRs.

### HF + publish (H)

### W1-H1 PromotionService logic — code agent
**Scope.** C3, M20.
**Approach.** Implements lifecycle transitions in `model_versions` and
performs HF branch updates (`main`, `candidate`, `stable`). Generates release
notes from benchmark deltas.
**Files.** `eliza/plugins/app-training/src/services/promotion-service.ts`
(scaffolded in W0-X3).
**Dependencies.** W0-X3, W1-D2.
**Exit.** `promote --to candidate <model_id>` and `promote --to stable
<model_id>` work; HF reflects the state.

### W1-H2 HF dataset push gated on promotion — code agent
**Scope.** M19.
**Approach.** Move the HF catalog from code into a JSON manifest at
`packages/local-inference/src/registry.json`. Manifest entries get added by
`PromotionService` on `stable` transitions.
**Dependencies.** W1-H1.
**Exit.** New models appear in manifest after promotion; no code change.

### Synth (S)

### W1-S1 Multi-turn project simulator — code agent
**Scope.** M5.
**Approach.** Loop wrapping `drive_eliza.py`. A project = an LLM-authored
multi-step goal. Each turn: agent acts, simulator decides next prompt or
terminates. Record entire session as a single trajectory chain.
**Files.** New `eliza/packages/training/scripts/synth/project_simulator.py`.
**Dependencies.** None.
**Exit.** Sample run produces a 10-turn coding-task trajectory.

### W1-S2 Adaptive (failure-driven) synth — code agent
**Scope.** M6.
**Approach.** Daily job reads recent benchmark failures. LLM author generates
N variations per failure. Drives them through the agent.
**Dependencies.** W1-S1, W0-X5.
**Exit.** Synth tagged as `derived_from: <benchmark_run_id>`.

### W1-S3 LLM-judge filter on synth — code agent
**Scope.** M7.
**Approach.** Wrap `eliza_reward_fn.py` as a pre-training filter. Drop or
flag below threshold.
**Dependencies.** None.
**Exit.** Filter integrated; rejected synth surfaced for review.

### W1-S4 Sub-agent spawning in synth — code agent
**Scope.** M8.
**Approach.** `drive_eliza.py --allow-subagents` lets the agent dispatch to
Codex/Claude Code/OpenCode. After W1-T1/T2/T3 land, those sessions are
captured with rich structure.
**Dependencies.** W1-T1, W1-T2, W1-T3.
**Exit.** Sample synth shows real sub-agent dispatch.

### Inference / serving / local (I)

### W1-I1 LM Studio plugin — code agent
**Scope.** M22.
**Approach.** Mirror `plugin-ollama`. Auto-detect at
`http://localhost:1234/v1/models`.
**Dependencies.** None.
**Exit.** Plugin auto-enables when LM Studio is up.

### W1-I2 MLX plugin (Apple Silicon) — code agent
**Scope.** M23.
**Approach.** `mlx-lm.server` provides OpenAI-compatible endpoint. Plugin
detects + registers. Quantization preference panel.
**Dependencies.** None.
**Exit.** Mac users see MLX option in provider switcher.

### W1-I3 Hardware detection + auto-download e2e — code agent
**Scope.** M25, M26.
**Approach.** Add VRAM/compute capability detection. Map hardware → recommended
quant level. e2e integration test that runs three fixture profiles and asserts
expected model selection.
**Dependencies.** W1-I1, W1-I2 (optional).
**Exit.** Auto-download chooses sensibly across low/mid/high profiles.

### W1-I4 Speculative decoding enable + sweep — code agent
**Scope.** M11.
**Approach.** Configure DFLASH drafter per target. Benchmark tokens/sec gain
on the unified harness.
**Dependencies.** W1-D4, W1-B2.
**Exit.** Spec-decoding default-on if proven gain > 1.5× at no quality cost.

### W1-I5 Cloud-routing per-feature hybrid mode — code agent
**Scope.** M24.
**Approach.** Per-service-per-call routing flag. Wire through resolver.
**Dependencies.** None.
**Exit.** A user can pin "RPC = cloud, LLM = local" or any combination.

### Runtime / routing (R)

### W1-R1 Main-agent local-only routing — code agent
**Scope.** C5.
**Approach.** New flag `localOnlyMain: true`. When set, the runtime's model
selector for planner / action LLM calls must resolve to a local-provider
endpoint (Ollama / LM Studio / MLX / llama.cpp). Cloud calls error out with
an actionable message.
**Files.** `eliza/packages/agent/src/runtime/eliza.ts`, the model-selection
seam, the Settings UX.
**Dependencies.** W1-I1, W1-I2 (optional but improves coverage).
**Exit.** Toggle on Settings → local-only mode results in zero cloud calls in
a recorded session.

### W1-R2 Per-action model routing — code agent
**Scope.** A5.
**Approach.** Action descriptor can request `TEXT_LARGE | TEXT_SMALL | LOCAL`.
Cost-aware fallback table (small first, escalate to large on low confidence).
**Dependencies.** None.
**Exit.** A configured action provably runs on a small/local model.

### W1-X1 Cost annotation on every LLM call — code agent
**Scope.** M40.
**Approach.** Per-provider cost table. Annotate trajectory step with `cost_usd`.
**Dependencies.** None.
**Exit.** Trajectory viewer shows cost; UI rolls up per-session.

---

## Wave 2 — Testing (per-subsystem)

**Goal.** Comprehensive tests for everything built in Wave 1. Highly parallel
(~one agent per built component).

**Exit criteria.**
- Unit / integration / e2e coverage for every W1 deliverable.
- New tests run in CI and gate develop merges.
- Privacy filter has a property-based test that fuzzes PII patterns.

### W2-* test jobs (template)
For each `W1-{S}{n}` job, spawn `W2-{S}{n}-tests`:
- Unit tests for any new function or class.
- Integration test for any new service or endpoint.
- e2e test if the change crosses subsystems (e.g., trajectory → training).
- Snapshot test for any new on-disk artifact format.
- For W1-T11 (privacy filter), add a property-based test using `hypothesis`
  (Python) or `fast-check` (TS) that generates JSONL with random PII and
  asserts no leak.
- For W1-P2 (A/B prompt promotion), add a regression test using historical
  prompt artifacts.
- For W1-D2 (CheckpointSyncAgent), add a contract test asserting the gate
  rejects clearly-regressed candidates.

**Cross-cutting**

### W2-X1 End-to-end loop fixture test — code agent
**Scope.** Wires W1-S1 → W1-D2 → W1-H1.
**Approach.** Fixture mode: tiny model, tiny dataset. Run the full loop in a
single test:
1. Generate 5 multi-turn synth trajectories.
2. Format as training data.
3. Train a 0.5B fixture model.
4. Evaluate against fixture benchmark.
5. Promote candidate.
6. Push to a HF test repo.
7. Load and serve locally.

**Exit.** Single command runs the whole loop under 10 minutes on CPU.

---

## Wave 3 — Validation (end-to-end loop)

**Goal.** Prove the closed loop works on real data with a small real model.
Lower parallelism (some agents wait on training time).

**Exit criteria.**
- A 2B Qwen-based candidate is trained from real trajectories.
- It is evaluated, promoted to `candidate`, published to HF, and served from
  Vast.ai.
- Local users can download and run it.
- No PII leaked at any stage.

### W3-V1 Train Eliza-1-2B from real trajectories — operator + code agent
**Scope.** Validates W1-T*, W1-D1, W1-D2, W1-H1.
**Approach.**
1. Gather all real trajectories since the cutover.
2. Apply W1-T11 privacy filter; spot-audit 100 random rows.
3. Format as `eliza_native_v1`.
4. `bash train_vast.sh provision-and-train --registry-key qwen3.5-2b --epochs 1`
5. Pull checkpoints, run promotion gate.

**Exit.** A candidate model in the registry with eval scores.

### W3-V2 Promotion + HF publish — operator
**Scope.** Validates W1-H1.
**Approach.** `promote --to candidate eliza-1-2b-202605xx`. After eval, if
gates pass, `promote --to stable`. Verify HF branch updates.
**Exit.** A `stable` row, an HF tag, release notes generated.

### W3-V3 Local download + serve — code agent
**Scope.** Validates W1-I3, W1-R1.
**Approach.** On a clean Mac, enable local-only mode. Auto-download triggers,
selects 2B Q6_K. Boot. Run 10 sample chats. Compare to cloud baseline.
**Exit.** Local-only mode works end-to-end; sample chats acceptable.

### W3-V4 Vast.ai serving live — code agent
**Scope.** Validates W1-D4.
**Approach.** Spin up serving, route 100 requests via cloud-routing, verify
billing path, verify auto-shutdown on idle.
**Exit.** Documented endpoint + billing reflected.

### W3-V5 PII audit on shipped HF dataset — code agent (security review)
**Scope.** Validates C9 + W1-T11.
**Approach.** Grep the published dataset for `sk-`, `Bearer `, common PAT
prefixes, `@` followed by domain patterns. Assert zero hits.
**Exit.** Audit report signed off.

---

## Wave 4 — Verification (cross-checks, regression)

**Goal.** Confirm nothing regressed and the system behaves correctly under
adversarial conditions. Parallel.

**Exit criteria.**
- Full benchmark suite passes on the new model with no regression vs
  baseline.
- All five optimized-prompt artifacts are consumed at runtime.
- Replay benchmarks confirm no drop on historical trajectories.

### W4-V1 Full benchmark suite vs baseline — code agent
**Scope.** Verifies C6, M1, M2.
**Approach.** Use W1-B2 to compare `eliza-1-2b-v1` (baseline) vs
`eliza-1-2b-v2` (candidate) across all 32 internal + 10 standard benchmarks.
Look for any drop > noise threshold.
**Exit.** Comparison report.

### W4-V2 Optimized prompt consumption audit — code agent
**Scope.** Verifies C4, W1-P1.
**Approach.** Instrument each task call site to count "optimized vs default".
Run a sample session; assert all 5 tasks produced optimized-load events.
**Exit.** Audit log shows all 5 used.

### W4-V3 Trajectory replay regression — code agent
**Scope.** Verifies M12, W1-B4.
**Approach.** Replay 1000 historical trajectories against the new candidate
model. Compare action sequences. Flag divergences.
**Exit.** Report of any drift > X%.

### W4-V4 Security review of merged trajectories — code agent (security-review skill)
**Scope.** Verifies A7.
**Approach.** Sample 100 merged parent+child trajectories. Check for
operational metadata leakage (session IDs, workspace paths, etc.) in the
training-formatted output.
**Exit.** Cleanup rules added if needed; audit signed off.

### W4-V5 Cost regression — code agent
**Scope.** Verifies W1-X1, M40.
**Approach.** Confirm aggregate cost-per-task on the new model is within
expected bounds vs prior runs.
**Exit.** Cost report.

---

## Wave 5 — Iteration (close W2–W4 findings)

**Goal.** Fix what testing and verification surfaced. Parallel per finding.

**Exit criteria.**
- All P0/P1 findings from Waves 2–4 closed.
- P2 findings tracked.

### W5-I* — open per finding
Each finding gets a job with the same shape as W1 jobs (scope, files,
deliverables, exit). Naming pattern:
`W5-I-<source-job>-<short-desc>`, e.g., `W5-I-T1-empty-session-log-handling`.

---

## Wave 6 — Optimization (perf, cost, quality)

**Goal.** Make the closed loop fast, cheap, and high-quality. Parallel.

**Exit criteria.**
- Inference cost/throughput improved by X% (defined per job).
- Training cost reduced by Y% per token.
- Model quality on the gating suite improved by Z points.

### W6-O1 KV cache + prompt caching across providers — code agent
**Scope.** Generic perf.
**Approach.** Enable prompt caching on Anthropic (already supported), enable
KV reuse in vLLM if used. Surface cache hit ratio in trajectory.
**Exit.** Documented hit ratio gains.

### W6-O2 vLLM in production serving path — code agent
**Scope.** Move from llama.cpp default to vLLM where it's a win.
**Approach.** Benchmark llama.cpp Q6 vs vLLM AWQ on representative load.
Switch default if vLLM wins on tokens/sec/$.
**Exit.** Decision documented; default switched if appropriate.

### W6-O3 Quantization sweep for local — code agent
**Scope.** Optimal quant per hardware class.
**Approach.** Q4 / Q5 / Q6 / Q8 / FP16 across hardware bins. Score quality vs
size vs speed. Default selection per bin.
**Exit.** Updated `auto-download-recommended.ts` defaults.

### W6-O4 Spec-decoding tuning — code agent
**Scope.** Drafter model + acceptance threshold tuning.
**Approach.** Continuation of W1-I4. Sweep drafter sizes.
**Exit.** New defaults baked in.

### W6-O5 Batching in cloud serving — code agent
**Scope.** Increase throughput on shared Vast instance.
**Approach.** Continuous batching in vLLM or llama.cpp Server.
**Exit.** Documented req/sec gain.

### W6-O6 Multi-judge ensemble for synth filter — code agent
**Scope.** M7 follow-up.
**Approach.** Use multiple LLM judges; require quorum to keep a synth.
**Exit.** Improved synth quality measurable on downstream eval.

### W6-O7 Train/val/test discipline — code agent
**Scope.** Statistical hygiene.
**Approach.** Fixed dataset split. No bleed between RL rollouts and eval.
**Exit.** Splits versioned and frozen per release.

### W6-O8 GRPO + tool-use reward shaping — code agent
**Scope.** Improve agentic reasoning.
**Approach.** Reward function tweaks for multi-step tool use; penalize
unnecessary calls.
**Exit.** Measurable agent benchmark improvements.

---

## Cross-wave: ownership and dispatch

**Recommended swarm composition**

| Wave | Concurrent agents | Mix                                                |
|------|-------------------|----------------------------------------------------|
| W0   | 3–5               | 1 Plan, 2–4 code                                   |
| W1   | 20–30             | All code agents (Claude Code preferred for repo edits) |
| W2   | 20–30             | All code agents; some general-purpose for fuzzing  |
| W3   | 5–8               | Operator + code agents (slow loops)                |
| W4   | 8–12              | Code agents + security-review                      |
| W5   | as needed         | Code agents                                        |
| W6   | 8–10              | Code agents                                        |

**Dispatch strategy**

- Each job spec above is self-contained — paste it as the initial prompt to a
  spawned coding agent.
- Use the orchestrator's worktree isolation
  (`isolation: "worktree"`) for any job that touches more than ~3 files.
- Per AGENTS.md commit rules: every agent commits to its own branch, pushes,
  opens a PR.
- The swarm coordinator merges only after the W2 test job for that build
  has passed.

**Sequencing rules**
- W0 must complete before W1 starts.
- W1 jobs may run in any order but the marked dependencies must respect order.
- W2 tests can start as soon as the corresponding W1 job opens its PR.
- W3 cannot start until W2 is green.
- W4 cannot start until W3 is green.
- W5 fires per finding as soon as it surfaces.
- W6 runs continuously after W3.

**Continuous obligations during the wave run**
- Every PR must include: design note (1 short paragraph), test evidence,
  benchmark delta if the change affects a model-touching path.
- Every PR must update `01-current-state.md` and `02-gap-analysis.md` if it
  closes a tracked gap. Use the gap ID (e.g., "Closes C1, M30").
- Privacy filter coverage is a release blocker. No exceptions.

---

## What "done" looks like

The end-to-end loop runs untouched for a week with these results:

1. Real user trajectories captured with full sub-agent reasoning, no PII.
2. Auto-trigger fires per task; optimized prompt artifacts written; all 5
   consumed at runtime.
3. Nightly synth produces new multi-turn project trajectories tagged with
   failure derivation where applicable.
4. Weekly training job provisions Vast.ai, trains a candidate, evaluates,
   promotes if better, publishes to HF.
5. Auto-download serves the latest stable model to local users matched to
   their hardware.
6. Trending dashboard shows monotonic improvement on the gating benchmark
   suite plus a stable or improving curve on MMLU/HumanEval/GSM8K.
7. Cost dashboard shows training and serving costs both within budget caps.

When that's true, Eliza-1 is real, the loop is closed, and the next wave is
quality-of-life polish, not survival work.
