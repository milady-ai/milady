#!/usr/bin/env bash
set -euo pipefail

# Binance Topic Rush - Fetch hot market topics
# Usage: fetch-topics.sh [chain] [type] [sort] [limit]
#   chain: solana (default) | bsc
#   type:  latest (default) | rising
#   sort:  time (default) | inflow
#   limit: optional positive integer result cap

CHAIN="${1:-solana}"
TYPE="${2:-latest}"
SORT="${3:-time}"
LIMIT="${4:-}"

case "$CHAIN" in
  solana|sol) CHAIN_ID="CT_501" ;;
  bsc|bnb)    CHAIN_ID="56" ;;
  *)          CHAIN_ID="$CHAIN" ;;
esac

case "$TYPE" in
  latest) RANK_TYPE=10 ;;
  rising) RANK_TYPE=20 ;;
  *)      RANK_TYPE="$TYPE" ;;
esac

case "$SORT" in
  time)   SORT_VAL=10 ;;
  inflow) SORT_VAL=20 ;;
  *)      SORT_VAL="$SORT" ;;
esac

RESPONSE="$(curl -s \
  "https://web3.binance.com/bapi/defi/v2/public/wallet-direct/buw/wallet/market/token/social-rush/rank/list/ai?chainId=${CHAIN_ID}&rankType=${RANK_TYPE}&sort=${SORT_VAL}&asc=false" \
  -H 'Accept-Encoding: identity' \
  -H 'User-Agent: binance-web3/1.1 (Skill)')"

if [[ -n "$LIMIT" ]]; then
  if [[ "$LIMIT" =~ ^[1-9][0-9]*$ ]]; then
    RESPONSE="$(
      printf '%s' "$RESPONSE" | python3 -c '
import json
import sys

limit = int(sys.argv[1])
payload = json.load(sys.stdin)
data = payload.get("data")
if isinstance(data, list):
    payload["data"] = data[:limit]
print(json.dumps(payload))
' "$LIMIT"
    )"
  else
    echo "Invalid limit: $LIMIT" >&2
    exit 1
  fi
fi

printf '%s' "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "Parse error"
