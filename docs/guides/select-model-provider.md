---
title: "Select A Model Provider"
sidebarTitle: "Select Provider"
description: "Provider choice is independent from where the server runs."
---

Provider selection should be the same regardless of whether the server is:

- local
- remote
- Eliza Cloud

## The Correct Mental Model

- server target answers: `where is the server?`
- provider routing answers: `who handles llm.text?`

## Supported Behavior

All server targets should be able to use:

- a local model on that host
- direct providers such as OpenAI, Anthropic, or OpenRouter
- Eliza Cloud inference

Linking an Eliza Cloud account should never force the provider to switch on its own.
