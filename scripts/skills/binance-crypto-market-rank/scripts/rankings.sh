#!/usr/bin/env bash
set -euo pipefail

# Binance Crypto Market Rank - Get market rankings
# Usage: rankings.sh [type] [chain] [limit]
#   type: trending (default) | top-search | alpha | stock | smart-money | meme | traders
#   chain: all (default for unified rank) | solana | bsc | base | eth
#   limit: number of items (default 20, max 200)

TYPE="${1:-trending}"
CHAIN="${2:-}"
LIMIT="${3:-20}"

case "$CHAIN" in
  ""|all)      CHAIN_ID="" ;;
  solana|sol)  CHAIN_ID="CT_501" ;;
  bsc|bnb)     CHAIN_ID="56" ;;
  base)        CHAIN_ID="8453" ;;
  eth)         CHAIN_ID="1" ;;
  *)           CHAIN_ID="$CHAIN" ;;
esac

case "$TYPE" in
  trending|top-search|alpha|stock)
    case "$TYPE" in
      trending)   RANK_TYPE=10 ;;
      top-search) RANK_TYPE=11 ;;
      alpha)      RANK_TYPE=20 ;;
      stock)      RANK_TYPE=40 ;;
    esac

    BODY="{\"rankType\":${RANK_TYPE},\"period\":50,\"sortBy\":70,\"orderAsc\":false,\"page\":1,\"size\":${LIMIT}"
    if [ -n "$CHAIN_ID" ]; then
      BODY="${BODY},\"chainId\":\"${CHAIN_ID}\""
    fi
    BODY="${BODY}}"

    curl -s -X POST \
      'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/unified/rank/list/ai' \
      -H 'Content-Type: application/json' \
      -H 'Accept-Encoding: identity' \
      -H 'User-Agent: binance-web3/2.1 (Skill)' \
      -d "$BODY" \
      | python3 -m json.tool 2>/dev/null || echo "Parse error"
    ;;
  smart-money)
    if [ -z "$CHAIN_ID" ]; then
      CHAIN_ID="56"
    fi
    curl -s -X POST \
      'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/tracker/wallet/token/inflow/rank/query/ai' \
      -H 'Content-Type: application/json' \
      -H 'Accept-Encoding: identity' \
      -H 'User-Agent: binance-web3/2.1 (Skill)' \
      -d "{\"chainId\":\"${CHAIN_ID}\",\"period\":\"24h\",\"tagType\":2}" \
      | python3 -m json.tool 2>/dev/null || echo "Parse error"
    ;;
  meme)
    if [ -z "$CHAIN_ID" ]; then
      CHAIN_ID="56"
    fi
    curl -s \
      "https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/exclusive/rank/list/ai?chainId=${CHAIN_ID}" \
      -H 'Accept-Encoding: identity' \
      -H 'User-Agent: binance-web3/2.1 (Skill)' \
      | python3 -m json.tool 2>/dev/null || echo "Parse error"
    ;;
  traders)
    if [ -z "$CHAIN_ID" ]; then
      CHAIN_ID="CT_501"
    fi
    curl -s \
      "https://web3.binance.com/bapi/defi/v1/public/wallet-direct/market/leaderboard/query/ai?tag=ALL&pageNo=1&chainId=${CHAIN_ID}&pageSize=${LIMIT}&sortBy=0&orderBy=0&period=30d" \
      -H 'Accept-Encoding: identity' \
      -H 'User-Agent: binance-web3/2.1 (Skill)' \
      | python3 -m json.tool 2>/dev/null || echo "Parse error"
    ;;
  *)
    echo "Unsupported ranking type: ${TYPE}" >&2
    exit 1
    ;;
esac
