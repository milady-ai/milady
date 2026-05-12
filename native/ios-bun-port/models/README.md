# Milady iOS — On-Device Models

GGUF models for on-device inference in the iOS Capacitor app. The Swift bridge
(`LlamaBridgeImpl.swift`) consumes models via a `llama_load_model({ path })`
call from the Bun-shape agent JS. The polyfill resolves the path with
`bridge.paths_app_support()` plus a `models/` subdirectory.

This directory is the staging area for development; the App Store path is
download-on-first-launch (see `FIRST_LAUNCH_DOWNLOAD.md`).

## Why a 0.5B–0.6B Q4 model for first-light

The first-light target is **end-to-end inference on iPhone Simulator (Apple
Silicon, M3-class)** with a real iOS-side llama.cpp build. The model has to:

- **Fit in the App Store install budget at runtime.** Cellular install cap is
  200 MB for the .ipa, so the model is never bundled in App Store builds — it
  is downloaded on first launch. For dev builds (Xcode install over USB), it
  is bundled directly.
- **Stay under ~500 MB resident.** iPhone-class devices kill apps that
  exceed roughly 1.0–1.5 GB of working set (depends on device class, OS
  pressure, and other allocations). The model weights are mmap'd from disk by
  llama.cpp on iOS, so weights-on-disk count partially. A 0.5B Q4 model with
  a small KV cache stays well under that cap on iPhone 14+ / Simulator.
- **Deliver demoable TTFT.** A 0.5B Q4 model on M3 Simulator generates the
  first token in ~150–400 ms after prompt eval, which is the kind of latency
  needed to feel like a chat app rather than a science project.
- **Use a standard chat template.** Qwen2.5 ships with ChatML
  (`<|im_start|>`, `<|im_end|>`), which is the most widely supported template
  in llama.cpp-based chat plumbing.

## Chosen model

| Field             | Value                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Display name      | `qwen2.5-0.5b-instruct`                                                                                        |
| On-device filename | `first-light.gguf`                                                                                            |
| Upstream filename | `qwen2.5-0.5b-instruct-q4_k_m.gguf`                                                                            |
| Parameters        | 494 M                                                                                                          |
| Quantization      | Q4_K_M (4-bit K-quants, medium — best size/quality at this scale)                                              |
| File size         | 491,400,032 bytes (~491 MB)                                                                                    |
| Context window    | 8192 (per GGUF metadata; Qwen2.5 base supports 32K with rope scaling)                                          |
| Vocab size        | 151,936                                                                                                        |
| Architecture      | `qwen2`                                                                                                        |
| Chat template     | ChatML                                                                                                         |
| License           | Apache-2.0                                                                                                     |
| HuggingFace repo  | https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF                                                          |
| Direct URL        | https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf          |
| SHA256            | `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db`                                             |
| Verified          | 2026-05-11 (extracted from the upstream Git LFS pointer; download script re-verifies on every fetch)            |

The SHA256 above was pulled from HuggingFace's Git LFS pointer
(`https://huggingface.co/.../raw/main/<file>.gguf`) rather than from the web
UI. The download script re-verifies after every fetch and refuses to stage a
binary whose hash does not match `manifest.json`.

## Why GGUF Q4_K_M specifically

| Quantization | Size      | Quality                      | Notes                                                  |
| ------------ | --------- | ---------------------------- | ------------------------------------------------------ |
| Q2_K         | 415 MB    | Noticeably degraded          | Avoid — small win in size, large hit in coherence      |
| Q3_K_M       | 432 MB    | Visible degradation          | Marginal vs Q4                                         |
| Q4_0         | 428 MB    | Decent                       | Older quant scheme, no K-quants                        |
| **Q4_K_M**   | **491 MB**| **Best small-model quality** | **Chosen — recommended by llama.cpp for ~0.5B models** |
| Q5_K_M       | 522 MB    | Slightly better              | +30 MB for marginal quality gain                       |
| Q6_K         | 650 MB    | Near-FP16                    | Too big for first-light budget                         |
| Q8_0         | 676 MB    | Near-FP16                    | Too big                                                |
| FP16         | 1.27 GB   | Reference                    | Not viable on device                                   |

Q4_K_M is the standard recommendation from the llama.cpp project for
sub-1B-parameter models: it preserves more outlier-channel precision than
Q4_0 via K-quants, while keeping the file under 500 MB.

