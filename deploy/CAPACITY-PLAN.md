# Capacity Plan

SOC2 A1.1 / A1.2.

Track the operator-owned capacity values in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this plan.

## Current load (baseline)

Snapshot — fill in after next capacity review:

| Tier       | Pods | CPU req | Mem req | p95 latency | RPS |
| ---------- | ---- | ------- | ------- | ----------- | --- |
| API        | 2-10 | 100m    | 256Mi   | TBD         | TBD |
| Postgres   | 3    | 1000m   | 2Gi     | TBD         | TBD |
| Redis      | 1    | 100m    | 256Mi   | n/a         | TBD |

## Headroom guidance

- Trigger a capacity review when **any** of the following hold for >7d:
  - API HPA sits at >70% maxReplicas for >1h/day.
  - Postgres CPU >60% p95.
  - Redis memory >70%.
  - GKE Autopilot node count drifts >2x the 30-day median.

## Scaling levers (ordered cheapest -> costliest)

1. Raise HPA `maxReplicas` (free; bounded by node pool quota).
2. Bump container resource requests in the Server CRD template.
3. Scale Postgres vertically (CNPG `instances` & `resources`).
4. Add read replicas (CNPG declarative).
5. Shard by tenant.

## Forecast inputs

- Active agents per tier (`Server.spec.capacity`).
- Inference RPS per agent (from OpenTelemetry collector).
- DB connection count / pool saturation.

## Review cadence

- **Monthly** quick check (5 min, dashboard glance).
- **Quarterly** full review with sign-off.
- After any incident classified P1 or higher.
