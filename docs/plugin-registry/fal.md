---
title: "FAL Plugin"
sidebarTitle: "FAL"
description: "FAL media generation plugin for Milady — access FAL.ai's suite of image, video, and audio generation models."
---

The FAL plugin connects Milady agents to [FAL.ai](https://fal.ai)'s media generation platform, providing access to fast inference for image, video, and audio generation models.

**Package:** `@elizaos/plugin-fal`

## Installation

```bash
milady plugins install fal
```

## Enable via Features

```json
{
  "features": {
    "fal": true
  }
}
```

## Features

- Image generation via FAL.ai models
- Video generation
- Audio generation
- Fast inference on serverless GPU infrastructure

## Related

- [Image Generation Plugin](/plugin-registry/image-generation) — General image generation
- [Suno Plugin](/plugin-registry/suno) — Music generation
- [Media Generation Guide](/guides/media-generation) — Overview of media capabilities
