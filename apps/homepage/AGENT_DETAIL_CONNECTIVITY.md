# Agent Detail Tab Connectivity Plan

## Overview

The Agent Detail panel has four tabs that need a live connection to the agent
backend to show useful data: **Wallets**, **Policies**, **Transactions**, and
**Approvals**. This document explains how connectivity works, what the current
gaps are, and what needs to be built to make each tab work for every agent type.

---

## Agent Types & Connectivity Modes

### 1. Local Agents (`source = "local"`)

`managedAgent.client` is a `CloudApiClient` pointing to `http://localhost:2138`.

**Status**: ✅ All tabs work (direct connection, no auth required by default).

### 2. Remote / Self-Hosted Agents (`source = "remote"`)

`managedAgent.client` is a `CloudApiClient` pointing to the user-supplied URL
(e.g. `https://{uuid}.milady.ai`), with an optional bearer token (`apiToken`).

**Status**: ✅ All tabs work as long as the agent backend is reachable and the
token is correct.

### 3. Cloud Agents — with matched sandbox (`source = "cloud"`, sandbox found)

During `fetchAll()`, sandbox discovery (`/agents` endpoint on
`sandboxes.waifu.fun`) is queried. If a sandbox is found whose `agent_name`
matches the cloud agent's name (case-insensitive), the cloud agent entry is
enriched:

- `managedAgent.client` → `CloudApiClient` pointing to `https://{uuid}.milady.ai`
- `managedAgent.apiToken` → sandbox `api_token`
- `managedAgent.sourceUrl` → sandbox URL

**Status**: ✅ All tabs work — direct connection to the sandbox backend.

### 4. Cloud Agents — **without** a sandbox match (`source = "cloud"`, no sandbox)

This is the problematic case. The agent is known to the cloud but either:
- Isn't currently running (stopped / paused / provisioning), or
- The sandbox discovery endpoint didn't match it by name.

In this case only the cloud management API fields are available:
- `managedAgent.sourceUrl` → `${CLOUD_BASE}/api/v1/milady/agents/${ca.id}`
- `managedAgent.client` → **undefined**
- `managedAgent.apiToken` → **undefined**
- `managedAgent.cloudClient` → `CloudClient` with the user's cloud API key ✅

---

## The Auth Fix (Applied)

**File**: `AgentDetail.tsx` and `WalletsPanel.tsx`

Both components now fall back to `managedAgent.cloudClient?.getToken()` when
`managedAgent.apiToken` is not set. This means API requests carry a valid cloud
bearer token (`Authorization: Bearer <cloud-api-key>`).

Before this fix, requests were made without any auth header, causing 401/403
from any cloud-proxied endpoint.

---

## Required Cloud Backend Endpoints

For case 4 (cloud agent without sandbox) to work, the cloud backend must proxy
steward requests from the management API path to the running agent backend.

The `stewardClient` base URL for these agents is:
```
${CLOUD_BASE}/api/v1/milady/agents/{agentId}
```

The following endpoints must be reachable at that base (proxied to the actual
agent sandbox):

### Wallets Tab (`WalletsPanel`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/wallet/addresses` | EVM + Solana wallet addresses |
| `GET` | `/api/wallet/balances` | Token balances across chains |
| `GET` | `/api/wallet/steward-status` | Whether Steward is configured/connected |

**Expected proxy path on cloud**:
```
GET ${CLOUD_BASE}/api/v1/milady/agents/{id}/api/wallet/addresses
    → proxied to agent sandbox → /api/wallet/addresses
```

### Policies Tab (`PolicyControls`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/wallet/steward-policies` | List current policy rules |
| `PUT` | `/api/wallet/steward-policies` | Update policy rules |

### Transactions Tab (`TransactionHistory`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/wallet/steward-tx-records` | Transaction history (with status/limit/offset) |

### Approvals Tab (`ApprovalQueue`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/wallet/steward-pending-approvals` | Pending approval queue |
| `POST` | `/api/wallet/steward-approve-tx` | Approve a pending tx |
| `POST` | `/api/wallet/steward-deny-tx` | Deny a pending tx |

---

## Current State (Post Auth Fix)

| Tab | Cloud (sandbox match) | Cloud (no sandbox) |
|-----|----------------------|--------------------|
| Wallets | ✅ Works | ⚠️ Needs cloud proxy |
| Policies | ✅ Works | ⚠️ Needs cloud proxy |
| Transactions | ✅ Works | ⚠️ Needs cloud proxy |
| Approvals | ✅ Works | ⚠️ Needs cloud proxy |

Without the cloud proxy endpoints, tabs for cloud agents without an active
sandbox will show errors (failed fetch) rather than "Connect an agent" messages,
since `stewardClient` is no longer null (it's properly authenticated).

---

## Alternative: Bridge-Based Proxy

The `CloudClient.bridge()` method sends JSON-RPC to the agent via:
```
POST ${CLOUD_BASE}/api/v1/milady/agents/{id}/bridge
{ "jsonrpc": "2.0", "method": "...", "params": {...} }
```

The agent backend (`packages/agent/src/api/cloud-compat-routes.ts`) already
has a pattern for proxying through the cloud. A bridge-based `StewardBridgeClient`
could be created to route all wallet/steward calls through the bridge, making
wallet features available even without direct sandbox URL access.

This would require:
1. Agent backend: register bridge handlers for `wallet.*` methods
2. Frontend: new `StewardBridgeClient` class wrapping `CloudClient.bridge()`

---

## Why Sandbox Discovery Might Miss a Running Agent

Sandbox discovery matches by `agent_name` (case-insensitive). Mismatches happen when:
- The agent was renamed in the cloud after creation
- The sandbox `agent_name` field contains a different string than `cloudAgent.name`
- `sandboxes.waifu.fun/agents` is unreachable (timeout → no sandboxes found)

A more robust approach would be to match by `cloudAgentId` (UUID) instead of
name, provided the sandbox discovery endpoint exposes the cloud agent ID.
