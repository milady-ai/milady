---
title: 插件设置指南
description: Milady 连接器、AI 提供商和流媒体插件的完整设置说明。
---

# 插件设置指南 — Milady AI

所有连接器、AI 提供商和流媒体插件的完整设置说明。
当用户询问如何设置插件时，请使用本指南：为他们提供准确的环境变量名称、
在哪里获取凭证、最低必填字段以及可选字段的提示。

---

<div id="ai-providers">

## AI 提供商

</div>

<div id="openai">

### OpenAI

</div>

**获取凭证：** https://platform.openai.com/api-keys
**最低要求：** `OPENAI_API_KEY`（以 `sk-` 开头）
**变量：**
- `OPENAI_API_KEY` — 来自 platform.openai.com 的密钥
- `OPENAI_BASE_URL` — 留空使用 OpenAI 默认值；如果使用自定义端点，请设置为代理 URL
- `OPENAI_SMALL_MODEL` — 例如 `gpt-4o-mini`（用于快速/低成本任务）
- `OPENAI_LARGE_MODEL` — 例如 `gpt-4o`（用于复杂推理）
- `OPENAI_EMBEDDING_MODEL` — 例如 `text-embedding-3-small`（用于语义搜索）
- `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` — 例如 `tts-1` / `alloy`（用于语音合成）
- `OPENAI_IMAGE_DESCRIPTION_MODEL` — 例如 `gpt-4o`（用于图像理解）
**提示：** OpenAI 是大多数功能的默认后备选项。如果你有额度，请优先配置此项。使用 `gpt-4o-mini` 作为小模型以节省成本。

<div id="anthropic">

### Anthropic

</div>

**获取凭证：** https://console.anthropic.com/settings/keys
**最低要求：** `ANTHROPIC_API_KEY`（以 `sk-ant-` 开头）或 `CLAUDE_API_KEY`
**变量：**
- `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY` — 来自 console.anthropic.com 的密钥（任一均可自动启用）
- `ANTHROPIC_SMALL_MODEL` — 例如 `claude-haiku-4-5-20251001`
- `ANTHROPIC_LARGE_MODEL` — 例如 `claude-sonnet-4-6`
- `ANTHROPIC_BROWSER_BASE_URL` —（高级）浏览器端请求的代理 URL
**提示：** 最适合复杂推理和长上下文场景。Claude Haiku 在小模型插槽中速度非常快。

<div id="google-gemini">

### Google Gemini

</div>

**获取凭证：** https://aistudio.google.com/app/apikey
**最低要求：** `GOOGLE_GENERATIVE_AI_API_KEY` 或 `GOOGLE_API_KEY`
**变量：**
- `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_API_KEY` — 来自 AI Studio 或 Google Cloud（任一均可自动启用）
- `GOOGLE_SMALL_MODEL` — 例如 `gemini-2.0-flash`
- `GOOGLE_LARGE_MODEL` — 例如 `gemini-2.0-pro`
- `GOOGLE_EMBEDDING_MODEL` — 例如 `text-embedding-004`
- `GOOGLE_IMAGE_MODEL` — 例如 `imagen-3.0-generate-002`
**提示：** Gemini Flash 速度快且成本低；非常适合作为小模型。免费额度非常慷慨。

<div id="groq">

### Groq

</div>

**获取凭证：** https://console.groq.com/keys
**最低要求：** `GROQ_API_KEY`
**变量：**
- `GROQ_API_KEY` — 来自 console.groq.com
- `GROQ_SMALL_MODEL` — 例如 `llama-3.1-8b-instant`
- `GROQ_LARGE_MODEL` — 例如 `llama-3.3-70b-versatile`
- `GROQ_TTS_MODEL` / `GROQ_TTS_VOICE` — 例如 `playai-tts` / `Fritz-PlayAI`
**提示：** Groq 推理速度极快——非常适合对延迟敏感的场景。有免费额度可用。通过 PlayAI 语音支持 TTS。

<div id="openrouter">

### OpenRouter

</div>

**获取凭证：** https://openrouter.ai/keys
**最低要求：** `OPENROUTER_API_KEY`
**变量：**
- `OPENROUTER_API_KEY` — 来自 openrouter.ai/keys
- `OPENROUTER_SMALL_MODEL` — 例如 `openai/gpt-4o-mini` 或 `meta-llama/llama-3.3-70b`
- `OPENROUTER_LARGE_MODEL` — 例如 `anthropic/claude-3.5-sonnet`
- `OPENROUTER_IMAGE_MODEL` — 例如 `openai/gpt-4o`（用于视觉任务）
- `OPENROUTER_IMAGE_GENERATION_MODEL` — 例如 `openai/dall-e-3`
- `OPENROUTER_EMBEDDING_MODEL` — 例如 `openai/text-embedding-3-small`
- `OPENROUTER_TOOL_EXECUTION_MAX_STEPS` — 每轮工具调用的最大步数（默认：5）
**提示：** OpenRouter 让你通过一个 API 密钥访问 200 多个模型。如果你想在不管理多个账户的情况下切换模型，这非常理想。使用 `provider/model-name` 格式的模型 ID。

<div id="xai-grok">

### xAI (Grok)

</div>

**获取凭证：** https://console.x.ai/
**最低要求：** `XAI_API_KEY` 或 `GROK_API_KEY`
**变量：**
- `XAI_API_KEY` / `GROK_API_KEY` — 来自 console.x.ai（任一均可自动启用）
- `XAI_MODEL` — 例如 `grok-2-1212`（覆盖小/大模型）
- `XAI_SMALL_MODEL` / `XAI_LARGE_MODEL` — 特定模型插槽
- `XAI_EMBEDDING_MODEL` — 例如 `v1`
- `X_AUTH_MODE` — `api_key`（默认）或 `oauth`
- `X_API_KEY`、`X_API_SECRET`、`X_ACCESS_TOKEN`、`X_ACCESS_TOKEN_SECRET` — Twitter OAuth 密钥（用于 xAI 的 X 连接器端）
- `X_ENABLE_POST`、`X_ENABLE_REPLIES`、`X_ENABLE_ACTIONS` — 切换 X/Twitter 行为
**提示：** xAI = Grok 模型。`X_*` 变量用于与 xAI 捆绑的 Twitter 集成。除非需要 OAuth，否则保持认证模式为 `api_key`。

<div id="ollama-local-models">

### Ollama（本地模型）

</div>

