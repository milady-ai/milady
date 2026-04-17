# milady — systemd (bare-metal) deployment

Installs milady as a long-running **user-level** systemd service on a Linux
VPS. Complements the existing Docker deployment for operators who want the
bot to run directly against the host — typically so it can use the Claude
Code CLI OAuth (Max subscription) without container/auth plumbing.

## Why bare-metal instead of Docker

| | bare-metal systemd | Docker |
|---|---|---|
| Claude Max OAuth via `claude auth login` | direct, one-time interactive | requires baking the CLI + mounting credentials, or using a separate API key |
| PTY subagents (`claude` invoked by the bot) | native, no extra networking | container-in-container / mount plumbing |
| Agent-home filesystem writes | direct | volume mount |
| Process isolation | no | yes |
| Multi-tenancy on one host | awkward | good |

Pick this if you run **one bot on one VPS** against a personal Max
subscription. Pick Docker for multi-bot hosts, managed cloud, or
API-key-first auth.

## What you get

- `milady.service` — `Restart=always`, capped burst (10/10min), OAuth refresh before launch, logs appended to a single file.
- `milady-refresh.timer` — runs the OAuth refresh helper every 6h. The helper is a no-op unless the access token is within 60 min of expiry, so it spends no LLM tokens.
- `milady-probe.timer` — every 5 min, checks the API is responding, the agent is in `running` state, and no `Authentication failed` errors are in the recent log tail. On any failure, restarts the bot. Exit code is always 0 — a restart is the remediation, not a service failure.
- `loginctl enable-linger` — the service keeps running after you log out of the VPS.

## Install

```bash
cd deploy/systemd
./install.sh            # uses the repo root as MILADY_WORKDIR
# or explicitly:
./install.sh /opt/milady
```

The installer:
1. Installs the two helper scripts into `~/bin/`.
2. Copies `milady.env.example` to `~/.config/milady/env` on first run (subsequent runs leave your edits alone).
3. Substitutes `__MILADY_WORKDIR__`, `__BUN_BIN__`, `__MILADY_LOG__` into the unit files and places them in `~/.config/systemd/user/`.
4. `loginctl enable-linger` (asks for sudo if needed).
5. Reloads systemd, enables + starts the service and two timers.

First-time setup also needs `claude auth login` once so the OAuth
credentials file exists at `~/.claude/.credentials.json`. The refresh
timer takes care of everything after that.

## Verify

```bash
systemctl --user status milady.service
systemctl --user list-timers 'milady-*'
journalctl --user -u milady.service -f
```

## OAuth refresh details

`milady-refresh-oauth.sh` reads `~/.claude/.credentials.json`, computes
how long until the access token expires, and returns without doing
anything if there are more than `MILADY_REFRESH_BEFORE_EXPIRY_MIN`
(default 60) minutes left. When the token is near expiry it runs
`claude auth status --json`, which hits the auth endpoint and rolls
the refresh token — it does not invoke any model.

## Uninstall

```bash
systemctl --user disable --now milady.service milady-refresh.timer milady-probe.timer
rm ~/.config/systemd/user/milady{,-refresh,-probe}.{service,timer}
rm ~/bin/milady-refresh-oauth.sh ~/bin/milady-health-probe.sh
systemctl --user daemon-reload
loginctl disable-linger "$USER"   # optional
```
