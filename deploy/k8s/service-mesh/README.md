# Linkerd service mesh — mTLS service-to-service

SOC2 CC6.7 / CC6.6.

Linkerd is **opt-in per namespace**. Namespaces without the
`linkerd.io/inject: enabled` annotation are unaffected.

## Why Linkerd

- FOSS, CNCF-graduated, no vendor lock-in.
- Automatic mTLS for all meshed pods (rotating identity certs).
- Tiny sidecar (Rust); minimal latency overhead.

## Install

```bash
# CLI
curl -fsSL https://run.linkerd.io/install | sh
export PATH="$HOME/.linkerd2/bin:$PATH"

# Pre-flight
linkerd check --pre

# Install CRDs + control plane
linkerd install --crds | kubectl apply -f -
linkerd install | kubectl apply -f -

# Verify
linkerd check
```

## Roll-out sequence (per namespace)

1. **Annotate** the namespace:
   ```
   kubectl annotate ns eliza-agents linkerd.io/inject=enabled
   ```
2. **Restart** workloads so the sidecar is injected:
   ```
   kubectl -n eliza-agents rollout restart deployment
   ```
3. **Verify** mTLS:
   ```
   linkerd -n eliza-agents viz edges deployment
   # All edges should show "TLS: yes"
   ```
4. **Update NetworkPolicies** if needed — Linkerd injects an init container
   that rewrites iptables. Existing `default-deny` policies continue to
   work because Linkerd uses normal pod IPs.

## Rollback

```
kubectl annotate ns eliza-agents linkerd.io/inject-
kubectl -n eliza-agents rollout restart deployment
```

## TODO(soc2)

- Decide rollout order: start with `eliza-infra` (DB + Redis edge),
  then `eliza-agents` (API tier).
- Add `linkerd-viz` extension for observability (separate manifest).
- Pair with `policy.linkerd.io/Server` resources to enforce mesh-level
  authorization (e.g., only API SA may call DB on port 5432).
