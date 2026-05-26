# Eliza-1 Pipeline — Gap Analysis

Companion to [01-current-state.md](01-current-state.md). Lists every weakness
identified during research, ranked by severity. The implementation plan
[03-implementation-plan.md](03-implementation-plan.md) prioritizes from this list.

Severity scale:

- **CRITICAL** — blocks the end-to-end loop or produces silently-wrong data.
- **MAJOR** — functional but inadequate; output quality degraded or workflow
  requires manual glue.
- **MINOR** — polish, tuning, robustness.

Status taxonomy:

- **missing** — feature does not exist.
- **stub / LARP** — code or docs reference it but it does nothing real.
- **partial** — feature exists but incomplete or only covers some cases.
- **hardcoded** — works but values bake assumptions.
- **untested** — code exists, no evidence it has run end-to-end.

---

## 0. Landings progress — Wave 1

Branches pushed and ready for merge / cherry-pick. None merged into `develop` yet.

### Critical gaps closed

| Gap | Job   | Branch                                                  |
|-----|-------|---------------------------------------------------------|
| C1 Claude  | W1-T1 | `feat/orchestrator-claude-code-trajectory-merge`        |
| C1 Codex   | W1-T2 | `feat/orchestrator-codex-trajectory-merge`              |
| C2  | W0-X2 | `chore/training-remove-atropos`                         |
| C6 (partial 4/10) | W1-B1 | `feat/benchmarks-standard-llm-adapters`       |
| C8  | W1-D1 | `feat/training-vast-launcher-grpo-pipeline`             |
| C9  | W1-T11| `feat/training-enforce-privacy-filter-in-format`        |

### Major gaps closed

| Gap | Job   | Branch                                                  |
|-----|-------|---------------------------------------------------------|
| M2 scaffold | W0-X5 | `feat/benchmarks-trending-results-store-scaffold` |
| M4  | W1-P3 | `feat/prompt-optim-rollback`                            |
| M5  | W1-S1 | `feat/synth-multi-turn-project-simulator`               |
| M5 replay | W1-B4 | `worktree-agent-a490b05daa80fe463` (needs rename)    |
| M7  | W1-S3 | `feat/synth-llm-judge-filter`                           |
| M9  | W1-D3 | `feat/training-vast-budget-surface`                     |
| M12 | W1-T4 | `feat/trajectories-action-exec-io`                      |
| M21 | W1-P4 | `chore/training-remove-tinker`                          |
| M24 | W1-I5 | `worktree-agent-ae9c3a54bc49012c4` (needs rename)       |
| M35 | W1-D6 | `fix/training-27b-seq-len-default`                      |
| M37 | W0-X2 | `chore/training-remove-nebius`                          |
| M40 | W1-X1 | `feat/trajectories-cost-annotation`                     |
| A5  | W1-R2 | `feat/runtime-per-action-model-routing`                 |

### Pending re-dispatch (rate-limited in Batch R2)

`W0-X3` promotion scaffold · `W1-P1` wire 4 optimized prompts · `W1-P2` A/B
promotion gate · `W1-R1` main-agent local-only · `W1-T5` skill I/O · `W1-T6`
evaluator step type · `W1-T7` trajectory search · `W1-T8` user feedback ·
`W1-T9` trajectory steps table · `W1-I1` LM Studio plugin · `W1-I2` MLX plugin.

### Pending dispatch (dependency-cleared)

`W1-T3` OpenCode capture · `W1-T10` sub-agent cost · `W1-S2` adaptive synth ·
`W1-S4` synth sub-agent spawning · `W1-B2` unified harness · `W1-B3` trending
dashboard · `W1-B5` CI gates · `W1-D2` CheckpointSyncAgent · `W1-D4` Vast
serving · `W1-H1` PromotionService logic · `W1-H2` dynamic HF catalog ·
`W1-I3` hardware detection · `W1-I4` speculative decoding.

---

## 1. Critical gaps (block the loop)

