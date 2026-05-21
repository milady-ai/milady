# 23 — AI/ML Model Governance Policy

**Owner:** Engineering Lead (training) + Security Lead
**Review cadence:** Annual; per-model on release
**SOC2 mapping:** Eliza-specific (maps to CC3.4, CC6.8, C1, PI1)

## Purpose

Govern the lifecycle of AI/ML models Eliza ships or hosts: training data provenance, consent basis, model artifact integrity, prompt-asset integrity, and customer transparency.

## Scope

- Eliza-trained models (e.g., `eliza-1`, future variants) and chip / training pipeline.
- DSPy-optimized prompt artifacts loaded by `OptimizedPromptService` at runtime.
- Inference-time use of third-party LLM APIs.

## Training-Data Consent Classes

| Class | Description | Allowed for training? |
|---|---|---|
| **A — Public** | Open-license corpora, public web with permissive license | Yes |
| **B — Eliza-curated** | Synthetic, in-house generated, contractor-produced | Yes |
| **C — Customer opt-in** | Customer conversations / connector data where customer has given explicit, revocable, per-purpose consent | Yes, with the documented consent record |
| **D — Customer default** | Customer data without explicit opt-in | **No.** Default baseline. |
| **E — Sensitive** | Health, financial, government-restricted | **No** unless governed by a dedicated DPA carve-out |

## Policy Statements

1. **Default-no on customer data** — class D is the baseline. Customer opt-in (class C) requires:
   - explicit, granular consent UI naming the dataset and purpose,
   - revocation mechanism with retraining commitment if data is revoked,
   - logged in `audit_events` with the consent version.
2. **Data lineage manifest** — every published model has a manifest (`model_lineage.json`) recording: dataset class breakdown, dataset IDs, training run ID, optimizer (APOLLO), hyperparameters, evaluations, and the consent-version cut-off.
3. **Model artifact signing** — every released model artifact (gguf, safetensors, etc.) is signed via Sigstore Cosign keyless against the build's OIDC identity.
4. **DSPy prompt HMAC** — `OptimizedPromptService` verifies an HMAC over each prompt artifact on load; mismatches fail-closed and alert.
5. **Inference-time third-party models** — provider (Anthropic, OpenAI, etc.) is named in the relevant feature's UI; data-sharing posture follows the provider's API terms (typically: do not train on API data).
6. **Model card** — every released model has a public model card noting capabilities, limitations, training data classes, evaluation results, and known failure modes.
7. **Red-team** — before public release of a new Eliza model, a documented adversarial evaluation is performed (prompt injection, jailbreak, training-data extraction).

## Procedures

- Training-run sign-off: training engineer files the lineage manifest; Security Lead reviews consent-class breakdown before release tag.
- HMAC key rotation per [`12-cryptography.md`](12-cryptography.md).

## Evidence

- `model_lineage.json` per release tag.
- Cosign signatures.
- Consent-record audit events (sample).
- Model cards (public).
- Red-team report archive.

## Open Items For Human Sign-Off

- Final consent UI copy.
- Red-team vendor or internal owner.
