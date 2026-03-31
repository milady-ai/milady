---
title: "本地插件"
sidebarTitle: "本地插件"
description: "在不发布到 npm 的情况下本地开发插件。"
---

本指南涵盖了在不发布到 npm 的情况下本地开发插件的内容——自定义集成、私有插件、快速原型开发以及提取上游插件进行修改。

<div id="table-of-contents">

## 目录

</div>

1. [插件位置](#plugin-locations)
2. [插件加载优先级](#plugin-loading-priority)
3. [创建本地插件](#creating-a-local-plugin)
4. [配置](#configuration)
5. [插件安装器](#plugin-installer)
6. [提取上游插件](#ejecting-upstream-plugins)
7. [开发工作流](#development-workflow)
8. [调试](#debugging)
9. [环境变量](#environment-variables)
10. [迁移到 npm](#migrating-to-npm)

---

<div id="plugin-locations">

## 插件位置

</div>

Milady 从状态目录（默认为 `~/.milady/`）下的三个位置发现插件：

<div id="1-ejected-plugins">

### 1. 已提取的插件

</div>

克隆到本地进行修改的上游插件：

```
~/.milady/plugins/ejected/<plugin-name>/
```

这些由提取系统创建（参见[提取上游插件](#ejecting-upstream-plugins)）。每个子目录都是一个完整的 git 仓库，包含可编辑的源代码。

<div id="2-installed-plugins">

### 2. 已安装的插件

</div>

通过插件管理器或 CLI 在运行时安装的插件：

```
~/.milady/plugins/installed/<sanitised-name>/
```

每个插件获得一个隔离的目录，有自己的 `package.json` 和 `node_modules/`。安装器创建一个最小的 `{ "private": true, "dependencies": {} }` package.json，然后在该目录中运行 `bun add <package>`（或回退到 `npm install`）。

<div id="3-custom-drop-in-plugins">

### 3. 自定义（即插即用）插件

</div>

手动编写并直接放置在自定义目录中的插件：

```
~/.milady/plugins/custom/<your-plugin>/
```

此处任何包含 `package.json` 的子目录都会在启动时被自动发现。这是添加本地插件最简单的方式——只需放入并重启即可。

<div id="4-extra-load-paths">

### 4. 额外加载路径

</div>

可以在 `milady.json` 中指定额外的目录：

```json
{
  "plugins": {
    "load": {
      "paths": [
        "~/shared-plugins",
        "/opt/team-plugins"
      ]
    }
  }
}
```

每个目录的扫描方式与 `plugins/custom/` 相同——包含 `package.json` 的子目录被视为插件。

<div id="full-directory-layout">

### 完整目录结构

</div>

```
~/.milady/
├── milady.json              # Main config file
├── plugins/
│   ├── ejected/              # Git-cloned upstream plugins for editing
│   │   └── plugin-telegram/
│   │       ├── .upstream.json
│   │       ├── package.json
│   │       ├── src/
│   │       └── dist/
│   ├── installed/            # Runtime-installed plugins (managed by plugin-installer)
│   │   └── _elizaos_plugin-twitter/
│   │       ├── package.json
│   │       └── node_modules/
│   └── custom/               # Hand-written drop-in plugins
│       └── my-plugin/
│           ├── package.json
│           ├── src/
│           └── dist/
```

---

<div id="plugin-loading-priority">

## 插件加载优先级

</div>

当多个来源提供相同的插件名称时，Milady 使用以下优先级（从高到低）：

| 优先级 | 来源 | 路径 | 用途 |
|--------|------|------|------|
| 1 | **已提取** | `~/.milady/plugins/ejected/` | 修改上游插件源代码 |
| 2 | **工作区覆盖** | 内部开发机制 | 仅限 Milady 贡献者 |
| 3 | **官方 npm**（带安装记录） | `node_modules/@elizaos/plugin-*` | 标准 `@elizaos/*` 插件优先使用捆绑副本 |
| 4 | **用户安装**（带安装记录） | `~/.milady/plugins/installed/` | 运行时安装的第三方插件 |
| 5 | **本地 @milady** | `src/plugins/`（编译后的 dist） | Milady 内置插件 |
| 6 | **npm 回退** | `import(name)` | 最后手段的动态导入 |

自定义/即插即用插件在解析前会合并到安装记录中，因此它们根据包名参与优先级 3-4。

拒绝列表（`milady.json` 中的 `plugins.deny`）具有绝对优先权——被拒绝的插件无论来源如何都不会被加载。

---

<div id="creating-a-local-plugin">

## 创建本地插件

</div>

<div id="step-1-create-the-directory">

### 步骤 1：创建目录

</div>

```bash
mkdir -p ~/.milady/plugins/custom/my-plugin/src
cd ~/.milady/plugins/custom/my-plugin
```

<div id="step-2-initialize-packagejson">

### 步骤 2：初始化 package.json

</div>

```bash
cat > package.json << 'EOF'
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@elizaos/core": "^2.0.0"
  }
}
EOF
```

<div id="step-3-add-tsconfigjson">

### 步骤 3：添加 tsconfig.json

</div>

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
EOF
```

<div id="step-4-write-the-plugin">

### 步骤 4：编写插件

</div>

```typescript
// src/index.ts
import type { Plugin, Action, Provider } from "@elizaos/core";

const greetAction: Action = {
  name: "GREET_USER",
  similes: ["SAY_HELLO", "WELCOME"],
  description: "Greets the user by name",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    const name = options?.parameters?.name ?? "friend";
    return {
      success: true,
      text: `Hello, ${name}! Welcome to Milady.`,
    };
  },
  parameters: [
    {
      name: "name",
      description: "Name of the person to greet",
      required: false,
      schema: { type: "string", default: "friend" },
    },
  ],
};

const statusProvider: Provider = {
  name: "myPluginStatus",
  get: async (runtime, message, state) => {
    return {
      text: "My plugin is active and running.",
    };
  },
};

const plugin: Plugin = {
  name: "my-plugin",
  description: "A local development plugin",
  actions: [greetAction],
  providers: [statusProvider],
  init: async (config, runtime) => {
    runtime.logger?.info("[my-plugin] Initialized successfully");
  },
};

export default plugin;
```

<div id="step-5-install-dependencies-and-build">

### 步骤 5：安装依赖并构建

</div>

```bash
cd ~/.milady/plugins/custom/my-plugin
bun install
bun run build
```

<div id="step-6-restart-milady">

### 步骤 6：重启 Milady

</div>

```bash
# If running in terminal
milady start

# Or restart via the agent chat
# Type: /restart
```

启动时，你应该在日志中看到：

```
[milady] Discovered 1 custom plugin(s): my-plugin
```

---

<div id="configuration">

## 配置

</div>

<div id="allow-and-deny-lists">

### 允许和拒绝列表

</div>

通过 `milady.json` 控制哪些插件被加载：

```json
{
  "plugins": {
    "allow": ["my-plugin", "telegram", "@elizaos/plugin-discord"],
    "deny": ["@elizaos/plugin-shell"]
  }
}
```

当设置了 `allow` 时，只有列出的插件会被加载（加上核心插件）。`deny` 列表始终优先——被拒绝的插件即使出现在 `allow` 中也不会被加载。

插件名称可以指定为：
- 完整包名：`@elizaos/plugin-telegram`
- 短标识符：`telegram`（解析为 `@elizaos/plugin-telegram`）
- 自定义名称：`my-plugin`（匹配插件 `package.json` 中的 `name` 字段）

<div id="per-plugin-settings">

### 单个插件设置

</div>

在 `plugins.entries` 下配置单个插件：

```json
{
  "plugins": {
    "entries": {
      "my-plugin": {
        "enabled": true,
        "config": {
          "apiEndpoint": "https://api.example.com",
          "maxRetries": 3
        }
      },
      "telegram": {
        "enabled": false
      }
    }
  }
}
```

在条目上设置 `enabled: false` 会阻止该插件加载，即使自动启用逻辑本来会激活它。

<div id="auto-enable-system">

### 自动启用系统

</div>

Milady 根据你的配置自动启用插件：

- **连接器插件**：如果连接器（telegram、discord、slack 等）在 `connectors` 下配置了凭证，其插件会自动启用。
- **提供者插件**：如果设置了 API 密钥环境变量（例如 `ANTHROPIC_API_KEY`），相应的提供者插件会自动启用。
- **功能插件**：如果在 `features` 下启用了功能标志，其插件会自动启用。

这在启动时通过 `applyPluginAutoEnable()` 发生，不会修改你的配置文件——它只影响该会话的内存中插件集合。

---

<div id="plugin-installer">

## 插件安装器

</div>

插件安装器（`plugin-installer.ts`）处理从注册表运行时安装插件。

<div id="how-it-works">

### 工作原理

</div>

1. **解析**插件名称，对照插件注册表
2. 通过 `bun add`（首选）或 `npm install`（回退）**安装**到 `~/.milady/plugins/installed/<sanitised-name>/` 的隔离目录中
3. 如果 npm 安装失败，**回退**到 `git clone`
4. **验证**已安装的插件有可解析的入口点
5. 在 `milady.json` 的 `plugins.installs` 下**记录**安装信息
6. **触发**代理重启以加载新插件

<div id="package-name-sanitisation">

### 包名清理

</div>

安装器通过将非字母数字字符（除 `.`、`-`、`_` 外）替换为下划线来清理包名以用作目录名。例如，`@elizaos/plugin-twitter` 变为 `_elizaos_plugin-twitter`。

<div id="install-record">

### 安装记录

</div>

每个已安装的插件都在 `milady.json` 中被跟踪：

```json
{
  "plugins": {
    "installs": {
      "@elizaos/plugin-twitter": {
        "source": "npm",
        "spec": "@elizaos/plugin-twitter@1.0.0",
        "installPath": "/Users/you/.milady/plugins/installed/_elizaos_plugin-twitter",
        "version": "1.0.0",
        "installedAt": "2026-02-19T12:00:00.000Z"
      }
    }
  }
}
```

<div id="serialisation">

### 序列化

</div>

安装器使用序列化锁来防止并发安装损坏配置。多个安装请求会排队并按顺序执行。

<div id="uninstalling">

### 卸载

</div>

卸载会从磁盘删除插件目录并从 `milady.json` 中删除其记录。核心/内置插件无法被卸载。卸载器拒绝删除 `~/.milady/plugins/installed/` 之外的目录作为安全措施。

---

<div id="ejecting-upstream-plugins">

## 提取上游插件

</div>

提取系统允许你克隆上游插件的源代码、修改它，并让 Milady 加载你的本地副本而不是 npm 包。

<div id="eject-via-agent-chat">

### 通过代理聊天提取

</div>

```
eject the telegram plugin so I can edit its source
```

<div id="eject-manually">

### 手动提取

</div>

```bash
git clone --branch 1.x --depth 1 \
  https://github.com/elizaos-plugins/plugin-telegram.git \
  ~/.milady/plugins/ejected/plugin-telegram

cd ~/.milady/plugins/ejected/plugin-telegram
bun install
bun run build
```

<div id="upstream-tracking">

### 上游跟踪

</div>

每个已提取的插件在其根目录有一个 `.upstream.json`：

```json
{
  "$schema": "milady-upstream-v1",
  "source": "github:elizaos-plugins/plugin-telegram",
  "gitUrl": "https://github.com/elizaos-plugins/plugin-telegram.git",
  "branch": "1.x",
  "commitHash": "093613e...",
  "ejectedAt": "2026-02-19T08:00:00Z",
  "npmPackage": "@elizaos/plugin-telegram",
  "npmVersion": "1.6.4",
  "lastSyncAt": null,
  "localCommits": 0
}
```

<div id="syncing-with-upstream">

### 与上游同步

</div>

```bash
cd ~/.milady/plugins/ejected/plugin-telegram
git fetch origin
git pull --rebase origin 1.x
bun run build
```

或通过代理聊天：`sync the ejected telegram plugin`

<div id="reverting-reinject">

### 恢复（重新注入）

</div>

删除已提取的目录以回退到 npm 版本：

```bash
rm -rf ~/.milady/plugins/ejected/plugin-telegram
# Restart milady -- it will load the npm version again
```

或通过代理聊天：`reinject the telegram plugin`

---

<div id="development-workflow">

## 开发工作流

</div>

<div id="edit-build-restart-cycle">

### 编辑-构建-重启循环

</div>

本地插件的标准开发循环：

```bash
# Terminal 1: Watch and rebuild on changes
cd ~/.milady/plugins/custom/my-plugin
bun run dev  # runs tsc --watch

# Terminal 2: Run milady
milady start
```

修改后，TypeScript 监视器会自动重新构建 `dist/`。你仍然需要重启代理以加载新的构建：

- 在代理聊天中输入 `/restart`，或
- 按 Ctrl+C 并再次运行 `milady start`

<div id="testing-your-plugin">

### 测试你的插件

</div>

与代理聊天并触发你的操作：

```
You: Greet me as Alice
Agent: Hello, Alice! Welcome to Milady.
```

检查日志中插件的初始化消息和任何调试输出。

<div id="quick-iteration-without-tsc---watch">

### 不使用 tsc --watch 的快速迭代

</div>

如果你更喜欢手动构建：

```bash
cd ~/.milady/plugins/custom/my-plugin
bun run build && milady start
```

<div id="using-source-directly-development-only">

### 直接使用源代码（仅限开发）

</div>

对于快速原型开发，你可以将 `main` 指向 TypeScript 源代码：

```json
{
  "main": "src/index.ts"
}
```

Milady 的运行时可以在开发模式下直接导入 TypeScript 文件。在分发前切换到 `dist/index.js`。

<div id="configuration-driven-loading">

### 基于配置的加载

</div>

使用 `milady.json` 从任意路径加载插件：

```json
{
  "plugins": {
    "entries": {
      "my-plugin": {
        "enabled": true,
        "path": "~/projects/my-plugin/dist"
      }
    }
  }
}
```

路径支持波浪号展开（`~/`）以及相对路径和绝对路径。当你的插件位于标准插件目录之外时，这很有用。

<div id="rapid-iteration-tips">

### 快速迭代技巧

</div>

1. **使用 `LOG_LEVEL=debug`** 查看插件加载、发现和初始化日志
2. **在调试日志中检查插件加载顺序** -- 查找 `Loading plugin: your-plugin-name`
3. **通过聊天测试操作** -- 输入触发你的操作验证函数的消息
4. **使用 REST API** 进行编程测试：

```bash
# List loaded plugins
curl http://localhost:18789/api/plugins

# Search the registry
curl http://localhost:18789/api/registry/search?q=my-plugin
```

5. **使用 `ELIZAOS_CONFIG_DIR` 运行多个实例**，配置不同的设置：

```bash
# Instance with your dev plugin
ELIZAOS_CONFIG_DIR=./config-dev milady start

# Instance with production plugins
ELIZAOS_CONFIG_DIR=./config-prod milady start
```

---

<div id="debugging">

## 调试

</div>

<div id="log-levels">

### 日志级别

</div>

Milady 从环境变量 `LOG_LEVEL` 或配置中的 `logging.level` 读取日志级别。如果环境中设置了 `LOG_LEVEL`，它优先于配置值。

```bash
# Verbose logging via environment variable
LOG_LEVEL=debug milady start
```

或在 `milady.json` 中设置：

```json
{
  "logging": {
    "level": "debug"
  }
}
```

可用级别：`debug`、`info`、`warn`、`error`（默认）。

<div id="plugin-logging">

### 插件日志

</div>

在插件中使用运行时日志记录器：

```typescript
init: async (config, runtime) => {
  runtime.logger?.debug("[my-plugin] Detailed debug info", { config });
  runtime.logger?.info("[my-plugin] Plugin initialized");
  runtime.logger?.warn("[my-plugin] Something looks off");
  runtime.logger?.error("[my-plugin] Something failed", { error: "details" });
},
```

<div id="source-maps">

### Source Maps

</div>

启用 source maps 以获取指向你的 TypeScript 源代码的可读堆栈跟踪：

```bash
NODE_OPTIONS="--enable-source-maps" milady start
```

确保在你的 `tsconfig.json` 中设置了 `"sourceMap": true`（包含在上面的模板中）。

<div id="vs-code-debugging">

### VS Code 调试

</div>

在你的项目中创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Milady",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["run", "milady", "start"],
      "cwd": "${workspaceFolder}",
      "env": {
        "LOG_LEVEL": "debug"
      },
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

在你的插件 TypeScript 文件中设置断点，然后按 F5 启动。

<div id="common-issues">

### 常见问题

</div>

**启动时未发现插件：**
- 验证插件目录直接位于 `~/.milady/plugins/custom/` 下（不要嵌套更深）
- 确认 `package.json` 存在且有 `name` 字段
- 检查 `package.json` 中的 `main` 指向一个存在的文件
- 在启动日志中查找 `[milady] Discovered N custom plugin(s)`

**插件被发现但加载失败：**
- 运行 `bun run build` -- `dist/` 目录可能缺失
- 验证默认导出是一个有效的 Plugin 对象，包含 `name` 和 `description`
- 在日志中检查导入错误：`LOG_LEVEL=debug milady start`

**插件被拒绝或被过滤：**
- 检查 `milady.json` 中的 `plugins.deny` -- 你的插件名可能在其中
- 如果设置了 `plugins.allow`，你的插件必须在允许列表中
- 检查 `plugins.entries.<name>.enabled` 是否设置为 `false`

**TypeScript 编译错误：**
```bash
cd ~/.milady/plugins/custom/my-plugin
bun run tsc --noEmit  # Type-check without emitting
```

---

<div id="environment-variables">

## 环境变量

</div>

这些环境变量影响插件路径和行为。它们定义在 `src/config/paths.ts` 中。

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `MILADY_STATE_DIR` | `~/.milady` | 覆盖状态目录。更改插件、配置和凭证的存储位置。 |
| `MILADY_CONFIG_PATH` | `~/.milady/milady.json` | 直接覆盖配置文件路径。 |
| `MILADY_OAUTH_DIR` | `~/.milady/credentials` | 覆盖 OAuth 凭证目录。 |
| `LOG_LEVEL` | `error` | 设置日志详细级别：`debug`、`info`、`warn`、`error`。 |
| `MILADY_DISABLE_WORKSPACE_PLUGIN_OVERRIDES` | 未设置 | 设置为 `1` 以禁用工作区插件覆盖（仅限开发机制）。 |
| `ELIZAOS_CONFIG_DIR` | 未设置 | 覆盖 elizaOS core 配置目录。适用于使用不同插件配置运行多个代理实例。 |

当设置了 `MILADY_STATE_DIR` 时，所有派生路径相应更改：
- 插件：`$MILADY_STATE_DIR/plugins/installed/`、`$MILADY_STATE_DIR/plugins/custom/`、`$MILADY_STATE_DIR/plugins/ejected/`
- 配置：`$MILADY_STATE_DIR/milady.json`（除非同时设置了 `MILADY_CONFIG_PATH`）
- 模型缓存：`$MILADY_STATE_DIR/models/`

---

<div id="migrating-to-npm">

## 迁移到 npm

</div>

当你的插件准备好分发时：

<div id="1-update-packagejson">

### 1. 更新 package.json

</div>

```json
{
  "name": "@yourorg/plugin-my-feature",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "bun run build"
  },
  "peerDependencies": {
    "@elizaos/core": "^2.0.0"
  }
}
```

<div id="2-build-and-publish">

### 2. 构建并发布

</div>

```bash
cd ~/.milady/plugins/custom/my-plugin
bun run build
npm pack              # Preview what gets published
npm publish --access public
```

<div id="3-install-via-milady">

### 3. 通过 Milady 安装

</div>

发布后，通过代理聊天或直接在配置中安装：

```json
{
  "plugins": {
    "allow": ["@yourorg/plugin-my-feature"]
  }
}
```

从 `~/.milady/plugins/custom/` 删除本地副本以避免加载两个版本。

---

<div id="next-steps">

## 后续步骤

</div>

- [插件开发指南](/zh/plugins/development) -- 完整的插件 API 参考
- [Skills 文档](/zh/plugins/skills) -- 更轻量级的扩展
- [贡献指南](/zh/guides/contribution-guide) -- 向上游贡献插件