### C1. Sub-agent reasoning capture is stdout-only [partial → critical]
**Where.** `eliza/plugins/plugin-agent-orchestrator/src/services/pty-service.ts`,
`spawn-trajectory.ts`. The parent injects `MILADY_PARENT_TRAJECTORY_STEP_ID` and
`PARALLAX_SESSION_ID` but never reads the sub-agent's structured logs.
**Impact.** The single largest training-data quality gap. Eliza-1 is a coding
agent; the high-value reasoning traces live in Claude Code / Codex / OpenCode
sessions and are being discarded. We see only ANSI-stripped final stdout.
**Why it matters.** Without reasoning, tool-call structure, and token usage we
cannot do SFT on agentic problem-solving — only on text completions of stripped
summaries.
**Fix.** Read `~/.local/state/milady/workspaces/<sessionId>/.claude/session-logs/*.json` on
`task_complete`. Parse Codex `--output-last-message` JSON. For OpenCode, enable
its streaming JSON output and parse. Merge into the parent trajectory as
`childSteps[]` with full step records, not just IDs.

### C2. `atropos` backend is LARP [CLOSED]
**Status.** Closed by W0-X2. All atropos references removed from `CLAUDE.md`,
`eliza/plugins/app-training/src/{backends,cli,core}`, `eliza/packages/docs/`,
and this docs set. `TrainingBackend` is now `"native"` after tinker is
removed in a follow-up; for the duration of this commit it is
`"tinker" | "native"`.

### C3. No automated checkpoint promotion / publish gate [missing]
**Where.** Nowhere. The pipeline can train, but cannot decide "this is better
than what's deployed". `push_model_to_hf.py` is the upload step; nothing
upstream of it evaluates a candidate against the incumbent.
**Impact.** The user's goal "automatically promote them to candidates and then
publish latest to eliza-1 repo on huggingface" is not wired.
**Fix.** Build a `PromotionService` with: deterministic eval suite → score
delta vs current best → human-or-rule gate → tag + upload. Store best-known
scores in a small SQLite/JSON registry.

### C4. Only 1/5 optimized-prompt artifacts are consumed [partial]
**Where.** `OptimizedPromptService` loads all five tasks but only
`action_planner` is read by the runtime injection point.
**Impact.** 80% of native optimization runs are wasted.
**Fix.** Wire `should_respond`, `context_routing`, `response`, `media_description`
into their respective runtime call sites. Each call site needs to look up the
task-specific artifact and (a) substitute the instruction prefix and (b)
optionally prepend few-shot examples.

### C5. Main agent's planner/action model cannot be local-only [missing]
**Where.** `PARALLAX_OPENCODE_LOCAL` works for coding sub-agents only.
`provider-switch-config.ts` accepts `Ollama` as a provider but the runtime path
that selects per-action model does not honor a "local-only" preference for the
*main* agent the same way the UX implies.
**Impact.** The "local only" toggle in Settings is misleading; sub-agents
locally, but the main agent's planner still calls cloud. Breaks the promise of
local-only mode.
**Fix.** Per-action model routing in
`eliza/packages/agent/src/runtime/eliza.ts` and the model-selection seam.
Honor a `localOnly: true` flag → block any non-local provider call.

### C6. No standard LLM benchmarks (MMLU / HumanEval / GSM8K / etc.) [missing]
**Where.** `eliza/packages/benchmarks/registry.py` lists 32+ benchmarks, none
of them standard public sets.
**Impact.** Cannot track Eliza-1 progress against public state-of-the-art.
Cannot make claims like "Eliza-1-9B matches Qwen-3-9B on MMLU".
**Fix.** Add adapters for: MMLU, MMLU-Pro, HumanEval, MBPP, GSM8K, MATH, ARC-C,
HellaSwag, TruthfulQA, BigCodeBench, MT-Bench. All have public datasets and
runners; wrap in our registry shape.

### C7. CheckpointSyncAgent referenced but missing [missing]
**Where.** Mentioned in research as the eval-gating piece; not found.
**Impact.** No defined gate between "checkpoint produced" and "checkpoint
evaluated". Without it, every checkpoint is treated equally.
**Fix.** Implement as part of C3.

### C8. GRPO not integrated into the Vast.ai launcher [partial]
**Where.** `train_grpo_verl.sh` works standalone but `train_vast.sh` does not
know about it.
**Impact.** Two separate manual provisioning paths. Operators forget to spin
down. Costs leak.
**Fix.** Add `--pipeline sft|dpo|grpo` flag. Each pipeline picks its own
GPU SKU (GRPO needs 8× H200 for 27B). Same teardown path.

