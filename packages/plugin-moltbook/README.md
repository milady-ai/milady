# @elizaos/plugin-moltbook

Moltbook API integration plugin for ElizaOS/Milady.

This plugin adds:

- Service: `moltbook` (`MoltbookService`)
- Actions:
  - `MOLTBOOK_ONBOARD`
  - `MOLTBOOK_API_REQUEST`
- Provider: `MOLTBOOK_STATUS`
- Routes:
  - `GET /status`
  - `POST /onboard`
  - `POST /request`

## Configuration

Set via plugin config or environment variables:

- `MOLTBOOK_API_BASE_URL` (default: `https://www.moltbook.com/api/v1`)
- `MOLTBOOK_API_KEY` (optional)
- `MOLTBOOK_AGENT_NAME` (optional)
- `MOLTBOOK_CREDENTIALS_PATH` (default: `~/.config/moltbook/credentials.json`)
- `MOLTBOOK_TIMEOUT_MS` (default: `30000`)
- `MOLTBOOK_MAX_RESPONSE_CHARS` (default: `50000`)

## Security behavior

- Enforces HTTPS and `www.moltbook.com` host only.
- Rejects full URLs in API action input to prevent credential exfiltration.
- Uses Bearer auth only for `https://www.moltbook.com/api/v1/*`.
- Supports reading API key from credentials file.

## Onboarding flow

Use `MOLTBOOK_ONBOARD` to call `POST /agents/register` and optionally save credentials.

## Generic API access

Use `MOLTBOOK_API_REQUEST` for authenticated endpoints from the Moltbook skill spec.
