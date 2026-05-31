# SOC2 Evidence Harness

`@elizaos/soc2-verify` is the automated control-verification harness for the
Eliza stack. It runs static (file/config inspection) and dynamic (round-trip
code) checks against the monorepo and emits a JSON + Markdown evidence report
that an external auditor can sample.

## What it checks

Checks are grouped by SOC2 Trust Service Criterion. Each check lists the TSC
ids it provides evidence for, a severity (`critical | high | medium | low`),
and a `run()` function that returns one of:

- `pass` — control is in place and verified.
- `fail` — control is missing or broken.
- `warn` — control is present but incomplete.
- `skip` — check could not run (e.g. external tool not installed).

### Categories covered

| TSC | Checks |
| --- | --- |
| CC4.1 Monitoring | `audit-actions-comprehensive`, `audit-dispatcher-emits`, `audit-redaction` |
| CC6.1 / CC6.3 Access | `codeowners-present`, `branch-protection-script-present` |
| CC6.6 Network hardening | `k8s-securitycontext`, `networkpolicies-present` |
| CC6.7 TLS | `db-sslmode` |
| CC6.8 Integrity | `plugin-signature-verify`, `subagent-env-allowlist`, `firmware-signing-scaffold` |
| CC7.1 / CC7.2 Operations | `monitoring-config`, `alert-rules-present` |
| CC8.1 SDLC / supply chain | `gitleaks-workflow`, `no-committed-secrets`, `workflow-permissions`, `actions-pinned-by-sha` |
| CC9.2 Vendor / disclosure | `security-md` |
| C1.1 Confidentiality | `kms-adoption`, `pii-encryption-columns`, `kms-roundtrip`, `kms-hmac-roundtrip`, `kms-signature-roundtrip` |
| C1.2 Retention / disposal | `soft-delete-columns`, `audit-log-retention` |
| PI1.1 / PI1.5 Processing integrity | `training-consent-basis`, `model-artifact-signing` |

## How to run

From the `eliza/` workspace:

```bash
bun run packages/soc2-verify/src/cli.ts
bun run packages/soc2-verify/src/cli.ts --strict-fail --out .soc2-evidence
bun run packages/soc2-verify/src/cli.ts --include kms --include audit
```

From the outer workspace:

```bash
./scripts/soc2/verify.sh
./scripts/soc2/verify.sh --strict-fail
```

CI invokes `--strict-fail` on every PR via
`.github/workflows/soc2-verify.yml` and uploads the report as a workflow
artifact (retained 90 days).

## JSON schema (auditor mapping)

```jsonc
{
  "generated_at": "2026-05-21T18:00:00Z",
  "branch": "shaw/wip-...",
  "commit": "<sha>",
  "controls": {
    "CC6.1": {
      "checks": [
        {
          "id": "CC6.1-codeowners-present",
          "title": "CODEOWNERS exists in both repo roots ...",
          "severity": "high",
          "status": "pass",
          "evidence": "CODEOWNERS files present and cover sensitive paths.",
          "files": [".github/CODEOWNERS"]
        }
      ],
      "summary": { "pass": 1, "fail": 0, "warn": 0, "skip": 0 }
    }
  },
  "overall": {
    "pass": 25,
    "fail": 5,
    "warn": 2,
    "skip": 1,
    "readiness_score": 0.833
  }
}
```

`controls[<TSC id>]` is the join point a GRC tool (Vanta, Drata, Secureframe)
imports against. A single check that lists multiple `tsc` ids appears under
every relevant control block so each TSC has a complete view.

`readiness_score = pass / (pass + fail)`, excluding `warn` and `skip`.

## How auditors should sample

1. Run `bun run packages/soc2-verify/src/cli.ts` against the commit under
   review. Confirm the run completes and produces `evidence-report.json` and
   `evidence-report.md`.
2. For each TSC the engagement letter requires, open the matching block in
   `controls`. Every `pass` row lists the `files` that were inspected — sample
   them directly in the source tree.
3. For dynamic checks (KMS / audit dispatcher), the `evidence` field describes
   the assertion that was verified at runtime. Re-run with
   `--include <id-substr>` to reproduce the assertion in isolation.
4. CI artifacts in `.github/workflows/soc2-verify.yml` (90-day retention)
   provide the operating-effectiveness sample across the audit window — every
   PR produces one signed evidence report.

## Adding a new check

Add a file under `packages/soc2-verify/src/controls/` that exports a `Check`:

```ts
export const myCheck: Check = {
  id: "CC6.x-my-check",
  title: "...",
  tsc: ["CC6.x"],
  severity: "high",
  async run(ctx) { /* … */ return { status: "pass", evidence: "…" }; },
};
```

then add it to `ALL_CHECKS` in `controls/index.ts`. Add a unit test under
`src/__tests__/`.

## Out of scope

The harness verifies **technical operating effectiveness** only. Policy
documents, board minutes, vendor SOC2 reports, background-check records, and
similar organizational evidence still need to be collected by hand or via a
GRC platform. The harness emits the `tsc` list per check so a GRC tool can map
this evidence onto its existing CC1/CC2/CC3 evidence requests.
