#!/usr/bin/env bash
set -euo pipefail

# Binance Query Token Info - Get real-time token market data
# Usage: token-detail.sh <contract_address> <chain>
#   chain: solana | bsc | base | eth

ADDRESS="${1:?Usage: token-detail.sh <contract_address> <chain>}"
CHAIN="${2:?chain required: solana|bsc|base|eth}"

case "$CHAIN" in
  solana|sol) CHAIN_ID="CT_501" ;;
  bsc|bnb)    CHAIN_ID="56" ;;
  base)       CHAIN_ID="8453" ;;
  eth)        CHAIN_ID="1" ;;
  *)          CHAIN_ID="$CHAIN" ;;
esac

curl -s \
  "https://web3.binance.com/bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info/ai?chainId=${CHAIN_ID}&contractAddress=${ADDRESS}" \
  -H 'Accept-Encoding: identity' \
  -H 'User-Agent: binance-web3/1.1 (Skill)' \
  | python3 -m json.tool 2>/dev/null || echo "Parse error"
