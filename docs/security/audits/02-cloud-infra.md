# SOC2 Type II Readiness Audit: Cloud Infrastructure
**Scope**: Cloud deployment, networking, container security, and operational controls  
**Date**: 2026-05-21  
**Status**: In-Progress Towards Compliance

---

## Executive Summary

The Eliza monorepo demonstrates a modern, infrastructure-as-code approach to cloud deployment with several SOC2-aligned controls in place (Kubernetes RBAC, GCS backups, Terraform IaC, GKE Autopilot). However, critical gaps exist in container security posture, secrets management, logging/monitoring, vulnerability scanning, and change management that must be remediated before SOC2 Type II audit.

**Key Findings**:
- **Multi-cloud hybrid**: GCP (primary, K8s), Railway (secondary), Cloudflare (edge), Hetzner (agent compute)
- **Backup/DR**: PostgreSQL CNPG daily backups to GCS (30d retention prod, 7d staging) with no restore testing documented
- **Secrets**: Hardcoded credentials in docker-compose.yml; plaintext JWT secrets; no documented secrets rotation SLA
- **Container Runtime**: Runs as root; no securityContext restrictions; no read-only filesystem; no network policies
- **Monitoring**: No SIEM, no centralized logging, no SLA-bound alert thresholds, retention periods undefined
- **CI/CD**: GitHub Actions with Workload Identity Federation (+ ); no container image signing; provenance disabled
- **Dependency Scanning**: Not configured; no CVE scanning in CI; no Dependabot/Renovate

**Maturity Level**: Early/Intermediate (50–60% of SOC2 controls mapped)

---

## Critical Gaps (P0)

### 1. **Hardcoded Secrets in Version Control**
- **Location**: `/Users/shawwalters/eliza-workspace/milady/eliza/packages/cloud-infra/cloud/docker-compose.yml`
- **Issue**: 
  - `POSTGRES_PASSWORD: postgres` (line 19)
  - `AUTH_JWT_SECRET: super-secret-jwt-token-...` (line 41)
  - `PGRST_JWT_SECRET: super-secret-jwt-token-...` (line 45)
  - S3 credentials hardcoded in storage config (lines 54–55)
- **SOC2 Control**: CC6.1 (logical access), CC7.2 (change management)
- **Remediation**:
  - Rotate all exposed credentials immediately
  - Use `secrets.local.env` (gitignored) for local dev
  - Inject production secrets via Kubernetes Secrets or GCP Secret Manager
  - Enable secret scanning in `.github/settings.json` (pre-commit hook)
  - Audit git history for leaked keys (BFG, git-secrets)

### 2. **No Container Security Context (Runs as Root)**
- **Location**: `/Users/shawwalters/eliza-workspace/milady/deploy/Dockerfile.ci`
- **Issue**:
  - No `USER` directive; runs as `root` (UID 0)
  - No `securityContext.runAsNonRoot` in K8s manifests
  - No `securityContext.readOnlyRootFilesystem`
  - No capability dropping (`securityContext.capabilities.drop: [ALL]`)
- **SOC2 Control**: CC6.3 (access restrictions), A1.2 (system hardening)
- **Remediation**:
  - Create non-root user in Dockerfile: `RUN useradd -m app && USER app`
  - Add K8s `securityContext` to agent server template:
    ```yaml
    securityContext:
      runAsNonRoot: true
      runAsUser: 1000
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
    ```
  - Mount `/tmp` and `/var/tmp` as tmpfs for temp files
  - Document in `/Users/shawwalters/eliza-workspace/milady/eliza/packages/cloud-infra/cloud/terraform/gcp/02-k8s/main.tf`

### 3. **No Centralized Logging or Syslog**
- **Location**: Entire infrastructure
- **Issue**:
  - No `stdout`/`stderr` collection mentioned
  - No SIEM integration (Datadog, Splunk, ELK)
  - Terraform backup retention only (30d prod, 7d staging) — no log index/search
  - No audit trail of who deployed what
