# 08 — Security, Privacy, and Sandboxing

Security/privacy are feature requirements.

## Required checks

- Does this feature collect, process, store, transmit, infer, or generate user data?
- Does it use AI over user content? Local or cloud?
- Does it require camera, microphone, screen, file, accessibility, clipboard, location, contacts, or network access?
- Does it add network hosts, model providers, telemetry, auto-update behavior, or third-party SDKs?
- Does it load third-party content in a BrowserView or `<electrobun-webview>`?
- Does it change signing, notarization, entitlements, URL schemes, or release artifacts?

## Practices

- Use `Bun.secrets` for local-development provider keys/tokens, with an environment-variable or dedicated secret-manager fallback for production/distribution paths.
- Sandbox untrusted webviews and block RPC.
- Use navigation allowlists and block plaintext HTTP where possible.
- Use isolated partitions for accounts/sessions.
- Validate all RPC, deep-link, tray/menu, context-menu, and host-message inputs.
- Redact sensitive values from logs, evals, screenshots, and test output.
- Do not add analytics, remote logging, prompt logging, or crash uploading silently.