**获取凭证：** 无需 API 密钥——在本地安装 Ollama
**设置：** https://ollama.ai — 运行 `ollama pull llama3.2` 下载模型
**最低要求：** `OLLAMA_BASE_URL` = `http://localhost:11434`（自动启用触发器）或 `OLLAMA_API_ENDPOINT` = `http://localhost:11434/api`
**变量：**
- `OLLAMA_BASE_URL` — 自动启用触发器。默认：`http://localhost:11434`
- `OLLAMA_API_ENDPOINT` — 插件端点。默认：`http://localhost:11434/api`
- `OLLAMA_SMALL_MODEL` — 例如 `llama3.2:3b`
- `OLLAMA_MEDIUM_MODEL` — 例如 `llama3.2`
- `OLLAMA_LARGE_MODEL` — 例如 `llama3.3:70b`
- `OLLAMA_EMBEDDING_MODEL` — 例如 `nomic-embed-text`
**提示：** 完全免费且私密。需要在你的机器或服务器上运行 Ollama。使用 `ollama pull <model>` 下载模型。嵌入模型请使用 `nomic-embed-text`。

<div id="local-ai">

### Local AI

</div>

**获取凭证：** 无需 API 密钥——使用本地模型文件
**变量：**
- `MODELS_DIR` — 本地模型文件的路径（例如 `/Users/you/models`）
- `CACHE_DIR` — 缓存路径（例如 `/tmp/ai-cache`）
- `LOCAL_SMALL_MODEL` / `LOCAL_LARGE_MODEL` — MODELS_DIR 中的模型文件名
- `LOCAL_EMBEDDING_MODEL` / `LOCAL_EMBEDDING_DIMENSIONS` — 嵌入模型及其维度数量
- `CUDA_VISIBLE_DEVICES` — GPU 选择，例如 `0` 表示第一块 GPU
**提示：** 当你有 .gguf 或类似模型文件并且需要完全离线运行时使用。

<div id="vercel-ai-gateway">

### Vercel AI Gateway

</div>

**获取凭证：** https://vercel.com/docs/ai/ai-gateway
**最低要求：** `AI_GATEWAY_API_KEY` 和 `AI_GATEWAY_BASE_URL`
**变量：**
- `AI_GATEWAY_API_KEY` / `AIGATEWAY_API_KEY` — 你的网关密钥（任一均可）
- `VERCEL_OIDC_TOKEN` — 仅用于 Vercel 托管的部署
- `AI_GATEWAY_BASE_URL` — 你的网关端点 URL
- `AI_GATEWAY_SMALL_MODEL` / `AI_GATEWAY_LARGE_MODEL` / `AI_GATEWAY_EMBEDDING_MODEL` — 模型 ID
- `AI_GATEWAY_IMAGE_MODEL` — 用于图像生成
- `AI_GATEWAY_TIMEOUT_MS` — 请求超时时间，默认 30000ms
**提示：** 通过 Vercel 的 AI 网关路由模型调用，实现缓存、速率限制和可观测性。如果你已经在使用 Vercel，这非常有用。

<div id="deepseek">

### DeepSeek

</div>

**获取凭证：** https://platform.deepseek.com/api_keys
**最低要求：** `DEEPSEEK_API_KEY`
**变量：**
- `DEEPSEEK_API_KEY` — 来自 platform.deepseek.com 的 API 密钥
- `DEEPSEEK_SMALL_MODEL` — 例如 `deepseek-chat`
- `DEEPSEEK_LARGE_MODEL` — 例如 `deepseek-reasoner`
**提示：** DeepSeek 提供有竞争力的定价和强大的推理模型。`deepseek-reasoner` 模型支持链式思维推理。

<div id="together-ai">

### Together AI

</div>

**获取凭证：** https://api.together.xyz/settings/api-keys
**最低要求：** `TOGETHER_API_KEY`
**变量：**
- `TOGETHER_API_KEY` — 来自 api.together.xyz
- `TOGETHER_SMALL_MODEL` — 例如 `meta-llama/Llama-3.2-3B-Instruct-Turbo`
- `TOGETHER_LARGE_MODEL` — 例如 `meta-llama/Llama-3.3-70B-Instruct-Turbo`
- `TOGETHER_EMBEDDING_MODEL` — 例如 `togethercomputer/m2-bert-80M-8k-retrieval`
- `TOGETHER_IMAGE_MODEL` — 例如 `black-forest-labs/FLUX.1-schnell`
**提示：** Together AI 托管了大量开源模型。非常适合通过 API 访问 Llama、Mixtral 和其他开源模型。

<div id="mistral">

### Mistral

</div>

**获取凭证：** https://console.mistral.ai/api-keys
**最低要求：** `MISTRAL_API_KEY`
**变量：**
- `MISTRAL_API_KEY` — 来自 console.mistral.ai
- `MISTRAL_SMALL_MODEL` — 例如 `mistral-small-latest`
- `MISTRAL_LARGE_MODEL` — 例如 `mistral-large-latest`
- `MISTRAL_EMBEDDING_MODEL` — 例如 `mistral-embed`
**提示：** Mistral 模型速度快且性价比高。非常适合有欧洲数据驻留要求的场景。

<div id="cohere">

### Cohere

</div>

**获取凭证：** https://dashboard.cohere.com/api-keys
**最低要求：** `COHERE_API_KEY`
**变量：**
- `COHERE_API_KEY` — 来自 dashboard.cohere.com
- `COHERE_SMALL_MODEL` — 例如 `command-r`
- `COHERE_LARGE_MODEL` — 例如 `command-r-plus`
- `COHERE_EMBEDDING_MODEL` — 例如 `embed-english-v3.0`
**提示：** Cohere 在 RAG（检索增强生成）和多语言任务方面表现出色。其嵌入模型达到了生产级水平。

<div id="perplexity">

### Perplexity

</div>

**获取凭证：** https://www.perplexity.ai/settings/api
**最低要求：** `PERPLEXITY_API_KEY`
**变量：**
- `PERPLEXITY_API_KEY` — 来自 perplexity.ai 设置页面
- `PERPLEXITY_SMALL_MODEL` — 例如 `llama-3.1-sonar-small-128k-online`
- `PERPLEXITY_LARGE_MODEL` — 例如 `llama-3.1-sonar-large-128k-online`
**提示：** Perplexity 模型内置了网络搜索功能——非常适合需要最新信息的任务。

<div id="google-antigravity">

### Google Antigravity

</div>

**获取凭证：** 具有 Antigravity 访问权限的 Google Cloud API 密钥
**最低要求：** `GOOGLE_CLOUD_API_KEY`
**变量：**
- `GOOGLE_CLOUD_API_KEY` — Google Cloud API 密钥
**提示：** Google Antigravity 是一个专门的 Google 模型提供商。需要与 Google Gemini 不同的 Google Cloud 凭证。

