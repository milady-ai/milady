# Security and Privacy Checklist

- Secrets use `Bun.secrets` or OS credential storage.
- No real secrets in repo/logs/prompts/tests.
- Untrusted webviews sandboxed.
- Navigation rules and HTTPS allowlists applied.
- RPC not exposed to remote content.
- Cloud AI disclosed and consented.
- Logs redacted.
- Update host and telemetry/network hosts documented.
