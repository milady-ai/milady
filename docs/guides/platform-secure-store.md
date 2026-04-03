---
title: "Platform Secure Store"
sidebarTitle: "Platform Secure Store"
description: "Secrets should converge on secure platform storage rather than staying mixed into config forever."
---

Milady is moving toward a clearer secret split:

- bootstrap config for non-secret structure
- secure storage for credentials and wallet material
- server database for mutable settings

This page remains a stable reference because code and docs still point here while the secret migration continues.
