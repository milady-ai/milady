# M11 — Real device end-to-end + battery / thermal characterization

**Owner:** TBD
**Status:** Not started
**Predecessors:** M10
**Successors:** M12

## Goal

Same as M10 but on physical iPhone 15 Pro / 16 Pro. Quantify battery + thermal cost.

## Acceptance Criteria

- [ ] App installs via Xcode → physical device.
- [ ] Chat works end-to-end on device.
- [ ] **10-message conversation completes in <60s total wall-clock** (each message ~6s end-to-end).
- [ ] **First-token latency <2s** on warm cache.
- [ ] **Generation rate >=5 tokens/sec** on Eliza-1 0.6B Q4_K_M.
- [ ] **Battery drain for 10-message conversation: <5%**.
- [ ] **Thermal state stays in `fair` or better** (use `ProcessInfo.thermalState`).
- [ ] **Peak memory <500 MB** (Bun + JSC + model + KV cache).
- [ ] **No app termination by iOS jetsam** during normal use.

## Profiling instrumentation

For this milestone, wire structured profile data into the agent's trajectory logging:

- Per-token generation time (already present in `LocalInferenceLoader`)
- Memory high-water mark at each turn (`mach_task_basic_info`)
- Thermal state at each turn
- Battery level delta at each turn (`UIDevice.batteryLevel`)

Output goes to `<stateDir>/profile/<session-id>.jsonl` for later analysis.

## Test plan

- **Test 1: 10-message synthetic conversation.** Script the user side (UI automation). Measure all metrics.
- **Test 2: 100-message conversation.** Does memory creep? Does thermal climb? Does battery drain disproportionately?
- **Test 3: Cold start in airplane mode.** First-launch UX without network. Must work.
- **Test 4: 10-conversation marathon.** Open/close app 10 times. Each opens cleanly.
- **Test 5: Background while generating.** Send message, immediately background. Token stream should pause (iOS suspends process). On foreground, should resume.

## Tuning knobs

- KV cache size: smaller = less memory, less context window. Tune for 32k context on 6 GB devices.
- Thread count: llama.cpp default may oversubscribe. Test 2–4 threads.
- Quantization: Q4_K_M is the default; consider Q4_0 or Q3_K_M for smaller models if needed.
- Speculative decoding: not available on iOS llama.cpp (custom kernel not portable). Just don't use it.

## Effort estimate

- Nominal: 2 weeks
- With "thermals are bad" iteration: 3 weeks
