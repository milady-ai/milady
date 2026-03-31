---
title: "选择合适的扩展点"
sidebarTitle: "决策指南"
description: "何时使用 Actions、Providers、Services、Skills、Routes、Event Handlers 或 Evaluators"
---

elizaOS 提供了多种方式来扩展代理行为。本指南帮助你选择合适的方式。

<div id="quick-decision-tree">

## 快速决策树

</div>

**"我希望代理在被要求时执行某个操作"** → [Action](#actions)

**"我想在每次响应中注入上下文"** → [Provider](#providers)

**"我需要一个后台运行的进程"** → [Service](#services)

**"我想在不编写代码的情况下添加知识/指令"** → [Skill](#skills)

**"我需要一个 HTTP 端点"** → [Route](#routes)

**"我想对系统事件做出反应"** → [Event Handler](#event-handlers)

**"我想评估响应质量"** → [Evaluator](#evaluators)

---

<div id="comparison-table">

## 对比表

</div>

| 特性 | Action | Provider | Service | Skill | Route |
|---------|--------|----------|---------|-------|-------|
| 触发方式 | 用户消息（LLM 选择） | 每个推理周期 | 插件初始化 | 用户消息（LLM 选择） | HTTP 请求 |
| 返回值 | ActionResult | Context string | -- | 代理响应 | HTTP 响应 |
| 有生命周期 | 否 | 否 | 是（start/stop） | 否 | 否 |
| 需要 TypeScript | 是 | 是 | 是 | 否（markdown） | 是 |
| 热重载 | Rebuild + restart | Rebuild + restart | Rebuild + restart | 编辑 markdown + restart | Rebuild + restart |
| 后台运行 | 否 | 否 | 是 | 否 | 否 |

---

<div id="actions">

## Actions

</div>

当代理需要根据用户输入**执行任务**时使用。LLM 根据描述和示例从已注册的选项中选择动作。

```typescript
import type { Action } from '@elizaos/core';

const sendEmailAction: Action = {
  name: 'SEND_EMAIL',
  description: 'Send an email to a specified recipient',
  similes: ['EMAIL', 'MAIL', 'SEND_MESSAGE'],
  validate: async (runtime, message) => {
    return !!runtime.getSetting('SMTP_HOST');
  },
  handler: async (runtime, message, state) => {
    // Parse recipient and body from message, send email
    return { success: true, text: 'Email sent!' };
  },
};
```

**适用于：** API 调用、数据变更、工具使用、文件操作、外部服务集成

---

<div id="providers">

## Providers

</div>

当你需要在每次响应前向代理的上下文中**注入信息**时使用。Providers 在每个推理周期自动运行。

```typescript
import type { Provider } from '@elizaos/core';

const timeProvider: Provider = {
  name: 'current-time',
  description: 'Provides current date and time',
  position: 'BEFORE_ACTIONS',
  get: async (runtime, message) => ({
    text: `Current time: ${new Date().toISOString()}`,
  }),
};
```

**适用于：** 实时数据、用户偏好、系统状态、数据库查询、环境上下文

---

<div id="services">

## Services

</div>

当你需要一个具有启动和关闭生命周期的**长时间运行的后台进程**时使用。

```typescript
import { defineService } from '@elizaos/core';

const webhookService = defineService({
  serviceType: 'webhook-listener',
  description: 'Listens for incoming webhooks',
  start: async (runtime) => {
    // Start HTTP listener, WebSocket connection, etc.
  },
  stop: async () => {
    // Clean up connections and resources
  },
});
```

**适用于：** WebSocket 连接、轮询、定时任务、队列消费者、缓存管理

---

<div id="skills">

## Skills

</div>

当你想通过**指令而非可执行代码来扩展代理行为**时使用。Skills 基于 markdown，不需要 TypeScript。

```markdown
---
name: git-helper
description: Help users with git commands and workflows
---

When asked about git, provide clear explanations and commands.
Always suggest safe operations first (status, log, diff before reset, force-push).
```

**适用于：** 领域知识、工作流程、指令集、提示工程、任务流程

---

<div id="routes">

## Routes

</div>

当你需要从插件中暴露 **HTTP 端点**时使用。

```typescript
import type { Route } from '@elizaos/core';

const healthRoute: Route = {
  type: 'GET',
  path: '/my-plugin/health',
  public: true,
  handler: async (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  },
};
```

**适用于：** Webhooks、状态页面、插件 API、文件服务、外部集成

---

<div id="event-handlers">

## Event Handlers

</div>

当你需要**对系统事件做出反应**（消息、连接、动作）时使用。

```typescript
import type { Plugin } from '@elizaos/core';

const analyticsPlugin: Plugin = {
  name: 'analytics',
  events: {
    MESSAGE_RECEIVED: [
      async (runtime, event) => {
        // Log message analytics
      },
    ],
    ACTION_STARTED: [
      async (runtime, event) => {
        // Track action usage
      },
    ],
  },
};
```

可用事件：`MESSAGE_RECEIVED`、`VOICE_MESSAGE_RECEIVED`、`WORLD_CONNECTED`、`WORLD_JOINED`、`ACTION_STARTED`、`ACTION_COMPLETED`

**适用于：** 日志记录、数据分析、副作用、通知、审计跟踪

---

<div id="evaluators">

## Evaluators

</div>

当你需要**评估响应质量**或在代理响应后触发后续操作时使用。

```typescript
import type { Evaluator } from '@elizaos/core';

const sentimentEvaluator: Evaluator = {
  name: 'sentiment-check',
  description: 'Assess sentiment of agent responses',
  alwaysRun: true,
  validate: async (runtime, message) => true,
  handler: async (runtime, message) => {
    // Analyze response sentiment, log metrics, trigger alerts
  },
};
```

**适用于：** 质量监控、合规检查、学习信号、响应后副作用

---

<div id="combining-extension-points">

## 组合扩展点

</div>

许多插件同时使用多个扩展点：

| 插件类型 | 典型组合 |
|-------------|-------------------|
| API 集成 | Action（API 调用）+ Provider（状态上下文）+ Service（令牌刷新） |
| 平台连接器 | Service（连接生命周期）+ Event Handler（消息）+ Route（webhooks） |
| 监控 | Evaluator（质量检查）+ Provider（指标上下文）+ Route（仪表板） |
| 知识 | Provider（上下文注入）+ Skill（指令） |

---

<div id="related">

## 相关资源

</div>

- [创建插件](/zh/plugins/create-a-plugin) -- 从零开始构建插件
- [插件开发](/zh/plugins/development) -- 所有扩展点的完整 API 参考
- [Skills 文档](/zh/plugins/skills) -- 深入了解 skills
- [插件模式](/zh/plugins/patterns) -- 常见实现模式