<div id="qwen">

### Qwen

</div>

**最低要求：** 通过 `milady.json` 中的提供商插件配置进行设置
**变量：**
- 通过 `milady.json` 中的 `providers.qwen` 配置块设置模型 ID
**提示：** 来自阿里云的 Qwen 模型。通过配置文件的提供商部分进行设置。

<div id="minimax">

### Minimax

</div>

**最低要求：** 通过 `milady.json` 中的提供商插件配置进行设置
**变量：**
- 通过 `milady.json` 中的 `providers.minimax` 配置块设置模型 ID
**提示：** Minimax 提供中文和多语言 AI 模型。

<div id="pi-ai">

### Pi AI

</div>

**最低要求：** `ELIZA_USE_PI_AI=true`
**变量：**
- `ELIZA_USE_PI_AI` — 设置为 `true` 以启用 Pi AI 作为模型提供商
**提示：** Pi AI 提供针对友好、有帮助的对话优化的会话模型。

<div id="zai">

### Zai

</div>

**获取凭证：** 来自 Homunculus Labs
**最低要求：** `ZAI_API_KEY`
**变量：**
- `ZAI_API_KEY` — 来自 Homunculus Labs 的 Zai API 密钥
**提示：** Zai 是来自 Homunculus Labs 的模型提供商。插件包：`@homunculuslabs/plugin-zai`。

<div id="eliza-cloud">

### Eliza Cloud

</div>

**获取凭证：** 来自 elizaOS Cloud 服务
**最低要求：** `ELIZAOS_CLOUD_API_KEY` 或 `ELIZAOS_CLOUD_ENABLED=true`
**变量：**
- `ELIZAOS_CLOUD_API_KEY` — 你的 Eliza Cloud API 密钥
- `ELIZAOS_CLOUD_ENABLED` — 设置为 `true` 以启用云功能
**提示：** Eliza Cloud 提供托管基础设施，用于运行具有托管扩展和监控功能的 Eliza 代理。

---

<div id="connectors">

## 连接器

</div>

<div id="discord">

### Discord

</div>

**获取凭证：** https://discord.com/developers/applications → 新建应用 → Bot → 重置 Token
**最低要求：** `DISCORD_API_TOKEN` + `DISCORD_APPLICATION_ID`
**变量：**
- `DISCORD_API_TOKEN` — Bot Token（从 Bot 部分，点击重置 Token）
- `DISCORD_APPLICATION_ID` — 应用 ID（从"常规信息"页面获取）
- `CHANNEL_IDS` — 以逗号分隔的要监听的频道 ID
- `DISCORD_VOICE_CHANNEL_ID` — 用于语音频道支持
- `DISCORD_SHOULD_IGNORE_BOT_MESSAGES` — `true` 防止机器人之间的循环
- `DISCORD_SHOULD_IGNORE_DIRECT_MESSAGES` — `true` 禁用私信回复
- `DISCORD_SHOULD_RESPOND_ONLY_TO_MENTIONS` — `true` 仅在被 @提及时回复
- `DISCORD_LISTEN_CHANNEL_IDS` — 仅监听但不主动发言的频道 ID
**设置步骤：**
1. 在 discord.com/developers/applications 创建应用
2. 进入 Bot 标签页 → 重置 Token（立即复制）
3. 从"常规信息"标签页获取应用 ID
4. 在 OAuth2 → URL 生成器 → Bot → 选择权限：发送消息、读取消息、使用斜杠命令
5. 使用生成的 URL 邀请机器人
6. 在 Bot → 特权网关 Intent 下启用消息内容 Intent
**提示：** 你需要同时提供 Bot Token 和应用 ID——没有应用 ID，斜杠命令将无法注册。右键点击频道并"复制 ID"来获取频道 ID（需要先在 Discord 设置中启用开发者模式）。

<div id="telegram">

### Telegram

</div>

**获取凭证：** 在 Telegram 上给 @BotFather 发消息
**最低要求：** `TELEGRAM_BOT_TOKEN`
**变量：**
- `TELEGRAM_BOT_TOKEN` — 使用 `/newbot` 后从 @BotFather 获取
- `TELEGRAM_ALLOWED_CHATS` — 允许的聊天 ID 的 JSON 数组，例如 `["123456789", "-100987654321"]`
- `TELEGRAM_API_ROOT` — 留空使用默认值；如果使用 Telegram 代理则设置
- `TELEGRAM_TEST_CHAT_ID` — 用于测试（高级）
**设置步骤：**
1. 给 @BotFather 发消息：`/newbot`
2. 为它起一个名称和用户名
3. 复制它给你的 Token
4. 要获取你的聊天 ID：给 @userinfobot 发消息
**提示：** 群组使用负数 ID（以 -100 开头）。使用 `TELEGRAM_ALLOWED_CHATS` 限制谁可以与机器人对话，以确保安全。

<div id="twitter--x">

### Twitter / X

</div>

**获取凭证：** https://developer.twitter.com/en/portal/dashboard
**最低要求：** 全部 4 个 OAuth 密钥：`TWITTER_API_KEY`、`TWITTER_API_SECRET_KEY`、`TWITTER_ACCESS_TOKEN`、`TWITTER_ACCESS_TOKEN_SECRET`
**变量：**
- `TWITTER_API_KEY` — Consumer API Key
- `TWITTER_API_SECRET_KEY` — Consumer API Secret
- `TWITTER_ACCESS_TOKEN` — Access Token（从"Keys and Tokens"标签页获取）
- `TWITTER_ACCESS_TOKEN_SECRET` — Access Token Secret
- `TWITTER_DRY_RUN` — `true` 测试而不实际发布
- `TWITTER_POST_ENABLE` — `true` 启用自主发布
- `TWITTER_POST_INTERVAL_MIN` / `TWITTER_POST_INTERVAL_MAX` — 发布间隔分钟数（例如 90/180）
- `TWITTER_POST_IMMEDIATELY` — `true` 启动时立即发布
- `TWITTER_AUTO_RESPOND_MENTIONS` — `true` 回复 @提及
- `TWITTER_POLL_INTERVAL` — 检查提及的间隔秒数（例如 120）
- `TWITTER_SEARCH_ENABLE` / `TWITTER_ENABLE_TIMELINE` / `TWITTER_ENABLE_DISCOVERY` — 高级互动模式
**设置步骤：**
1. 在 developer.twitter.com 申请开发者账户（基本层级即时通过）
2. 创建一个项目和应用
3. 从"Keys and Tokens"标签页生成全部 4 个密钥
4. 将应用权限设置为读写
5. 设置权限之后重新生成 Token
**提示：** 先使用 `TWITTER_DRY_RUN=true` 验证而不发布。免费 API 层级每月有 500 条推文限额。你需要全部 4 个 OAuth 密钥——缺少任何一个都会导致认证失败。