### C9. Privacy filter coverage at training-export only [partial]
**Where.** Filter at `eliza/plugins/app-training/src/core/privacy-filter.ts`
runs on the nightly export cron and the on-demand training trigger. There is
**no proof** it is invoked by `format_for_training.py` (the script that
prepares JSONL for the trainer).
**Decision.** **Raw PII in the trajectory DB is intentional** — it's the user's
own data on their own machine. Filtering applies only on the *outbound* path
(export → training → HF publish), never on the storage path.
**Impact.** Without verification at the training-format step, PII could land
in datasets pushed to HF.
**Fix.** (1) Make `format_for_training.py` import and apply the privacy filter.
(2) Unit-test that no JSONL output line can contain `sk-*` / `Bearer ` /
common credential prefixes / geo. (3) Push_model + push_dataset already
mandatory; verify and lock in.

---

## 2. Major gaps (inadequate but functional)

### M1. No unified benchmark harness for model comparison [missing]
Each benchmark runs in isolation. No "evaluate model X against the full suite,
compare to model Y" command.
**Fix.** A `benchmarks/run-all.py` that takes a model endpoint (OpenAI-compat)
and a baseline endpoint, runs the full suite, emits a comparison report.

### M2. No benchmark trending DB or dashboard [missing]
Results are JSON files in `benchmarks/benchmark_results/` and `artifacts/`.
No time series, no per-model history, no regression alerts.
**Fix.** SQLite for the registry of `(model, benchmark, score, ts, commit)`.
Tiny dashboard at `/api/training/benchmarks` rendering trend lines.

### M3. No A/B test gate on prompt promotion [missing]
Optimizer artifacts are written and consumed without comparing to the
incumbent prompt. Hardcoded baselines.
**Fix.** Run candidate vs. incumbent on a held-out trajectory replay set.
Only promote if it wins on the chosen metric. Keep last-N artifacts to
allow rollback.

### M4. No rollback for optimized prompts [missing]
If a new artifact regresses, there is no per-task rollback.
**Fix.** Symlink-based "current" artifact pointer, with a `previous` and
`previous2` fallback. CLI to flip back.

### M5. No multi-turn / project-scope synthetic trajectories [missing]
Synth is one-shot. Eliza-1 needs to learn multi-step coding tasks.
**Fix.** Build a "project simulator" that hands the agent a multi-step goal
(`build a TodoMVC, write tests, commit`) and records the full session. Reuse
the `drive_eliza.py` harness with a turn loop.

### M6. No adaptive (failure-driven) synth [missing]
Pre-curated scenario corpus only.
**Fix.** Synthesis loop reads recent benchmark failures and generates
similar-but-not-identical tasks. LLM-as-author. Tag synthetic as
"failure-derived" in trajectory metadata.

### M7. No LLM judge filtering synth output [missing]
`eliza_reward_fn.py` exists but only used during RL.
**Fix.** Wrap reward_fn as a pre-training filter. Drop synth trajectories below
a quality threshold; surface borderline ones for review.

### M8. No sub-agent spawning during synth [missing]
Synth uses native LLM only. Real Eliza often dispatches to sub-agents; we
should record those paths.
**Fix.** Synth mode can request `--allow-subagents`. Use the actual orchestrator
to dispatch to Codex/Claude Code/OpenCode and record the resulting traces.

### M9. No Vast.ai budget enforcement / cost surfacing [missing]
Operator can leak money with a runaway 8× H200 run.
**Fix.** Per-job soft-cap (`MILADY_VAST_MAX_USD`). Hard-cap teardown. Surface
running cost via `train_vast.sh status` and the Training UI.

### M10. Vast.ai serving (llama.cpp template) untested in prod [untested]
Template exists; no deployment record, no billing, no endpoint URLs.
**Fix.** Deploy the 27B Q6_K to one Vast instance, wire `/v1/chat/completions`
through cloud-routing, run the benchmark suite against it end-to-end.

