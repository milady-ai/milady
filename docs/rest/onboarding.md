---
title: "Onboarding API"
sidebarTitle: "Onboarding"
description: "REST API endpoints for the first-run onboarding flow — checking status, fetching setup options, and submitting the initial agent configuration."
---

The onboarding API drives the first-run setup wizard. It lets you check whether the agent has been configured, retrieve available provider and style options, and submit the initial configuration (agent name, personality, AI provider, connectors, etc.).

## Cloud provisioning bypass

When the agent is running as a cloud-provisioned container, onboarding is bypassed automatically. The bypass activates only when **both** conditions are met:

1. `MILADY_CLOUD_PROVISIONED=1` (or `ELIZA_CLOUD_PROVISIONED=1`) is set
2. `MILADY_API_TOKEN` (or `ELIZA_API_TOKEN`) is configured

When cloud provisioned, `GET /api/onboarding/status` returns `{ "complete": true }` so the frontend skips the setup wizard and goes directly to chat. A container with only the cloud flag but no API token falls through to the normal onboarding flow.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/onboarding/status` | Check if onboarding has been completed |
| GET | `/api/onboarding/options` | Retrieve available names, styles, providers, and models |
| POST | `/api/onboarding` | Submit the initial agent configuration |

---

### GET /api/onboarding/status

Returns whether the initial setup has been completed. Onboarding is considered complete when a config file exists and the `agents` section is populated. For cloud-provisioned containers, this always returns `{ "complete": true }`.

**Response**

```json
{
  "complete": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `complete` | boolean | `true` if the config file exists and contains an agents section, or if the agent is cloud provisioned |

---

### GET /api/onboarding/options

Returns the available options for the onboarding wizard — random name suggestions, style presets, AI provider choices, cloud provider options, model selections, and inventory/RPC provider options.

**Response**

```json
{
  "names": ["Aurora", "Luna", "Nyx", "Selene", "Nova"],
  "styles": [
    {
      "id": "milady",
      "label": "Milady",
      "description": "Classic milady persona"
    }
  ],
  "providers": [
    {
      "id": "openai",
      "label": "OpenAI",
      "envKey": "OPENAI_API_KEY"
    }
  ],
  "cloudProviders": [
    {
      "id": "elizacloud",
      "label": "elizaOS Cloud"
    }
  ],
  "models": [
    {
      "id": "openai/gpt-5-mini",
      "label": "GPT-5 Mini"
    }
  ],
  "inventoryProviders": [
    {
      "id": "evm",
      "label": "EVM",
      "rpcProviders": [
        {
          "id": "alchemy",
          "label": "Alchemy",
          "envKey": "ALCHEMY_API_KEY"
        }
      ]
    }
  ],
  "sharedStyleRules": "Keep responses brief. Be helpful and concise."
}
```

---

### POST /api/onboarding

Submit the initial agent configuration. The onboarding API persists the
selected runtime in the canonical config fields:

- `deploymentTarget` — where the active server runs (`local`, `cloud`, `remote`)
- `linkedAccounts` — which accounts are linked and available
- `serviceRouting` — which backend handles each capability (`llmText`, `tts`, `media`, `embeddings`, `rpc`)

The agent's `name`, `bio`, and `systemPrompt` are still persisted directly
onto the active agent entry so the runtime retains its identity after restart.

<Info>
  Older callers may still send compatibility fields such as `runMode`,
  `provider`, `providerApiKey`, `cloudProvider`, or `smallModel` / `largeModel`.
  They are no longer the primary API contract and should not be used for new
  clients.
</Info>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Agent display name |
| `bio` | string[] | No | Short biography lines |
| `systemPrompt` | string | No | System prompt for the agent |
| `style` | object | No | Style rules — `{ all?: string[], chat?: string[], post?: string[] }` |
| `adjectives` | string[] | No | Personality adjectives |
| `topics` | string[] | No | Topics the agent knows about |
| `postExamples` | string[] | No | Example social media posts |
| `messageExamples` | array | No | Example message conversations |
| `theme` | string | No | UI theme — `milady`, `qt314`, `web2000`, `programmer`, `haxor`, or `psycho` |
| `connection` | object | No | Optional onboarding connection payload. Accepted as a credential/bootstrap input, but not persisted as the runtime source of truth |
| `deploymentTarget` | object | No | Canonical hosting target — `{ runtime: "local" \| "cloud" \| "remote", provider?, remoteApiBase?, remoteAccessToken? }` |
| `linkedAccounts` | object | No | Canonical linked-account map — records what providers or cloud accounts are available |
| `serviceRouting` | object | No | Canonical per-capability routing — e.g. `llmText`, `tts`, `media`, `embeddings`, `rpc` |
| `sandboxMode` | string | No | Sandbox isolation level — `off`, `light`, `standard`, or `max` |
| `telegramToken` | string | No | Telegram bot token |
| `discordToken` | string | No | Discord bot token |
| `whatsappSessionPath` | string | No | WhatsApp session path |
| `twilioAccountSid` | string | No | Twilio account SID |
| `twilioAuthToken` | string | No | Twilio auth token |
| `twilioPhoneNumber` | string | No | Twilio phone number |
| `blooioApiKey` | string | No | Bloo.io API key |
| `blooioPhoneNumber` | string | No | Bloo.io phone number |
| `inventoryProviders` | array | No | RPC/inventory provider configs — `[{ chain, rpcProvider, rpcApiKey }]` |

**Example: Eliza Cloud hosting with direct Anthropic inference**

```json
{
  "name": "Milady",
  "bio": ["A helpful AI assistant"],
  "deploymentTarget": {
    "runtime": "cloud",
    "provider": "elizacloud"
  },
  "linkedAccounts": {
    "elizacloud": {
      "status": "linked",
      "source": "oauth"
    }
  },
  "serviceRouting": {
    "llmText": {
      "backend": "anthropic",
      "transport": "direct",
      "primaryModel": "anthropic/claude-sonnet-4-5"
    }
  }
}
```

In this example, the agent is hosted on Eliza Cloud, but text inference still
routes directly to Anthropic. Hosting, linked accounts, and active service
routing are separate concerns.

**Response**

```json
{
  "ok": true
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| 400 | Missing or invalid agent name |
| 400 | Invalid `connection`, `deploymentTarget`, `linkedAccounts`, or `serviceRouting` payload |
| 500 | Failed to save configuration |

---

## Related: in-app wizard (frontend)

The HTTP API above backs **server** configuration. The **React onboarding wizard** (step order, back/next, sidebar) is documented separately because it uses client-side flow helpers and must stay aligned with UI navigation without duplicating step lists. See [Onboarding UI flow](/guides/onboarding-ui-flow).