<div id="slack">

### Slack

</div>

**获取凭证：** https://api.slack.com/apps → 创建新应用
**最低要求：** `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`
**变量：**
- `SLACK_BOT_TOKEN` — 以 `xoxb-` 开头（从 OAuth 和权限 → Bot Token 获取）
- `SLACK_APP_TOKEN` — 以 `xapp-` 开头（从基本信息 → 应用级别 Token 获取；scope：`connections:write`）
- `SLACK_SIGNING_SECRET` — 从基本信息获取（用于 webhook 验证）
- `SLACK_USER_TOKEN` — 以 `xoxp-` 开头（可选，用于用户级别操作）
- `SLACK_CHANNEL_IDS` — 以逗号分隔的频道 ID，例如 `C01ABCDEF,C02GHIJKL`
- `SLACK_SHOULD_IGNORE_BOT_MESSAGES` — 防止机器人循环
- `SLACK_SHOULD_RESPOND_ONLY_TO_MENTIONS` — 仅在被 @提及时回复
**设置步骤：**
1. 在 api.slack.com/apps 创建应用（从零开始 → 选择工作区）
2. Socket 模式：启用 Socket 模式 → 生成具有 `connections:write` scope 的应用级别 Token
3. Bot Token Scopes（OAuth 和权限）：`chat:write`、`channels:read`、`channels:history`、`groups:history`、`im:history`、`app_mentions:read`
4. 将应用安装到工作区 → 复制 Bot Token
5. 启用事件订阅 → 订阅 bot 事件：`message.channels`、`message.im`、`app_mention`
**提示：** Socket 模式意味着你不需要公共 webhook URL。Socket 模式需要同时提供 Bot Token（xoxb-）和 App Token（xapp-）。要获取频道 ID：在 Slack 中右键点击频道 → 复制链接，ID 在 URL 中。

<div id="whatsapp">

### WhatsApp

</div>

**两种模式——选择其一：**

**模式 1：Cloud API（商业版，推荐）**
**获取凭证：** https://developers.facebook.com/apps → WhatsApp → API 设置
- `WHATSAPP_ACCESS_TOKEN` — 来自 Meta Business 的永久系统用户 Token
- `WHATSAPP_PHONE_NUMBER_ID` — 从 WhatsApp → API 设置获取
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — 从 WhatsApp Business 设置获取
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — 你选择的任意字符串（用于验证 webhook）
- `WHATSAPP_API_VERSION` — 例如 `v18.0`（使用最新版本）
**设置：** 需要 Meta Business 账户、已验证的电话号码、已批准的 WhatsApp Business 应用

**模式 2：Baileys（个人版，二维码）**
- `WHATSAPP_AUTH_DIR` — 存储会话文件的目录，例如 `/data/whatsapp-auth`
- 无需其他凭证——首次运行时扫描二维码
**提示：** Baileys 模式可以使用你的个人 WhatsApp 号码，但违反服务条款。生产环境请使用 Cloud API。Cloud API 需要真实的企业和 Meta 应用审批。

<div id="instagram">

### Instagram

</div>

**获取凭证：** 使用你的 Instagram 账户凭证
**最低要求：** `INSTAGRAM_USERNAME` + `INSTAGRAM_PASSWORD`
**变量：**
- `INSTAGRAM_USERNAME` — 你的 Instagram 用户名
- `INSTAGRAM_PASSWORD` — 你的 Instagram 密码
- `INSTAGRAM_VERIFICATION_CODE` — 如果启用了 2FA，则需要提供验证码
- `INSTAGRAM_PROXY` — 如果被限速或封禁，则使用代理 URL
**提示：** ⚠️ 使用非官方 API。Instagram 经常封禁自动化访问。请使用专用账户，不要使用你的个人账户。代理可以减少封禁。启用了 2FA 的用户必须在启动时提供验证码。

<div id="bluesky">

### Bluesky

</div>

**获取凭证：** https://bsky.app → 设置 → 应用密码
**最低要求：** `BLUESKY_HANDLE` + `BLUESKY_PASSWORD`（应用密码，不是你的真实密码）
**变量：**
- `BLUESKY_HANDLE` — 你的 handle，例如 `yourname.bsky.social`
- `BLUESKY_PASSWORD` — 应用密码（不是你的登录密码——在设置中创建一个）
- `BLUESKY_ENABLED` — `true` 启用
- `BLUESKY_SERVICE` — 默认：`https://bsky.social`（仅在自托管 PDS 时更改）
- `BLUESKY_ENABLE_POSTING` — `true` 启用自主发帖
- `BLUESKY_POST_INTERVAL_MIN` / `BLUESKY_POST_INTERVAL_MAX` — 发帖间隔秒数
- `BLUESKY_MAX_POST_LENGTH` — 每帖最大字符数（默认：300）
- `BLUESKY_POLL_INTERVAL` — 检查提及/私信的间隔秒数
- `BLUESKY_ENABLE_DMS` — `true` 回复私信
**提示：** 在 bsky.app → 设置 → 应用密码中创建应用密码。永远不要使用你的主登录密码。

<div id="farcaster">

### Farcaster

</div>

**获取凭证：** https://warpcast.com → 设置，然后 https://neynar.com 获取 API
**最低要求：** `FARCASTER_FID` + `FARCASTER_SIGNER_UUID` + `FARCASTER_NEYNAR_API_KEY`
**变量：**
- `FARCASTER_FID` — 你的 Farcaster ID（个人主页 URL 中显示的数字）
- `FARCASTER_SIGNER_UUID` — 来自 Neynar 控制面板的签名者 UUID
- `FARCASTER_NEYNAR_API_KEY` — 来自 neynar.com（读写操作需要）
- `ENABLE_CAST` — `true` 启用自主 cast
- `CAST_INTERVAL_MIN` / `CAST_INTERVAL_MAX` — cast 间隔分钟数
- `MAX_CAST_LENGTH` — 默认 320 字符
- `FARCASTER_POLL_INTERVAL` — 检查通知的间隔秒数
- `FARCASTER_HUB_URL` — 自定义 Farcaster hub（高级，留空使用默认值）
**设置步骤：**
1. 创建 Warpcast 账户，从你的个人主页 URL 获取 FID
2. 在 neynar.com 注册，为你的 FID 创建签名者
3. 从 Neynar 控制面板获取 API 密钥
**提示：** Neynar 是必需的——它是使 Farcaster 数据可通过 API 访问的索引器。

