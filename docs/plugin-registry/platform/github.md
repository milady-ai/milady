---
title: "GitHub Plugin"
sidebarTitle: "GitHub"
description: "GitHub connector for Milady — interact with repositories, issues, and pull requests."
---

The GitHub plugin connects Milady agents to GitHub, enabling interactions with repositories, issues, pull requests, and other GitHub resources.

**Package:** `@elizaos/plugin-github`

## Installation

```bash
milady plugins install github
```

## Setup

### 1. Create a GitHub Personal Access Token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token** (classic) or **Fine-grained token**
3. Select the scopes needed for your use case (e.g., `repo`, `issues`, `pull_requests`)
4. Copy the generated token

### 2. Configure Milady

```json
{
  "connectors": {
    "github": {
      "apiToken": "YOUR_API_TOKEN",
      "owner": "YOUR_GITHUB_OWNER",
      "repo": "YOUR_GITHUB_REPO"
    }
  }
}
```

Or via environment variables:

```bash
export GITHUB_API_TOKEN=YOUR_API_TOKEN
export GITHUB_OWNER=YOUR_GITHUB_OWNER
export GITHUB_REPO=YOUR_GITHUB_REPO
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `apiToken` | Yes | GitHub personal access token |
| `owner` | Yes | GitHub repository owner (user or organization) |
| `repo` | Yes | GitHub repository name |
| `enabled` | No | Set `false` to disable (default: `true`) |

## Environment Variables

```bash
export GITHUB_API_TOKEN=YOUR_API_TOKEN
export GITHUB_OWNER=YOUR_GITHUB_OWNER
export GITHUB_REPO=YOUR_GITHUB_REPO
```

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
