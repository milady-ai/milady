# SOC2 Operator Checklist

Canonical fill-in sheet for SOC2 placeholders and operator-owned gaps that are still live in the current repository. Fill this file first, then patch the referenced files with the chosen names, vendors, URLs, and deployment values.

## How to Use

1. Fill the `Decision / value` column.
2. Replace the placeholders in each `Source refs` entry.
3. Attach evidence in the GRC tool or the listed repo path.
4. Re-run `scripts/soc2/verify.sh` after the source refs are patched.

## People and Contacts

| Item | Decision / value | Evidence to attach | Source refs |
|---|---|---|---|
| Security Lead / CISO function |  | Appointment record; delegate list | `SOC2.md`; `POLICIES/01-information-security.md`; `docs/security/AUDIT-EVIDENCE-INVENTORY.md`; `docs/security/INCIDENT-RUNBOOK.md` |
| Engineering Lead for SOC2 controls |  | Owner assignment | `SOC2.md`; `POLICIES/09-business-continuity.md`; `POLICIES/14-logging-monitoring.md`; `POLICIES/23-ai-ml-model-governance.md` |
| DPO or privacy owner |  | DPO appointment or Security Lead designation | `POLICIES/19-privacy.md`; `POLICIES/22-data-subject-request.md` |
| Legal incident contact |  | Contact roster | `docs/security/INCIDENT-RUNBOOK.md`; `POLICIES/08-incident-response.md` |
| Communications incident contact |  | Contact roster | `docs/security/INCIDENT-RUNBOOK.md`; `POLICIES/08-incident-response.md` |
| `security@elizalabs.ai` mailbox monitors, at least two named people |  | Mailbox access export; paging route | `SECURITY.md`; `POLICIES/21-responsible-disclosure.md`; `docs/security/ai-pr-review-policy.md` |
| `privacy@elizaos.ai` inbox owner |  | Mailbox access export | `POLICIES/22-data-subject-request.md` |
| On-call paging tool and primary pager URL |  | PagerDuty/Opsgenie schedule export | `SOC2.md`; `docs/security/INCIDENT-RUNBOOK.md`; `POLICIES/08-incident-response.md`; `deploy/observability/prometheus/alerts/security.yml` |
| Incident chat platform and channel |  | Channel ownership screenshot | `docs/security/INCIDENT-RUNBOOK.md`; `POLICIES/08-incident-response.md` |

## Public Security Surfaces

| Item | Decision / value | Evidence to attach | Source refs |
|---|---|---|---|
| PGP key fingerprint for `security@elizalabs.ai` |  | Public key URL; fingerprint verification | `SECURITY.md`; `POLICIES/21-responsible-disclosure.md` |
| Public PGP key URL |  | Published key response | `SECURITY.md`; `POLICIES/21-responsible-disclosure.md` |
| `/.well-known/security.txt` URL |  | HTTP response; securitytxt.org validation | `SECURITY.md`; `POLICIES/21-responsible-disclosure.md`; `docs/security/SOC2-CONTROL-MATRIX.md` |
| Responsible disclosure / bug bounty model |  | Program page or internal procedure | `POLICIES/15-vulnerability-management.md`; `POLICIES/21-responsible-disclosure.md`; `SOC2.md` |
| Public status page URL |  | Published status page | `SOC2.md`; `docs/security/INCIDENT-RUNBOOK.md`; `POLICIES/08-incident-response.md` |
| Public privacy notice URL |  | Published policy URL | `POLICIES/19-privacy.md`; `POLICIES/20-terms-dpa-subprocessors.md`; `docs/security/SOC2-CONTROL-MATRIX.md` |
| Public subprocessor URL |  | Published list; notification subscription path | `POLICIES/06-vendor-management.md`; `POLICIES/20-terms-dpa-subprocessors.md`; `SOC2.md` |

## Vendors and Compliance Tools

