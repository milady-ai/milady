---
title: Twilio Connector
sidebarTitle: Twilio
description: Connect your agent to Twilio for SMS and voice using the @elizaos/plugin-twilio package.
---

Connect your agent to Twilio for SMS messaging and voice call capabilities.

## Overview

The Twilio connector is an elizaOS plugin that bridges your agent to Twilio's communication APIs. It supports inbound and outbound SMS, as well as voice call capabilities. This connector is available from the plugin registry.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-twilio` |
| Config key | `connectors.twilio` |
| Install | `milady plugins install twilio` |

## Setup Requirements

- Twilio Account SID and Auth Token
- A Twilio phone number

## Configuration

```json
{
  "connectors": {
    "twilio": {
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | No | Twilio phone number for sending/receiving |
| `TWILIO_WEBHOOK_URL` | No | Webhook URL for inbound messages |
| `TWILIO_WEBHOOK_PORT` | No | Port for webhook listener |
| `VOICE_CALL_ENABLED` | No | Enable voice call capabilities |
| `VOICE_CALL_PROVIDER` | No | Voice call provider selection |
| `VOICE_CALL_FROM_NUMBER` | No | Phone number for outbound calls |
| `VOICE_CALL_TO_NUMBER` | No | Default destination phone number |
| `VOICE_CALL_ALLOW_FROM` | No | Comma-separated list of allowed caller numbers |
| `VOICE_CALL_PUBLIC_URL` | No | Public URL for voice call webhooks |
| `VOICE_CALL_INBOUND_POLICY` | No | Inbound call handling policy |

## Features

- SMS messaging (send and receive)
- Voice call capabilities (inbound and outbound)
- Webhook-based inbound message handling
- Configurable inbound call policies and greetings
- Concurrent call management

## Related

- [Connectors overview](/guides/connectors#twilio)
