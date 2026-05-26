# SOC2 Type II Audit: Training Pipeline, Models, & AI Supply Chain
**Scope:** Training infrastructure, model artifacts, hardware/chip integration, inference-time prompt artifacts  
**Date:** 2026-05-21  
**Status:** CRITICAL GAPS IDENTIFIED

---

## Executive Summary

The Eliza monorepo implements a **production-grade training pipeline** (`packages/training`) with native privacy filtering, HuggingFace artifact management, and quantization infrastructure. However, **critical SOC2 compliance gaps** exist around customer data handling, artifact integrity verification, and training infrastructure access control.

**Key Finding:** Training uses **user-generated trajectories** collected nightly from the Eliza runtime (`~/.local/state/eliza/training/datasets/<YYYY-MM-DD>/`). While a **local privacy filter** is implemented, **no explicit consent mechanism** is documented, and **no data lineage tracking** connects trained models back to their original data sources for customer/DPA compliance.

---

## Critical Gaps

### 1. **NO Explicit Customer Consent / Data Use Agreement (CC6.1, PI1.1-PI1.5, C1.1)**

**Finding:**  
- Nightly trajectory exports are collected from running Eliza instances into `~/.local/state/eliza/training/datasets/`.
- `datasets.yaml` lists `eliza-nightly-*` sources as **proprietary** but does **not document**:
  - Whether end-users opted into trajectory collection for training
  - Whether a Data Processing Agreement (DPA) exists with customers
  - Customer notification of training use
  - Data retention / deletion policies

**Location:**  
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/training/datasets.yaml` (lines 75–153)
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/training/README.md` (no DPA, consent, or user notification language)

**Impact:** **CRITICAL for SOC2 PI1 (Processing Integrity) & C1.1 (Confidentiality).**  
If customer chats are trained without explicit consent, this is a **material SOC2 violation**.

**Remediation:** 
- [ ] Document customer consent flow for trajectory collection (opt-in, opt-out, granular controls)
- [ ] Create Data Processing Agreement (DPA) attachment for customers
- [ ] Implement user-visible opt-out mechanism in Eliza runtime
- [ ] Audit nightly exports to confirm only consented data is collected
- [ ] Add `consentRequirement: true` to each trajectory data source in `datasets.yaml`

---

### 2. **No Data Lineage / Model ↔ Training Data Traceability (CC8.1, CC6.8)**

**Finding:**  
- Models are published to HuggingFace (`elizaos/eliza-1`) with a **manifest** (`eliza1_manifest.py`).
- Manifest contains **release state, kernel versions, and backends** but **NOT**:
  - Training dataset manifest (which source datasets contributed)
  - Hash/version of training data for reproducibility
  - Timestamp of training run tied to nightly export dates
  - Data lineage back to original customer/source

**Location:**  
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/training/scripts/manifest/eliza1_manifest.py` (lines 1–120+)
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/training/README.md` (manifest schema includes no data provenance)

**Impact:** **HIGH for CC8.1 (Change Management) & CC6.8 (Artifact Integrity).**  
Cannot audit which training data was used. Cannot assess customer data exposure in a breach.

**Remediation:**
- [ ] Extend manifest to include training dataset SHA256 references
- [ ] Generate `manifest.training_data_lineage` JSON listing sources, dates, record counts
- [ ] Publish training manifest alongside model (HF side car or separate JSON)
- [ ] Implement audit trail: `scripts/publish/publish_model.py` must emit lineage before push

---

### 3. **Model Artifact Integrity: No Signature Verification (CC6.8)**

**Finding:**  
- Models are published as GGUF files with SHA256 checksums computed locally.
- **No digital signature or GPG signing** before HF push.
- **No verification** that downloaded models haven't been tampered with at HF or in transit.
- HuggingFace downloads are not verified against a public key or attestation.

