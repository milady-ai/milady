# Stream S3 - Wallet Routing and UX Parity

## Goal

Deliver production-ready wallet trade behavior with clear routing, predictable execution, and user-visible clarity on provider/path used.

## Branch / PR

- Branch: `codex/wallet-routing`
- PR: `to open`

## Current State

- Wallet + BSC trade flow already exists.
- Current swap implementation is Pancake V2 path (not 0x primary).

## Planned Phases

1. Routing Abstraction
- [ ] Introduce router/provider abstraction for quote/build/execute path.

2. 0x Integration
- [ ] Add 0x quote/build integration for supported chains.
- [ ] Define request/response mapping into existing wallet contracts.

3. Fallback + Safety
- [ ] Add deterministic fallback path when 0x unavailable.
- [ ] Preserve existing quote freshness and permission safeguards.

4. UX Clarity
- [ ] Surface active route/provider in UI.
- [ ] Improve failure messages for quote/execute and provider errors.

5. Tests
- [ ] Unit tests for routing selection and fallback logic.
- [ ] API tests for quote/execute across route outcomes.
- [ ] UI tests for route display + failure states.

## Acceptance

- 0x path works as primary where configured.
- Fallback path is explicit and test-covered.
- No regression to existing wallet security checks.
- CI green.
