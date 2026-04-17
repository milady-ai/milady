#!/bin/bash
# milady-refresh-oauth.sh — keeps Claude Code OAuth rolling without spending
# LLM tokens. Reads ~/.claude/.credentials.json, checks the access token's
# expiresAt, and only calls `claude auth status` (which forces a refresh-
# token roll on the auth endpoint) when we are within
# REFRESH_BEFORE_EXPIRY_MIN of expiry. Otherwise a no-op.
#
# Intended to run:
#   - ExecStartPre for the bot service (so every (re)start refreshes when
#     needed and starts with a valid token)
#   - On a timer (default every 6h) so long-lived bots keep the refresh
#     token rolling even during quiet periods

set -euo pipefail

# Make sure `claude` is resolvable regardless of the invoking environment
# (cron, systemd timer with minimal PATH).
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

REFRESH_BEFORE_EXPIRY_MIN="${MILADY_REFRESH_BEFORE_EXPIRY_MIN:-60}"
CREDS="$HOME/.claude/.credentials.json"
LOG="${MILADY_LOG_DIR:-$HOME/.local/share/milady}/oauth-refresh.log"

mkdir -p "$(dirname "$LOG")"

if [ ! -f "$CREDS" ]; then
    echo "[$(date -u)] no claude credentials at $CREDS — run 'claude auth login' once" >> "$LOG"
    exit 0
fi

# Parse expiresAt without requiring python3 or jq — plain grep/cut.
EXPIRES_AT_MS=$(grep -o '"expiresAt":[0-9]*' "$CREDS" | grep -o '[0-9]*$' || echo 0)
NOW_MS=$(date +%s%3N)
MIN_LEFT=$(( (EXPIRES_AT_MS - NOW_MS) / 60000 ))

if [ "$MIN_LEFT" -gt "$REFRESH_BEFORE_EXPIRY_MIN" ]; then
    echo "[$(date -u)] ok — ${MIN_LEFT}m left, no refresh needed" >> "$LOG"
    exit 0
fi

# Near expiry: force a refresh-token round-trip. `claude auth status` hits
# the auth endpoint and rolls the refresh token; it does not spend LLM
# tokens. Failures are swallowed so the unit does not fail — the next
# timer fire will retry.
claude auth status --json > /dev/null 2>&1 || true

NEW_EXPIRES_AT_MS=$(grep -o '"expiresAt":[0-9]*' "$CREDS" | grep -o '[0-9]*$' || echo 0)
NEW_MIN_LEFT=$(( (NEW_EXPIRES_AT_MS - NOW_MS) / 60000 ))
echo "[$(date -u)] refresh: ${MIN_LEFT}m -> ${NEW_MIN_LEFT}m left" >> "$LOG"
