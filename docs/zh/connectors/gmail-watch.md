---
title: Gmail Watch 连接器
sidebarTitle: Gmail Watch
description: 使用 @elizaos/plugin-gmail-watch 包监控 Gmail 收件箱。
---

使用 Pub/Sub 监控 Gmail 收件箱中的传入消息。

<div id="overview">

## 概述

</div>

Gmail Watch 连接器是一个 elizaOS 插件，通过 Google Cloud Pub/Sub 监控 Gmail 收件箱。它监视新消息并触发代理事件。此连接器通过功能标志而非 `connectors` 部分启用。可从插件注册表获取。

<div id="package-info">

## 包信息

</div>

| 字段 | 值 |
|------|----|
| 包 | `@elizaos/plugin-gmail-watch` |
| 功能标志 | `features.gmailWatch` |
| 安装 | `milady plugins install gmail-watch` |

<div id="setup-requirements">

## 设置要求

</div>

- Google Cloud 服务账户或具有 Gmail API 访问权限的 OAuth 凭据
- 为 Gmail 推送通知配置的 Pub/Sub 主题

<div id="configuration">

## 配置

</div>

Gmail Watch 通过 `features` 部分启用：

```json
{
  "features": {
    "gmailWatch": true
  }
}
```

<div id="features">

## 功能

</div>

- 通过 Pub/Sub 监视 Gmail 消息
- 自动续订监视订阅
- 传入邮件事件处理

<div id="related">

## 相关内容

</div>

- [连接器概述](/zh/guides/connectors#gmail-watch)
