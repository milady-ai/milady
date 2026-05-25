# /electrobun-rpc

Add or review Bun ↔ browser typed RPC.

Include:

- Shared RPC type in `src/shared/rpc.ts` or equivalent.
- Bun handler via `BrowserView.defineRPC` with `maxRequestTime`.
- Browser handler/client via `Electroview.defineRPC` and `new Electroview({ rpc })`.
- Runtime validation for untrusted or user-controlled payloads.
- Tests for contract shape and error cases.
- Security review: no privileged handlers exposed to sandboxed/untrusted content.
- Documentation of request vs message semantics.
