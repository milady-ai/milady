---
title: "Trust Plugin"
sidebarTitle: "Trust"
description: "Trust primitives for Milady — enables agents to establish and manage trust with humans and other agents."
---

The Trust plugin provides trust management primitives for Milady agents.

**Package:** `@elizaos/plugin-trust`

## Overview

This plugin gives agents the building blocks for trust: evaluating trustworthiness, managing trust levels, and making trust-based decisions about interactions with humans and other agents. It enables agents to gate actions or share information based on established trust relationships.

Key capabilities:

- **Trust scoring** — assign and update trust levels for known entities.
- **Trust-gated actions** — agents can require a minimum trust level before performing sensitive operations.
- **Inter-agent trust** — agents can establish trust with other agents, not just humans.
- **Reputation tracking** — trust levels evolve over time based on interaction history.

## Installation

```bash
milady plugins install trust
```

## Configuration

No environment variables or configuration parameters are required. Trust state is stored using the agent's default storage backend.

## Usage Examples

> "What is my current trust level?"

> "Only run shell commands for users with high trust."

> "Show me the trust scores for known contacts."

## Related

- [Rolodex Plugin](/plugin-registry/rolodex) — Entity and relationship management
- [Memory Plugin](/plugin-registry/memory) — Persistent memory across sessions