### M11. Speculative decoding not enabled [untested / partial]
DFLASH drafter is template-supported but never engaged.
**Fix.** Drafter model selection per target (Qwen-1.5B GGUF for 9B target,
etc.). Benchmark tokens/sec gain before flipping default.

### M12. Action exec inputs/outputs not captured [partial]
Trajectory captures step lifecycle but not action params / return values.
**Fix.** Extend the recorder hook in
`packages/core/src/runtime/trajectory-recorder.ts` to include action `input`,
`output`, `error`, with a size cap and structured truncation marker.

### M13. Skill invocations only name-captured [partial]
Same as M12 but for skills.
**Fix.** Per-skill invocation record with inputs/outputs/duration.

### M14. Evaluator step type not distinguished [missing]
Evaluator LLM calls look identical to action LLM calls.
**Fix.** New `StepType.EVALUATOR` with the evaluator name on the step.

### M15. InMemory adapter silently disables trajectory logging [partial]
A developer using in-memory mode for dev has zero training data captured and
no signal.
**Fix.** Warn on boot. Document. Optionally write to a local JSON store.

### M16. Trajectory search field stubbed [stub]
`TrajectoryListOptions.search` is accepted but ignored.
**Fix.** Implement a postgres full-text search on `(prompt, completion,
action_name)`. Index appropriately.

### M17. No user-feedback / rating field on trajectories [missing]
Eval signals are limited to `reward_components_json` + `status`.
**Fix.** Add `userFeedback: { rating, freeText, ts, userId }`. Wire from
existing thumbs-up/down UI if present, or add it.

### M18. AI-judge fields in schema never written [stub]
Schema accepts judge scores; no writer.
**Fix.** Offline batch job runs `eliza_reward_fn.py` over recent trajectories,
backfills judge scores.

### M19. HF model catalog is hardcoded [hardcoded]
4 entries in code; adding a new model requires a code change.
**Fix.** A JSON registry at `~/.local/state/eliza/local-inference/registry.json`
(updateable via API) or a remote manifest fetched from HF.

### M20. No HF release automation [missing]
No semver, no release notes, no tag → channel mapping (`latest`, `candidate`).
**Fix.** Use HF repo branches: `main` = latest, `candidate` = pending eval,
`stable` = production. CLI to flip via PromotionService (C3).

