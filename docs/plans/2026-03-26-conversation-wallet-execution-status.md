# Conversation Wallet Execution Status (BSC Testnet)

## Goal
Get conversation-driven wallet execution working end-to-end on BSC testnet with one clean path:
- local wallet signer first
- tx hash in assistant reply
- same tx hash visible in conversation/trajectory logs
- swap after send

## What Was Missing
- No single wallet abstraction across plugin-evm, local wallet, Privy, and Steward.
- Chat routing, action handlers, and execution backends were split across different paths.
- Some wallet turns produced prose without any action execution.
- Model-generated action parameters were often malformed.
- Live runtime behavior and tested server behavior were diverging.
- Wallet actions could target the wrong loopback API port.
- Some compat execution routes still preferred Steward-style signing even when local-key execution should have been used.
- Stale watcher/runtime processes repeatedly masked whether code changes were actually loaded.

## What Has Been Fixed
### Wallet capability and visibility
- Wallet capability/readiness fields are surfaced in backend/UI.
- Wallet address/status replies are deterministic instead of persona-driven.
- plugin-evm visibility and readiness diagnostics were improved.

### Runtime/action execution hardening
- Wallet actions are registered in the live runtime.
- Balance execution from chat is working.
- Transfer/trade action responses were normalized to canonical text blocks with:
  - action
  - chain
  - execution mode
  - executed true/false
  - tx hash when executed
- Wallet chat tests now cover deterministic fallback behavior for:
  - CHECK_BALANCE
  - TRANSFER_TOKEN
  - EXECUTE_TRADE
- Wallet action fallback execution now captures returned text even when a handler forgets to emit a callback.
- Wallet execution failures now return explicit blocked/failure text instead of filler like "let me check that for you".

### Test coverage
- `packages/agent/test/api-server.e2e.test.ts`
  - prose-only balance fallback
  - prose-only send fallback
  - prose-only swap fallback
  - explicit missing-token swap failure
- `packages/app-core/src/actions/transfer-token.test.ts`
- `packages/app-core/src/actions/execute-trade.test.ts`

## What We Learned From Live Debugging
### Live send failure sequence
1. Chat/action routing was initially failing.
2. Then malformed action params caused invalid-address failures.
3. Then execution reached the compat wallet API but attempted Steward signing when local-key execution should have been allowed.
4. Then we found some runs were targeting a dead loopback API port (`2138`) instead of the active API server.
5. Stale dev-server/watcher processes repeatedly made it look like patches were not working.

### Current grounded live status
- Wallet exists.
- plugin-evm is loaded.
- BSC RPC is ready.
- automation mode is `full`.
- trade permission mode is `agent-auto`.
- Balance from conversation works.
- Send and swap are not yet proven end-to-end in the live desktop runtime.

## Current Code Changes On This Branch
### Agent/server path
- `packages/agent/src/api/server.ts`
  - deterministic wallet-execution fallback logic
  - wallet-intent failure hardening
  - canonical wallet response trimming
  - fallback action result capture

### App-core action path
- `packages/app-core/src/actions/transfer-token.ts`
  - canonical transfer success/failure responses
  - callback metadata includes tx hash/execution info
  - partial parameter recovery from the original message
- `packages/app-core/src/actions/execute-trade.ts`
  - canonical trade success/failure responses
  - callback metadata includes tx hash/route provider/execution info
  - `routeProvider` support exposed in action params

### App-core compat API path
- `packages/app-core/src/api/server.ts`
  - work started to prefer local-key execution where allowed instead of always relying on Steward signing paths

### Drill tooling
- `scripts/wallet-chat-testnet-drill.mjs`
  - can set trade mode to `agent-auto`
  - can print conversation log after prompts

## What Is Still Blocked
### 1. One live runtime path
The live desktop runtime is still more brittle than the tested API path.
We need one consistently loaded runtime with no stale watchers competing for the same port.

### 2. One wallet execution target
Wallet actions must always target the active API server.
No hidden fallback to dead sidecar ports.

### 3. One signer abstraction
We need a single provider contract for:
- local signer
- Steward signer
- managed signer (if retained)

Callers should ask for wallet execution capability, not for Privy/Steward/local-specific behavior.

### 4. End-to-end live send
Required acceptance:
- prompt: `send 0.001 tBNB on BSC testnet to 0x8DFBdEEC8c5d4970BB5F481C6ec7f73fa1C65be5`
- assistant reply includes tx hash
- conversation log contains same tx hash
- trajectory contains same tx hash

### 5. End-to-end live swap
Required acceptance:
- prompt: `swap 0.001 tBNB to <configured token> on BSC testnet using pancakeswap-v2`
- executed true
- tx hash present
- route provider visible in assistant/logs

## Recommended Architecture Direction
Build one abstraction and get one provider working first.

### Target shape
- `WalletProvider`
  - `getStatus()`
  - `getAddresses()`
  - `getBalances()`
  - `sendTransfer(input)`
  - `executeTrade(input)`
- `WalletCapabilityService`
  - chooses active provider
  - exposes readiness
  - exposes one execution interface to UI/chat/actions

### Practical order
1. BSC testnet
2. local signer first
3. conversation send
4. conversation swap
5. Steward as a pluggable signer backend
6. remove Privy dependence later if desired

## Bottom Line
We are on the right path now.
The main improvement is that the failures are no longer vague:
- we know which layer is failing
- we have tests around the routing/fallback layer
- we know the next narrowing step is live local-key send from conversation

The system is not done, but the architecture problem is now much clearer than when this work started.
