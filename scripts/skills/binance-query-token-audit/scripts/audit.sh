#!/usr/bin/env bash
set -euo pipefail

# Binance Query Token Audit - Security scan a token contract
# Usage: audit.sh <contract_address> <chain>
#   chain: solana | bsc | base | eth

ADDRESS="${1:?Usage: audit.sh <contract_address> <chain>}"
CHAIN="${2:?chain required: solana|bsc|base|eth}"

case "$CHAIN" in
  solana|sol) CHAIN_ID="CT_501" ;;
  bsc|bnb)    CHAIN_ID="56" ;;
  base)       CHAIN_ID="8453" ;;
  eth)        CHAIN_ID="1" ;;
  *)          CHAIN_ID="$CHAIN" ;;
esac

REQUEST_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"

curl -s -X POST \
  'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit' \
  -H 'Content-Type: application/json' \
  -H 'source: agent' \
  -H 'Accept-Encoding: identity' \
  -H 'User-Agent: binance-web3/1.4 (Skill)' \
  -d "{\"binanceChainId\":\"${CHAIN_ID}\",\"contractAddress\":\"${ADDRESS}\",\"requestId\":\"${REQUEST_ID}\"}" \
  | python3 -m json.tool 2>/dev/null || echo "Parse error"