### M21. Tinker backend is a stub [stub]
Cloud surface only, untested.
**Fix.** Either complete the integration (it's a remote training API) or
remove. Recommendation: remove unless a customer needs it.

### M22. LM Studio is env-only [partial]
No plugin. Works for sub-agents through `PARALLAX_OPENCODE_BASE_URL` but
not as a first-class provider.
**Fix.** Mirror `plugin-ollama` structure for LM Studio. Detect at
`http://localhost:1234/v1/models`.

### M23. MLX backend missing [missing]
Apple Silicon native acceleration referenced in docs, no implementation.
**Fix.** Optional, but high impact for Mac users running locally. MLX has an
OpenAI-compatible server (`mlx-lm.server`). Plugin should detect + register.

### M24. Hybrid mode is partial [partial]
Local LLM + cloud RPC works *globally* but cannot mix per-call (e.g., use
Cloud RPC for one feature, fully local for another).
**Fix.** Per-feature flag in cloud-routing/resolve.ts. Already partially
supported per service; expose at config level.

### M25. Auto-download per hardware untested e2e [untested]
`auto-download-recommended.ts` selects based on detected hardware but the
full path has not been validated.
**Fix.** A boot-time integration test that runs the selection logic on three
synthetic hardware profiles (low-end Mac, 24GB Mac, 96GB GPU) and asserts
expected model choice.

### M26. Hardware detection weak [partial]
Pick-a-model logic uses crude bins (RAM > X → model Y). No GPU VRAM accounting.
**Fix.** Add VRAM/compute capability detection. Use it to gate Q-level
selection (Q4 vs Q6 vs FP16).

### M27. CI gating is LifeOps-only [partial]
**Fix.** Add benchmark gates for SWE-bench, BFCL, Terminal-Bench on every PR
to develop. Allow opt-out for unrelated changes.

### M28. Cerebras action benchmark lifecycle unclear [unclear]
18+ named artifacts under `eliza/artifacts/cerebras-action-benchmark-*`
indicate active use but no documentation of when/how to run.
**Fix.** Add `docs/eliza-1-pipeline/04-runbook.md` (later) documenting
the benchmark workflow. Move stale artifacts to S3 or delete.

### M29. Coordinator decision synthesis is lossy [partial]
Swarm coordinator emits final summary only; intermediate decisions discarded.
**Fix.** Persist coordinator state-machine transitions as a side-stream of
the trajectory.

### M30. No per-sub-agent cost/model tracking [missing]
Cannot answer "how much did Claude Code cost this session" or "which model
did Codex use".
**Fix.** Capture from session-logs after C1 lands.

### M31. USE_SKILL callback is text-pattern parsed [partial]
`USE_SKILL <slug> <json>` line is regex-matched. Fragile.
**Fix.** Move to structured stdout protocol (a tag-and-JSON-block pattern
parseable by both human-readable terminal and the parent).

### M32. ANSI stripping loses semantic structure [partial]
Tool boundaries and diffs are encoded in ANSI/markers we strip.
**Fix.** Capture both raw and stripped; strip only for display, keep raw for
training.

### M33. Approval-policy presets are static [hardcoded]
Codex sandbox policy is the same regardless of task risk.
**Fix.** Risk-tier policy selection. Read-only research = on-failure; code
edits in a workspace = always; financial ops = always + human in loop.

### M34. Skill manifest is auto-generated once [partial]
If skills change mid-session, sub-agent sees stale list.
**Fix.** Re-emit manifest on skill-set change events.

### M35. seq_len default 147k risky [hardcoded]
1% headroom on 27B; one outlier OOMs the run.
**Fix.** Reduce default to 64k for 27B. Surface as registry-level config.

### M36. Liger chunk_size hardcoded [hardcoded]
Tuning not validated for all sizes.
**Fix.** Sweep + bake size-specific defaults.

### M37. Nebius fallback deprecated but not removed [CLOSED]
**Status.** Closed by W0-X2 (Nebius portion). No Nebius references remain in
the active codebase; the deprecated upstream fallback has been deleted
along with its env vars, scripts, and docs.

### M38. Mobile runtime hardening test untracked from git [partial]
`packages/ui/src/first-run/__tests__/mobile-runtime-mode-hardening.test.ts`
shows up in git status (untracked).
**Fix.** Commit and ensure it runs in CI.

### M39. Sensitive-requests dirs untracked from git [partial]
`packages/app-core/src/services/sensitive-requests/` and
`packages/core/src/sensitive-requests/` are untracked.
**Fix.** Confirm they are intentional and commit, or delete.

### M40. No LLM-call cost tracking in trajectories [partial]
Token counts present but no `$` value attached.
**Fix.** Per-provider cost table → annotate trajectory step with cost.

### M41. Trajectory step JSON unbounded [partial]
Large trajectories make the JSONB column unwieldy.
**Fix.** Move `steps` to a separate table `trajectory_steps`, paged.

### M42. Script field capped at 4096 chars [hardcoded]
Large action code truncated.
**Fix.** Move to dedicated TEXT column or external storage.

---

## 3. Hardcoded values inventory

| Where                                                    | Value                       | Risk     |
|----------------------------------------------------------|-----------------------------|----------|
| TrainingTriggerService                                   | 100 trajectories / task     | low      |
| TrainingTriggerService                                   | 12h cooldown                | low      |
| Optimized prompts                                        | 5 task names (hardcoded)    | medium   |
| HF eliza-1 catalog                                       | 4 model entries             | medium   |
| Codex approval policies                                  | static preset map           | medium   |
| `train_local.py`                                         | seq_len 147k default        | high (OOM)|
| `train_local.py`                                         | Liger chunk_size            | medium   |
| Nightly cron times                                       | 03:00 / 03:05               | low      |
| `pty-service.ts`                                         | TASK_COMPLETE_STOP_DELAY_MS = 5000 | medium |
| `coordinator-wiring.ts`                                  | POLL_TIMEOUT_MS = 90000     | medium   |
| Vast.ai default SKUs                                     | blackwell6000-1x, b200-2x   | low      |
| `format_for_training.py`                                 | `eliza_native_v1` format ID | medium   |
| Anthropic large default                                  | `claude-opus-4-7`           | low      |
| Anthropic small default                                  | `claude-haiku-4-5-20251001` | low      |
| OpenAI large default                                     | `gpt-5.5`                   | low      |
| OpenAI small default                                     | `gpt-5.5-mini`              | low      |

---

## 4. LARP / stubs inventory

| Item                            | Where                                              | Status                       |
|---------------------------------|----------------------------------------------------|------------------------------|
| Tinker backend                  | training plugin backend selector                   | Stub                         |
| `DECISION:` channel             | sub-agent memory file                              | Compliance-dependent         |
| Trajectory search               | `TrajectoryListOptions.search`                     | Accepted, ignored            |
| AI-judge fields                 | trajectory schema                                  | No writer                    |
| MLX backend                     | doc references                                     | No implementation            |
| Sub-agent rich capture          | parent step env injected                           | No consumer                  |
| Speculative decoding (DFLASH)   | Vast template                                      | Template only                |
| vLLM serving                    | Vast manifest                                      | Manifest only                |
| `CheckpointSyncAgent`           | promotion / eval gate                              | Missing                      |
| MMLU/HumanEval/GSM8K/etc.       | benchmark registry                                 | Missing                      |
| Cerebras action benchmark docs  | `eliza/artifacts/cerebras-action-benchmark-*`      | Artifacts present, no doc    |

---

## 5. Architectural concerns

### A1. Sub-agent trajectory storage is *split*, not *merged*
Parent writes its trajectory; sub-agent writes its own with a parent-step ID
metadata pointer; reassembling the full chain requires a JOIN-like operation
at read time. Training pipeline never does it.

### A2. Privacy is enforced at *export*, by design
Raw PII in the trajectory DB is the user's data; no redaction at write.
Filtering is applied only on the export path (training data + HF publish).
The seam is clean and intentional; ensure every outbound path goes through it.

### A3. No standard `(model, task) → score` registry
Every comparison must re-run the benchmarks. Cache scores by `(model_id,
benchmark_id, dataset_version, code_commit)`.

### A4. Prompt-optimization → runtime injection seam is informal
Each task has its own bespoke injection. A small `OptimizedPromptInjector`
interface would let us mechanically wire the missing 4/5 tasks (C4).

### A5. Provider switching is per-provider, not per-action
Cannot route planner to model A and action exec to model B. Limits
cost-aware routing and model specialization.

### A6. Training format `eliza_native_v1` versioning unclear
What is the migration path when we change the format? Past trajectories are
encoded in the v1 shape; if we add v2, do we re-encode the historical set?

### A7. Sub-agent capture leaks operational metadata into training data
Without filtering, PARALLAX_SESSION_ID / workspace paths / parent step IDs
can land in the training set as text patterns. The model learns to emit
those tokens.

### A8. No clear ownership of "current best model"
HF repos exist; nothing in the runtime queries "what's the canonical current
production model?" Each consumer rolls its own model-id detection.

---

## 6. Severity-ranked summary

### Critical (block the loop) — fix first
- C1 Sub-agent reasoning capture (data quality)
- C2 Atropos LARP (clarity) — CLOSED
- C3 No promotion / publish gate (releases stuck)
- C4 4/5 optimized prompts unused (waste)
- C5 Main agent local-only model missing (UX)
- C6 No standard benchmarks (progress tracking)
- C7 CheckpointSyncAgent missing (eval gating)
- C8 GRPO not in Vast launcher (operator pain)
- C9 Privacy filter coverage incomplete (legal risk)

### Major — significant quality improvements
- M1–M11 Benchmark + serving infra
- M12–M18 Trajectory quality + eval surfaces
- M19–M26 HF + local-inference UX
- M27–M30 CI + audit
- M31–M34 Sub-agent capture refinements
- M35–M37 Training perf / dead code
- M38–M42 Misc

### Architectural — long-term
- A1–A8 Format / storage / routing seams

---

Continue to [03-implementation-plan.md](03-implementation-plan.md) for the
swarm execution plan.
