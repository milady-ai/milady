# Nyx deployment

Nyx is the manually managed agent runtime on `nyx-node` (`89.167.49.4`). The canonical container is named `nyx` on Docker network `milady-isolated` with static IP `172.18.0.5`.

## How to access Nyx

From any trusted shell with SSH access to nyx-node:

```bash
ssh nyx-node nyx-launch
```

Open the printed URL (`https://nyx.shad0w.xyz/?launch=<token>`) within 60 seconds. The launch URL exchanges the short-lived token for an HttpOnly `milady_auth` cookie and redirects to `/`; after that, normal reloads use the cookie.

For phone setup:

```bash
ssh nyx-node 'nyx-launch --qr'
```

Scan the QR code, wait for Nyx to load, then use the browser’s **Add to Home Screen / Install App** flow. The app is installable as a PWA from `nyx.shad0w.xyz`.

## Self-host architecture

```text
Shadow device
  -> https://nyx.shad0w.xyz (Cloudflare proxied DNS)
  -> Cloudflare Tunnel e455fb9a-ce6b-405e-8420-84abbe58c775
  -> cloudflared on nyx-node (dial-out only; no inbound port exposure)
  -> nyx namespace relay 172.18.0.5:2139 -> 127.0.0.1:2138
  -> Docker container nyx (agent runtime + PWA assets)
```

Cloudflared config lives at `nyx-node:/root/.cloudflared/config.yml`. It routes `nyx.shad0w.xyz` to the namespace relay and sets `originRequest.httpHostHeader: localhost` so the app’s host checks see the allowed loopback host.

## Auth flow

1. `nyx-launch` reads `/etc/nyx/nyx.env`.
2. It mints a 60-second HMAC launch token for agent `a1d4ec93-9b23-4e25-a3bc-0769fd93d4b5`.
3. Browser opens `https://nyx.shad0w.xyz/?launch=<token>` (or `GET/POST /api/auth/launch`).
4. The container-side launch handler verifies the token using `MILADY_LAUNCH_SECRET`, sets `milady_auth` with `HttpOnly; Secure; SameSite=Strict; Path=/`, and redirects to `/`.
5. API middleware accepts either the existing bearer token or a valid `milady_auth` cookie.

The feature is opt-in via `MILADY_ENABLE_LAUNCH_AUTH=1`; cloud agents without that env continue using bearer/router auth.

## PWA

The web bundle serves:

- `/site.webmanifest` with `id`, `start_url`, `scope`, standalone display, maskable icons, orientation, and productivity category.
- `/sw.js` service worker with asset precache, network-first `/api/*`, and cache-first hashed `/assets/*`.
- `index.html` registers `/sw.js` on `DOMContentLoaded`.

Because the app is private, fetch these after the launch cookie is set.

## Inference

Primary inference is Eliza Cloud, matching cloud-provisioned agents:

```env
ELIZAOS_CLOUD_ENABLED=true
ELIZAOS_CLOUD_BASE_URL=https://www.elizacloud.ai/api/v1
ELIZA_CLOUD_PROVISIONED=1
MILADY_CLOUD_PROVISIONED=1
```

The secret `ELIZAOS_CLOUD_API_KEY` lives only in `nyx-node:/etc/nyx/nyx.env` and must not be committed. It is tied to Sol's Eliza Cloud account.

Secondary/fallback OpenAI-compatible inference remains local on nyx-node via the llama/steward path:

```env
OPENAI_BASE_URL=http://host.docker.internal:18080/v1
OPENAI_API_KEY=nyx-local
```

Keep `host.docker.internal:host-gateway` in the compose file so the container can still reach the host-local secondary endpoint.

## API tokens and web route

`/etc/nyx/nyx.env` also carries the inbound API token used by the milady web route. For cloud-provisioned mode, keep `ELIZA_API_TOKEN` aligned with the existing `MILADY_API_TOKEN`; otherwise the public `a1d4ec93-9b23-4e25-a3bc-0769fd93d4b5.milady.ai` route will receive `401 Unauthorized` even if the container is healthy.

Self-host launch auth requires these additional env vars in `/etc/nyx/nyx.env`:

```env
MILADY_ENABLE_LAUNCH_AUTH=1
MILADY_LAUNCH_SECRET=<random 32-byte hex secret>
ELIZA_LAUNCH_SECRET=<same value>
MILADY_AGENT_ID=a1d4ec93-9b23-4e25-a3bc-0769fd93d4b5
ELIZA_AGENT_ID=a1d4ec93-9b23-4e25-a3bc-0769fd93d4b5
```

