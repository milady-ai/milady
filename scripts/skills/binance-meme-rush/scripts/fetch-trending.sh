#!/usr/bin/env bash
set -euo pipefail

# Binance Meme Rush - Fetch trending meme tokens
# Usage: fetch-trending.sh [chain] [stage] [limit]
#   chain: solana (default) | bsc
#   stage: new (default) | finalizing | migrated
#   limit: number of results (default 20, max 200)
#
# Examples:
#   fetch-trending.sh
#   fetch-trending.sh solana new 20
#   fetch-trending.sh bsc migrated 40

CHAIN="${1:-solana}"
STAGE="${2:-new}"
LIMIT="${3:-20}"

# Map chain name to chainId
case "$CHAIN" in
  solana|sol) CHAIN_ID="CT_501" ;;
  bsc|bnb)    CHAIN_ID="56" ;;
  *)          CHAIN_ID="$CHAIN" ;;
esac

# Map stage name to rankType
case "$STAGE" in
  new)        RANK_TYPE=10 ;;
  finalizing) RANK_TYPE=20 ;;
  migrated)   RANK_TYPE=30 ;;
  *)          RANK_TYPE="$STAGE" ;;
esac

curl -s -X POST \
  'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/rank/list/ai' \
  -H 'Content-Type: application/json' \
  -H 'Accept-Encoding: identity' \
  -H 'User-Agent: binance-web3/1.1 (Skill)' \
  -d "{\"chainId\":\"${CHAIN_ID}\",\"rankType\":${RANK_TYPE},\"limit\":${LIMIT}}" \
  | python3 -m json.tool 2>/dev/null || echo "Parse error"
