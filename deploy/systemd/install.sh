#!/bin/bash
# install.sh — install the milady user systemd unit + timers.
#
# Idempotent. Run as the Linux user the bot should execute under (do NOT
# run as root). First run sets everything up; subsequent runs refresh
# files in place.
#
# Usage:
#   cd deploy/systemd
#   ./install.sh [MILADY_WORKDIR]
#
# MILADY_WORKDIR defaults to the parent of this repo checkout. Pass an
# absolute path to override. The same value also lands in
# ~/.config/milady/env for the env-file-backed settings.

set -euo pipefail

if [ "$(id -u)" = "0" ]; then
    echo "install.sh: do NOT run as root. Run as the user the bot should execute under." >&2
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEFAULT_WORKDIR="$REPO_ROOT"
MILADY_WORKDIR="${1:-$DEFAULT_WORKDIR}"
if [ ! -d "$MILADY_WORKDIR" ]; then
    echo "install.sh: MILADY_WORKDIR not found: $MILADY_WORKDIR" >&2
    exit 1
fi

BUN_BIN="$(command -v bun || true)"
if [ -z "$BUN_BIN" ]; then
    echo "install.sh: bun not in PATH. Install bun (https://bun.sh) first." >&2
    exit 1
fi

LOG_DIR="${MILADY_LOG_DIR:-$HOME/.local/share/milady}"
LOG_FILE="$LOG_DIR/bot.log"
mkdir -p "$LOG_DIR" "$HOME/.config/milady" "$HOME/bin" "$HOME/.config/systemd/user"

# -- bin scripts --
install -m 0755 "$(dirname "$0")/bin/milady-refresh-oauth.sh" "$HOME/bin/milady-refresh-oauth.sh"
install -m 0755 "$(dirname "$0")/bin/milady-health-probe.sh" "$HOME/bin/milady-health-probe.sh"

# -- env file --
if [ ! -f "$HOME/.config/milady/env" ]; then
    install -m 0600 "$(dirname "$0")/milady.env.example" "$HOME/.config/milady/env"
    # Replace the default path in the newly-created env file with the
    # user's actual workdir. Existing env files are left alone so the
    # user's edits survive re-runs.
    sed -i "s|^MILADY_WORKDIR=.*|MILADY_WORKDIR=$MILADY_WORKDIR|" "$HOME/.config/milady/env"
fi

# -- units: substitute placeholders and place --
UNIT_DIR="$HOME/.config/systemd/user"
for unit in milady.service milady-refresh.service milady-refresh.timer milady-probe.service milady-probe.timer; do
    src="$(dirname "$0")/units/$unit"
    dst="$UNIT_DIR/$unit"
    sed \
        -e "s|__MILADY_WORKDIR__|$MILADY_WORKDIR|g" \
        -e "s|__BUN_BIN__|$BUN_BIN|g" \
        -e "s|__MILADY_LOG__|$LOG_FILE|g" \
        "$src" > "$dst"
    chmod 0644 "$dst"
done

# -- enable linger so user services survive logout/reboot --
if command -v loginctl >/dev/null 2>&1; then
    if loginctl show-user "$USER" 2>/dev/null | grep -q "Linger=no"; then
        echo "install.sh: enabling linger (requires sudo)..."
        sudo loginctl enable-linger "$USER"
    fi
fi

# -- reload + enable + start --
systemctl --user daemon-reload
systemctl --user enable --now milady.service milady-refresh.timer milady-probe.timer

echo
echo "installed. status:"
systemctl --user status --no-pager milady.service milady-refresh.timer milady-probe.timer | head -20
echo
echo "logs:"
echo "  bot:         $LOG_FILE"
echo "  oauth:       $LOG_DIR/oauth-refresh.log"
echo "  probe:       $LOG_DIR/probe.log"
echo
echo "next step: if you have not yet, run 'claude auth login' once to seed"
echo "the OAuth credentials file. The refresh unit keeps it rolling from there."