**Location:**  
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/training/scripts/publish_eliza1_model.py` (lines 100–180):
  - `_sha256_file()` computes hash locally
  - No signing before upload
  - No signature check in `README.md` or manifest

**Impact:** **MEDIUM for CC6.8 (Artifact Integrity).**  
Malicious actor at HF (or MITM) could substitute a backdoored model.

**Remediation:**
- [ ] Implement GPG signing of GGUF files before HF push (`publish_eliza1_model.py`)
- [ ] Store public key in repo and document verification step in README
- [ ] Publish signature sidecar to HF alongside GGUF
- [ ] Runtime must verify signature on model download (inference-side, not training)

---

### 4. **Training Infrastructure Credentials Not Audited (CC6.1)**

**Finding:**  
- Training scripts accept credentials via environment variables:
  - `HF_TOKEN` (HuggingFace push access)
  - `VAST_API_KEY` (GPU rental provider)
  - `AWS_*` credentials for S3 (potential)
  
- **No credential rotation policy** documented.
- **No audit trail** of who ran training with which credentials.
- Secrets are passed to subprocess calls without explicit handling.

**Location:**  
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/training/scripts/publish_all_finetuned.py` (lines ~200–250): passes `HF_TOKEN` to subprocess
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/training/README.md` (line 159): documents `VAST_API_KEY=...` inline

**Impact:** **MEDIUM for CC6.1 (Access Control).**  
Token compromise allows unauthorized model uploads or GPU rental.

**Remediation:**
- [ ] Document credential requirements in AGENTS.md (HF_TOKEN, VAST_API_KEY sources)
- [ ] Use secure credential store (HashiCorp Vault, AWS Secrets Manager) instead of env vars
- [ ] Add audit logging: log (hash of token, user, timestamp, action) before training
- [ ] Implement token rotation on each publish cycle

---

### 5. **Optimized Prompts Writable Without Integrity Check (CC6.8, Inference-time risk)**

**Finding:**  
- DSPy/MIPRO optimized prompts are written to `~/.local/state/eliza/optimized-prompts/<task>/` as JSON.
- **No write permission check**: any process that can write to `~/.local/state/eliza/` can poison prompts.
- **No signature or checksum** of optimized prompt artifacts.
- At inference time, the runtime loads from `current` symlink without validation.
- Malicious actor with local filesystem access can substitute an adversarial prompt.

**Location:**  
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/core/src/services/optimized-prompt.ts` (lines 40–677):
  - `setPrompt()` writes JSON to disk (line 394) with no sig check
  - `getPrompt()` reads `current` symlink (line 339) without validation
  - No mention of HMAC, signature, or checksum verification

**Impact:** **HIGH for inference-time prompt injection attack.**  
Attacker can rewrite prompts to exfiltrate data, change model behavior, or cause resource exhaustion.

**Remediation:**
- [ ] Implement HMAC-SHA256 on optimized prompt JSON (`"hmac": sha256(json_content, key)`)
- [ ] Load key from secure store (not hardcoded)
- [ ] Verify HMAC on `getPrompt()` before returning artifact (line 656–676)
- [ ] Restrict write access to `~/.local/state/eliza/optimized-prompts/` to trusted optimizer process only
- [ ] Add audit logging of prompt mutations

---

### 6. **Chip / Hardware Package: Firmware Update Path Not Audited (CC6.1, Physical Security)**

**Finding:**  
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/chip` contains RISC-V SoC design, bootloader, firmware.
- **No firmware signing or attestation** documented in `AGENTS.md` or chip RTL.
- **No secure boot** evidence in DTS, bootloader configs, or firmware scripts.
- Fabrication / programming interfaces (OpenOCD, QEMU, Renode) are not restricted.

**Location:**  
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/chip/AGENTS.md` (lines 1–66): no firmware integrity or secure boot mention
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/chip/fw/` (firmware payloads, no signing logic)

**Impact:** **CRITICAL for supply chain if deployed to customer devices.**  
Unsigned firmware allows attacker to load malicious kernel, exfiltrate data, or DOS.

**Remediation:**
- [ ] Implement firmware signing with hardware-backed keys (likely RSA-4096)
- [ ] Document secure boot ROM validation flow in `chip/docs/security.md`
- [ ] Create attestation certificate chain (root → platform → firmware)
- [ ] Gate bootloader to reject unsigned firmware with test-vector proof

---

### 7. **HuggingFace Model Deserialization Risk (Pickle, Code execution)**

**Finding:**  
- Models are GGUF format (safe), but:
  - **No verification** that the downloaded file is actually GGUF (not pickle/safetensors with hidden code)
  - Inference code may fall back to transformers library loading (which supports pickle)
  - **No sandboxing** of model loading

**Location:**  
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/training/scripts/publish_eliza1_model.py` (lines 112–138): checks for GGUF but does not verify runtime deserialization
- Inference code location (not training-scoped, but supply-chain risk)

**Impact:** **MEDIUM for supply chain.**  
Compromised HF account + pickle deserialization = RCE on inference machine.

**Remediation:**
- [ ] Document model format in manifest (GGUF only, no pickle)
- [ ] Add `--trust-remote-code=false` guard in inference code
- [ ] Validate GGUF magic bytes before loading (first 4 bytes: `0x47 0x47 0x55 0x46`)

---

## High-Severity Gaps

### 8. **Training Data Sanitization: "Best Effort" Privacy Filter, Not Mandatory (PI1.1, C1.1)**

**Finding:**  
- Privacy filter is implemented (`privacy_filter_trajectories.py`, 1500+ lines), but:
  - Filter is **not mandatory** in all training paths
  - `--strict` flag makes residual patterns **fail the run**, but flag is optional
  - External backend (`--backend-command`) can be configured but is not default
  - Some trajectory sources bypass filter entirely:
    - `eliza-nightly-*` sources documented as "already sanitized by runtime privacy filter" (line 75)
    - **No proof** that TS runtime filter is equivalent to Python filter

**Location:**  
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/training/scripts/privacy_filter_trajectories.py` (lines 1241–1357): filtering is not gated
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/training/datasets.yaml` (line 75): assumes TS filter sufficiency without proof

**Impact:** **HIGH for PI1.1 & C1.1.**  
Residual PII (names, emails, lat/lon) can leak into training data undetected.