<div id="wechat">

### WeChat

</div>

**获取凭证：** 从你的 WeChat 代理服务提供商获取
**最低要求：** `WECHAT_API_KEY` + 配置中的代理 URL
**变量：**
- `WECHAT_API_KEY` — 代理服务 API 密钥
**仅配置字段**（在 `connectors.wechat` 中设置，不是环境变量）：
- `proxyUrl` — **必填** — 你的 WeChat 代理服务 URL
- `webhookPort` — Webhook 监听端口（默认：18790）
- `deviceType` — 设备模拟：`ipad`（默认）或 `mac`
- `features.images` — 启用图片收发（默认：false）
- `features.groups` — 启用群聊支持（默认：false）
**设置步骤：**
1. 从你的 WeChat 代理服务获取 API 密钥
2. 在 milady.json 中配置 `connectors.wechat`，设置 `apiKey` 和 `proxyUrl`
3. 启动 Milady — 用 WeChat 扫描终端中显示的二维码
**提示：** WeChat 使用第三方代理服务，而非官方 API。只使用你信任的代理——它可以看到所有消息流量。通过 `accounts` 映射支持多账户。包：`@miladyai/plugin-wechat`。

<div id="github">

### GitHub

</div>

**获取凭证：** https://github.com/settings/tokens → Fine-grained 或 Classic
**最低要求：** `GITHUB_API_TOKEN`
**变量：**
- `GITHUB_API_TOKEN` — 个人访问令牌或 GitHub App 令牌
- `GITHUB_OWNER` — 仓库所有者（用户名或组织）
- `GITHUB_REPO` — 仓库名称
- `GITHUB_BRANCH` — 默认分支（例如 `main`）
- `GITHUB_WEBHOOK_SECRET` — 用于 GitHub App webhook 验证
- `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_INSTALLATION_ID` — 用于 GitHub Apps
**提示：** Fine-grained 令牌更安全——仅将范围限定在你需要的仓库。对于组织仓库，你可能需要向组织请求访问权限。

<div id="twitch">

### Twitch

</div>

**获取凭证：** https://dev.twitch.tv/console/apps → 注册你的应用
**最低要求：** `TWITCH_USERNAME` + `TWITCH_CLIENT_ID` + `TWITCH_ACCESS_TOKEN` + `TWITCH_CLIENT_SECRET`
**变量：**
- `TWITCH_USERNAME` — 你的 Twitch 机器人用户名
- `TWITCH_CLIENT_ID` — 来自 Twitch 开发者控制台
- `TWITCH_CLIENT_SECRET` — 来自 Twitch 开发者控制台
- `TWITCH_ACCESS_TOKEN` — OAuth Token（通过 https://twitchapps.com/tmi/ 或 Twitch OAuth 流程获取）
- `TWITCH_REFRESH_TOKEN` — 用于长期会话
- `TWITCH_CHANNEL` — 要加入的主频道（例如 `mychannel`）
- `TWITCH_CHANNELS` — 额外频道（以逗号分隔）
- `TWITCH_REQUIRE_MENTION` — `true` 仅在提及机器人用户名时回复
- `TWITCH_ALLOWED_ROLES` — `broadcaster`、`moderator`、`vip`、`subscriber`、`viewer`
**提示：** 为机器人创建一个单独的 Twitch 账户。使用 https://twitchapps.com/tmi/ 快速获取聊天机器人的访问令牌。

<div id="twilio-sms--voice">

### Twilio（SMS + 语音）

</div>

**获取凭证：** https://console.twilio.com
**最低要求：** `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_PHONE_NUMBER`
**变量：**
- `TWILIO_ACCOUNT_SID` — 来自 Twilio 控制台面板（以 `AC` 开头）
- `TWILIO_AUTH_TOKEN` — 来自 Twilio 控制台面板
- `TWILIO_PHONE_NUMBER` — 你的 Twilio 号码，E.164 格式（例如 `+15551234567`）
- `TWILIO_WEBHOOK_URL` — 你的可公开访问的 URL，用于接收消息
- `TWILIO_WEBHOOK_PORT` — 监听端口（如果自托管，默认 3000）
- `VOICE_CALL_PROVIDER` — 例如 `twilio`
- `VOICE_CALL_FROM_NUMBER` — 外呼来电显示号码
- `VOICE_CALL_TO_NUMBER` — 默认拨打号码
- `VOICE_CALL_PUBLIC_URL` — 用于语音 webhook 的可公开访问 URL
- `VOICE_CALL_MAX_DURATION_SECONDS` — 最大通话时长（默认 3600）
- `VOICE_CALL_INBOUND_POLICY` — `allow-all`、`allow-from` 或 `deny-all`
- `VOICE_CALL_INBOUND_GREETING` — 接听电话时播放的文本
**提示：** 为了使 webhook 正常工作，Twilio 需要一个公共 URL。开发时使用 ngrok。在控制台 → 电话号码 → 购买号码中获取电话号码。免费试用提供约 $15 的额度。

<div id="matrix">

### Matrix

</div>

**获取凭证：** 你的 Matrix 主服务器账户
**最低要求：** `MATRIX_HOMESERVER` + `MATRIX_USER_ID` + `MATRIX_ACCESS_TOKEN`
**变量：**
- `MATRIX_HOMESERVER` — 例如 `https://matrix.org` 或你自己的主服务器
- `MATRIX_USER_ID` — 例如 `@yourbot:matrix.org`
- `MATRIX_ACCESS_TOKEN` — 从 Element 获取：设置 → 帮助与关于 → 高级 → Access Token
- `MATRIX_DEVICE_ID` — 留空自动分配
- `MATRIX_ROOMS` — 以逗号分隔的房间 ID（例如 `!abc123:matrix.org`）
- `MATRIX_AUTO_JOIN` — `true` 自动加入邀请的房间
- `MATRIX_ENCRYPTION` — `true` 启用端对端加密（需要更多设置）
- `MATRIX_REQUIRE_MENTION` — `true` 仅在被 @提及时回复
**提示：** 在 Element → 设置 → 帮助与关于 → 高级中获取你的访问令牌。Matrix ID 使用 `@user:server` 格式。

<div id="microsoft-teams">

### Microsoft Teams

</div>

