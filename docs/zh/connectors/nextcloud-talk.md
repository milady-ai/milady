---
title: Nextcloud Talk 连接器
sidebarTitle: Nextcloud Talk
description: 使用 @elizaos/plugin-nextcloud-talk 包将你的代理连接到 Nextcloud Talk。
---

将你的代理连接到 Nextcloud Talk，进行自托管协作消息。

<div id="overview">

## 概述

</div>

Nextcloud Talk 连接器是一个 elizaOS 插件，将你的代理桥接到 Nextcloud Talk 房间。它支持自托管 Nextcloud 实例上的私信和群组对话。此连接器可从插件注册表获取。

<div id="package-info">

## 包信息

</div>

| 字段 | 值 |
|------|----|
| 包 | `@elizaos/plugin-nextcloud-talk` |
| 配置键 | `connectors.nextcloud-talk` |
| 安装 | `milady plugins install nextcloud-talk` |

<div id="setup-requirements">

## 设置要求

</div>

- Nextcloud 服务器 URL 和凭据

<div id="configuration">

## 配置

</div>

```json
{
  "connectors": {
    "nextcloud-talk": {
      "enabled": true
    }
  }
}
```

<div id="features">

## 功能

</div>

- 基于房间的消息
- 支持私信和群组对话
- 自托管协作平台集成

<div id="related">

## 相关内容

</div>

- [连接器概述](/zh/guides/connectors#nextcloud-talk)
