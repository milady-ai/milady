/*
 * milady_llama_shim.c — pointer-style wrapper around llama.cpp's
 * struct-by-value entry points.
 *
 * Why this file exists:
 *   bun:ffi (the AOSP runtime's only path to native code) cannot pass C
 *   structs by value to a foreign function. llama.cpp's loader API uses
 *   struct-by-value pervasively:
 *     - llama_model_default_params(void)              -> struct
 *     - llama_context_default_params(void)            -> struct
 *     - llama_sampler_chain_default_params(void)      -> struct
 *     - llama_model_load_from_file(path, struct params)
 *     - llama_init_from_model(model, struct params)
 *     - llama_sampler_chain_init(struct params)
 *
 *   Without this shim, the adapter previously passed zeroed buffers to those
 *   call sites. That clobbered the real defaults (most importantly
 *   model_params.use_mmap = true; setting it to false forces the loader to
 *   read the entire weights file into RAM, which is correctness-impacting
 *   on phones with tight memory budgets) and silently degraded inference.
 *
 *   The shim materializes each struct on the heap with the canonical
 *   defaults from llama.cpp's *_default_params() helpers, exposes
 *   field-by-field setters for the subset the adapter actually overrides,
 *   then unwraps the pointer back into a struct argument when calling the
 *   real entry points.
 *
 * llama.cpp pin: apothic/llama.cpp-1bit-turboquant @ main-b8198-b2b5273
 *   (== upstream llama.cpp b8198 + TurboQuant KV-cache patch)
 *   Field set verified against
 *     ~/.cache/milady-android-agent/llama-cpp-main-b8198-b2b5273/include/llama.h
 *   Specifically:
 *     llama_model_params:           lines 280-320
 *     llama_context_params:         lines 329-381
 *     llama_sampler_chain_params:   one field: no_perf
 *
 * Drift since the b4500 pin:
 *   - llama_context_params.flash_attn (bool) → flash_attn_type (enum). The
 *     bool setter has been removed; the adapter never called it.
 *   - llama_context_params gains type_k / type_v (ggml_type for K/V cache),
 *     samplers / n_samplers (sampler-seq config), swa_full, kv_unified.
 *     Setters for type_k / type_v are now exposed below to drive the
 *     TurboQuant KV-cache integration (Bonsai-8B-1bit ships a TBQ-trained
 *     1-bit GGUF that needs type_k=tbq4_0 / type_v=tbq3_0 for the memory
 *     win to materialise on phone CPU).
 *   - llama_model_params gains use_direct_io / use_extra_bufts / no_host /
 *     no_alloc; defaults are fine for AOSP CPU, no setters needed.
 *
 * Setter coverage strategy:
 *   We expose only the fields the adapter currently calls or is likely to
 *   override in the near term. Adding a new setter is a one-line C edit
 *   plus a one-line dlopen entry; it does NOT require touching llama.cpp.
 *   Fields not covered (tensor_split, kv_overrides, progress_callback, etc.)
 *   keep whatever default *_default_params() stamped — which is exactly
 *   what we want for now.
 *
 * Memory ownership:
 *   *_default() returns a malloc'd pointer. Caller MUST call the matching
 *   *_free() after the load/init/chain-init call returns. Leaking a few
 *   hundred bytes per process boot is harmless, but the adapter pairs
 *   each default() with a free() in a try/finally so the pattern stays
 *   clean.
 *
 * ABI:
 *   Compiled per-Android-ABI as `libmilady-llama-shim.so` and shipped
 *   alongside `libllama.so`. The shim NEEDED-links libllama.so so the
 *   dynamic linker resolves llama.cpp symbols at load time via the
 *   per-ABI LD_LIBRARY_PATH MiladyAgentService.java sets.
 */

#include "llama.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ------------------------------------------------------------------ */
/* llama_model_params                                                  */
/* ------------------------------------------------------------------ */

struct llama_model_params * milady_llama_model_params_default(void) {
    struct llama_model_params defaults = llama_model_default_params();
    struct llama_model_params * out = (struct llama_model_params *) malloc(sizeof(struct llama_model_params));
    if (out == NULL) return NULL;
    /* Plain-data struct as of llama.cpp b4500 (verified llama.h:278-310 — the
     * only pointer fields are `devices`, `tensor_split`, `rpc_servers`,
     * `progress_callback`, `progress_callback_user_data`, `kv_overrides`, and
     * the defaults zero them out). A shallow memcpy is safe. If a future
     * llama.cpp bump adds a pointer field that requires deep-copy or owned
     * lifetime semantics, this memcpy must be replaced with explicit
     * field copies. */
    memcpy(out, &defaults, sizeof(struct llama_model_params));
    return out;
}

void milady_llama_model_params_free(struct llama_model_params * p) {
    free(p);
}

void milady_llama_model_params_set_n_gpu_layers(struct llama_model_params * p, int32_t v) {
    if (p != NULL) p->n_gpu_layers = v;
}

void milady_llama_model_params_set_use_mmap(struct llama_model_params * p, bool v) {
    if (p != NULL) p->use_mmap = v;
}