| Item | Decision / value | Evidence to attach | Source refs |
|---|---|---|---|
| GRC tool, or `none` with manual evidence path |  | Vendor contract or spreadsheet location | `SOC2.md`; `POLICIES/07-risk-assessment.md`; `docs/security/EVIDENCE.md`; `docs/security/audits/PLAN.md` |
| IdP / SSO provider |  | SSO/MFA policy export | `SOC2.md`; `POLICIES/02-access-control.md`; `POLICIES/18-onboarding-offboarding.md`; `docs/security/SOC2-CONTROL-MATRIX.md` |
| Admin-tier grant approver roles |  | Access-control policy update | `POLICIES/02-access-control.md` |
| MDM tool, or approved no-MDM decision |  | MDM console export or risk acceptance | `POLICIES/03-acceptable-use.md`; `POLICIES/04-asset-management.md` |
| VPN provider |  | Provider config export | `POLICIES/03-acceptable-use.md` |
| Endpoint protection tool |  | Console export | `POLICIES/04-asset-management.md` |
| Container registry |  | Registry settings export | `POLICIES/04-asset-management.md`; `.github/workflows/sign-images.yml` |
| Hosting provider |  | Vendor SOC2 report; DPA | `SOC2.md`; `POLICIES/06-vendor-management.md`; `POLICIES/20-terms-dpa-subprocessors.md`; `docs/security/audits/00-framework.md` |
| Primary production region |  | Infrastructure config export | `SOC2.md`; `POLICIES/20-terms-dpa-subprocessors.md`; `deploy/CAPACITY-PLAN.md` |
| Backup / DR region |  | DR design record; restore test | `SOC2.md`; `POLICIES/09-business-continuity.md`; `deploy/RUNBOOK-DR.md`; `deploy/CAPACITY-PLAN.md` |
| Hosting topology, single-region vs multi-region |  | Architecture decision record | `POLICIES/09-business-continuity.md`; `deploy/RUNBOOK-DR.md`; `deploy/CAPACITY-PLAN.md` |
| Postgres provider |  | Provider SOC2 report; backup config | `POLICIES/13-backup.md`; `deploy/RUNBOOK-DR.md`; `deploy/CAPACITY-PLAN.md` |
| Payment processor |  | Vendor SOC2/PCI report; DPA | `SOC2.md`; `POLICIES/06-vendor-management.md`; `POLICIES/20-terms-dpa-subprocessors.md` |
| Observability vendor / log aggregator |  | Vendor SOC2 report; redaction config | `SOC2.md`; `POLICIES/06-vendor-management.md`; `POLICIES/14-logging-monitoring.md`; `POLICIES/20-terms-dpa-subprocessors.md` |
| OTel backend choices for traces/logs/metrics |  | Observability architecture record | `POLICIES/14-logging-monitoring.md`; `deploy/observability/README.md` |
| Cold log storage class |  | Storage lifecycle policy | `POLICIES/14-logging-monitoring.md`; `deploy/observability/loki/loki-config.yaml`; `deploy/terraform/logging/main.tf` |
| Penetration test vendor and annual test window |  | Signed SOW; final report | `SOC2.md`; `POLICIES/15-vulnerability-management.md`; `docs/security/THREAT-MODEL.md` |
| Static-analysis scanner, CodeQL vs Semgrep vs both |  | Workflow config | `POLICIES/16-secure-development.md`; `docs/security/audits/PLAN.md` |
| Protected branch list |  | Branch protection API export | `POLICIES/16-secure-development.md`; `scripts/security/apply-branch-protection.sh` |
| Background-check vendor |  | Vendor contract; sample report metadata | `POLICIES/18-onboarding-offboarding.md`; `docs/security/AUDIT-EVIDENCE-INVENTORY.md` |
| Red-team / model evaluation owner |  | Evaluation report | `POLICIES/23-ai-ml-model-governance.md`; `docs/security/AUDIT-EVIDENCE-INVENTORY.md` |

## Steward, KMS, and Secrets

| Item | Decision / value | Evidence to attach | Source refs |
|---|---|---|---|
| Steward production topology |  | Architecture diagram; deployment config | `SOC2.md`; `POLICIES/12-cryptography.md`; `docs/security/audits/STEWARD-KMS-SPEC.md` |
| Steward URL and auth mode |  | Config export; OIDC audience/issuer | `docs/security/audits/KMS-CONTRACT.md`; `docs/security/audits/STEWARD-KMS-SPEC.md`; `deploy/k8s/networkpolicies/README.md` |
| Steward client support decision |  | Client library issue or HTTP-only decision | `docs/security/audits/STEWARD-KMS-SPEC.md` |
| Steward DR and key-store backup plan |  | DR runbook; test evidence | `docs/security/audits/STEWARD-KMS-SPEC.md`; `docs/security/KEY-LIFECYCLE.md`; `deploy/RUNBOOK-DR.md` |
| Cached key-version fallback decision |  | Risk acceptance or implementation ticket | `docs/security/audits/STEWARD-KMS-SPEC.md` |
| KMS-backed secret store for JWT/webhook/vault/org DEKs |  | Secret inventory; rotation records | `docs/security/audits/PLAN.md`; `docs/security/KEY-LIFECYCLE.md`; `POLICIES/12-cryptography.md` |
| Enterprise customer-managed-key support |  | Product/security decision | `POLICIES/12-cryptography.md` |

## CI, Review, and Publishing