**获取凭证：** https://portal.azure.com → Azure Active Directory → 应用注册
**最低要求：** `MSTEAMS_APP_ID` + `MSTEAMS_APP_PASSWORD` + `MSTEAMS_TENANT_ID`
**变量：**
- `MSTEAMS_APP_ID` — 来自 Azure 门户的应用程序（客户端）ID
- `MSTEAMS_APP_PASSWORD` — 来自 Azure 门户的客户端密钥值
- `MSTEAMS_TENANT_ID` — 你的 Azure AD 租户 ID
- `MSTEAMS_WEBHOOK_PORT` / `MSTEAMS_WEBHOOK_PATH` — Bot Framework 发送消息的位置
- `MSTEAMS_ALLOWED_TENANTS` — 限制到特定租户（以逗号分隔）
- `MSTEAMS_SHAREPOINT_SITE_ID` — 用于 SharePoint 集成（高级）
- `MSTEAMS_MEDIA_MAX_MB` — 最大文件上传大小（默认 25MB）
**设置步骤：**
1. 在 Azure 门户注册应用 → 应用注册 → 新建注册
2. 在"证书和密钥"下添加客户端密钥
3. 通过 https://dev.botframework.com → 创建机器人来注册 bot
4. 在 Bot Framework 门户中将 bot 连接到 Microsoft Teams 频道
**提示：** 需要 Microsoft 365 管理员权限或允许应用注册的组织。

<div id="google-chat">

### Google Chat

</div>

**获取凭证：** https://console.cloud.google.com → APIs → Google Chat API
**最低要求：** 服务账户 JSON 或 `GOOGLE_APPLICATION_CREDENTIALS` 路径
**变量：**
- `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` — 完整的服务账户 JSON（粘贴整个 JSON）
- `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE` — 替代方案：服务账户 JSON 文件的路径
- `GOOGLE_APPLICATION_CREDENTIALS` — 替代方案：凭证文件的路径
- `GOOGLE_CHAT_SPACES` — 以逗号分隔的空间名称（例如 `spaces/AAAA_space_id`）
- `GOOGLE_CHAT_AUDIENCE_TYPE` — `PUBLISHED` 或 `DOMAIN_INSTALL`
- `GOOGLE_CHAT_AUDIENCE` — 你的应用受众 URL
- `GOOGLE_CHAT_WEBHOOK_PATH` — 接收消息的 webhook 路径
- `GOOGLE_CHAT_REQUIRE_MENTION` — `true` 要求 @提及
- `GOOGLE_CHAT_BOT_USER` — 机器人用户 ID
**提示：** 在 Cloud Console 中启用 Google Chat API。创建具有 Chat 范围权限的服务账户。Workspace 管理员必须批准 Chat 应用。

<div id="signal">

### Signal

</div>

**获取凭证：** 你自己的电话号码 + signal-cli 或 signal-api-rest-api
**最低要求：** `SIGNAL_ACCOUNT_NUMBER` + `SIGNAL_HTTP_URL`
**变量：**
- `SIGNAL_ACCOUNT_NUMBER` — 你的电话号码，E.164 格式（例如 `+15551234567`）
- `SIGNAL_HTTP_URL` — REST API URL，例如 `http://localhost:8080`
- `SIGNAL_CLI_PATH` — signal-cli 二进制文件的路径（可选，用于直接 CLI 模式）
- `SIGNAL_SHOULD_IGNORE_GROUP_MESSAGES` — `true` 忽略群聊
**设置：** 运行 signal-api-rest-api 服务器：https://github.com/bbernhard/signal-cli-rest-api
**提示：** Signal 没有官方 API。使用 bbernhard/signal-cli-rest-api Docker 镜像——它处理 signal-cli 连接并暴露 REST API。

<div id="imessage-macos-only">

### iMessage（仅限 macOS）

</div>

**获取凭证：** 仅限 macOS——无需凭证，使用本地"信息"应用
**变量：**
- `IMESSAGE_CLI_PATH` — imessage-reader CLI 的路径（从 GitHub 安装）
- `IMESSAGE_DB_PATH` — "信息"chat.db 的路径（默认：`~/Library/Messages/chat.db`）
- `IMESSAGE_POLL_INTERVAL_MS` — 检查新消息的频率（默认：5000ms）
- `IMESSAGE_DM_POLICY` — `allow-all` 或 `allow-from`
- `IMESSAGE_GROUP_POLICY` — `allow-all`、`allow-from` 或 `deny-all`
- `IMESSAGE_ALLOW_FROM` — 以逗号分隔的允许发送者
- `IMESSAGE_ENABLED` — `true` 启用
**提示：** 仅限 macOS。需要"完全磁盘访问"权限以便应用读取"信息"数据库。仅在配置了 iMessage 的机器上有效。

<div id="bluebubbles-imessage-from-any-platform">

### BlueBubbles（从任何平台使用 iMessage）

</div>

**获取凭证：** 在 Mac 上安装 BlueBubbles 服务器：https://bluebubbles.app
**最低要求：** `BLUEBUBBLES_SERVER_URL` + `BLUEBUBBLES_PASSWORD`
**变量：**
- `BLUEBUBBLES_SERVER_URL` — 你的 BlueBubbles 服务器 URL（例如 `http://your-mac:1234`）
- `BLUEBUBBLES_PASSWORD` — 在 BlueBubbles 服务器设置中设定的密码
- `BLUEBUBBLES_WEBHOOK_PATH` — 接收 webhook 的路径
- `BLUEBUBBLES_DM_POLICY` / `BLUEBUBBLES_GROUP_POLICY` — `allow-all` 或 `allow-from`
- `BLUEBUBBLES_ALLOW_FROM` / `BLUEBUBBLES_GROUP_ALLOW_FROM` — 允许的联系人（以逗号分隔）
- `BLUEBUBBLES_SEND_READ_RECEIPTS` — 是否将消息标记为已读
**提示：** BlueBubbles 需要一台配置了 iMessage 的 Mac 作为服务器。你可以从任何设备访问它。从 bluebubbles.app 安装服务器应用。

<div id="blooio-sms-via-api">

### Blooio（通过 API 发送 SMS）

</div>

**获取凭证：** https://bloo.io
**最低要求：** `BLOOIO_API_KEY`
**变量：**
- `BLOOIO_API_KEY` — 来自 bloo.io 控制面板
- `BLOOIO_WEBHOOK_URL` — 你的公共 URL，用于接收 SMS webhook
- `BLOOIO_WEBHOOK_SECRET` — 用于 webhook 签名验证的密钥
- `BLOOIO_BASE_URL` — bloo.io API 基础 URL（保持默认值）
- `BLOOIO_PHONE_NUMBER` — 用于发送的电话号码
- `BLOOIO_WEBHOOK_PORT` — webhook 监听端口
**提示：** Blooio 桥接 iMessage/SMS。需要一台运行 Blooio 应用的 Mac。

<div id="nostr">

### Nostr

</div>

