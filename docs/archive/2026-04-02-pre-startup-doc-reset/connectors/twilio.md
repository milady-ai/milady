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

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number for sending/receiving |

## Features

- SMS messaging (send and receive)
- Voice call capabilities
- Webhook-based inbound message handling

## Related

- [Connectors overview](/guides/connectors#twilio)
