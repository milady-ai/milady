# M09 — LlamaCppCapacitor → static linkage

**Owner:** TBD
**Status:** Not started
**Predecessors:** M08
**Successors:** M10

## Goal

`libllama.a` cross-built for iOS arm64 with Metal enabled. The agent's `LocalInferenceLoader` route through a new `@elizaos/plugin-ios-bun-bridge` plugin reaches `llama_*` symbols via `bun:ffi` over the static-link path. Tokens generate against Eliza-1 0.6B from the agent JS.

## Acceptance Criteria

- [ ] `vendor-deps/build-llama-cpp-ios.sh` produces `libllama.a` for `aarch64-ios` and `aarch64-ios-simulator`.
- [ ] Built with `LLAMA_METAL=ON`, no CUDA/Vulkan flags.
- [ ] Metal shaders embedded (Apple's `metallib` format) as a resource.
- [ ] `libllama.a` linked into `libbun.a` (or as a separate static archive linked alongside).
- [ ] `bun:ffi`-via-allow-list resolves `llama_backend_init`, `llama_load_model_from_file`, `llama_decode`, `llama_sample_token`, etc.
- [ ] New `@elizaos/plugin-ios-bun-bridge` package:
  - Bundled into the iOS agent bundle
  - Registers `TEXT_LARGE` / `TEXT_SMALL` / `TEXT_EMBEDDING` handlers
  - Each handler calls into `llama_*` symbols via FFI
- [ ] Agent generates tokens against `Eliza-1 0.6B Q4_K_M.gguf` (bundled in app for dev; downloaded for App Store).
- [ ] Generation rate >= 5 tokens/sec on iPhone 15 Pro (Metal-accelerated).
- [ ] Tokens stream to WebView UI via `Bun.serve` HTTP loopback with chunked transfer.

## Allow-list (initial)

```zig
// stubs/ios-ffi-allowlist.zig — llama.cpp section
.{ .symbol = "llama_backend_init" },
.{ .symbol = "llama_backend_free" },
.{ .symbol = "llama_load_model_from_file" },
.{ .symbol = "llama_free_model" },
.{ .symbol = "llama_new_context_with_model" },
.{ .symbol = "llama_free" },
.{ .symbol = "llama_n_ctx" },
.{ .symbol = "llama_n_vocab" },
.{ .symbol = "llama_n_embd" },
.{ .symbol = "llama_token_eos" },
.{ .symbol = "llama_token_bos" },
.{ .symbol = "llama_decode" },
.{ .symbol = "llama_get_logits" },
.{ .symbol = "llama_get_logits_ith" },
.{ .symbol = "llama_sample_token" },
.{ .symbol = "llama_sample_token_greedy" },
.{ .symbol = "llama_sample_softmax" },
.{ .symbol = "llama_sample_temp" },
.{ .symbol = "llama_sample_top_k" },
.{ .symbol = "llama_sample_top_p" },
.{ .symbol = "llama_sample_min_p" },
.{ .symbol = "llama_sample_repetition_penalties" },
.{ .symbol = "llama_token_to_piece" },
.{ .symbol = "llama_tokenize" },
.{ .symbol = "llama_batch_init" },
.{ .symbol = "llama_batch_free" },
.{ .symbol = "llama_kv_cache_clear" },
.{ .symbol = "llama_kv_cache_seq_cp" },
.{ .symbol = "llama_kv_cache_seq_rm" },
```

## Effort estimate

- Nominal: 2 weeks
- With Metal shader path debugging: 3 weeks

## Notes

The desktop / Android side already has the wiring via `aosp-llama-adapter.ts` and `capacitor-llama-adapter.ts`. iOS gets a third adapter (`ios-bun-llama-adapter.ts`) that uses `bun:ffi` directly against the statically-linked `libllama.a`. The contract (`LocalInferenceLoader`) is the same; only the call mechanism differs.
