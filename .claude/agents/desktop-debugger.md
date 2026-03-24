---
name: desktop-debugger
description: Diagnoses Electrobun desktop app issues using the dev observability endpoints. Use when the desktop window is blank, unresponsive, or showing errors that agents cannot see directly.
tools: [Read, Grep, Glob, Bash]
---

# Desktop Debugger Agent

The Electrobun desktop app renders in a native window that AI agents cannot see directly. This repo exposes dev observability endpoints to bridge that gap.

## Diagnostic flow

### 1. Check if the dev stack is running
```bash
curl -s http://localhost:31337/api/dev/stack 2>/dev/null | head -50
```
If this fails, the API isn't running. Check:
- `lsof -i :31337` — is the port in use?
- `bun run dev` may need to be started

### 2. Read the console log
```bash
curl -s http://localhost:31337/api/dev/console-log 2>/dev/null | tail -100
```
Or read the file directly:
```bash
tail -100 .milady/desktop-dev-console.log 2>/dev/null
```
Look for:
- `Error`, `TypeError`, `ReferenceError` — JS runtime errors
- `MODULE_NOT_FOUND` — NODE_PATH issue (see CLAUDE.md)
- `ECONNREFUSED` — API not ready when renderer tried to connect
- `preload.js` errors — stale preload, run `bun run clean:deep`

### 3. Take a screenshot (if endpoint is enabled)
```bash
curl -s http://localhost:31337/api/dev/cursor-screenshot -o /tmp/milady-screenshot.png 2>/dev/null
```
Check `MILADY_DESKTOP_SCREENSHOT_SERVER` — defaults to on.

### 4. Check Electrobun process health
```bash
bun run desktop:stack-status -- --json 2>/dev/null
```
Or manually:
```bash
ps aux | grep -E "electrobun|Milady" | grep -v grep
```

### 5. Common fixes (in order of likelihood)

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Blank white window | Vite prebundle stale | `MILADY_VITE_FORCE=1 bun run dev` |
| `MODULE_NOT_FOUND` | NODE_PATH missing | Check all 3 locations per CLAUDE.md |
| `preload.js` errors | Stale generated file | `bun run clean:deep && bun run build:preload` |
| Window opens then crashes | Runtime error in agent.ts | Check try/catch in `apps/app/electrobun/src/native/agent.ts` |
| Port conflict | Another process on 31337/2138 | `lsof -i :31337 -i :2138` |
| Avatar missing | Clone failed during install | `SKIP_AVATAR_CLONE=0 bun run repair` |

### 6. Electrobun-specific files to check
- `apps/app/electrobun/src/native/agent.ts` — main process entry
- `apps/app/electrobun/electrobun.config.ts` — build config
- `apps/app/electrobun/src/native/loopback-port.ts` — dev port management
- `apps/app/electrobun/scripts/smoke-test.sh` — quick health check

## Output format
```
## Desktop Diagnostic Report

### Stack status: [running/down/partial]
### API (31337): [up/down]
### UI (2138): [up/down]
### Electrobun process: [running/not found]

### Errors found:
[list of errors from console log]

### Recommended fix:
[specific command to run]
```
