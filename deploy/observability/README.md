# Eliza Observability Stack

Open-source observability stack for Eliza Cloud. Acts as the **single funnel** for all telemetry (metrics, logs, traces) emitted by the agent runtime, Cloud API, training pipeline, and clients (when opt-in telemetry is enabled).

## Components

| Component | Purpose | Image |
|---|---|---|
| **OpenTelemetry Collector** | Single ingress for OTLP traffic; redaction; routing to backends | `otel/opentelemetry-collector-contrib` |
| **Prometheus** | Metrics storage + alerting | `prom/prometheus` |
| **Alertmanager** | Alert routing | `prom/alertmanager` |
| **Loki** | Log storage with retention tiers (`audit_events` stream kept 7y) | `grafana/loki` |
| **Tempo** (optional) | Trace storage | `grafana/tempo` |
| **Grafana** | Dashboards | `grafana/grafana` |

## Single-funnel principle

Every service emits OTLP (gRPC `4317` or HTTP `4318`) to the central collector. **No service writes to Loki or Prometheus directly.** Two reasons:

1. **Redaction.** The collector applies the redaction processor that strips known PII / secret keys before any data leaves the cluster. Direct writes bypass this.
2. **Routing.** The collector decides where each signal goes (`audit_events` stream into the 7y-retention tier, app logs into 365d, etc.). Centralizing routing keeps services dumb.

Required header from every emitting service: `eliza.org_id`, `eliza.request_id` (resource attributes). The collector enriches and forwards.

## Deployment order

1. **Prometheus + Alertmanager** — needs to be up first because the collector exports to it.
2. **Loki** — same reason.
3. **(Tempo)** — optional traces.
4. **OTel Collector** — depends on (1)(2)(3).
5. **Grafana** — depends on (1)(2)(3) as datasources.

## Files

- [`otel-collector-config.yaml`](otel-collector-config.yaml) — collector pipeline (receivers / processors incl. redaction / exporters).
- [`prometheus/prometheus.yml`](prometheus/prometheus.yml) — scrape + alerting config skeleton.
- [`prometheus/alerts/security.yml`](prometheus/alerts/security.yml) — security alert rules.
- [`loki/loki-config.yaml`](loki/loki-config.yaml) — log retention (365d hot, 7y for `audit_events` stream).
- [`grafana/dashboards/security-overview.json`](grafana/dashboards/security-overview.json) — minimum security dashboard skeleton.

## Related

- Policy: [`../../POLICIES/14-logging-monitoring.md`](../../POLICIES/14-logging-monitoring.md).
- Threat model: [`../../docs/security/THREAT-MODEL.md`](../../docs/security/THREAT-MODEL.md).
- Evidence inventory: [`../../docs/security/AUDIT-EVIDENCE-INVENTORY.md`](../../docs/security/AUDIT-EVIDENCE-INVENTORY.md).
