# /electrobun-security-review

Audit security and privacy readiness.

Check:

- Secrets: no real keys in repo/logs/prompts/tests; provider keys use `Bun.secrets`/OS credential store.
- Webviews: untrusted URLs sandboxed, no RPC, HTTPS allowlists, partitions, navigation rules.
- RPC/tools: typed validation, least privilege, timeout, cancellation, confirmation for side effects.
- AI: local vs cloud clearly disclosed; data minimization; no hidden prompt/transcript retention.
- Network hosts, telemetry, crash reporting, analytics, and update host documented.
- Signing/notarization/entitlements/release settings reviewed.
- Accessibility and localization impacts noted.

Return concrete file changes and unresolved risks.
