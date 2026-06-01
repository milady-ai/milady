# 03 — Model Routing and AI

Electrobun does not ship an Apple Foundation Models equivalent. Port the Foundation Models pattern to a provider-neutral adapter.

## Preferred routes

1. Deterministic local code path when AI is not required.
2. Local model service when available and suitable.
3. User-configured BYOK cloud model only after explicit product consent and clear data handling.
4. Graceful “model unavailable” fallback.

## Required practices

- Never hide cloud AI use behind local UI language.
- Keep provider keys in `Bun.secrets` or the OS credential store.
- Use typed structured outputs. Validate model JSON with explicit runtime validators.
- Keep prompts short and static instructions separate from untrusted input.
- Minimize included user data and redact secrets before prompt construction.
- Add timeouts and `AbortSignal` propagation to model calls.
- Log only privacy-safe operational metadata.
- Store raw prompts/transcripts only with explicit requirements, consent, retention, export, and deletion flows.

## Tool calling

- Tool descriptions must be narrow and factual.
- Do not expose secrets or unrelated user data in tool output.
- Avoid broad tools like `runShell`, `queryDatabase`, `fetchAnyURL`, `writeFile`, or `executeJavascript` under model control.
- Split tools into specific operations such as `searchLocalNotes`, `createDraftTask`, `summarizeSelectedFile`, `checkReleaseUpdate`.