| Item | Decision / value | Evidence to attach | Source refs |
|---|---|---|---|
| GitHub team for core maintainers |  | `gh api orgs/<org>/teams/<slug>` output | `.github/CODEOWNERS` |
| GitHub team for security review |  | `gh api orgs/<org>/teams/<slug>` output | `.github/CODEOWNERS` |
| GitHub team for platform review |  | `gh api orgs/<org>/teams/<slug>` output | `.github/CODEOWNERS` |
| GitHub team for backend / patch review |  | `gh api orgs/<org>/teams/<slug>` output | `.github/CODEOWNERS` |
| npm trusted publisher organization and package |  | npm Trusted Publisher screenshot/export | `.github/workflows/reusable-npm-publish.yml` |
| Coverage gate threshold and enforcement date |  | Baseline report; workflow update | `.github/workflows/coverage-gate.yml`; `docs/security/ai-pr-review-policy.md` |
| Image digest artifact automation |  | Workflow run with `image-digests` artifact | `.github/workflows/sign-images.yml` |

## Deployment and Infrastructure Values

| Item | Decision / value | Evidence to attach | Source refs |
|---|---|---|---|
| CI Docker base image digests |  | Digest-pinned Dockerfile | `deploy/Dockerfile.ci`; `deploy/k8s/security/pod-security-template.yaml` |
| Runtime image digest for pod security template |  | Published image digest | `deploy/k8s/security/pod-security-template.yaml`; `.github/workflows/sign-images.yml` |
| Sigstore policy org name |  | Final org/repo name; policy-controller dry run | `deploy/k8s/policy/cluster-image-policy.yaml`; `deploy/k8s/policy/README.md` |
| Sigstore policy enforce date |  | 14-day clean warn-only evidence | `deploy/k8s/policy/cluster-image-policy.yaml`; `deploy/k8s/policy/README.md` |
| Loki S3 region and bucket |  | Bucket config; retention policy | `deploy/observability/loki/loki-config.yaml`; `deploy/terraform/logging/main.tf` |
| Logging bucket object lock enablement |  | Terraform apply output | `deploy/terraform/logging/main.tf` |
| Fluent Bit `GCP_PROJECT_ID` source |  | Deployment/env export | `deploy/k8s/logging/fluent-bit.yaml` |
| Fluent Bit image digest |  | Digest-pinned manifest | `deploy/k8s/logging/fluent-bit.yaml` |
| Service mesh enablement namespaces |  | Namespace annotation rollout plan | `deploy/k8s/service-mesh/namespace-annotations.yaml`; `deploy/k8s/service-mesh/README.md` |
| Linkerd `Server` resource rollout |  | Mesh policy manifests | `deploy/k8s/service-mesh/README.md` |
| External Secrets to Steward egress policy |  | `allow-eso-to-steward.yaml` or equivalent | `deploy/k8s/networkpolicies/README.md` |
| HPA target Deployment name from Server CRD operator |  | CRD/operator output; patched HPA | `deploy/k8s/availability/hpa.yaml` |
| Capacity review values for API/Postgres/Redis |  | Capacity dashboard snapshot | `deploy/CAPACITY-PLAN.md` |

## Product and Scope Decisions

| Item | Decision / value | Evidence to attach | Source refs |
|---|---|---|---|
| Include Privacy TSC in SOC2 scope |  | Leadership decision | `SOC2.md`; `POLICIES/19-privacy.md`; `docs/security/audits/PLAN.md` |
| Board / leadership security review cadence |  | Calendar invite or minutes template | `SOC2.md`; `docs/security/AUDIT-EVIDENCE-INVENTORY.md`; `docs/security/audits/PLAN.md` |
| Customer-impacting change definition |  | Policy patch | `POLICIES/05-change-management.md` |
| Customer incident notification template approval |  | Approved template | `POLICIES/08-incident-response.md`; `docs/security/INCIDENT-RUNBOOK.md` |
| Field-level encryption coverage in Cloud schema |  | Schema review; encryption map | `POLICIES/10-data-classification.md`; `docs/security/audits/03-data-encryption.md` |
| Billing-record retention period |  | Finance/counsel approval | `POLICIES/11-data-retention.md` |
| Conduct reporting channel |  | Mailbox/channel ownership export | `POLICIES/17-code-of-conduct.md` |
| Reactivation policy for boomerang hires |  | People Ops approval | `POLICIES/18-onboarding-offboarding.md` |
| In-product DSR form vs email-only |  | Product decision; implementation ticket | `POLICIES/22-data-subject-request.md` |
| Final AI/ML consent UI copy |  | Product/legal approval | `POLICIES/23-ai-ml-model-governance.md`; `docs/security/audits/PLAN.md` |
| Vision/screen-capture opt-in and audit scope |  | Consent UI ticket; audit event design | `docs/security/audits/PLAN.md` |
| Plugin publisher key approach, Sigstore vs in-house Ed25519 |  | Security decision; key lifecycle patch | `POLICIES/24-plugin-connector-trust.md`; `docs/security/KEY-LIFECYCLE.md` |
| Customer install-dialog copy for local plugins/connectors |  | Product/legal approval | `POLICIES/24-plugin-connector-trust.md` |
