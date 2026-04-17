---
title: "Secrets Manager 插件"
sidebarTitle: "Secrets Manager"
description: "为 Milady 代理提供安全的密钥存储、环境变量映射、运行时密钥注入和加密功能。"
---

Secrets Manager 插件为 API 密钥和其他敏感配置值提供安全的加密存储。它在启动序列的早期阶段加载——在任何连接器或提供者插件之前——因此密钥在插件初始化时即可使用。

**Package:** `@elizaos/plugin-secrets-manager`（静态导入——可用但不在默认核心插件集中；可能在未来版本中重新启用）

<div id="overview">
## 概述
</div>

通过 Secrets Manager 存储的密钥具有以下特性：

- 使用 AES-256-GCM 进行静态加密
- 仅在运行时由授权插件请求时解密
- 可审计——所有密钥访问都会被记录（仅记录密钥名称，绝不记录值）
- 按代理隔离——密钥不会在代理之间泄露

<div id="setting-secrets">
## 设置密钥
</div>

<div id="via-the-admin-panel">
### 通过管理面板
</div>

导航到 **Agent → Settings → Secrets** 并添加键值对。

<div id="via-the-cli">
### 通过 CLI
</div>

```bash
# Open the config file in your editor
$EDITOR "$(milady config path)"
# Add the key under the "secrets" section
```

<div id="via-configuration-file">
### 通过配置文件
</div>

密钥可以包含在 `milady.json` 中（不建议在生产环境中使用——请改用环境变量）：

```json
{
  "secrets": {
    "OPENAI_API_KEY": "<OPENAI_API_KEY>",
    "TELEGRAM_BOT_TOKEN": "123456:ABC..."
  }
}
```

<div id="via-environment-variables">
### 通过环境变量
</div>

启动时存在的任何环境变量都会自动作为密钥可用。插件通过 `runtime.getSetting()` 访问它们，该方法会同时检查已存储的密钥和 `process.env`。

```bash
OPENAI_API_KEY=sk-... TELEGRAM_BOT_TOKEN=123456:ABC... milady start
```

<div id="accessing-secrets-in-plugins">
## 在插件中访问密钥
</div>

插件应始终使用 `runtime.getSetting()` 而不是直接读取 `process.env`。Secrets Manager 确保无论存储后端如何，都能返回正确的值。

```typescript
import type { Plugin } from "@elizaos/core";

const myPlugin: Plugin = {
  name: "my-plugin",
  description: "Plugin demonstrating secret access",

  init: async (_config, runtime) => {
    const apiKey = runtime.getSetting("MY_API_KEY");

    if (!apiKey) {
      throw new Error("[my-plugin] MY_API_KEY is required but not set");
    }

    runtime.logger?.info("[my-plugin] API key loaded (length: " + apiKey.length + ")");
  },
};
```

<div id="secret-resolution-order">
## 密钥解析顺序
</div>

当调用 `runtime.getSetting("KEY")` 时，Secrets Manager 按以下顺序解析：

1. 存储在数据库中的代理特定密钥（最高优先级）
2. 角色文件中的 `settings.secrets` 对象
3. `process.env` 环境变量
4. 来自 `~/.milady/secrets` 的全局密钥

<div id="environment-variable-mapping">
## 环境变量映射
</div>

Secrets Manager 将环境变量名称映射到插件需求。当插件在其清单中声明 `requiredSecrets` 时，管理面板会提示输入这些值并安全存储。

```json
{
  "requiredSecrets": ["OPENAI_API_KEY"],
  "optionalSecrets": ["OPENAI_ORG_ID"]
}
```

<div id="encryption">
## 加密
</div>

静态密钥使用以下方式加密：

- 算法：AES-256-GCM
- 密钥派生：PBKDF2-SHA256
- 盐值：每个代理的随机盐值与加密值分开存储

加密密钥从一个永远不会存储在磁盘上的主密钥派生而来。

<div id="audit-logging">
## 审计日志
</div>

所有密钥访问都记录在 `debug` 级别：

```
[secrets-manager] Secret accessed: OPENAI_API_KEY (by: plugin-openai)
```

实际的密钥值永远不会被记录。

<div id="configuration">
## 配置
</div>

| 设置 | 描述 | 默认值 |
|---------|-------------|---------|
| `secrets.encryption` | 启用静态加密 | `true` |
| `secrets.auditLog` | 启用访问审计日志 | `true` |

<div id="related">
## 相关
</div>

- [SQL 插件](/plugin-registry/sql) — 用于加密密钥存储的数据库后端
- [配置指南](/zh/configuration) — 完整的配置参考
- [插件架构](/zh/plugins/architecture) — 密钥如何在启动时注入
