# Nyx deployment

Nyx is the manually managed agent runtime on `nyx-node` (`89.167.49.4`). The canonical container is named `nyx` on Docker network `milady-isolated` with static IP `172.18.0.5`.

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

After recreating the container, restart the route relay:

```bash
systemctl restart nyx-agent-api-proxy.service
```

## Fallback / rollback

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

A smoke test through the OpenAI-compatible route should return HTTP 200:

```bash
docker exec nyx sh -lc 'curl -sS -X POST http://127.0.0.1:2138/v1/chat/completions \
  -H "Authorization: Bearer $ELIZA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"nyx\",\"messages\":[{\"role\":\"user\",\"content\":\"health check\"}],\"max_tokens\":80}"'
```

Confirm Eliza Cloud is actually used by checking the selected `api_keys` row has an advanced `usage_count` or `last_used_at` after the smoke test.
