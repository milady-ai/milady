---
title: "Wallet API"
sidebarTitle: "Wallet"
description: "REST API endpoints for managing EVM and Solana wallets, balances, NFTs, and keys."
---

The wallet API provides access to the agent's on-chain identity across EVM-compatible chains and Solana. Balance and NFT lookups require API keys (Alchemy for EVM, Helius for Solana) configured via `PUT /api/wallet/config`.

<Warning>
The `POST /api/wallet/export` endpoint returns private keys in plaintext. It requires explicit confirmation and is logged as a security event.
</Warning>

## Endpoints

### GET /api/wallet/addresses

Get the agent's EVM and Solana wallet addresses.

**Response**

```json
{
  "evmAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "solanaAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU"
}
```

---

### GET /api/wallet/balances

Get token balances across all supported chains. Requires `ALCHEMY_API_KEY` for EVM chains and `HELIUS_API_KEY` for Solana. Returns `null` for chains where the required API key is not configured.

**Response**

```json
{
  "evm": {
    "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "chains": [
      {
        "chainId": 1,
        "name": "Ethereum",
        "nativeBalance": "1.5",
        "tokens": []
      }
    ]
  },
  "solana": {
    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU",
    "nativeBalance": "2.5",
    "tokens": []
  }
}
```

---

### GET /api/wallet/nfts

Get NFTs held by the agent across EVM chains and Solana. Requires `ALCHEMY_API_KEY` for EVM and `HELIUS_API_KEY` for Solana.

**Response**

```json
{
  "evm": [
    {
      "contractAddress": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
      "tokenId": "1234",
      "name": "Bored Ape #1234",
      "imageUrl": "https://..."
    }
  ],
  "solana": {
    "nfts": []
  }
}
```

---

### GET /api/wallet/config

Get the wallet API key configuration status and current wallet addresses. Key values are not returned — only their set/unset status.

**Response**

```json
{
  "alchemyKeySet": true,
  "infuraKeySet": false,
  "ankrKeySet": false,
  "heliusKeySet": true,
  "birdeyeKeySet": false,
  "evmChains": ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"],
  "evmAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "solanaAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU"
}
```

---

### PUT /api/wallet/config

Update wallet API keys. Accepted keys: `ALCHEMY_API_KEY`, `INFURA_API_KEY`, `ANKR_API_KEY`, `HELIUS_API_KEY`, `BIRDEYE_API_KEY`. Setting `HELIUS_API_KEY` also automatically configures `SOLANA_RPC_URL`. Triggers a runtime restart to apply changes.

**Request**

```json
{
  "ALCHEMY_API_KEY": "alchemy-key-here",
  "HELIUS_API_KEY": "helius-key-here"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ALCHEMY_API_KEY` | string | No | Alchemy API key for EVM balance/NFT lookups |
| `INFURA_API_KEY` | string | No | Infura API key |
| `ANKR_API_KEY` | string | No | Ankr API key |
| `HELIUS_API_KEY` | string | No | Helius API key for Solana lookups — also sets `SOLANA_RPC_URL` |
| `BIRDEYE_API_KEY` | string | No | Birdeye API key for Solana token prices |

**Response**

```json
{
  "ok": true
}
```

---

### POST /api/wallet/import

Import an existing private key for EVM or Solana. Chain is auto-detected if not specified.

**Request**