## Alternatives, ranked

If Qwen2.5-0.5B-Instruct-GGUF is unavailable, swap in this order:

1. **Qwen2.5-0.5B-Instruct (Q4_0)** — 429 MB, same repo, same license, slightly
   lower quality but smaller.
   `https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_0.gguf`
2. **Qwen2.5-1.5B-Instruct (Q4_K_M)** — ~940 MB, Apache-2.0, materially
   higher quality. Use only when the install/runtime budget allows ~1 GB.
   `https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF`
3. **Llama-3.2-1B-Instruct (Q4_K_M)** — ~770 MB, **Llama 3.2 Community
   License** (commercial-use OK below ~700 M MAU but **not** Apache/MIT,
   gated download requires HF token). Use only if Qwen quality is a
   blocker.
4. **Eliza-1-0.6B-Instruct** — As of 2026-05-11, no public GGUF release of
   this exists on HuggingFace under `elizaos/`. The closest is
   `elizaos/eliza-1-assets` (an asset repo, not a runnable model). When a
   GGUF lands upstream, swap by editing `manifest.json` and re-running the
   download script.

Non-options:

- **SmolLM2-360M-Instruct-GGUF** is Apache-2.0 and 386 MB, but the upstream
  repo only publishes a Q8_0 GGUF — no Q4_K_M is available without us
  re-quantizing locally. Skipped to avoid taking on a build-tool dependency.

## Where the model lands on device

Three installation tiers, controlled by `MILADY_DISTRIBUTION_TIER` at build
time (read by the dev tooling and by the chat UI's first-launch flow):

### Dev (Xcode install over USB) — `MILADY_DISTRIBUTION_TIER=dev`

- `download-first-light.sh` writes the GGUF to
  `apps/app/ios/App/App/agent/models/first-light.gguf`.
- Capacitor's iOS build step copies anything under `App/App/...` into the
  `.app` bundle as a resource.
- On launch, the polyfill asks the bridge for
  `paths_bundle_resource("first-light", "gguf")`, which returns the
  bundled absolute path inside `Bundle.main`.
- The agent JS copies the file from `Bundle.main` into
  `paths_app_support()/models/` so it lives in a writable directory (the
  bundle Resources dir is read-only and gets blown away on app update).

### Sideload (Ad Hoc / Enterprise / TestFlight pre-flight) — `MILADY_DISTRIBUTION_TIER=sideload`

- Defaults to bundled (same as `dev`) unless the build script sets
  `MILADY_DISTRIBUTION_TIER=sideload-thin`, in which case it uses the
  App Store path below.

### App Store — `MILADY_DISTRIBUTION_TIER=appstore`

- The `.ipa` ships **without** the GGUF.
- On first launch the chat UI shows a one-screen onboarding flow that
  downloads to
  `~/Library/Application Support/Milady/models/first-light.gguf`
  via `URLSession`, verifies the SHA256, and marks the file as
  excluded from iCloud backup. See `FIRST_LAUNCH_DOWNLOAD.md` for the
  full spec.

## Manifest format

`manifest.json` (this directory) is the single source of truth for what
model `download-first-light.sh` fetches and what the iOS app expects to
load. Schema:

```json
{
  "version": 1,
  "first-light": {
    "name": "<display name>",
    "filename": "<on-device filename>",
    "source_filename": "<upstream filename>",
    "url": "<https URL>",
    "sha256": "<64 hex chars>",
    "size_bytes": <int>,
    "context_window": <int>,
    "vocab_size": <int>,
    "license": "Apache-2.0|MIT|...",
    "tokenizer_family": "qwen|llama|...",
    "architecture": "qwen2|llama|...",
    "quantization": "Q4_K_M|...",
    "chat_template": "chatml|llama3|..."
  }
}
```

Only Apache-2.0 / MIT-licensed models go in here. No
non-commercial-licensed entries — we ship as a product.

## Scripts in this directory

| Script                     | What it does                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `download-first-light.sh`  | Downloads + verifies the GGUF, stages it into the dev bundle and the local cache.       |
| `stage-into-xcode.mjs`     | Copies from the cache into the Xcode bundle resources path. Verifies pbxproj membership. |

See `INTEGRATION.md` for how this wires into the Swift bridge and the chat UI.
