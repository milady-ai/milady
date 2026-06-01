# wakeword-hey-eliza training run (2026-05-14)

First real "hey eliza" wake-word head trained against the
`packages/training/scripts/wakeword/train_eliza1_wakeword_head.py`
recipe. Replaces the placeholder `hey_jarvis_v0.1.onnx` renamed
`hey-eliza.onnx` that previously shipped in the Eliza-1 tier bundles.

## Pipeline

1. **Synthesis** (`synthesize_data.py`) — locally-built fused
   `llama-omnivoice-server` (eliza-fused fork) generates 300 positive
   + 300 negative + 20 held-out-positive + 20 held-out-negative
   clips at 16 kHz mono PCM16, 2.0s each. Voice grid: 26
   gender/age/pitch/accent OmniVoice instructs. Distractor grid: 47
   phrases mixing near-miss wake words ("hey alexa", "hey lisa",
   "okay eliza", "they realize") and common everyday phrases.
2. **Augmentation** (`augment_data.py`) — 5x per clip; gain
   (×0.5..×1.5), additive noise (SNR 25-40 dB), time-shift (±200 ms),
   speed change (±5%). Boosts the train set from 600 to 3600 clips
   (1800 positive + 1800 negative).
3. **Training** (`train_eliza1_wakeword_head.py`) — 100 epochs,
   seed=1, BCE on the flattened `[16, 96]` embedding window through
   the openWakeWord front-end. Threshold picker (smallest threshold
   keeping internal val-FA ≤ 0.5%) returned 0.5 fallback because the
   model overfits enough that no t in [0.1, 0.95] satisfies the
   strict constraint on the internal split.
4. **Eval** (`eval_head.py`) — runs the **truly** held-out 20+20
   clips (different seeds from the train set) through the same
   front-end + head the runtime uses. Reports per-clip P(wake) and
   aggregate TA/FA.

## Models trained

| name | epochs | seed | held-out TA | held-out FA @ best-op |
| --- | --- | --- | --- | --- |
| hey-eliza (v1) | 30  | 0 | 75%  | 5%  |
| hey-eliza-v2   | 100 | 1 | 90%  | 10% |
| hey-eliza-v3   | 50  | 7 | 85%  | 10% |
| hey-eliza-v4   | 50  | 42 | 85% | 10% |

**Shipped: v2** (`out/hey-eliza-v2.onnx`, SHA256
`e565952901cd4203baacef7cb8700891c9bee4e6f42fc9bc0aa03b9c39a2da92`).

## Held-out FA targets

Target was **FA<1%, TA>90%**. v2 reaches TA=90% but the held-out FA
is 10% (2 of 20 hard-negatives fire confidently — phonetic
near-misses like "okay eliza" / "hey lisa" the model can't reliably
reject with only 600 base synthetic negatives). Honest assessment:

- v2 is a clear win over the placeholder (renamed `hey_jarvis` head
  fires on "hey jarvis", not "hey eliza" — the previous shipped state
  was 0% TA on the actual wake phrase).
- The synthetic-only eval is not a substitute for an ambient-noise
  corpus. Real-world FA likely differs from 10%.
- Follow-up to push FA below 1%: (a) 10x the negative corpus,
  especially with phonetically-similar hard negatives generated at
  the same voice grid as positives; (b) add room-impulse / noise
  augmentation (audiomentations chain from the openWakeWord notebook);
  (c) consider hard-negative mining over an ambient-speech corpus
  (Common Voice, LibriSpeech), not just synthetic distractor phrases.

## Bundle integration

The trained head + the two front-end ONNX graphs are staged into both
local tier bundles:

```
~/.eliza/local-inference/models/eliza-1-0_6b.bundle/wake/{melspectrogram,embedding_model,hey-eliza}.onnx
~/.eliza/local-inference/models/eliza-1-1_7b.bundle/wake/{melspectrogram,embedding_model,hey-eliza}.onnx
```

The per-bundle `eliza-1.manifest.json` declares the wake/* files with
SHA256 + `releaseState: "weights-staged"` + `headMetrics` so the
engine and the registry can audit the provenance.

## Runtime smoke-test

End-to-end through `onnxruntime-node` (the path the runtime uses):

```
node plugins/plugin-local-inference/wake-smoke.mjs
# Read positive WAV: 32000 samples (2s)
# Mel output shape: [1,1,197,32] -> 197 frames, 32 bins
# Computed 16 embeddings
# Max P(wake) on heldout positive hpos-00000.wav: 1.0000
# Threshold (provenance): 0.5
# Fires: YES
# [smoke] PASS
```

## Staging from this run into bundles

```bash
cd packages/training
uv run python -m scripts.manifest.stage_eliza1_bundle_assets \
  --tier 1_7b \
  --bundle-dir ~/.eliza/local-inference/models/eliza-1-1_7b.bundle \
  --wakeword-head-path /home/shaw/milady/training-runs/wakeword-hey-eliza/out/hey-eliza-v2.onnx
```

The new `--wakeword-head-path` flag was added in this run; without
it the staging script falls back to the upstream openWakeWord
`hey_jarvis` placeholder (the legacy behavior).

## llama.cpp port decision

**Recommendation: keep onnxruntime-node, do NOT port to llama.cpp.**

Rationale:

- The full wake-word pipeline (mel → embed → head) is ~5-10ms per
  80ms audio frame on CPU with onnxruntime — well below real-time.
  This is not a hot path that benefits from llama.cpp kernels.
- The three ONNX graphs are tiny (~3MB total per bundle). Bundling
  llama.cpp variants would add to bundle size, not subtract.
- The openWakeWord pipeline is well-documented and the upstream
  graphs are Apache-2.0; porting to llama.cpp would force us to
  re-quantize and re-validate against the same reference output.
- The runtime already loads ONNX graphs for VAD (silero) and the
  turn detector — onnxruntime-node is a known dep, not a new one.
- Future work: if a future Eliza-1 tier wants to drop onnxruntime
  entirely (e.g. for a more aggressively-trimmed mobile bundle), the
  wake-word pipeline is one of the smaller graphs to port.

## Files

- `synthesize_data.py` — TTS-based positive/negative generation
- `augment_data.py` — PCM-domain augmentation (gain/noise/shift/speed)
- `eval_head.py` — held-out evaluation against the runtime contract
- `manifest.json` — synthesis provenance (started/finished, voice grid,
  distractor list, TTS backend SHAs)
- `train.log` — full training stdout for all 4 variants
- `out/hey-eliza-v{1..4}.onnx` — trained heads
- `out/hey-eliza-v{1..4}.provenance.json` — per-head provenance
- `out/heldout-eval-v{1..4}.json` — per-clip held-out scores +
  aggregate TA/FA
- `cache/embedding-windows.json` — featurized training set (1800 pos
  + 1800 neg `[16, 96]` windows), reusable for further training
- `front-end/{melspectrogram,embedding_model}.onnx` — openWakeWord
  v0.5.1 graphs (Apache-2.0, redistributable)
