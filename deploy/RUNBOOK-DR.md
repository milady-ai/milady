# Disaster Recovery Runbook

SOC2 A1.2 / A1.3 / CC7.4.

## RTO / RPO targets

| Service          | RTO  | RPO   | Notes                                      |
| ---------------- | ---- | ----- | ------------------------------------------ |
| Cloud API        | 4h   | 1h    | CNPG WAL-shipped to GCS every 5 min        |
| Postgres (CNPG)  | 4h   | 1h    | Daily full + 5-min WAL, 30d retention prod |
| Dashboard / web  | 24h  | 24h   | Stateless; redeploy from container image   |
| Background jobs  | 24h  | 24h   | Redis is cache-only; idempotent retries    |
| Object storage   | 24h  | 24h   | R2 has its own replication                 |

## Backup inventory

- **Postgres**: CNPG `Cluster.spec.backup.barmanObjectStore` -> GCS bucket
  `eliza-pg-backups-<env>`, retention 30d prod / 7d staging.
- **K8s manifests**: GitOps repo (this repo); reapply with `kubectl apply`.
- **Container images**: GHCR; cosign-signed (see `deploy/k8s/policy/`).
- **Logs**: GCS via Fluent Bit (`deploy/terraform/logging/`), 365d general,
  7y immutable for security audit.

## Restore procedure — Postgres (CNPG)

```bash
# 1. Identify backup
kubectl -n eliza-infra get backups.postgresql.cnpg.io

# 2. Create a new Cluster from the chosen backup
cat <<EOF | kubectl apply -f -
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: eliza-pg-restore
  namespace: eliza-infra
spec:
  instances: 1
  bootstrap:
    recovery:
      backup:
        name: <BACKUP-NAME>
  storage:
    size: 100Gi
EOF

# 3. Validate
kubectl -n eliza-infra exec -it eliza-pg-restore-1 -- psql -U postgres -c '\dt'

# 4. Cut over: scale old cluster to 0, point services at new cluster,
#    rename, scale up.
```

## Restore procedure — full cluster

1. Provision a fresh GKE Autopilot cluster from
   `eliza/packages/cloud-infra/cloud/terraform/gcp/02-k8s/`.
2. Apply core manifests:
   ```
   kubectl apply -f deploy/k8s/networkpolicies/
   kubectl apply -f deploy/k8s/policy/
   kubectl apply -f deploy/k8s/logging/fluent-bit.yaml
   kubectl apply -f eliza/packages/cloud-infra/cloud/local/manifests/
   ```
3. Restore Postgres from latest backup (above).
4. Verify TLS, image signatures, NetworkPolicies before exposing ingress.

## Restore-drill cadence

- **Quarterly** (at minimum). Schedule on the first Tuesday of Jan/Apr/Jul/Oct.
- Each drill must restore to an isolated namespace, exercise a row-level
  verification query, and tear down within 24h.

## Drill evidence template

Create one file per drill at `deploy/dr-drills/YYYY-QN.md`:

```markdown
# DR Drill YYYY-QN

- Date:
- Operator:
- Backup restored:
- Source cluster / region:
- Target namespace:
- Time-to-restore (TTR):
- Data validation query / result:
- Issues encountered:
- Action items:
- Sign-off:
```

## TODO(soc2)

Track region, datastore, and restore-drill decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this runbook.

- Wire automated quarterly drill via GitHub Actions schedule that creates a
  new `eliza-pg-restore-drill-<quarter>` cluster, runs verification, posts
  evidence file via PR, and tears down.
- Document RTO/RPO measurements after first real drill.
