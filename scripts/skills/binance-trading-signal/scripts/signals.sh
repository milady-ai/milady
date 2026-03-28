#!/usr/bin/env bash
set -euo pipefail

# Binance Trading Signal - Get smart money signals
# Usage: signals.sh [chain] [limit]
#   chain: solana (default) | bsc
#   limit: number of signals (default 20, max 100)

CHAIN="${1:-solana}"
LIMIT="${2:-20}"

case "$CHAIN" in
  solana|sol) CHAIN_ID="CT_501" ;;
  bsc|bnb)    CHAIN_ID="56" ;;
  *)          CHAIN_ID="$CHAIN" ;;
esac

curl -s -X POST \
  'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/web/signal/smart-money/ai' \
  -H 'Content-Type: application/json' \
  -H 'Accept-Encoding: identity' \
  -H 'User-Agent: binance-web3/1.1 (Skill)' \
  -d "{\"page\":1,\"pageSize\":${LIMIT},\"chainId\":\"${CHAIN_ID}\"}" \
  | python3 -m json.tool 2>/dev/null || echo "Parse error"
