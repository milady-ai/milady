---
title: "Anthropic 插件"
sidebarTitle: "Anthropic"
description: "Milady 的 Anthropic Claude 模型提供者 — Claude Opus 4.6、Sonnet 4.6、Haiku 4.5 以及扩展思维模型。"
---

Anthropic 插件将 Milady 代理连接到 Anthropic 的 Claude API，提供对 Claude 4.6、4.5、4 和 3 模型系列的访问，包括 Opus、Sonnet 和 Haiku 变体。

**Package:** `@elizaos/plugin-anthropic`

<div id="installation">

## 安装

</div>

```bash
milady plugins install anthropic
```

<div id="auto-enable">

## 自动启用

</div>

当 `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY` 存在时，插件会自动启用：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

<div id="configuration">

## 配置

</div>

| 环境变量 | 必需 | 描述 |
|---------|------|------|
| `ANTHROPIC_API_KEY` | 是* | 来自 [console.anthropic.com](https://console.anthropic.com) 的 Anthropic API 密钥 |
| `CLAUDE_API_KEY` | 是* | `ANTHROPIC_API_KEY` 的别名 |
| `ANTHROPIC_API_URL` | 否 | 自定义基础 URL |

*需要 `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY`。

<div id="miladyjson-example">

### milady.json 示例

</div>

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514"
      }
    }
  }
}
```

<div id="supported-models">

## 支持的模型

</div>

<div id="claude-4546-family">

### Claude 4.5/4.6 系列

</div>

| 模型 | 上下文 | 最适合 |
|------|--------|--------|
| `claude-opus-4-6` | 200k | 最强大，复杂推理，可用 1M 上下文 |
| `claude-sonnet-4-6` | 200k | 最新 Sonnet，性能与成本平衡 |
| `claude-haiku-4-5-20251001` | 200k | 快速、轻量任务 |

<div id="claude-4-family">

### Claude 4 系列

</div>

| 模型 | 上下文 | 最适合 |
|------|--------|--------|
| `claude-opus-4-20250514` | 200k | 复杂推理 |
| `claude-sonnet-4-20250514` | 200k | 性能与成本平衡 |
| `claude-sonnet-4.5` | 200k | 改进的编程能力 |
| `claude-3-5-haiku-20241022` | 200k | 快速响应 |

<div id="claude-37-family">

### Claude 3.7 系列

</div>

| 模型 | 上下文 | 最适合 |
|------|--------|--------|
| `claude-3-7-sonnet-20250219` | 200k | 扩展思维、代理任务 |

<div id="claude-35-family">

### Claude 3.5 系列

</div>

| 模型 | 上下文 | 最适合 |
|------|--------|--------|
| `claude-3-5-sonnet-20241022` | 200k | 代码生成、分析 |
| `claude-3-5-haiku-20241022` | 200k | 快速响应 |

<div id="claude-3-family">

### Claude 3 系列

</div>

| 模型 | 上下文 | 最适合 |
|------|--------|--------|
| `claude-3-opus-20240229` | 200k | 深度分析 |
| `claude-3-sonnet-20240229` | 200k | 均衡 |
| `claude-3-haiku-20240307` | 200k | 高性价比 |

<div id="model-type-mapping">

## 模型类型映射

</div>

| elizaOS 模型类型 | Anthropic 模型 |
|-----------------|---------------|
| `TEXT_SMALL` | `claude-3-5-haiku-20241022` |
| `TEXT_LARGE` | `claude-sonnet-4-20250514` |
| `OBJECT_SMALL` | `claude-3-5-haiku-20241022` |
| `OBJECT_LARGE` | `claude-sonnet-4-20250514` |

<div id="features">

## 功能特性

</div>

- 流式响应
- 工具使用（函数调用）
- 视觉（所有模型支持图像输入）
- 扩展思维（claude-3-7-sonnet、claude-opus-4-6）
- 通过工具使用实现结构化 JSON 输出
- 所有模型均支持 200k token 上下文窗口
- 提示缓存，降低重复上下文的成本

<div id="extended-thinking">

## 扩展思维

</div>

Claude 3.7 Sonnet 和 Claude Opus 4（`claude-opus-4-20250514`）支持扩展思维——一种模型在回答之前逐步推理的模式。这对于复杂推理、数学和多步骤规划特别有效。

```typescript
const response = await runtime.useModel("TEXT_LARGE", {
  prompt: "Design a database schema for a multi-tenant SaaS application.",
  thinking: { type: "enabled", budgetTokens: 10000 },
});
```

<div id="rate-limits-and-pricing">

## 速率限制与定价

</div>

速率限制取决于您的 Anthropic 使用层级。请参阅 [docs.anthropic.com/en/api/rate-limits](https://docs.anthropic.com/en/api/rate-limits) 了解当前限制。

定价：[anthropic.com/pricing](https://www.anthropic.com/pricing)

<div id="related">

## 相关

</div>

- [OpenAI 插件](/zh/plugin-registry/llm/openai) — GPT-4o 和推理模型
- [OpenRouter 插件](/zh/plugin-registry/llm/openrouter) — 在多个提供者之间路由，包括 Anthropic
- [模型提供者](/zh/runtime/models) — 比较所有提供者