## Secret rotation

To rotate launch auth:

1. Edit `nyx-node:/etc/nyx/nyx.env` and replace `MILADY_LAUNCH_SECRET` + `ELIZA_LAUNCH_SECRET` with the same new random value.
2. Recreate/restart the container with the same network/IP/name.
3. Existing launch cookies expire quickly; mint a new URL with `nyx-launch`.

## Restart / apply env changes

Use the compose manifest or an equivalent `docker run` that preserves:

- container name: `nyx`
- network: `milady-isolated`
- IP: `172.18.0.5`
- env file: `/etc/nyx/nyx.env`
- config mount: `/tmp/nyx-config/milady.json:/root/.milady/milady.json`
- extra host: `host.docker.internal:host-gateway`

Before changing env, back up both the live container env and the env file:

```bash
docker exec nyx env | sort > /root/nyx-env-pre-change-$(date +%Y%m%d_%H%M%S).env
cp -a /etc/nyx/nyx.env /root/nyx-env-file-pre-change-$(date +%Y%m%d_%H%M%S).env
```

After recreating the container, restart the route relay and cloudflared:

```bash
systemctl restart nyx-agent-api-proxy.service
systemctl restart cloudflared.service
```

## Fallback / rollback

Current self-host image: `ghcr.io/milady-ai/agent@sha256:9db7e2d2af7c9cba19f2510dbf4367a0eafb6e090664c52314ce2f5f5e0ae28d`.

Previous rollback image retained on nyx-node/GHCR: `ghcr.io/milady-ai/agent@sha256:0973bfc5d4083c1881251e7c2731433b7dc8e697e7089ba220e470098079f26f`.

To roll back the self-host MVP:

```bash
# On nyx-node
cp -a /root/nyx-env-file-pre-selfhost-mvp-*.env /etc/nyx/nyx.env
chmod 600 /etc/nyx/nyx.env
sed -i 's#image: .*#image: ghcr.io/milady-ai/agent@sha256:0973bfc5d4083c1881251e7c2731433b7dc8e697e7089ba220e470098079f26f#' /tmp/nyx-selfhost-compose.yml
docker rm -f nyx
docker compose -f /tmp/nyx-selfhost-compose.yml up -d
systemctl restart nyx-agent-api-proxy.service
systemctl stop cloudflared.service
```

If only the custom domain needs rollback, restore Cloudflare DNS `nyx.shad0w.xyz` from the tunnel CNAME to the prior proxied A record `188.245.252.86` and stop `cloudflared.service` on nyx-node.

To fall back to local-only inference, restore a pre-change env file or remove/disable the `ELIZAOS_CLOUD_*` values, then recreate `nyx` with the same network/IP/name. Keep `OPENAI_BASE_URL=http://host.docker.internal:18080/v1` and `OPENAI_API_KEY=nyx-local` intact.

Rollback from the v2 Eliza Cloud switch:

```bash
cp -a /root/nyx-env-file-pre-elizacloud-v2-20260424_115537.env /etc/nyx/nyx.env && chmod 600 /etc/nyx/nyx.env && /tmp/recreate_nyx_elizacloud.sh
```

## Verification

Expected health after restart:

```json
{
  "ready": true,
  "database": "ok",
  "coordinator": "ok",
  "connectors": { "discord": "ok" }
}
```

Self-host verification:

```bash
# 401 without auth means the tunnel is reachable and auth is enforced
curl -i https://nyx.shad0w.xyz/api/health

# Mint launch URL, exchange for cookie, then check health with the cookie
url=$(ssh nyx-node nyx-launch)
curl -i "$url"

# Bearer compatibility
ssh nyx-node 'docker exec nyx sh -lc '\''curl -sS -H "Authorization: Bearer $ELIZA_API_TOKEN" https://nyx.shad0w.xyz/api/health'\'''
```

A smoke test through the OpenAI-compatible route should return HTTP 200:

```bash
docker exec nyx sh -lc 'curl -sS -X POST http://127.0.0.1:2138/v1/chat/completions \
  -H "Authorization: Bearer $ELIZA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"nyx\",\"messages\":[{\"role\":\"user\",\"content\":\"health check\"}],\"max_tokens\":80}"'
```

Confirm Eliza Cloud is actually used by checking the selected `api_keys` row has an advanced `usage_count` or `last_used_at` after the smoke test.