**Remediation:**
- [ ] Make `--strict` the default for all production training runs
- [ ] Require `--backend-command` (OpenAI Privacy Filter or equivalent) for proprietary data
- [ ] Prove equivalence of TS runtime filter vs. Python filter (cross-audit)
- [ ] Block `pack_dataset.py` unless privacy filter attestation is present (SHA256 proof)

---

### 9. **Scenario Runner: No Audit of Privileged Scenario Execution (CC6.1)**

**Finding:**  
- Scenario runner (`packages/scenario-runner`) executes arbitrary test scenarios.
- **No validation** that scenarios don't:
  - Write to unauthorized directories
  - Exfil data to external systems
  - Launch privileged commands

**Location:**  
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/scenario-runner/src/executor.ts` (no sandboxing or capability restriction mentioned)

**Impact:** **MEDIUM for CI/CD supply chain.**  
Attacker can submit a PR with a malicious scenario that exfils training data or credentials from CI.

**Remediation:**
- [ ] Sandbox scenario execution (seccomp, pledge, or container)
- [ ] Whitelist allowed file I/O paths
- [ ] Block network access unless explicitly opted in per scenario
- [ ] Audit scenario definitions in CI before execution

---

## Medium-Severity Gaps

### 10. **No Model Versioning Strategy / Reproducibility Proof (CC8.1)**

**Finding:**  
- Training scripts use `run_pipeline.py` with `--epochs`, `--max-samples` flags.
- **No recorded metadata** of exact training parameters saved with model.
- **Cannot reproduce** the exact model from scratch without original training data + exact parameters.

**Remediation:**
- [ ] Save `training_config.json` (epochs, batch size, lr, seed, dataset hash) alongside model
- [ ] Publish to HF in model README or manifest
- [ ] Generate reproducibility proof: re-run training with same config, compare model hashes

---

### 11. **Nightly Trajectory Exports: No Retention / Deletion Policy (PI1.3, PI1.4)**

**Finding:**  
- `~/.local/state/eliza/training/datasets/<YYYY-MM-DD>/` accumulates indefinitely.
- **No documented retention period** (e.g., "delete after 30 days" or "retain for 1 year").
- **No automated purge** of old export directories.

**Remediation:**
- [ ] Document retention policy in AGENTS.md (recommend 90 days for compliance)
- [ ] Implement automated deletion cron (e.g., `find ~/.local/state/eliza/training/datasets -mtime +90 -delete`)
- [ ] Log deletions for audit trail

---

## Existing Controls

### Strengths

1. **Privacy Filter is Comprehensive** (lines 1–1533 of `privacy_filter_trajectories.py`):
   - Regex patterns for secrets (OpenAI, Anthropic, GitHub, AWS keys)
   - Geo coordinate redaction (JSON-aware)
   - Contact PII redaction (email, phone, handles, names)
   - Optional external backend (OpenAI Privacy Filter)
   - Ledger + attestation output

2. **Privacy Attestation Schema**:
   - `FilterStats` records redactions by category, label, source
   - Attestation JSON includes `residual_findings` (high-risk patterns that survived)
   - Attestation failure blocks strict mode

3. **Manifest + Release State Tracking**:
   - `eliza1_manifest.py` enforces kernel requirements (TurboQuant, QJL, PolarQuant)
   - Release state enum prevents publishing incomplete models
   - Manifest validator checks provenance

4. **Optimized Prompt Versioning** (optimized-prompt.ts):
   - Symlink-based versioning (current, previous, previous2)
   - Auto-pruning to last 5 versions
   - Rollback capability

---

## Required Remediation Tasks

### Phase 1: CRITICAL (30 days)

- [ ] Document customer consent / opt-in flow for trajectory collection
- [ ] Implement firmware signing in chip package (RSA-4096 + attestation chain)
- [ ] Add mandatory `--strict` privacy filtering gate to training publish pipeline
- [ ] Create Data Processing Agreement (DPA) template for customers
- [ ] Extend manifest to include training data lineage (sources, hashes, dates)

### Phase 2: HIGH (60 days)

- [ ] Implement model artifact GPG signing + verification
- [ ] Add HMAC verification to optimized prompt loading (inference-time)
- [ ] Audit TS runtime privacy filter equivalence vs. Python filter
- [ ] Implement secure credential management (Vault or AWS Secrets Manager)
- [ ] Document and enforce scenario sandbox restrictions

### Phase 3: MEDIUM (90 days)

- [ ] Set up nightly trajectory retention policy + deletion cron
- [ ] Create reproducibility test: re-train model from manifest, verify hash match
- [ ] Add scenario execution audit logging
- [ ] Document model versioning strategy in README
- [ ] Verify GGUF deserialization sandboxing

---

## Conclusion

The training pipeline is **functionally mature** with strong privacy filtering and artifact governance. However, **customer consent, data lineage, and artifact integrity** are not adequately addressed for SOC2 Type II compliance. The **firmware signing gap** is critical if chips are deployed to customer devices.

**Recommendation:** Prioritize Phase 1 remediation before any customer training data collection or model deployment.