**获取凭证：** 使用任何 Nostr 客户端生成你自己的密钥对
**最低要求：** `NOSTR_PRIVATE_KEY`
**变量：**
- `NOSTR_PRIVATE_KEY` — 你的 nsec 私钥（十六进制格式）
- `NOSTR_RELAYS` — 以逗号分隔的中继 URL，例如 `wss://relay.damus.io,wss://relay.nostr.band`
- `NOSTR_DM_POLICY` — `allow-all` 或 `allow-from`
- `NOSTR_ALLOW_FROM` — 允许的公钥（npub 格式）
- `NOSTR_ENABLED` — `true` 启用
**提示：** 使用任何 Nostr 应用（Damus、Primal、Amethyst）生成密钥。保持私钥机密——它就是你的身份。使用多个中继以提高可靠性。

<div id="line">

### LINE

</div>

**获取凭证：** https://developers.line.biz/console
**最低要求：** `LINE_CHANNEL_ACCESS_TOKEN` + `LINE_CHANNEL_SECRET`
**变量：**
- `LINE_CHANNEL_ACCESS_TOKEN` — 来自 LINE Developers 控制台 → Messaging API → Channel Access Token
- `LINE_CHANNEL_SECRET` — 来自"基本设置"标签页
- `LINE_WEBHOOK_PATH` — Webhook URL 路径（也需要在 LINE 控制台中配置）
- `LINE_DM_POLICY` / `LINE_GROUP_POLICY` — `allow-all` 或 `allow-from`
- `LINE_ALLOW_FROM` — 允许的用户 ID
- `LINE_ENABLED` — `true` 启用
**设置步骤：**
1. 在 developers.line.biz 创建频道
2. 签发频道访问令牌（长期有效，在 Messaging API 标签页中）
3. 在控制台中设置你的 webhook URL
**提示：** LINE 要求你的 webhook 使用带有有效证书的 HTTPS。开发时使用 ngrok 或部署到服务器。

<div id="feishu-lark">

### Feishu (Lark)

</div>

**获取凭证：** https://open.feishu.cn（或 open.larksuite.com 用于 Lark）
**最低要求：** `FEISHU_APP_ID` + `FEISHU_APP_SECRET`
**变量：**
- `FEISHU_APP_ID` — 来自飞书/Lark 开发者控制台 → 应用凭证
- `FEISHU_APP_SECRET` — 来自应用凭证部分
- `FEISHU_DOMAIN` — `feishu.cn`（默认）或 `larksuite.com`
- `FEISHU_ALLOWED_CHATS` — 允许的聊天 ID（以逗号分隔）
- `FEISHU_TEST_CHAT_ID` — 用于测试

<div id="mattermost">

### Mattermost

</div>

**获取凭证：** 你的 Mattermost 实例 → 系统控制台 → 集成 → Bot 账户
**最低要求：** `MATTERMOST_BASE_URL` + `MATTERMOST_BOT_TOKEN`
**变量：**
- `MATTERMOST_BASE_URL` — 例如 `https://mattermost.yourcompany.com`
- `MATTERMOST_BOT_TOKEN` — 来自系统控制台 → Bot 账户 → 添加 Bot 账户
- `MATTERMOST_TEAM_ID` — 你的团队 ID（从团队 URL 或 API 获取）
- `MATTERMOST_DM_POLICY` / `MATTERMOST_GROUP_POLICY` — `allow-all` 或 `allow-from`
- `MATTERMOST_ALLOWED_USERS` / `MATTERMOST_ALLOWED_CHANNELS` — 限制访问
- `MATTERMOST_REQUIRE_MENTION` — `true` 要求 @提及
**提示：** 在系统控制台 → 认证 → Bot 账户中启用 Bot 账户。自托管 Mattermost 是免费的。

<div id="nextcloud-talk">

### Nextcloud Talk

</div>

**获取凭证：** 你的 Nextcloud 实例 → 设置 → 安全 → 应用密码
**最低要求：** `NEXTCLOUD_URL` + `NEXTCLOUD_BOT_SECRET`
**变量：**
- `NEXTCLOUD_URL` — 你的 Nextcloud URL（例如 `https://cloud.yourserver.com`）
- `NEXTCLOUD_BOT_SECRET` — 通过 Nextcloud Talk API 注册 bot 时设置
- `NEXTCLOUD_WEBHOOK_PUBLIC_URL` — 用于 Talk webhook 的可公开访问 URL
- `NEXTCLOUD_WEBHOOK_PORT` / `NEXTCLOUD_WEBHOOK_PATH` — Webhook 服务器设置
- `NEXTCLOUD_ALLOWED_ROOMS` — 允许的房间令牌

<div id="tlon-urbit">

### Tlon (Urbit)

</div>

**获取凭证：** 你的 Urbit ship 访问权限
**最低要求：** `TLON_SHIP` + `TLON_URL` + `TLON_CODE`
**变量：**
- `TLON_SHIP` — 你的 ship 名称（例如 `~sampel-palnet`）
- `TLON_URL` — 你的 ship URL（例如 `http://localhost:8080`）
- `TLON_CODE` — 你的 ship 访问代码（在 Dojo 中使用 `+code` 获取）
- `TLON_GROUP_CHANNELS` — 要监听的频道（组路径格式）
- `TLON_DM_ALLOWLIST` — 允许的私信发送者
- `TLON_AUTO_DISCOVER_CHANNELS` — 自动加入频道

<div id="zalo-vietnam-messaging">

### Zalo（越南即时通讯）

</div>

**获取凭证：** https://developers.zalo.me
**最低要求：** `ZALO_APP_ID` + `ZALO_SECRET_KEY` + `ZALO_ACCESS_TOKEN`
**变量：**
- `ZALO_APP_ID` / `ZALO_SECRET_KEY` — 来自 Zalo 开发者门户
- `ZALO_ACCESS_TOKEN` / `ZALO_REFRESH_TOKEN` — 来自 Zalo 的 OAuth 令牌
- `ZALO_WEBHOOK_URL` / `ZALO_WEBHOOK_PATH` / `ZALO_WEBHOOK_PORT` — Webhook 配置

<div id="zalo-user-personal">

### Zalo User（个人版）

</div>

个人 Zalo 账户连接器（非官方，无需 API 密钥）。
**变量：**
- `ZALOUSER_COOKIE_PATH` — 导出的 Zalo 会话 Cookie 的路径
- `ZALOUSER_IMEI` — 会话的设备 IMEI（来自 Zalo 官方应用）
- `ZALOUSER_USER_AGENT` — 浏览器 User Agent 字符串
- `ZALOUSER_PROFILES` — 多账户配置文件（JSON）
- `ZALOUSER_ALLOWED_THREADS` — 允许的会话线程
- `ZALOUSER_DM_POLICY` / `ZALOUSER_GROUP_POLICY` — 消息策略