void milady_llama_model_params_set_use_mlock(struct llama_model_params * p, bool v) {
    if (p != NULL) p->use_mlock = v;
}

void milady_llama_model_params_set_vocab_only(struct llama_model_params * p, bool v) {
    if (p != NULL) p->vocab_only = v;
}

void milady_llama_model_params_set_check_tensors(struct llama_model_params * p, bool v) {
    if (p != NULL) p->check_tensors = v;
}

struct llama_model * milady_llama_model_load_from_file(const char * path, const struct llama_model_params * p) {
    if (p == NULL) return NULL;
    return llama_model_load_from_file(path, *p);
}

/* ------------------------------------------------------------------ */
/* llama_context_params                                                */
/* ------------------------------------------------------------------ */

struct llama_context_params * milady_llama_context_params_default(void) {
    struct llama_context_params defaults = llama_context_default_params();
    struct llama_context_params * out = (struct llama_context_params *) malloc(sizeof(struct llama_context_params));
    if (out == NULL) return NULL;
    memcpy(out, &defaults, sizeof(struct llama_context_params));
    return out;
}

void milady_llama_context_params_free(struct llama_context_params * p) {
    free(p);
}

void milady_llama_context_params_set_n_ctx(struct llama_context_params * p, uint32_t v) {
    if (p != NULL) p->n_ctx = v;
}

void milady_llama_context_params_set_n_batch(struct llama_context_params * p, uint32_t v) {
    if (p != NULL) p->n_batch = v;
}

void milady_llama_context_params_set_n_ubatch(struct llama_context_params * p, uint32_t v) {
    if (p != NULL) p->n_ubatch = v;
}

void milady_llama_context_params_set_n_threads(struct llama_context_params * p, int32_t v) {
    if (p != NULL) p->n_threads = v;
}

void milady_llama_context_params_set_n_threads_batch(struct llama_context_params * p, int32_t v) {
    if (p != NULL) p->n_threads_batch = v;
}

void milady_llama_context_params_set_embeddings(struct llama_context_params * p, bool v) {
    if (p != NULL) p->embeddings = v;
}

void milady_llama_context_params_set_offload_kqv(struct llama_context_params * p, bool v) {
    if (p != NULL) p->offload_kqv = v;
}

/* pooling_type is enum llama_pooling_type, ABI-wise an int. We accept i32. */
void milady_llama_context_params_set_pooling_type(struct llama_context_params * p, int32_t v) {
    if (p != NULL) p->pooling_type = (enum llama_pooling_type) v;
}

/* type_k / type_v are enum ggml_type, ABI-wise an int. We accept i32 so the
 * adapter can pass the GGML_TYPE_TBQ3_0 (43) / GGML_TYPE_TBQ4_0 (44)
 * constants from llama.cpp-1bit-turboquant. Stock ggml types
 * (GGML_TYPE_F16 = 1, GGML_TYPE_Q4_0 = 2, etc.) work too — this is just
 * the canonical KV-cache type field.
 *
 * Wiring these turns on the fork's CPU TurboQuant KV-cache path. The
 * tbq{3,4}_0 codebooks live in ggml/src/ggml-quants.c; the CPU vec-dot
 * implementations live in ggml/src/ggml-cpu/quants.c. Storage is
 * 14 bytes per 32 floats (tbq3_0) / 16 bytes per 32 floats (tbq4_0)
 * vs 64 bytes for fp16 — a ~4x KV-cache memory reduction on phones. */
void milady_llama_context_params_set_type_k(struct llama_context_params * p, int32_t v) {
    if (p != NULL) p->type_k = (enum ggml_type) v;
}

void milady_llama_context_params_set_type_v(struct llama_context_params * p, int32_t v) {
    if (p != NULL) p->type_v = (enum ggml_type) v;
}

struct llama_context * milady_llama_init_from_model(struct llama_model * model, const struct llama_context_params * p) {
    if (p == NULL) return NULL;
    return llama_init_from_model(model, *p);
}

/* ------------------------------------------------------------------ */
/* llama_sampler_chain_params                                          */
/* ------------------------------------------------------------------ */

struct llama_sampler_chain_params * milady_llama_sampler_chain_params_default(void) {
    struct llama_sampler_chain_params defaults = llama_sampler_chain_default_params();
    struct llama_sampler_chain_params * out =
        (struct llama_sampler_chain_params *) malloc(sizeof(struct llama_sampler_chain_params));
    if (out == NULL) return NULL;
    memcpy(out, &defaults, sizeof(struct llama_sampler_chain_params));
    return out;
}

void milady_llama_sampler_chain_params_free(struct llama_sampler_chain_params * p) {
    free(p);
}

void milady_llama_sampler_chain_params_set_no_perf(struct llama_sampler_chain_params * p, bool v) {
    if (p != NULL) p->no_perf = v;
}

struct llama_sampler * milady_llama_sampler_chain_init(const struct llama_sampler_chain_params * p) {
    if (p == NULL) return NULL;
    return llama_sampler_chain_init(*p);
}

#ifdef __cplusplus
}
#endif
