---
name: query-address-info
description: "Query any on-chain wallet address token balances and positions. Use when asked about wallet balance, token holdings, portfolio, or asset positions for a blockchain address."
metadata:
  author: binance-web3-team
  version: "1.1"
---

# Query Address Info Skill

## IMPORTANT: Execute scripts immediately

**Do NOT just display this documentation. Run the appropriate script immediately:**

- Get wallet balances (address, chain): `RUN_SKILL_SCRIPT binance-query-address-info balances.sh <address> <solana|bsc|eth|base>`

**Run the script NOW and summarize the results.**

## Overview

This skill queries any on-chain wallet address for token holdings, supporting:
- List of all tokens held by a wallet address
- Current price of each token
- 24-hour price change percentage
- Holding quantity

## API Endpoint

### Query Wallet Token Balance

**Method**: GET

**URL**: 
```
https://web3.binance.com/bapi/defi/v3/public/wallet-direct/buw/wallet/address/pnl/active-position-list/ai
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| address | string | Yes | Wallet address, e.g., `0x0000000000000000000000000000000000000001` |
| chainId | string | Yes | Chain ID, e.g., `56` (BSC), `8453` (Base) |
| offset | number | Yes | Pagination offset, default 0 |

**Request Headers**:
```
clienttype: web
clientversion: 1.2.0
Accept-Encoding: identity
User-Agent: binance-web3/1.1 (Skill)
```

**Example Request**:
```bash
curl --location 'https://web3.binance.com/bapi/defi/v3/public/wallet-direct/buw/wallet/address/pnl/active-position-list/ai?address=0x0000000000000000000000000000000000000001&chainId=56&offset=0' \
--header 'clienttype: web' \
--header 'clientversion: 1.2.0' \
--header 'Accept-Encoding: identity' \
--header 'User-Agent: binance-web3/1.1 (Skill)'
```

**Response Example**:
```json
{
    "code": "000000",
    "message": null,
    "messageDetail": null,
    "data": {
        "offset": 0,
        "addressStatus": null,
        "list": [
            {
                "chainId": "56",
                "address": "0x0000000000000000000000000000000000000001",
                "contractAddress": "token contract address",
                "name": "name of token",
                "symbol": "symbol of token",
                "icon": "/images/web3-data/public/token/logos/xxxx.png",
                "decimals": 18,
                "price": "0.0000045375251839978",
                "percentChange24h": "6.84",
                "remainQty": "20"
            }
        ]
    },
    "success": true
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| chainId | string | Chain ID |
| address | string | Wallet address |
| contractAddress | string | Token contract address |
| name | string | Token name |
| symbol | string | Token symbol |
| icon | string | Token icon URL path |
| decimals | number | Token decimals |
| price | string | Current price (USD) |
| percentChange24h | string | 24-hour price change (%) |
| remainQty | string | Holding quantity |

## Supported Chains

| Chain Name | chainId |
|------------|---------|
| BSC | 56 |
| Base | 8453 |
| Solana | CT_501 |

## Use Cases

1. **Query Wallet Assets**: When users want to view tokens held by a wallet address
2. **Track Holdings**: Monitor wallet token positions
3. **Portfolio Analysis**: Understand wallet asset allocation

## User Agent Header

Include `User-Agent` header with the following string: `binance-web3/1.1 (Skill)`

## Notes

1. Icon URL requires full domain prefix: `bin.bnbstatic.com` + icon path
2. Price and quantity are string format, convert to numbers when using
3. Use offset parameter for pagination