- **SOC2 Control**: CC7.1 (system monitoring), CC7.4 (incident response), A1.1 (availability monitoring)
- **Remediation**:
  - Deploy Fluent Bit DaemonSet to K8s cluster (collect container logs → GCS / Cloud Logging)
  - Enable GCP Cloud Logging for all resources:
    ```hcl
    # terraform/gcp/02-k8s/main.tf
    resource "google_logging_project_sink" "k8s_events" {
      name        = "k8s-events"
      destination = "storage.googleapis.com/${google_storage_bucket.logs.name}"
      filter      = "resource.type=k8s_cluster"
    }
    ```
  - Set log retention to ≥1 year (SOC2 requirement)
  - Create CloudWatch/Stackdriver dashboard for alerts (error rates, pod restarts, etc.)

### 4. **No Image Scanning or Container Vulnerability Management**
- **Location**: `.github/workflows/build-cloud-image.yml`, no Snyk/Trivy step
- **Issue**:
  - No CVE scanning on image build
  - No container registry vulnerability scanning enabled
  - No SLA for patching critical CVEs
  - Base image (`node:22-slim`) not pinned to digest
- **SOC2 Control**: CC6.2 (threat/vulnerability management), A1.3 (patch management)
- **Remediation**:
  - Add Trivy scan step to CI (after docker build):
    ```yaml
    - name: Scan image with Trivy
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: ${{ steps.build.outputs.image }}
        exit-code: '1'  # Fail on CRITICAL
        severity: 'CRITICAL,HIGH'
    ```
  - Pin Node base image to digest: `node:22.20.0@sha256:<hash>`
  - Enable Artifact Registry vulnerability scanning (GCP)
  - Document patching SLA: **CRITICAL** <1 day, **HIGH** <7 days

### 5. **No Network Policies (East–West Traffic Unsegmented)**
- **Location**: `/Users/shawwalters/eliza-workspace/milady/eliza/packages/cloud-infra/cloud/local/manifests/`
- **Issue**:
  - No `NetworkPolicy` resources defined
  - Redis/PostgreSQL accessible from any pod
  - No egress filtering; pods can reach external networks without restriction
  - No mTLS between services
- **SOC2 Control**: CC6.6 (network segmentation), A1.2 (system boundaries)
- **Remediation**:
  - Create default-deny NetworkPolicy per namespace:
    ```yaml
    # /cloud-infra/cloud/local/manifests/network-policy-default-deny.yaml
    apiVersion: networking.k8s.io/v1
    kind: NetworkPolicy
    metadata:
      name: default-deny
    spec:
      podSelector: {}
      policyTypes:
      - Ingress
      - Egress
    ```
  - Whitelist agent → database, agent → gateway, gateway ↔ Redis
  - Document in K8s manifests
  - Test with `kubectl get netpol -A` after deploy

---

## High Gaps (P1)

### 6. **No Container Image Signing or Supply Chain Provenance**
- **Location**: `.github/workflows/build-cloud-image.yml` line 552: `provenance: false`
- **Issue**:
  - SLSA provenance disabled (cannot verify image origin/build conditions)
  - No cosign signing (no way to verify image was built by CI)
  - No attestations; any image can be pushed with correct tag
- **SOC2 Control**: CC8.1 (change management), A1.2 (deployment integrity)
- **Remediation**:
  - Enable SLSA provenance: `provenance: true`
  - Add cosign signing step:
    ```yaml
    - name: Sign image with Cosign
      run: |
        cosign sign --key ${{ secrets.COSIGN_PRIVATE_KEY }} \
          ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ steps.version.outputs.version_clean }}
    ```
  - Store cosign public key in repo (or OIDC-based keyless signing via GitHub OIDC)
  - Require image verification in K8s admission policy

### 7. **No Dependency Scanning or SCA (Software Composition Analysis)**
- **Location**: No `dependabot.yml`, `renovate.json`, or Snyk config
- **Issue**:
  - No automated detection of vulnerable npm packages
  - Transitive dependencies not tracked
  - No PR audit for high/critical CVEs
  - Pinned eliza ref to SHA in `.github/workflows/build-cloud-image.yml` (line 66) but no update mechanism
