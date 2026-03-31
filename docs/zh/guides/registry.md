---
title: 插件注册表指南
description: 如何在 Milady/elizaOS 插件注册表中发现、配置、提交和维护插件。
---

# 插件注册表指南

插件注册表是可用 elizaOS 插件的中央索引。本指南涵盖了发现、使用和向注册表提交插件的内容。

<div id="table-of-contents">

## 目录

</div>

1. [什么是注册表？](#what-is-the-registry)
2. [发现插件](#discovering-plugins)
3. [使用插件](#using-plugins)
4. [插件清单](#plugin-manifest)
5. [提交插件](#submitting-plugins)
6. [插件分类](#plugin-categories)
7. [命名约定](#naming-conventions)

---

<div id="what-is-the-registry">

## 什么是注册表？

</div>

插件注册表是：

- **一个 JSON 索引**（`plugins.json`），列出所有已知插件
- **元数据**，包括名称、描述、分类和配置
- **发现系统**，用于查找和加载插件

Milady 附带了一个内置的 `plugins.json`，包含 elizaOS 生态系统中 90 多个插件。

---

<div id="discovering-plugins">

## 发现插件

</div>

<div id="list-available-plugins">

### 列出可用插件

</div>

```bash
milady plugins list
```

<div id="search-plugins">

### 搜索插件

</div>

```bash
milady plugins list --search telegram
```

<div id="view-plugin-details">

### 查看插件详情

</div>

```bash
milady plugins info telegram
```

<div id="browse-by-category">

### 按分类浏览

</div>

```bash
milady plugins list --category connector
milady plugins list --category model
milady plugins list --category tool
```

<div id="programmatic-access">

### 编程访问

</div>

```typescript
import pluginIndex from "miladyai/plugins.json";

// List all plugins
for (const plugin of pluginIndex.plugins) {
  console.log(`${plugin.id}: ${plugin.description}`);
}

// Find by category
const connectors = pluginIndex.plugins.filter(p => p.category === "connector");
```

---

<div id="using-plugins">

## 使用插件

</div>

<div id="install-via-npm">

### 通过 npm 安装

</div>

大多数插件是 npm 包：

```bash
# Install the Telegram connector
bun add @elizaos/plugin-telegram
```

<div id="configure-in-miladyjson">

### 在 milady.json 中配置

</div>

```json
{
  "plugins": [
    "@elizaos/plugin-telegram",
    "@elizaos/plugin-discord",
    "@elizaos/plugin-openai"
  ]
}
```

<div id="environment-variables">

### 环境变量

</div>

大多数插件需要通过环境变量进行配置：

```bash
# .env or environment
TELEGRAM_BOT_TOKEN=your-bot-token
DISCORD_BOT_TOKEN=your-discord-token
OPENAI_API_KEY=sk-...
```

<div id="auto-enable-based-on-credentials">

### 基于凭据自动启用

</div>

Milady 可以在所需凭据存在时自动启用插件：

```json
{
  "plugins": {
    "autoEnable": true
  }
}
```

启用 `autoEnable` 后，如果设置了 `TELEGRAM_BOT_TOKEN`，Telegram 插件会自动加载。

---

<div id="plugin-manifest">

## 插件清单

</div>

注册表中的每个插件都有一个清单条目：

```json
{
  "id": "telegram",
  "dirName": "plugin-telegram",
  "name": "Telegram",
  "npmName": "@elizaos/plugin-telegram",
  "description": "Telegram bot connector for Eliza agents",
  "category": "connector",
  "envKey": "TELEGRAM_BOT_TOKEN",
  "configKeys": [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_BOT_USERNAME",
    "TELEGRAM_CHANNEL_IDS"
  ],
  "version": "2.0.0-alpha.4",
  "pluginDeps": [],
  "pluginParameters": {
    "TELEGRAM_BOT_TOKEN": {
      "type": "string",
      "description": "Telegram Bot API token from @BotFather",
      "required": true,
      "sensitive": true
    },
    "TELEGRAM_BOT_USERNAME": {
      "type": "string",
      "description": "Bot username (without @)",
      "required": false,
      "sensitive": false
    }
  }
}
```

<div id="manifest-fields">

### 清单字段

</div>

| 字段 | 描述 |
|------|------|
| `id` | 短标识符（例如 `telegram`） |
| `dirName` | 仓库中的目录名称 |
| `name` | 人类可读名称 |
| `npmName` | npm 包名称 |
| `description` | 插件的功能 |
| `category` | 插件分类 |
| `envKey` | 主要环境变量 |
| `configKeys` | 所有配置键 |
| `version` | 当前版本 |
| `pluginDeps` | 依赖的其他插件 |
| `pluginParameters` | 详细的参数定义 |

---

<div id="submitting-plugins">

## 提交插件

</div>

<div id="option-1-official-plugins-elizaos">

### 选项 1：官方插件（@elizaos）

</div>

要将插件纳入官方 `@elizaos` 命名空间：

1. **创建 PR** 到 [elizaos-plugins](https://github.com/elizaos-plugins) 组织
2. **遵循约定**（见下文）
3. **包含测试**和文档
4. **通过维护者的审核**

<div id="option-2-community-plugins">

### 选项 2：社区插件

</div>

使用社区命名发布到 npm：

```json
{
  "name": "elizaos-plugin-my-feature",
  "version": "1.0.0"
}
```

或使用作用域包：

```json
{
  "name": "@yourorg/elizaos-plugin-my-feature"
}
```

<div id="option-3-local-registry">

### 选项 3：本地注册表

</div>

对于私有/内部插件，维护一个本地注册表：

```json
// custom-plugins.json
{
  "$schema": "plugin-index-v1",
  "plugins": [
    {
      "id": "internal-crm",
      "npmName": "@internal/plugin-crm",
      "description": "Internal CRM integration",
      "category": "connector"
    }
  ]
}
```

---

<div id="plugin-categories">

## 插件分类

</div>

<div id="connector">

### connector

</div>

外部服务集成和消息平台。

| 插件 | 描述 |
|------|------|
| `telegram` | Telegram 机器人 |
| `discord` | Discord 机器人 |
| `slack` | Slack 集成 |
| `twitter` | Twitter/X |
| `whatsapp` | WhatsApp（通过 Baileys） |
| `signal` | Signal 通讯 |
| `imessage` | iMessage (macOS) |

<div id="model">

### model

</div>

AI 模型提供商和推理。

| 插件 | 描述 |
|------|------|
| `openai` | OpenAI GPT 模型 |
| `anthropic` | Claude 模型 |
| `ollama` | 本地 Ollama 模型 |
| `groq` | Groq 推理 |
| `openrouter` | OpenRouter 网关 |
| `google-genai` | Google Gemini |

<div id="tool">

### tool

</div>

实用工具和功能。

| 插件 | 描述 |
|------|------|
| `browser` | 网页浏览 |
| `shell` | Shell 命令执行 |
| `code` | 代码生成/执行 |
| `repoprompt` | RepoPrompt CLI 编排 |
| `vision` | 图像分析 |
| `knowledge` | RAG/知识库 |
| `mcp` | Model Context Protocol |

<div id="memory">

### memory

</div>

存储和记忆系统。

| 插件 | 描述 |
|------|------|
| `sql` | SQL 数据库适配器 |
| `local-embedding` | 本地嵌入生成 |

<div id="automation">

### automation

</div>

调度和自动化。

| 插件 | 描述 |
|------|------|
| `cron` | 定时任务 |
| `scheduling` | 日历集成 |

---

<div id="naming-conventions">

## 命名约定

</div>

<div id="package-names">

### 包名称

</div>

**官方插件：**
```
@elizaos/plugin-{feature}
```

示例：
- `@elizaos/plugin-telegram`
- `@elizaos/plugin-openai`
- `@elizaos/plugin-browser`

**社区插件：**
```
elizaos-plugin-{feature}
@yourorg/plugin-{feature}
```

示例：
- `elizaos-plugin-my-integration`
- `@acme/plugin-internal-tool`

<div id="plugin-ids">

### 插件 ID

</div>

简短的小写标识符：

```
telegram
discord
openai
my-feature
```

<div id="action-names">

### 操作名称

</div>

大写字母加下划线：

```
SEND_MESSAGE
GENERATE_IMAGE
FETCH_DATA
```

---

<div id="plugin-configuration-schema">

## 插件配置模式

</div>

插件可以定义其配置模式用于 UI 生成：

```json
{
  "pluginParameters": {
    "API_KEY": {
      "type": "string",
      "description": "API key for authentication",
      "required": true,
      "sensitive": true
    },
    "ENDPOINT_URL": {
      "type": "string",
      "description": "API endpoint URL",
      "required": false,
      "sensitive": false
    },
    "TIMEOUT_MS": {
      "type": "number",
      "description": "Request timeout in milliseconds",
      "required": false,
      "sensitive": false
    },
    "DEBUG_MODE": {
      "type": "boolean",
      "description": "Enable debug logging",
      "required": false,
      "sensitive": false
    }
  }
}
```

<div id="parameter-types">

### 参数类型

</div>

| 类型 | 描述 |
|------|------|
| `string` | 文本值 |
| `number` | 数值 |
| `boolean` | 真/假 |

<div id="parameter-flags">

### 参数标志

</div>

| 标志 | 描述 |
|------|------|
| `required` | 必须提供 |
| `sensitive` | 应在 UI 中遮蔽（密码、令牌） |

---

<div id="regenerating-the-registry">

## 重新生成注册表

</div>

如果你维护一个 fork 或自定义注册表：

```bash
# Generate plugins.json from installed plugins
pnpm generate:plugins
```

这会扫描 `node_modules/@elizaos/plugin-*` 并生成更新的索引。

---

<div id="examples">

## 示例

</div>

<div id="finding-a-model-provider">

### 查找模型提供商

</div>

```bash
# List model plugins
milady plugins list --category model

# Check OpenAI plugin info
milady plugins info openai

# Install and configure
pnpm add @elizaos/plugin-openai
echo "OPENAI_API_KEY=sk-..." >> .env
```

<div id="adding-multiple-connectors">

### 添加多个连接器

</div>

```json
// milady.json
{
  "plugins": [
    "@elizaos/plugin-telegram",
    "@elizaos/plugin-discord",
    "@elizaos/plugin-slack"
  ]
}
```

```bash
# .env
TELEGRAM_BOT_TOKEN=...
DISCORD_BOT_TOKEN=...
SLACK_BOT_TOKEN=...
```

<div id="using-community-plugins">

### 使用社区插件

</div>

```bash
# Install community plugin
pnpm add elizaos-plugin-custom-feature

# Add to config
# milady.json
{
  "plugins": [
    "@elizaos/plugin-openai",
    "elizaos-plugin-custom-feature"
  ]
}
```

---

<div id="next-steps">

## 后续步骤

</div>

- [插件开发指南](/zh/plugins/development) — 创建你自己的插件
- [本地插件开发](/zh/plugins/local-plugins) — 无需发布即可开发
- [贡献指南](./contributing.md) — 向上游提交插件

---

<div id="registry-runbook">

## 注册表运维手册

</div>

<div id="setup-checklist">

### 设置检查清单

</div>

1. 确保插件元数据在 `plugins.json` 中存在且有效。
2. 确保可安装的包能从 npm 或你的内部注册表解析。
3. 确保每个插件所需的环境键已在清单中记录。
4. 对于链上注册表操作，设置 `EVM_PRIVATE_KEY` 并在代理配置中配置 `mainnetRpc`、`registryAddress` 和 `collectionAddress`。
5. 验证插件安装目录是否可写：`ls -ld ~/.milady/plugins/installed/`。

<div id="failure-modes">

### 故障模式

</div>

**插件注册表查找：**

- 注册表查找未返回结果：
  确认 `plugins.json` 是最新的，且插件 ID 拼写正确。
- 安装成功但插件未加载：
  确认所需的环境键已设置，且插件已在 `plugins.allow` 或 `plugins.entries` 中启用。
- 清单与包之间的版本偏差：
  重新生成注册表元数据并提交更新的清单。

**NPM 解析和安装：**

- 插件安装期间 `npm pack` 或 `bun install` 失败：
  检查到 npm 注册表的网络连接。安装程序会从 npm 回退到直接 git 克隆——如果两者都失败，包规范可能无效。
- 安装后找不到入口点：
  安装程序会检查目标目录中的 `package.json`。确认包具有有效的 `main` 或 `module` 字段，或者 `index.js`/`index.ts` 存在于包根目录。
- 并发安装损坏：
  安装程序使用序列化锁。如果先前的安装崩溃，过期的锁状态可能会阻止新安装。重启代理以清除内存中的锁。

**链上注册表/drop 操作：**

- 交易回滚或超时：
  检查 `EVM_PRIVATE_KEY` 是否有足够的 gas 余额。验证 `mainnetRpc` 是否可达且未被限速。tx 服务会以递增的 gas 重试——如果所有重试都失败，错误会包含回滚原因。
- 注册表合约调用返回空数据：
  确认 `registryAddress` 和 `collectionAddress` 指向正确链上已部署的合约。使用区块浏览器验证合约状态。
- 快速连续交易的 nonce 冲突：
  tx 服务在本地管理 nonce。如果外部钱包交易更改了 nonce，重启代理以重新同步。

<div id="recovery-procedures">

### 恢复程序

</div>

1. **过期的插件状态：** 删除 `~/.milady/plugins/installed/<plugin-name>/` 并从 `milady.json` 的 `plugins.installs` 下移除该条目，然后重新安装。
2. **注册表元数据不同步：** 运行 `milady plugin sync` 或从上游注册表手动更新 `plugins.json`。
3. **链上交易卡住：** 在区块浏览器上检查待处理交易。如果卡住，代理将在下次尝试时使用更高的 gas 重试。通过钱包手动加速是安全的——代理会在下次调用时重新读取 nonce。

<div id="verification-commands">

### 验证命令

</div>

```bash
# Plugin registry and installer tests
bunx vitest run src/services/plugin-installer.test.ts src/services/skill-marketplace.test.ts src/services/mcp-marketplace.test.ts

# Plugin install e2e lifecycle
bunx vitest run --config vitest.e2e.config.ts test/plugin-install.e2e.test.ts test/skills-marketplace-api.e2e.test.ts test/skills-marketplace-services.e2e.test.ts

# On-chain service tests
bunx vitest run src/api/tx-service.test.ts src/api/registry-service.test.ts src/api/drop-service.test.ts

# API server e2e (includes registry routes)
bunx vitest run --config vitest.e2e.config.ts test/api-server.e2e.test.ts

bun run typecheck
```
