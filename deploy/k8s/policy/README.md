# Admission policy — image signature enforcement

SOC2 CC8.1 / A1.2.

We use **sigstore policy-controller** (FOSS) to enforce that every image
admitted to the cluster was signed by our GitHub Actions OIDC identity.

## Install

```
helm repo add sigstore https://sigstore.github.io/helm-charts
helm install policy-controller sigstore/policy-controller \
  -n cosign-system --create-namespace
```

## Apply policy

```
kubectl apply -f deploy/k8s/policy/cluster-image-policy.yaml
kubectl label ns eliza-agents policy.sigstore.dev/include=true
kubectl label ns eliza-infra  policy.sigstore.dev/include=true
```

## Signer identity

- **OIDC issuer**: `https://token.actions.githubusercontent.com`
- **Subject regex**: `^https://github.com/elizaOS/.+/\.github/workflows/sign-images\.yml@.*$`

When the org name changes update `cluster-image-policy.yaml`.

## TODO(soc2)

Track the final org name and enforcement date in [`../../../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../../../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Replace `mode: warn` with `mode: enforce` after running for two weeks in
  warn-only to catch any unsigned base images / sidecars we still pull.