- **SOC2 Control**: CC6.2 (threat/vulnerability management)
- **Remediation**:
  - Create `.github/dependabot.yml`:
    ```yaml
    version: 2
    updates:
      - package-ecosystem: npm
        directory: "/"
        schedule:
          interval: daily
        open-pull-requests-limit: 5
        allow:
          - dependency-type: direct
        reviewers: ["@milady-ai/security"]
    ```
  - Enable GitHub Secret Scanning and Dependency Alerts
  - Document critical CVE SLA (CRITICAL <24h, HIGH <7d)

### 8. **TLS/Encryption in Transit Not Enforced Everywhere**
- **Location**: Multiple services, docker-compose.yml (local dev OK, production unclear)
- **Issue**:
  - Unclear if all services (Redis, PostgreSQL, gateway APIs) enforce TLS
  - docker-compose.yml uses plain HTTP for storage-api (line 62: `wget -q -O - http://localhost:5000/status`)
  - No mention of mTLS between services (operator, agents, gateways)
  - App API on Cloudflare Workers (TLS ✓), but internal K8s services unclear
- **SOC2 Control**: CC6.7 (encryption in transit)
- **Remediation**:
  - Verify all service-to-service communication uses TLS:
    - PostgreSQL: `sslmode=require` in connection strings
    - Redis: `--tls` enabled, auth enforced
    - K8s API: GKE enforces TLS by default ✓
  - Add mTLS (Istio or Linkerd) for service mesh:
    ```yaml
    # terraform/gcp/02-k8s/main.tf
    resource "helm_release" "linkerd" {
      name       = "linkerd"
      chart      = "linkerd2"
      # ... with tlsPolicy: system
    }
    ```
  - Document TLS posture in security architecture doc

### 9. **No Defined RTO/RPO or Tested Disaster Recovery**
- **Location**: `terraform/gcp/01-foundation/main.tf`, `02-k8s/main.tf`
- **Issue**:
  - Backup configured (daily CNPG snapshots, 30d retention)
  - No documented RTO/RPO targets
  - No restore procedure documented or tested
  - Backup location (GCS) isolated from K8s, but single-region (no geo-redundancy)
- **SOC2 Control**: CC8.2 (disaster recovery), A1.3 (backup & recovery)
- **Remediation**:
  - Define RTO/RPO in architecture doc:
    - **RTO**: <1 hour (restore from backup)
    - **RPO**: 24 hours (daily backups acceptable)
  - Document restore procedure in `/eliza/packages/cloud-infra/DISASTER_RECOVERY.md`:
    ```bash
    # Restore from GCS backup
    gsutil cp gs://${PROJECT_ID}-pg-backups/${NAMESPACE}/latest /tmp/backup
    PGPASSWORD=... pg_restore -d app /tmp/backup
    ```
  - Schedule quarterly restore test (runbook + calendar alert)
  - Geo-replicate backup bucket to second region (future: `location_type: "DUAL_REGION"`)

### 10. **No Change Management Audit Trail**
- **Location**: GitHub Actions, but no deployment audit log centralization
- **Issue**:
  - CI/CD logs exist in GitHub (60-day retention default), but:
    - No export to long-term audit log store (GCS, Cloud Logging)
    - No human-readable audit trail of "who deployed what when"
    - Rollback capability not documented
  - Terraform state stored remotely (GCS) but no state locking documented
- **SOC2 Control**: CC8.1 (change management), CC7.4 (incident response)
- **Remediation**:
  - Archive GH Actions run logs to GCS:
    ```yaml
    # .github/workflows/build-cloud-image.yml
    - name: Archive logs to GCS
      if: always()
      run: |
        gsutil cp -r $GITHUB_WORKSPACE/logs \
          gs://${AUDIT_BUCKET}/ci-runs/$(date +%Y-%m-%d)/${GITHUB_RUN_ID}/
    ```
  - Add Terraform state locking in backend config:
    ```hcl
    terraform {
      backend "gcs" {
        bucket = "terraform-state"
        lock_bucket = "terraform-locks"
      }
    }
    ```
  - Document rollback process (revert commit, re-run CI)

---

## Medium Gaps (P2)

