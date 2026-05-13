# Milady on Pixel 9a — Models, Speeds, Voice, Embeddings

Generated 2026-05-13 during the autonomous Pixel 9a-prep session. Snapshot of
current capabilities + projected speeds + how to sideload + what still needs
follow-up PRs (#7666, #7667) before voice goes fully local on the phone.

## Hardware (Pixel 9a)

```
SoC          Google Tensor G4
CPU          1× Cortex-X4 @3.1 GHz + 3× Cortex-A720 + 4× Cortex-A520
GPU          Mali-G715 MC7 (Valhall, Vulkan 1.3)
NPU          Edge TPU (~10 TOPS, INT8 specialist)
RAM          8 GB LPDDR5X
Storage      128/256 GB UFS 3.1
OS           Android 14+ (Capacitor target)
```

Realistic free RAM after OS+WebView ≈ 5-6 GB. Plan model footprint accordingly.

---

## LLM — what fits and how fast

The `@elizaos/plugin-aosp-local-inference` plugin handles `TEXT_SMALL` /
`TEXT_LARGE` / `TEXT_EMBEDDING` on Android via the AOSP llama adapter (Shaw's
dflash binary cross-compiled for arm64). Vulkan via Mali, with CPU fallback.

| Model | Size (Q4_K_M) | RAM footprint | Vulkan Mali tg | CPU tg (NEON) | Use case |
|---|---|---|---|---|---|
| Qwen-2.5-0.5B Q4_K_M | 400 MB | ~1 GB | **20-30 t/s** | 12-18 t/s | Fastest; thin assistant replies |
| Llama-3.2-1B Q4_K_M | 770 MB | ~1.5 GB | **10-15 t/s** | 6-9 t/s | Sweet spot for chat quality vs speed |
| Gemma-3-1B Q4_K_M | 600 MB | ~1.3 GB | 12-18 t/s | 7-10 t/s | Better quality than Llama-1B on factual recall |
| Llama-3.2-3B Q4_K_M | 1.9 GB | ~3.5 GB | **4-7 t/s** | 2-4 t/s | Better reasoning, slower; tight on RAM with Chrome WebView open |
| eliza-1-0_8b (when published) | ~800 MB | ~1.5 GB | 10-15 t/s + DFlash | — | Will become the default once Shaw publishes |

**TTFT (time to first token)** on Vulkan Mali: ~150-300 ms for any of the small
bodies. **Pp (prompt eval)** on Mali: ~120-180 t/s for the same models.

Recommendation for today: **Llama-3.2-1B Q4_K_M** — fits with headroom, decent
quality, and the AOSP plugin's CPU+Vulkan dispatch already handles it. After
Shaw publishes `eliza-1-0_8b`, switch to that (gets the W4-B kernel + DFlash
spec-decode uplift, ~30-50% faster than plain Llama on the same hardware).

---

## TTS — what works on Android today vs after the follow-up PRs

| Path | Today? | Latency (TTFB) | Power | Source |
|---|---|---|---|---|
| Edge TTS (cloud) | ✅ Default | 250-500 ms + network | 0 (offload) | `@elizaos/plugin-edge-tts` shipping in the APK |
| ElevenLabs / OpenAI TTS | ✅ If user provides key | network-bound | 0 | cloud plugins |
| **Kokoro INT8 ONNX (CPU)** | ❌ Needs [#7666](https://github.com/elizaOS/eliza/issues/7666) | ~250-400 ms | ~1.5 W | AOSP plugin gets a `TEXT_TO_SPEECH` handler — 4-6 hr engineering |
| **Kokoro on Mali Vulkan EP** | ❌ Needs [#7666](https://github.com/elizaOS/eliza/issues/7666) + ORT-Vulkan build | ~150 ms | ~2 W | Same as above + ORT Vulkan EP for ARM64 |
| **Kokoro via Tensor TPU / NNAPI** | ❌ Needs [#7667](https://github.com/elizaOS/eliza/issues/7667) | **~80-120 ms** | **~0.5 W** | Flagship demo path; TFLite conversion OR ORT NNAPI EP wiring |
| omnivoice fused | ❌ No Android port | — | — | Linux/Vulkan compiles now; no Mali kernels yet, no Tensor TPU port |

**On a freshly sideloaded APK from `develop` today:** voice goes to Edge TTS
(cloud). To get local Kokoro, [#7666](https://github.com/elizaOS/eliza/issues/7666)
needs to land. To get the "absolute best" sub-100 ms TTFB at ~0.5 W,
[#7667](https://github.com/elizaOS/eliza/issues/7667) needs to land on top.

---

## ASR — speech recognition on the phone

| Path | Today? | Latency | Source |
|---|---|---|---|
| Edge / cloud STT | ✅ via voice plugins if configured | network-bound | cloud TTS plugins handle this too |
| whisper.cpp INT8 base.en | ❌ Not wired on AOSP plugin | ~3-5× RTF on CPU | needs an AOSP plugin `TRANSCRIPTION` handler — separate follow-up to #7666 |
| ONNX Whisper via `onnxruntime-react-native` | ❌ Not wired | ~5-8× RTF on CPU; ~10-15× on Mali | same plumbing as Kokoro from #7666 — would land in the same PR or close after |
| Whisper TFLite on Tensor TPU | ❌ Not wired | **~12-15× RTF, ~0.3 W** | mirrors #7667 for ASR |

Today, voice _input_ on Android probably falls to whatever cloud STT the user
has configured (Google's Cloud Speech, OpenAI's Whisper API, etc.) via voice
plugin defaults. Truly local ASR needs a wiring PR.

---

## Embeddings — TEXT_EMBEDDING

The AOSP plugin DOES wire `TEXT_EMBEDDING` (per
`aosp-local-inference-bootstrap.ts`). Two cases:

1. **`eliza-1` bundle with a dedicated embedding region** (e.g. `eliza-1-9b`,
   `eliza-1-27b` once published): a 1024-dim Matryoshka embedding via the
   bundle's `embedding/` GGUF. Sub-50 ms per text on Vulkan Mali.
2. **Anything else** (Llama-3.2-1B etc.): pooled text via `--pooling last`
   from the active text model. ~100-150 ms per text on CPU+Vulkan.

For chat with retrieval-augmented context: ~200-500 ms to embed each new
message + comparable for the top-K retrieval candidates. Acceptable for chat.

---

## End-to-end voice TTFA estimates

```
                          TODAY (Edge TTS, cloud STT)    AFTER #7666 (local Kokoro)    AFTER #7667 (Kokoro on TPU)
ASR finalize              500-1500 ms (network)          800 ms (whisper.cpp CPU)       150 ms (Whisper TPU)
LLM first phrase          200-400 ms (Vulkan Mali)       same                            same
TTS first audio           250-500 ms (network)           300 ms (Kokoro CPU)             100 ms (Kokoro TPU)
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Total TTFA               ~1.0-2.5 s (network-bound)     ~1.3-1.5 s (fully local)       ~450-650 ms (Lunar Lake-class)
```

ChatGPT voice mode parity (~1.5 s) is reachable after #7666. Sub-1s on Tensor
TPU is realistic after #7667.

Power: today ~2-4 W during a voice turn (Mali + screen + radio). Local Kokoro
CPU adds ~1.5 W per phrase. Kokoro on TPU adds ~0.5 W. Worst case battery hit
during a 30-min voice session: ~15-20% on today's Edge-TTS-only path, ~10-15%
after #7666, ~5-8% after #7667.

---

## How to sideload the APK to your Pixel 9a

```bash
# 1. Build the APK (from milady root). Takes 15-30 min first time.
bun run build:android

# 2. Locate the output
find apps/app/android/app/build/outputs/apk -name '*.apk' -mmin -60
# Typical path:
#   apps/app/android/app/build/outputs/apk/debug/app-debug.apk

# 3. Enable USB debugging on the Pixel 9a (Settings → About phone →
#    tap Build number 7 times → Settings → Developer options → USB debugging)
#    Connect phone via USB; confirm the "Allow USB debugging?" prompt.

# 4. Verify the device shows up
adb devices
#   expected output:
#   List of devices attached
#   3A081JEHN0XXXX  device

# 5. Install the APK (uninstall any prior version first to dodge signature conflicts)
adb uninstall ai.milady.milady    # ignore "not found" error
adb install -r apps/app/android/app/build/outputs/apk/debug/app-debug.apk

# 6. Launch the app
adb shell monkey -p ai.milady.milady -c android.intent.category.LAUNCHER 1

# 7. To watch logcat for the agent / Eliza runtime
adb logcat -v time | grep -E 'Eliza|Milady|libeliza_bun|aosp-local-inference'
```

**Note**: The APK requests `MANAGE_APP_OPS_MODES` and `PACKAGE_USAGE_STATS` —
sideload-only by design. Won't ship to Play Store as-is. Use the
`build:android:cloud` variant for a Play-Store-compliant thin client (LLM via
cloud, no on-device runtime).

---

## Staging models on the phone (when #7666 lands)

Pre-staging the LLM, Kokoro, and Whisper artifacts so the app finds them on
first launch:

```bash
# Get the app's external data dir path (after first launch)
adb shell pm path ai.milady.milady
# adb shell run-as ai.milady.milady ls -la files/

# For sideload-debug builds, you can push to /sdcard/Android/data/<pkg>/files/
DEVICE_DIR="/sdcard/Android/data/ai.milady.milady/files/.eliza/local-inference"

# LLM (Llama-3.2-1B Q4_K_M — sweet spot for Pixel 9a)
adb push ~/.cache/llama-cpp-models/Llama-3.2-1B-Instruct-Q4_K_M.gguf \
    "$DEVICE_DIR/models/text/llama-3.2-1b-instruct-q4_k_m.gguf"

# Kokoro TTS (after #7666 ships)
adb push ~/.eliza/local-inference/models/kokoro/kokoro-v1.0.int8.onnx \
    "$DEVICE_DIR/models/kokoro/kokoro-v1.0.int8.onnx"
adb push ~/.eliza/local-inference/models/kokoro/voices/af_bella.bin \
    "$DEVICE_DIR/models/kokoro/voices/af_bella.bin"

# Whisper ASR (after the parallel ASR PR ships)
adb push ~/.eliza/local-inference/whisper/ggml-base.en.bin \
    "$DEVICE_DIR/models/whisper/ggml-base.en.bin"
```

The auto-discovery helpers in PR #7661 use `resolveStateDir() + "/local-inference/..."`
which Capacitor maps to the per-app external data dir on Android. **Same path,
different mount point on Linux vs Android** — operator stages, runtime finds.

---

## Current state of related PRs / issues

| Item | Status |
|---|---|
| [#7656](https://github.com/elizaOS/eliza/pull/7656) Kokoro voice loader fixes | ✅ Merged to develop |
| [#7658](https://github.com/elizaOS/eliza/pull/7658) OpenVINO Whisper ASR adapter | ✅ Merged to develop |
| [#7661](https://github.com/elizaOS/eliza/pull/7661) Kokoro engine wiring (desktop) | ✅ Merged to develop |
| [#7664](https://github.com/elizaOS/eliza/pull/7664) Kokoro speed-tensor polarity fix | ✅ Merged to develop |
| [#7666](https://github.com/elizaOS/eliza/issues/7666) **AOSP Kokoro wiring RFC** | 🆕 Filed — needs maintainer green-light on the architecture decision (move Kokoro classes to `@elizaos/shared` vs duplicate) |
| [#7667](https://github.com/elizaOS/eliza/issues/7667) **Tensor TPU / NNAPI RFC** | 🆕 Filed — long-tail follow-up to #7666 |
| [#7671](https://github.com/elizaOS/eliza/pull/7671) `FLAG_KEEP_SCREEN_ON` on Android `MainActivity` | 🔄 Open — APK already includes the fix; PR backports to the upstream Capacitor template so it survives `cap sync` |
| [milady #2148](https://github.com/milady-ai/milady/pull/2148) `MILADY_DEFAULT_THEME` → `ELIZA_DEFAULT_THEME` | 🔄 Open — unbreaks fresh-clone Vite builds on develop after the upstream theme rename |

---

## TL;DR

- **Today, sideloaded from `develop`**: text chat works locally, voice goes to Edge TTS (cloud). Expected TTFA ~1-2.5 s, network-bound.
- **After [#7666](https://github.com/elizaOS/eliza/issues/7666) lands**: Kokoro plays audio locally on the phone. ~1.3-1.5 s TTFA, fully on-device.
- **After [#7667](https://github.com/elizaOS/eliza/issues/7667) lands**: ~0.5-0.65 s TTFA, sub-watt power. Lunar Lake parity.
- **The bottleneck is engineering time, not hardware**: Pixel 9a's Tensor G4 is capable of all three tiers; we just haven't shipped the wiring for tiers 2 and 3 yet.
- **Recommendation today**: Llama-3.2-1B Q4_K_M as the LLM body. After Shaw publishes `eliza-1-0_8b`, switch to that for the W4-B + DFlash uplift.
