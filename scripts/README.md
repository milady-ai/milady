# scripts/

Repo-level helper scripts. Most are invoked via `bun run <name>` from the
root `package.json`.

### Action-planner auto-tuning
Run after the action benchmark to improve planner accuracy:
  1. `bun run test:benchmark:actions:mocked`   # generate trajectories
  2. `bun run action:trajectories-to-dataset`  # trajectories -> JSONL
  3. `bun run action:optimize-planner`         # MIPRO-style tuning

Re-run step 1 to measure improvement. The `OptimizedPromptService`
loads the new artifact at next runtime boot; the action planner
prompt is automatically substituted.

The dataset is written to
`eliza/apps/app-training/datasets/action_planner_from_benchmark.jsonl`
(plus a sibling `.meta.json`), and artifacts land under
`~/.milady/optimized-prompts/action_planner/`.