### 11. **Multi-Tenant Isolation Not Explicit**
- **Location**: `terraform/gcp/02-k8s/main.tf` (RBAC, namespace isolation)
- **Issue**:
  - Namespaces created per database cluster (`for_each = var.database_clusters`)
  - RBAC bindings per-namespace, but no explicit pod security policies
  - No NetworkPolicy documented to isolate tenant workloads
  - Secrets stored in K8s Secrets (opaque; encryption at rest via GKE default)
- **SOC2 Control**: A1.2 (multi-tenant boundaries)
- **Remediation** (lower priority):
  - Add PodSecurityPolicy per tenant namespace
  - Document tenant isolation model in architecture guide
  - Consider Gatekeeper OPA policies for network isolation enforcement

### 12. **No Centralized Alert/On-Call Management**
- **Location**: No alert configuration found
- **Issue**:
  - No CloudWatch/GCP Monitoring alert rules
  - No on-call schedule or escalation documented
  - No MTTR (mean time to recovery) SLA
- **SOC2 Control**: A1.1 (availability), CC7.1 (monitoring)
- **Remediation** (lower priority):
  - Define key metrics (CPU/memory/error rate) with thresholds
  - Example GCP alert:
    ```hcl
    resource "google_monitoring_alert_policy" "k8s_pod_restart" {
      display_name = "K8s pod restart rate > 5/min"
      conditions {
        display_name = "pod restart rate"
        condition_threshold {
          filter = "metric.type=kubernetes.io/pod/restart_count"
          comparison = "COMPARISON_GT"
          threshold_value = 5
        }
      }
    }
    ```

### 13. **No Egress Filtering / Firewall Rules Documentation**
- **Location**: Terraform network module not fully reviewed
- **Issue**:
  - VPC + Cloud NAT configured, but no explicit firewall rules shown
  - Unclear if outbound to external APIs is rate-limited
  - No WAF on public endpoints (Cloudflare may cover this)
- **SOC2 Control**: CC6.6 (network segmentation)
- **Remediation**:
  - Document firewall rules (GCP Firewall resources in Terraform)
  - Add explicit allow rules for external service calls (OpenAI, etc.)
  - Example:
    ```hcl
    resource "google_compute_firewall" "allow_dns_out" {
      name    = "allow-dns-out"
      network = module.network.vpc_self_link
      allow {
        protocol = "udp"
        ports    = ["53"]
      }
      destination_ranges = ["0.0.0.0/0"]
    }
    ```

### 14. **Docker Image Size & Supply Chain Transparency**
- **Issue**: Large multi-stage build; unclear if all dependencies are necessary
- **Current**: Dockerfile.ci ~670 lines with many npm stubs and patches
- **Remediation** (future optimization):
  - Generate SBOM (Software Bill of Materials) in CI
  - Use syft or cyclonedx to create attestation
  - Publish to image metadata (OCI Artifact)

---

## Existing Controls (✓ Mapped to SOC2)

| Control | Status | Evidence |
|---------|--------|----------|
| **CC6.1** Logical access — RBAC | ✓ Partial | K8s Roles/RoleBindings in Terraform; GitHub Actions WIF |
| **CC6.6** Network segmentation | ✓ Partial | GCP VPC, subnets; K8s namespaces; no NetworkPolicies |
| **CC6.7** Encryption in transit | ✓ Partial | GKE TLS, Cloudflare TLS; PostgreSQL/Redis unclear |
| **CC7.1** System monitoring | ✗ Missing | No SIEM, no centralized logging |
| **CC7.4** Incident response | ✗ Missing | No runbook, no alert escalation |
| **CC8.1** Change management | ✓ Partial | GitHub Actions CI, Terraform IaC; no audit trail export |
| **A1.1** Availability & redundancy | ✓ Partial | GKE Autopilot, KEDA autoscaling, daily backups |
| **A1.2** System hardening | ✗ Missing | No securityContext, no read-only FS, root user |
| **A1.3** Backup & DR | ✓ Partial | CNPG daily backups to GCS; no restore test, no RTO/RPO |

---

## Required Remediation Tasks (Concrete Actions)

