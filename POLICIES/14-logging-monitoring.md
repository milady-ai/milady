# 14 — Logging & Monitoring Policy

**Owner:** Security Lead + Engineering Lead
**Review cadence:** Annual
**SOC2 mapping:** CC7.1, CC7.2

## Purpose

Ensure security-relevant activity is logged, retained, monitored, and alerted on across the Eliza stack.

## Scope

Cloud API, agent runtime telemetry (opt-in), client crash reports, CI/CD events, KMS / Steward operations, infrastructure logs.

## Authoritative References

- `audit_events` table is the canonical security-event sink (see `/tmp/soc2-audit/04-logging-monitoring.md`).
- `AuditDispatcher` (Cloud) is the single writer for audit events.
- OpenTelemetry Collector is the single funnel for metrics/logs/traces from all services. See [`../deploy/observability/README.md`](../deploy/observability/README.md).

## Policy Statements

1. **Single funnel** — all services emit OTLP to the central OTel Collector. Direct writes to Loki/Prometheus from services are prohibited.
2. **Audit-event coverage** — every authentication outcome, KMS operation, plugin install/revoke, prod-access action, billing mutation, DSR fulfillment, and data-export event writes an `audit_events` row.
3. **Retention** — security-relevant audit events: 7 years. Application logs: 365 days. Metrics: 90 days downsampled. Traces: 7 days.
4. **Redaction** — the OTel Collector strips known PII/secret keys (`authorization`, `cookie`, `token`, `password`, `oauth_token`, email patterns, etc.) before export. No Restricted-class data lands in Loki.
5. **Tamper-resistance** — audit-event sink is append-only at the application layer; underlying storage has retention locks where supported.
6. **Anomaly alerts** — see `deploy/observability/prometheus/alerts/security.yml` for the required ruleset (failed-auth surge, audit-sink write failure, anomalous export volume, cert expiry, backup failure, container restart loop).
7. **Time sync** — all hosts run NTP; clock skew > 5s alerts.

## Procedures

- Alert routing: SEV-0/1 page on-call; SEV-2/3 to `#security-alerts`.
- Quarterly log-coverage review: Security Lead spot-checks 5 random sensitive endpoints for audit-event emission.

## Evidence

- OTel Collector config (versioned).
- `audit_events` row count + sample.
- Alert rule files in source control.
- Alert-fire history from Alertmanager.

## Open Items For Human Sign-Off

Track observability decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Confirm OTel backend choice (Tempo / Jaeger for traces; Loki for logs; Prometheus for metrics).
- Confirm log storage class for cold tier.