```json
{
  "privateKey": "0xabc123...",
  "chain": "evm"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `privateKey` | string | Yes | Private key to import |
| `chain` | string | No | `"evm"` or `"solana"` — auto-detected if omitted |

**Response**

```json
{
  "ok": true,
  "chain": "evm",
  "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
}
```

---

### POST /api/wallet/generate

Generate one or more new wallets. The generated private keys are saved to config and available immediately via `GET /api/wallet/addresses`.

**Request**

```json
{
  "chain": "both"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain` | string | No | `"evm"`, `"solana"`, or `"both"` (default: `"both"`) |

**Response**

```json
{
  "ok": true,
  "wallets": [
    { "chain": "evm", "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
    { "chain": "solana", "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU" }
  ]
}
```

---

### POST /api/wallet/export

Export private keys in plaintext. Requires explicit confirmation. This action is logged as a security event.

**Request**

```json
{
  "confirm": true
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `confirm` | boolean | Yes | Must be `true` to proceed |
| `exportToken` | string | No | Optional one-time export token for additional security |

**Response**

```json
{
  "evm": {
    "privateKey": "0xabc123...",
    "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
  },
  "solana": {
    "privateKey": "base58encodedkey...",
    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU"
  }
}
```

---

## Steward bridge

The Steward bridge enables delegated transaction signing through an external policy service. When configured, trade and transfer endpoints route signing requests through Steward, which can approve, reject, or hold transactions for policy review before they are broadcast.

### GET /api/wallet/steward-status

Get the current status of the Steward bridge connection, including whether the service is configured, reachable, and which agent identity is in use.

**Response**

```json
{
  "configured": true,
  "available": true,
  "connected": true,
  "baseUrl": "https://steward.example.com",
  "agentId": "agent-1",
  "evmAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "error": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `configured` | boolean | Whether the Steward API URL is set |
| `available` | boolean | Whether the Steward service responded successfully |
| `connected` | boolean | Whether the bridge established a connection |
| `baseUrl` | string \| null | Steward API base URL, if configured |
| `agentId` | string \| null | Agent identity used for Steward requests |
| `evmAddress` | string \| null | EVM wallet address associated with this agent |
| `error` | string \| null | Error message if the connection check failed |

---

## Trading

### POST /api/wallet/trade/preflight

Run a preflight check to verify the wallet and RPC are ready for a BSC trade.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tokenAddress` | string | No | Token contract address to validate (optional) |

**Response**

Returns a readiness object with wallet balance, RPC status, and any blocking issues.

---

### POST /api/wallet/trade/quote

Get a price quote for a BSC token swap before executing.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `side` | string | Yes | `"buy"` or `"sell"` |
| `tokenAddress` | string | Yes | Token contract address |
| `amount` | string | Yes | Trade amount (in human-readable units) |
| `slippageBps` | number | No | Slippage tolerance in basis points |

**Response**

Returns a quote object with estimated output amount, price impact, and route details.

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing `side`, `tokenAddress`, or `amount` |

---

### POST /api/wallet/trade/execute

Execute a token trade on BSC. Behavior depends on wallet configuration, Steward bridge availability, and confirmation:

- Without `confirm: true` or without a local private key, returns an unsigned transaction for client-side signing.
- With `confirm: true`, a local key, and appropriate trade permissions, executes the trade on-chain and returns the receipt.
- When the Steward bridge is configured, signing is delegated to the Steward service. Steward may approve the transaction immediately, hold it for policy review, or reject it based on configured policies.

**Request headers**

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `x-milady-agent-action` | string | No | Set to `1`, `true`, `yes`, or `agent` to mark this as an agent-automated request. Affects trade permission mode resolution. |

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `side` | string | Yes | `"buy"` or `"sell"` |
| `tokenAddress` | string | Yes | Token contract address |
| `amount` | string | Yes | Trade amount (in human-readable units) |
| `slippageBps` | number | No | Slippage tolerance in basis points |
| `deadlineSeconds` | number | No | Transaction deadline in seconds |
| `confirm` | boolean | No | Set to `true` to execute immediately with a local key |
| `source` | string | No | `"agent"` or `"manual"` — attribution for ledger tracking |

**Response (unsigned — user must sign)**

Returned when `confirm` is not `true`, no local key is available, or the trade permission mode does not allow server-side execution.

```json
{
  "ok": true,
  "side": "buy",
  "mode": "user-sign",
  "quote": {
    "side": "buy",
    "tokenAddress": "0x...",
    "slippageBps": 100,
    "route": "TOKEN/WBNB",
    "routerAddress": "0x...",
    "quoteIn": { "symbol": "BNB", "amount": "0.1", "amountWei": "100000000000000000" },
    "quoteOut": { "symbol": "TOKEN", "amount": "1000", "amountWei": "1000000000000000000000" }
  },
  "executed": false,
  "requiresUserSignature": true,
  "unsignedTx": {
    "to": "0x...",
    "data": "0x...",
    "valueWei": "100000000000000000",
    "chainId": 56
  },
  "requiresApproval": false
}
```

For sell orders, the response includes an additional `unsignedApprovalTx` field when the router needs token approval:

```json
{
  "requiresApproval": true,
  "unsignedApprovalTx": {
    "to": "0x...",
    "data": "0x...",
    "valueWei": "0",
    "chainId": 56
  }
}
```

**Response (executed)**

Returned when the trade was signed and broadcast (locally or via Steward).

```json
{
  "ok": true,
  "side": "buy",
  "mode": "local",
  "quote": { "..." : "..." },
  "executed": true,
  "requiresUserSignature": false,
  "unsignedTx": { "..." : "..." },
  "requiresApproval": false,
  "execution": {
    "hash": "0x...",
    "nonce": 42,
    "gasLimit": "250000",
    "valueWei": "100000000000000000",
    "explorerUrl": "https://bscscan.com/tx/0x...",
    "blockNumber": null,
    "status": "pending",
    "approvalHash": "0x..."
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `mode` | string | `"local-key"`, `"user-sign"`, `"steward"`, or `"local"` |
| `execution.hash` | string | On-chain transaction hash |
| `execution.nonce` | number \| null | Transaction nonce (`null` when signed by Steward) |
| `execution.status` | string | `"pending"` immediately after broadcast |
| `execution.approvalHash` | string \| undefined | Token approval transaction hash (sell orders only) |

**Response (Steward pending approval)**

Returned when Steward holds the transaction for policy review instead of signing immediately.

```json
{
  "ok": true,
  "side": "buy",
  "mode": "steward",
  "quote": { "..." : "..." },
  "executed": false,
  "requiresUserSignature": false,
  "unsignedTx": { "..." : "..." },
  "requiresApproval": false,
  "execution": {
    "status": "pending_approval",
    "policyResults": [
      { "policy": "max-trade-value", "result": "pending" }
    ]
  }
}
```

**Response (Steward policy rejection)**

Returned with status `403` when Steward rejects the transaction based on policy rules.

```json
{
  "ok": false,
  "mode": "steward",
  "executed": false,
  "requiresUserSignature": false,
  "error": "Policy rejected",
  "execution": {
    "status": "rejected",
    "policyResults": [
      { "policy": "max-trade-value", "result": "denied" }
    ]
  }
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing `side`, `tokenAddress`, or `amount` |
| 400 | `side` is not `"buy"` or `"sell"` |
| 403 | Steward policy rejection (see response shape above) |
| 500 | Trade execution failed |

---

### GET /api/wallet/trade/tx-status

Check the on-chain status of a previously submitted trade transaction.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `hash` | string | Yes | Transaction hash |

**Response**

```json
{
  "ok": true,
  "hash": "0x...",
  "status": "success",
  "explorerUrl": "https://bscscan.com/tx/0x...",
  "chainId": 56,
  "blockNumber": 12345678,
  "confirmations": 12,
  "nonce": 42,
  "gasUsed": "150000",
  "effectiveGasPriceWei": "3000000000"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"pending"`, `"success"`, `"reverted"`, or `"not_found"` |
| `chainId` | number | Always `56` (BSC) |

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing `hash` query parameter |

---

### GET /api/wallet/trading/profile

Get a trading profit-and-loss profile from the local trade ledger.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `window` | string | `30d` | Time window: `"7d"`, `"30d"`, or `"all"` |
| `source` | string | `all` | Filter by attribution: `"agent"`, `"manual"`, or `"all"` |

**Response**

Returns aggregated trading statistics including realized and unrealized P&L over the requested window.

---

### POST /api/wallet/transfer/execute

Transfer native tokens (BNB) or ERC-20 tokens on BSC.

- Without `confirm: true` or without a local private key, returns an unsigned transaction for client-side signing.
- With `confirm: true` and a local key, executes the transfer on-chain.
- When the Steward bridge is configured, signing is delegated to the Steward service with the same policy approval flow as trade execution.

**Request headers**

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `x-milady-agent-action` | string | No | Set to `1`, `true`, `yes`, or `agent` to mark this as an agent-automated request. Affects trade permission mode resolution. |

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `toAddress` | string | Yes | Recipient EVM address |
| `amount` | string | Yes | Amount to transfer (in human-readable units) |
| `assetSymbol` | string | Yes | Token symbol (e.g. `"BNB"`, `"USDT"`) |
| `tokenAddress` | string | No | ERC-20 contract address (required for non-native tokens) |
| `confirm` | boolean | No | Set to `true` to execute immediately with a local key |

**Response (unsigned — user must sign)**

```json
{
  "ok": true,
  "mode": "user-sign",
  "executed": false,
  "requiresUserSignature": true,
  "toAddress": "0x...",
  "amount": "1.5",
  "assetSymbol": "BNB",
  "unsignedTx": {
    "chainId": 56,
    "from": "0x...",
    "to": "0x...",
    "data": "0x",
    "valueWei": "1500000000000000000",
    "explorerUrl": "https://bscscan.com",
    "assetSymbol": "BNB",
    "amount": "1.5"
  }
}
```

For ERC-20 transfers, `unsignedTx.to` is the token contract address, `unsignedTx.data` contains the encoded `transfer` call, and `unsignedTx.tokenAddress` is included.

**Response (executed)**

```json
{
  "ok": true,
  "mode": "local",
  "executed": true,
  "requiresUserSignature": false,
  "toAddress": "0x...",
  "amount": "1.5",
  "assetSymbol": "BNB",
  "unsignedTx": { "..." : "..." },
  "execution": {
    "hash": "0x...",
    "nonce": 42,
    "gasLimit": "21000",
    "valueWei": "1500000000000000000",
    "explorerUrl": "https://bscscan.com/tx/0x...",
    "blockNumber": null,
    "status": "pending"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `mode` | string | `"local-key"`, `"user-sign"`, `"steward"`, or `"local"` |
| `execution.nonce` | number \| null | Transaction nonce (`null` when signed by Steward) |
| `execution.status` | string | `"pending"` immediately after broadcast |

**Response (Steward pending approval)**

```json
{
  "ok": true,
  "mode": "steward",
  "executed": false,
  "requiresUserSignature": false,
  "toAddress": "0x...",
  "amount": "1.5",
  "assetSymbol": "BNB",
  "unsignedTx": { "..." : "..." },
  "execution": {
    "status": "pending_approval",
    "policyResults": [
      { "policy": "max-transfer-value", "result": "pending" }
    ]
  }
}
```

**Response (Steward policy rejection)**

Returned with status `403` when Steward rejects the transaction based on policy rules.

```json
{
  "ok": false,
  "mode": "steward",
  "executed": false,
  "requiresUserSignature": false,
  "error": "Policy rejected",
  "execution": {
    "status": "rejected",
    "policyResults": [
      { "policy": "max-transfer-value", "result": "denied" }
    ]
  }
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing `toAddress`, `amount`, or `assetSymbol` |
| 400 | Invalid EVM address format |
| 403 | Steward policy rejection (see response shape above) |
| 500 | Transfer execution failed |

---

### POST /api/wallet/production-defaults

Apply opinionated production defaults for wallet trading configuration (trade permission mode, RPC settings, etc.).

**Response**

```json
{
  "ok": true,
  "applied": [
    "tradePermissionMode=user-sign-only",
    "bscRpcUrl=https://bsc-dataseed.binance.org"
  ],
  "tradePermissionMode": "user-sign-only"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `applied` | string[] | List of configuration changes that were applied |
| `tradePermissionMode` | string | The resulting trade permission mode |

---

## Common error codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_REQUEST` | Request body is malformed or missing required fields |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication token |
| 404 | `NOT_FOUND` | Requested resource does not exist |
| 400 | `INVALID_KEY` | Private key format is invalid |
| 400 | `INVALID_ADDRESS` | EVM address format is invalid |
| 403 | `EXPORT_FORBIDDEN` | Export is not permitted without proper confirmation |
| 403 | `TRADE_FORBIDDEN` | Trade permission denied |
| 403 | `STEWARD_POLICY_REJECTED` | Steward policy engine rejected the transaction. The response body includes `execution.policyResults` with details on which policies were evaluated. |
| 500 | `INSUFFICIENT_BALANCE` | Wallet balance is insufficient for the operation |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
