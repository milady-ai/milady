---
title: "插件注册表"
sidebarTitle: "注册表"
description: "Milady 如何从远程注册表发现、缓存和解析插件。"
---

插件注册表是为 Milady 代理发现、缓存和解析插件及应用的系统。它将本地内置索引与远程 GitHub 托管的注册表相结合，使用 3 级缓存来支持离线工作、桌面应用打包和开发环境。

<div id="table-of-contents">

## 目录

</div>

1. [什么是注册表？](#what-is-the-registry)
2. [3 级缓存](#3-tier-caching)
3. [远程注册表](#remote-registry)
4. [插件解析](#plugin-resolution)
5. [CLI 命令](#cli-commands)
6. [插件清单字段](#plugin-manifest-fields)
7. [应用注册表](#apps-registry)
8. [编程访问](#programmatic-access)

---

<div id="what-is-the-registry">

## 什么是注册表？

</div>

注册表有两层：

<div id="bundled-registry-pluginsjson">

### 内置注册表 (`plugins.json`)

</div>

一个随 Milady 分发的本地 JSON 文件，包含 elizaOS 生态系统中约 97 个插件的元数据。每个条目包括插件的 id、npm 包名、类别、环境变量、版本、依赖项和详细的参数定义。此文件遵循 `plugin-index-v1` 架构。

```json
{
  "$schema": "plugin-index-v1",
  "generatedAt": "2026-02-09T20:23:38.561Z",
  "count": 97,
  "plugins": [
    {
      "id": "telegram",
      "dirName": "plugin-telegram",
      "name": "Telegram",
      "npmName": "@elizaos/plugin-telegram",
      "description": "Telegram bot connector for Eliza agents",
      "category": "connector",
      "envKey": "TELEGRAM_BOT_TOKEN",
      "configKeys": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME"],
      "version": "2.0.0-alpha.4",
      "pluginDeps": [],
      "pluginParameters": { ... }
    }
  ]
}
```

内置的 `plugins.json` 被 `milady plugins config` 命令用于查找参数定义、环境变量键和插件配置的界面提示。

<div id="remote-registry-github">

### 远程注册表 (GitHub)

</div>

远程注册表托管在 GitHub 仓库 `elizaos-plugins/registry` 的 `next` 分支上。注册表客户端从两个远程端点获取数据：

| 端点 | URL | 格式 |
|------|-----|------|
| **主要** | `https://raw.githubusercontent.com/elizaos-plugins/registry/next/generated-registry.json` | 包含 git 信息、npm 版本、星标数、主题、应用元数据的富 JSON |
| **备用** | `https://raw.githubusercontent.com/elizaos-plugins/registry/next/index.json` | 名称到 git 引用的最小映射 |

主要的 `generated-registry.json` 包含一个以包名为键的 `registry` 对象，每个条目提供：

- Git 仓库，v0/v1/v2 的分支
- npm 包名和 v0/v1/v2 的版本字符串
- 版本支持标志 (`supports: { v0, v1, v2 }`)
- 描述、主页、主题、星标数、语言
- 应用元数据（对于 `kind: "app"` 的条目）

如果主要端点失败，客户端会回退到 `index.json`，这是一个将包名映射到 `github:owner/repo` 引用的扁平 `Record<string, string>`。此备用方案仅提供 git 坐标，不包含富元数据。

---

<div id="3-tier-caching">

## 3 级缓存

</div>

注册表客户端 (`src/services/registry-client.ts`) 使用 3 级解析策略来最小化网络请求并支持离线操作：

```
Memory Cache  -->  File Cache  -->  Network Fetch
  (in-process)     (~/.milady/     (GitHub raw)
                    cache/
                    registry.json)
```

<div id="tier-1-memory-cache">

### 第 1 级：内存缓存

</div>

一个保存在模块级状态中的进程内 `Map<string, RegistryPluginInfo>`。每次调用 `getRegistryPlugins()` 时首先检查。TTL 过期后失效。

<div id="tier-2-file-cache">

### 第 2 级：文件缓存

</div>

位于 `~/.milady/cache/registry.json` 的 JSON 文件，包含序列化的插件映射和 `fetchedAt` 时间戳。当内存缓存为空或过期时检查。每次成功的网络获取后异步写入。

文件缓存以 `{ fetchedAt: number, plugins: Array<[string, RegistryPluginInfo]> }` 格式存储条目，TTL 过期后失效。

<div id="tier-3-network-fetch">

### 第 3 级：网络获取

</div>

从 GitHub 获取 `generated-registry.json`（回退到 `index.json`）。仅当内存和文件缓存都为空或过期时才会到达此级。

<div id="cache-ttl">

### 缓存 TTL

</div>

所有级别共享 1 小时的 TTL (`3_600_000` ms)。过期后，下一次调用 `getRegistryPlugins()` 会级联通过各级直到获取新数据。

<div id="force-refresh">

### 强制刷新

</div>

调用 `refreshRegistry()` 清除内存缓存和文件缓存，然后从网络获取：

```typescript
import { refreshRegistry } from "milady/services/registry-client";

const plugins = await refreshRegistry();
```

或从 CLI：

```bash
milady plugins refresh
```

---

<div id="plugin-resolution">

## 插件解析

</div>

通过 `getPluginInfo(name)` 按名称查找插件时，注册表客户端按顺序尝试三种策略：

1. **精确匹配** -- 直接在注册表映射中查找名称（例如 `@elizaos/plugin-telegram`）
2. **@elizaos/ 前缀** -- 如果名称不以 `@` 开头，添加 `@elizaos/` 前缀后重试（例如 `plugin-telegram` 变为 `@elizaos/plugin-telegram`）
3. **裸后缀扫描** -- 去除输入的任何 scope 前缀，扫描所有注册表键以找到以 `/<bare-name>` 结尾的条目（例如 `plugin-telegram` 匹配 `@elizaos/plugin-telegram`）

CLI 还通过 `normalizePluginName()` 标准化用户输入：

- `@scope/plugin-x` -- 原样使用
- `plugin-x` -- 原样使用
- `x` -- 展开为 `@elizaos/plugin-x`

支持使用 `@` 分隔符固定版本：

```bash
milady plugins install twitter@1.2.3
milady plugins install @custom/plugin-x@2.0.0
milady plugins install twitter@next    # dist-tags work too
```

---

<div id="cli-commands">

## CLI 命令

</div>

所有插件命令都在 `milady plugins` 下。运行 `milady plugins --help` 查看完整列表。

<div id="milady-plugins-list">

### `milady plugins list`

</div>

列出远程注册表中的所有插件。

```bash
# List all plugins (default limit: 30)
milady plugins list

# Search by keyword
milady plugins list -q telegram

# Increase the result limit
milady plugins list --limit 100
```

<div id="milady-plugins-search-query">

### `milady plugins search <query>`

</div>

按关键词搜索注册表，带相关性评分。

```bash
milady plugins search "discord bot"
milady plugins search openai --limit 5
```

结果显示基于名称、描述和主题评分的匹配百分比。

<div id="milady-plugins-info-name">

### `milady plugins info <name>`

</div>

显示特定插件的详细信息：仓库、主页、语言、星标数、主题、npm 版本和支持的 elizaOS 版本。

```bash
milady plugins info telegram
milady plugins info @elizaos/plugin-openai
```

<div id="milady-plugins-install-name">

### `milady plugins install <name>`

</div>

从注册表安装插件到 `~/.milady/plugins/installed/<name>/`。

```bash
# Install by shorthand (expands to @elizaos/plugin-telegram)
milady plugins install telegram

# Install a specific version
milady plugins install telegram@1.2.3

# Install without restarting the agent
milady plugins install telegram --no-restart
```

安装器使用 npm/bun 安装到隔离的前缀目录。如果失败，会回退到克隆插件的 GitHub 仓库。安装信息记录在 `milady.json` 中。

<div id="milady-plugins-uninstall-name">

### `milady plugins uninstall <name>`

</div>

删除用户安装的插件。

```bash
milady plugins uninstall @elizaos/plugin-telegram
milady plugins uninstall telegram --no-restart
```

<div id="milady-plugins-installed">

### `milady plugins installed`

</div>

列出所有从注册表安装的插件（不包括内置的）。

```bash
milady plugins installed
```

<div id="milady-plugins-refresh">

### `milady plugins refresh`

</div>

强制刷新注册表缓存（清除内存 + 文件缓存，从 GitHub 获取）。

```bash
milady plugins refresh
```

<div id="milady-plugins-config-name">

### `milady plugins config <name>`

</div>

显示或交互式编辑插件的配置参数。

```bash
# View current config values
milady plugins config telegram

# Interactive edit mode
milady plugins config telegram --edit
```

在编辑模式下，CLI 会遍历每个参数，显示当前值（隐藏敏感值）并提示输入新值。更改保存到 `milady.json`。

<div id="milady-plugins-test">

### `milady plugins test`

</div>

验证 `~/.milady/plugins/custom/` 中的自定义插件。检查每个插件目录是否有有效的入口点，并导出包含 `name` 和 `description` 的 Plugin 对象。

```bash
milady plugins test
```

<div id="milady-plugins-add-path-path">

### `milady plugins add-path <path>`

</div>

在配置文件中注册额外的插件搜索目录。

```bash
milady plugins add-path ~/my-plugins
```

<div id="milady-plugins-paths">

### `milady plugins paths`

</div>

列出所有插件搜索目录及其内容。

```bash
milady plugins paths
```

<div id="milady-plugins-open-name-or-path">

### `milady plugins open [name-or-path]`

</div>

在编辑器中打开插件目录（或自定义插件文件夹）。

```bash
# Open the custom plugins folder
milady plugins open

# Open a specific custom plugin
milady plugins open my-plugin
```

---

<div id="plugin-manifest-fields">

## 插件清单字段

</div>

<div id="bundled-registry-fields-pluginsjson">

### 内置注册表字段 (`plugins.json`)

</div>

内置 `plugins.json` 中的每个条目使用此架构：

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | `string` | 简短标识符（例如 `telegram`、`openai`） |
| `dirName` | `string` | 源仓库中的目录名（例如 `plugin-telegram`） |
| `name` | `string` | 可读的显示名称 |
| `npmName` | `string` | 完整的 npm 包名（例如 `@elizaos/plugin-telegram`） |
| `description` | `string` | 插件的功能描述 |
| `category` | `string` | 插件类别：`connector`、`model`、`tool`、`memory`、`automation` |
| `envKey` | `string` | 激活此插件的主要环境变量 |
| `configKeys` | `string[]` | 此插件读取的所有环境变量 |
| `version` | `string` | 当前发布版本 |
| `pluginDeps` | `string[]` | 此插件依赖的其他插件的 ID |
| `pluginParameters` | `object` | 详细的参数定义（见下文） |

<div id="parameter-definitions">

### 参数定义

</div>

`pluginParameters` 中的每个键映射到：

| 字段 | 类型 | 描述 |
|------|------|------|
| `type` | `"string" \| "number" \| "boolean"` | 值类型 |
| `description` | `string` | 可读的帮助文本 |
| `required` | `boolean` | 参数是否必须设置 |
| `sensitive` | `boolean` | 是否在界面中隐藏值（令牌、密码） |

<div id="remote-registry-fields-generated-registryjson">

### 远程注册表字段 (`generated-registry.json`)

</div>

远程富注册表中的条目使用不同的结构：

| 字段 | 类型 | 描述 |
|------|------|------|
| `git.repo` | `string` | GitHub `owner/repo` 路径 |
| `git.v0` / `v1` / `v2` | `{ branch: string \| null }` | 每个 elizaOS 版本的 Git 分支 |
| `npm.repo` | `string` | npm 包名 |
| `npm.v0` / `v1` / `v2` | `string \| null` | 每个 elizaOS 版本已发布的 npm 版本 |
| `supports` | `{ v0, v1, v2: boolean }` | 支持的 elizaOS 版本 |
| `description` | `string` | 插件描述 |
| `homepage` | `string \| null` | 主页 URL |
| `topics` | `string[]` | GitHub 主题 / 标签 |
| `stargazers_count` | `number` | GitHub 星标数 |
| `language` | `string` | 主要语言（通常是 `TypeScript`） |
| `kind` | `"app" \| undefined` | 对于可启动的应用设置为 `"app"` |
| `app` | `object \| undefined` | 应用元数据（见下方应用注册表） |

---

<div id="apps-registry">

## 应用注册表

</div>

注册表对 **apps** 提供一等支持 -- 可启动的应用程序，与标准插件不同。当满足以下条件时，条目被视为应用：

- 其 `kind` 字段为 `"app"`，或
- 它有一个 `appMeta` / `app` 对象，或
- 它匹配硬编码的本地应用覆盖（例如 `@elizaos/app-babylon`）

<div id="app-metadata-fields">

### 应用元数据字段

</div>

| 字段 | 类型 | 描述 |
|------|------|------|
| `displayName` | `string` | 界面中显示的名称 |
| `category` | `string` | 应用类别（例如 `game`） |
| `launchType` | `string` | 应用的启动方式：`url`、`connect`、`local` |
| `launchUrl` | `string \| null` | 启动或连接的 URL |
| `icon` | `string \| null` | 图标 URL |
| `capabilities` | `string[]` | 应用能力 |
| `minPlayers` / `maxPlayers` | `number \| null` | 玩家数量限制（用于游戏应用） |
| `viewer` | `object` | 嵌入配置：`url`、`embedParams`、`postMessageAuth`、`sandbox` |

<div id="app-specific-functions">

### 应用专用函数

</div>

```typescript
import { listApps, getAppInfo, searchApps } from "milady/services/registry-client";

// List all registered apps, sorted by stars
const apps = await listApps();

// Look up a specific app
const app = await getAppInfo("@elizaos/app-babylon");

// Search apps by query (scores against displayName and capabilities too)
const results = await searchApps("game", 10);
```

<div id="local-workspace-app-discovery">

### 本地工作区应用发现

</div>

注册表客户端还会从本地工作区目录发现应用。它扫描：

1. 工作区根目录中的 `plugins/` 目录，查找以 `app-` 开头的文件夹
2. 用户在 `~/.milady/plugins/installed/` 安装的、package.json 中包含 `kind: "app"` 的插件

本地应用元数据与远程注册表数据合并，对于 `description`、`homepage` 和 `localPath` 等字段，本地值优先。

---

<div id="programmatic-access">

## 编程访问

</div>

<div id="core-functions">

### 核心函数

</div>

注册表客户端从 `src/services/registry-client.ts` 导出以下函数：

```typescript
import {
  getRegistryPlugins,  // Get all plugins (3-tier cached)
  refreshRegistry,     // Force network refresh
  getPluginInfo,       // Look up a single plugin by name
  searchPlugins,       // Fuzzy search plugins
  listApps,            // List all app-kind entries
  getAppInfo,          // Look up a single app
  searchApps,          // Search apps
  listNonAppPlugins,   // List plugins excluding apps
  searchNonAppPlugins, // Search plugins excluding apps
} from "milady/services/registry-client";
```

<div id="usage-example">

### 使用示例

</div>

```typescript
// Fetch the full registry (cached)
const registry = await getRegistryPlugins();
console.log(`${registry.size} plugins loaded`);

// Look up a plugin (tries exact, @elizaos/ prefix, bare suffix)
const info = await getPluginInfo("telegram");
if (info) {
  console.log(info.name);       // "@elizaos/plugin-telegram"
  console.log(info.gitRepo);    // "elizaos-plugins/plugin-telegram"
  console.log(info.npm.v2Version); // "2.0.0-alpha.4"
}

// Search with relevance scoring
const results = await searchPlugins("discord", 10);
for (const r of results) {
  console.log(`${r.name} (${(r.score * 100).toFixed(0)}% match)`);
}
```

<div id="rest-api">

### REST API

</div>

当代理服务器运行时，注册表也可通过 HTTP 访问：

| 方法 | 端点 | 描述 |
|------|------|------|
| `GET` | `/api/registry/plugins` | 列出所有插件及其已安装/已加载/内置状态 |
| `GET` | `/api/registry/plugins/:name` | 查找特定插件 |
| `GET` | `/api/registry/search?q=<query>&limit=<n>` | 按关键词搜索插件 |
| `POST` | `/api/registry/refresh` | 强制刷新注册表缓存 |

<div id="search-scoring">

### 搜索评分

</div>

搜索算法通过将查询与以下内容匹配来对条目评分：

- **插件名称**（精确匹配：+100，部分匹配：+50）
- **描述**（包含查询：+30）
- **主题 / 标签**（包含查询：+25）
- **单独的查询词**（按空格分割，分别评分：每个 +8 到 +15）
- **星标加分**（>100：+3，>500：+3，>1000：+4）

结果按评分降序排列，然后以星标数作为平局决胜。

---

---

<div id="plugin-ecosystem">

## 插件生态系统

</div>

<div id="organization-structure">

### 组织结构

</div>

官方 elizaOS 插件位于 [`elizaos-plugins`](https://github.com/elizaos-plugins) GitHub 组织中。注册表自动索引此组织的插件。

| 仓库 | 内容 |
|------|------|
| `elizaos-plugins/registry` | 注册表索引（`index.json`、`generated-registry.json`）、注册表网站 |
| `elizaos-plugins/plugin-*` | 各个官方插件包 |

<div id="naming-conventions">

### 命名约定

</div>

遵循以下命名模式以便于发现：

| 范围 | 模式 | 示例 |
|------|------|------|
| 官方 | `@elizaos/plugin-<name>` | `@elizaos/plugin-telegram` |
| 组织 | `@yourorg/plugin-<name>` | `@acme/plugin-crm` |
| 社区 | `elizaos-plugin-<name>` | `elizaos-plugin-weather` |

`plugin-` 前缀是自动发现所必需的。注册表扫描器识别所有三种模式。

<div id="submitting-a-plugin-to-the-registry">

### 向注册表提交插件

</div>

1. **发布到 npm** — 遵循[发布指南](/zh/plugins/publish)
2. **向 [`elizaos-plugins/registry`](https://github.com/elizaos-plugins/registry) 提交 PR**，将你的插件添加到 `index.json`：

```json
{
  "@yourorg/plugin-weather": "github:yourorg/plugin-weather"
}
```

3. **在 PR 中包含：**
   - 插件名称、描述和类别
   - 包中的有效 `elizaos.plugin.json` 清单
   - 至少一个通过的测试套件
   - 包含配置说明的 README

4. **注册表 CI** 验证你的插件能够编译、加载和通过测试
5. 合并后，你的插件将出现在 `milady plugins search` 和注册表网站中

<div id="registry-site">

### 注册表网站

</div>

注册表有一个可浏览的 Web 界面，托管在 `registry/site/`。用户可以：
- 按类别浏览插件（核心、模型提供者、连接器、DeFi、功能）
- 按名称、描述或标签搜索
- 查看插件详情、安装命令和配置

---

<div id="next-steps">

## 后续步骤

</div>

- [插件开发指南](/zh/plugins/development) -- 创建你自己的插件
- [本地插件开发](/zh/plugins/local-plugins) -- 无需发布即可开发
- [发布指南](/zh/plugins/publish) -- 发布到 npm 和注册表
- [贡献指南](/zh/guides/contribution-guide) -- 向上游提交插件
