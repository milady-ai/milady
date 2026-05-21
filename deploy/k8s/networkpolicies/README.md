# NetworkPolicies — SOC2 CC6.6 (network segmentation)

## Model

1. **Default deny** ingress AND egress in every application namespace
   (`eliza-agents`, `eliza-infra`). Nothing talks to anything until allowed.
2. **Per-edge allows**: one NetworkPolicy per service-to-service edge,
   labelled with `app.kubernetes.io/component` so the graph stays
   auditable.

## Edges currently modeled

| From                  | To                | File                            |
| --------------------- | ----------------- | ------------------------------- |
| ingress-nginx pod     | API (eliza-agents) | `allow-ingress-to-api.yaml`     |
| API (eliza-agents)    | Postgres (CNPG)   | `allow-api-to-postgres.yaml`    |
| API (eliza-agents)    | Redis             | `allow-api-to-redis.yaml`       |
| kube-dns              | all pods (DNS)    | `allow-dns-egress.yaml`         |

## Roll-out sequence

```
kubectl apply -f deploy/k8s/networkpolicies/default-deny.yaml
kubectl apply -f deploy/k8s/networkpolicies/allow-dns-egress.yaml
kubectl apply -f deploy/k8s/networkpolicies/allow-ingress-to-api.yaml
kubectl apply -f deploy/k8s/networkpolicies/allow-api-to-postgres.yaml
kubectl apply -f deploy/k8s/networkpolicies/allow-api-to-redis.yaml
```

Apply DNS first or every pod loses name resolution.

## Verification

```
kubectl get netpol -A
kubectl run -n eliza-agents netshoot --image=nicolaka/netshoot --rm -it -- \
  curl -m 2 http://redis.eliza-infra:6379  # should hang / fail
```

## Steward integration

External-secrets-operator runs in `external-secrets` namespace and reaches the
Steward proxy via a separate egress rule (TODO: add
`allow-eso-to-steward.yaml` once Steward endpoint is finalized).
