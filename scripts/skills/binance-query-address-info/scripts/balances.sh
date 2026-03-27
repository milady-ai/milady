#!/usr/bin/env bash
set -euo pipefail

# Binance Query Address Info - Get wallet token balances
# Usage: balances.sh <wallet_address> <chain> [offset]
#   chain: solana | bsc | base | eth

ADDRESS="${1:?Usage: balances.sh <wallet_address> <chain>}"
CHAIN="${2:?chain required: solana|bsc|base|eth}"
OFFSET="${3:-0}"

case "$CHAIN" in
  solana|sol) CHAIN_ID="CT_501" ;;
  bsc|bnb)    CHAIN_ID="56" ;;
  base)       CHAIN_ID="8453" ;;
  eth)        CHAIN_ID="1" ;;
  *)          CHAIN_ID="$CHAIN" ;;
esac

curl -s \
  "https://web3.binance.com/bapi/defi/v3/public/wallet-direct/buw/wallet/address/pnl/active-position-list/ai?address=${ADDRESS}&chainId=${CHAIN_ID}&offset=${OFFSET}" \
  -H 'clienttype: web' \
  -H 'clientversion: 1.2.0' \
  -H 'Accept-Encoding: identity' \
  -H 'User-Agent: binance-web3/1.1 (Skill)' \
  | python3 -m json.tool 2>/dev/null || echo "Parse error"
