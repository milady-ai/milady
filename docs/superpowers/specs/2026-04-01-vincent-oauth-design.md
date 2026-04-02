# Vincent OAuth Integration — Design Spec

## Overview

Add "Sign in with Vincent" to the wallet UI using OAuth 2.0 PKCE flow from the [Vincent OAuth Demo](https://github.com/HeyVincent-ai/Vincent-OAuth-Demo). Once authenticated, the user's Vincent access token is persisted server-side so the `plugin-vincent-finance` can use it at runtime.

## Auth Flow

1. User clicks "Connect Vincent" in wallet sidebar
2. Frontend generates PKCE code verifier + challenge, stores verifier in sessionStorage
3. Frontend calls `POST /api/vincent/register` (proxied to Vincent) to get `client_id`
4. Frontend opens browser to Vincent authorize URL with PKCE params
5. Vincent redirects to callback URL:
   - **Dev**: `http://localhost:2138/callback/vincent`
   - **Prod**: `https://milady.ai/callback/vincent` or `milady://callback/vincent`
6. Callback page extracts auth code from URL, sends to `POST /api/vincent/token` with code + verifier
7. Backend exchanges code for access token (`vot_*`) + refresh token via Vincent API
8. Backend persists tokens to `~/.milady/milady.json` under `vincent` key
9. Frontend polls `GET /api/vincent/status` until connected
10. Wallet sidebar shows "Vincent Connected" with disconnect option

## Files

### New Files
- `packages/app-core/src/api/vincent-oauth.ts` — PKCE crypto helpers
- `packages/app-core/src/api/vincent-routes.ts` — Backend route handler (`/api/vincent/*`)
- `packages/app-core/src/api/client-vincent.ts` — Client methods (vincentRegister, vincentToken, vincentStatus, vincentDisconnect)
- `packages/app-core/src/state/useVincentState.ts` — React hook for Vincent auth state

### Modified Files
- `packages/app-core/src/api/server.ts` — Register Vincent route handler
- `packages/app-core/src/api/client-types.ts` — Add Vincent response types
- `packages/app-core/src/components/pages/InventoryView.tsx` — Add Vincent connect button to wallet sidebar
- `packages/app-core/src/state/AppContext.tsx` or equivalent — Wire useVincentState into app state
- `plugins.json` — Already done (plugin-vincent entry)

## Backend Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/vincent/register` | POST | Register app with Vincent, returns client_id |
| `/api/vincent/token` | POST | Exchange auth code + verifier for tokens |
| `/api/vincent/status` | GET | Check if Vincent is connected (has valid token) |
| `/api/vincent/disconnect` | POST | Clear stored Vincent tokens |

## Token Storage

Tokens stored in `~/.milady/milady.json`:
```json
{
  "vincent": {
    "accessToken": "vot_...",
    "refreshToken": "...",
    "clientId": "...",
    "connectedAt": 1711929600
  }
}
```

## Vincent API Endpoints

- `POST https://heyvincent.ai/api/oauth/public/register` — `{ client_name, redirect_uris }` → `{ client_id }`
- `GET https://heyvincent.ai/api/oauth/public/authorize` — Redirect with PKCE params
- `POST https://heyvincent.ai/api/oauth/public/token` — Code exchange → `{ access_token, refresh_token }`

## UI

Wallet sidebar footer gets a new button between the address copy buttons and settings:
- **Disconnected**: "Connect Vincent" button with Vincent icon
- **Connecting**: Spinner + "Connecting..."
- **Connected**: "Vincent Connected" green badge + "Disconnect" link

## Redirect URIs

Register both with Vincent:
- `http://localhost:2138/callback/vincent` (dev)
- `https://milady.ai/callback/vincent` (prod)
- `milady://callback/vincent` (desktop prod)