| Task | Priority | Owner | Timeline | File(s) |
|------|----------|-------|----------|---------|
| **Rotate hardcoded secrets** | **P0** | Infra | Immediate | `docker-compose.yml` → env injection |
| **Add container securityContext** | **P0** | Infra | Week 1 | Dockerfile.ci, K8s manifests |
| **Deploy centralized logging** | **P0** | DevOps | Week 1–2 | New Fluent Bit Helm chart |
| **Add Trivy CVE scanning** | **P0** | CI/CD | Week 1 | `.github/workflows/build-cloud-image.yml` |
| **Define & enforce NetworkPolicies** | **P0** | Infra | Week 2 | `/cloud-infra/cloud/local/manifests/` |
| **Enable image signing (cosign)** | **P1** | CI/CD | Week 2 | `.github/workflows/build-cloud-image.yml` |
| **Add Dependabot for npm CVE tracking** | **P1** | DevOps | Week 1 | `.github/dependabot.yml` |
| **Document RTO/RPO & restore test** | **P1** | Infra | Week 2–3 | `DISASTER_RECOVERY.md` + runbook |
| **Audit trail export to GCS** | **P1** | DevOps | Week 3 | New job in CI workflow |
| **Add mTLS service mesh (future)** | **P2** | Arch | Month 2 | Istio/Linkerd spike |

---

## Compliance Roadmap

**Phase 1 (Now–Week 2)**: Critical gaps  
- [ ] Rotate secrets, enable Secret Manager injection
- [ ] Add container security contexts, non-root user
- [ ] Deploy Cloud Logging + Fluent Bit
- [ ] Add Trivy image scanning
- [ ] Create & enforce NetworkPolicies

**Phase 2 (Week 2–4)**: High-priority controls  
- [ ] Enable image signing & SLSA provenance
- [ ] Add Dependabot/Renovate
- [ ] Document RTO/RPO; schedule restore test
- [ ] Export deployment audit logs to GCS

**Phase 3 (Month 2+)**: Medium-term maturity  
- [ ] Implement mTLS service mesh
- [ ] Centralized alerts & on-call runbooks
- [ ] Complete multi-tenant isolation documentation
- [ ] SBOM & supply chain transparency

---

## SOC2 Audit Checklist

- [ ] **CC6.1**: RBAC fully implemented & tested → Pending k8s RBAC audit
- [ ] **CC6.2**: Vulnerability management SLA → Create patching runbook
- [ ] **CC6.3**: Access controls (non-root, securityContext) → P0 task
- [ ] **CC6.6**: Network segmentation (NetworkPolicies) → P0 task
- [ ] **CC6.7**: Encryption in transit (TLS everywhere) → Verify + document
- [ ] **CC7.1**: Monitoring & logging → Deploy Fluent Bit + alerting
- [ ] **CC7.2**: Anomaly detection → Cloud Monitoring custom metrics
- [ ] **CC7.4**: Incident response runbooks → Create runbook library
- [ ] **CC7.5**: Recovery procedures (backup/restore) → Test quarterly
- [ ] **CC8.1**: Change management & audit trail → Export to GCS
- [ ] **A1.1**: Availability & monitoring → Thresholds + escalation
- [ ] **A1.2**: System hardening & boundaries → securityContext + NetworkPolicy
- [ ] **A1.3**: Backup encryption & tested recovery → Test restore in staging

---

## Notes for Auditor

1. **Needs Verification**: Exact TLS/mTLS posture between services (PostgreSQL, Redis, agents) — not fully visible in current terraform/deployment configs
2. **Workspace Structure**: Multi-workspace monorepo (milady + eliza submodule); cloud infra is in `/eliza/packages/cloud-infra/`
3. **Hybrid Cloud**: GCP primary (GKE, GCS), Railway secondary (stateless workers), Hetzner (compute agents) — each needs network & monitoring rules
4. **References**:
   - GCP IaC: `/Users/shawwalters/eliza-workspace/milady/eliza/packages/cloud-infra/cloud/terraform/`
   - CI/CD: `/Users/shawwalters/eliza-workspace/milady/.github/workflows/`
   - Deployment: `/Users/shawwalters/eliza-workspace/milady/deploy/`

---

**Report Generated**: 2026-05-21  
**Next Review**: After P0 tasks completed (estimated Week 2)