<div id="acp-agent-communication-protocol">

### ACP (Agent Communication Protocol)

</div>

用于连接多个 AI 代理的内部代理间通信协议。
**变量：**
- `ACP_GATEWAY_URL` — ACP hub 的网关 URL
- `ACP_GATEWAY_TOKEN` / `ACP_GATEWAY_PASSWORD` — 认证凭证
- `ACP_DEFAULT_SESSION_KEY` / `ACP_DEFAULT_SESSION_LABEL` — 会话标识
- `ACP_CLIENT_NAME` / `ACP_CLIENT_DISPLAY_NAME` — 此代理的身份
- `ACP_AGENT_ID` — 唯一代理 ID
- `ACP_PERSIST_SESSIONS` — `true` 在重启之间保存会话
- `ACP_SESSION_STORE_PATH` — 保存会话的位置

<div id="mcp-model-context-protocol">

### MCP (Model Context Protocol)

</div>

连接到任何 MCP 服务器以获取扩展工具功能。
**变量：**
- `mcp` — MCP 服务器的 JSON 配置对象
**提示：** MCP 服务器可以直接向 AI 提供工具（网络搜索、代码执行、文件访问、数据库等）。请参阅 https://modelcontextprotocol.io 获取可用服务器列表。

<div id="iq-solana-on-chain">

### IQ (Solana On-chain)

</div>

通过 Solana 区块链进行链上聊天。
**最低要求：** `SOLANA_PRIVATE_KEY` + `IQ_GATEWAY_URL`
**变量：**
- `SOLANA_PRIVATE_KEY` — Solana 钱包私钥（base58 编码）
- `SOLANA_KEYPAIR_PATH` — 替代方案：密钥对 JSON 文件的路径
- `SOLANA_RPC_URL` — 例如 `https://api.mainnet-beta.solana.com`
- `IQ_GATEWAY_URL` — IQ 协议网关 URL
- `IQ_AGENT_NAME` — 你的代理显示名称
- `IQ_DEFAULT_CHATROOM` — 要加入的默认聊天室
- `IQ_CHATROOMS` — 额外聊天室（以逗号分隔）

<div id="gmail-watch">

### Gmail Watch

</div>

通过 Google Pub/Sub 推送通知监控 Gmail。
**设置：** 需要具有 Gmail API 访问权限的 Google Cloud 服务账户。
**提示：** 内部使用 `gog gmail watch serve`。需要启用了 Gmail API 和配置了 Pub/Sub 的 Google Cloud 项目。

---

<div id="streaming-live-broadcasting">

## 流媒体（直播）

</div>

<div id="enable-streaming-streaming-base">

### 启用流媒体（streaming-base）

</div>

为界面添加 Stream 标签页，支持 RTMP 目标管理。
**无需配置** — 只需启用插件。然后添加下面的目标插件。

<div id="twitch-streaming">

### Twitch 直播

</div>

**获取凭证：** https://dashboard.twitch.tv → 设置 → 直播
**变量：** `TWITCH_STREAM_KEY` — 你的直播密钥（请保密！）
**提示：** 永远不要分享你的直播密钥——它允许任何人在你的频道上直播。如果泄露请立即重新生成。

<div id="youtube-streaming">

### YouTube 直播

</div>

**获取凭证：** https://studio.youtube.com → 开始直播 → 直播设置
**变量：**
- `YOUTUBE_STREAM_KEY` — 来自 YouTube Studio → 直播密钥
- `YOUTUBE_RTMP_URL` — 默认：`rtmp://a.rtmp.youtube.com/live2`（通常无需更改）
**提示：** 你需要一个启用了直播功能的 YouTube 频道（可能需要手机验证）。

<div id="x-streaming">

### X 直播

</div>

使用为活跃直播生成的 RTMP 凭证在 X 上直播。
**获取凭证：** 创建直播时从 X Live Producer / Media Studio 获取
**变量：**
- `X_STREAM_KEY` — 直播的直播密钥
- `X_RTMP_URL` — 直播会话的 RTMP 推流 URL
**提示：** X 的 RTMP 凭证通常是按次直播生成的。先创建直播，然后将两个值直接复制到插件中。

<div id="pumpfun-streaming">

### pump.fun 直播

</div>

使用平台的 RTMP 推流凭证在 pump.fun 上直播。
**获取凭证：** 创建直播时从 pump.fun 直播流程中获取
**变量：**
- `PUMPFUN_STREAM_KEY` — pump.fun 推流的直播密钥
- `PUMPFUN_RTMP_URL` — 当前直播的 RTMP 推流 URL
**提示：** 将两个值都视为会话凭证。如果直播无法启动，请重新创建直播并粘贴新的值。

<div id="custom-rtmp">

### Custom RTMP

</div>

向任何平台直播（Facebook、TikTok、Kick、自托管 RTMP 等）
**变量：**
- `CUSTOM_RTMP_URL` — RTMP 端点 URL，例如 `rtmp://live.kick.com/app`
- `CUSTOM_RTMP_KEY` — 来自平台的直播密钥
**常用 RTMP URL：**
- Facebook Live：`rtmps://live-api-s.facebook.com:443/rtmp/`
- TikTok：`rtmp://push.tiktokcdn.com/third/`（需要 TikTok Live 访问权限）
- Kick：`rtmp://ingest.global-contribute.live-video.net/app`

---

<div id="general-tips">

## 通用提示

</div>

**必填 vs 可选：** 每个插件都有最低必填字段。先只配置这些——你可以之后再添加可选设置。

**上线前测试：** 大多数连接器都有"试运行"模式（例如 `TWITTER_DRY_RUN=true`、`FARCASTER_DRY_RUN=true`、`BLUESKY_DRY_RUN=true`）——用此模式验证设置而不实际发布。

**策略字段：** 大多数连接器都有 `DM_POLICY` 和 `GROUP_POLICY` 字段：
- `allow-all` — 回复所有人
- `allow-from` — 仅回复 `ALLOW_FROM` 列表中的账户
- `deny-all` — 永不回复（实际上禁用了该频道类型）

**Webhook vs 轮询：** 像 LINE、Twilio、WhatsApp Cloud API 和 Google Chat 这样的连接器使用 webhook（它们将消息推送到你的服务器）。你需要一个可公开访问的 URL。本地开发时使用 ngrok：`ngrok http 3000`。

**速率限制：** 大多数平台都有速率限制。特别是对于 Twitter，请使用保守的发布间隔（最少 90-180 分钟）。
