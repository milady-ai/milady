#!/bin/bash
# milady-health-probe.sh — active health check for a running milady bot.
#
# Reports SUCCESS (exit 0) when everything is fine. On any failure mode:
#   - API not responding
#   - agent state != "running"
#   - Authentication failures in the recent log tail
# it asks systemd to restart the user unit and still exits 0 (restart
# *is* the remediation, not a service failure).
#
# Reads port + log path from the environment (defaults match the Docker
# deployment). Override via EnvironmentFile=~/.config/milady/env on the
# invoking timer unit, or export in your shell when running by hand.

MILADY_API_PORT="${MILADY_API_PORT:-47831}"
MILADY_LOG="${MILADY_LOG:-$HOME/.local/share/milady/bot.log}"
MILADY_UNIT="${MILADY_UNIT:-milady.service}"
WATCHLOG="$HOME/.local/share/milady/probe.log"

mkdir -p "$(dirname "$WATCHLOG")"

fail() {
    echo "[$(date -u)] RESTART: $1" >> "$WATCHLOG"
    systemctl --user restart "$MILADY_UNIT"
    exit 0
}

HEALTH=$(curl -sS -m 5 "http://127.0.0.1:${MILADY_API_PORT}/api/health" 2>/dev/null)
[ -z "$HEALTH" ] && fail "api not responding on port ${MILADY_API_PORT}"

STATE=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('agentState',''))" 2>/dev/null)
[ "$STATE" != "running" ] && fail "agent state=$STATE (expected running)"

if [ -f "$MILADY_LOG" ]; then
    AUTH_ERRS=$(tail -50 "$MILADY_LOG" 2>/dev/null | grep -c "Authentication failed" || true)
    [ "$AUTH_ERRS" -gt 0 ] && fail "auth failing ($AUTH_ERRS recent errors)"
fi

# Periodic OK heartbeat, suppressed most of the time so the log stays
# small. The bot's own logs are the primary audit trail; this log is
# just for "is the watchdog itself running".
MINUTE=$(date +%M)
if [ "$((10#$MINUTE % 60))" -lt 5 ]; then
    echo "[$(date -u)] OK" >> "$WATCHLOG"
fi

exit 0
