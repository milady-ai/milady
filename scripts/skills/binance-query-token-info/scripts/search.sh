#!/usr/bin/env bash
set -euo pipefail

# Binance Query Token Info - Search token by keyword or contract address
# Usage: search.sh <keyword_or_address> [chain]
#   chain: all (default) | solana | bsc | base

KEYWORD="${1:?Usage: search.sh <keyword_or_address> [chain]}"
CHAIN="${2:-}"

CHAIN_PARAM=""
case "$CHAIN" in
  solana|sol) CHAIN_PARAM="&chainIds=CT_501" ;;
  bsc|bnb)    CHAIN_PARAM="&chainIds=56" ;;
  base)       CHAIN_PARAM="&chainIds=8453" ;;
  eth)        CHAIN_PARAM="&chainIds=1" ;;
esac

curl -s \
  "https://web3.binance.com/bapi/defi/v5/public/wallet-direct/buw/wallet/market/token/search/ai?keyword=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$KEYWORD")${CHAIN_PARAM}" \
  -H 'Accept-Encoding: identity' \
  -H 'User-Agent: binance-web3/1.1 (Skill)' \
  | python3 -m json.tool 2>/dev/null || echo "Parse error"
