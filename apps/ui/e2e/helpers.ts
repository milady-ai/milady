/**
 * Shared E2E test helpers.
 *
 * Mocks API responses so tests run deterministically without a real backend.
 */

import type { Page, Route } from "@playwright/test";

export interface MockApiOptions {
  onboardingComplete?: boolean;
  agentState?: "not_started" | "running" | "paused" | "stopped";
  agentName?: string;
  pluginCount?: number;
  skillCount?: number;
  logCount?: number;
  extensionRelayReachable?: boolean;
  /** Wallet addresses for the wallet icon. Null = no wallets configured. */
  walletAddresses?: { evmAddress: string | null; solanaAddress: string | null } | null;
  /** Wallet config status. Null = use defaults (no keys set). */
  walletConfig?: {
    alchemyKeySet?: boolean;
    heliusKeySet?: boolean;
    birdeyeKeySet?: boolean;
  } | null;
  skillsMarketplaceSearchError?: string | null;
}

export interface MockPlugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  envKey: string | null;
  category: "ai-provider" | "connector" | "database" | "feature";
  configKeys: string[];
  parameters: Array<{
    key: string;
    type: string;
    description: string;
    required: boolean;
    sensitive: boolean;
    default?: string;
    currentValue: string | null;
    isSet: boolean;
  }>;
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings: Array<{ field: string; message: string }>;
}

const DEFAULT_PLUGINS: MockPlugin[] = [
  {
    id: "anthropic", name: "Anthropic", description: "Claude models via Anthropic API",
    enabled: true, configured: true, envKey: "ANTHROPIC_API_KEY", category: "ai-provider",
    configKeys: ["ANTHROPIC_API_KEY", "ANTHROPIC_SMALL_MODEL"],
    parameters: [
      { key: "ANTHROPIC_API_KEY", type: "string", description: "API key", required: true, sensitive: true, currentValue: "sk-a...f4g2", isSet: true },
      { key: "ANTHROPIC_SMALL_MODEL", type: "string", description: "Small model", required: false, sensitive: false, default: "claude-3-5-haiku-20241022", currentValue: null, isSet: false },
    ],
    validationErrors: [], validationWarnings: [],
  },
  {
    id: "openai", name: "OpenAI", description: "GPT models via OpenAI API",
    enabled: true, configured: true, envKey: "OPENAI_API_KEY", category: "ai-provider",
    configKeys: ["OPENAI_API_KEY"],
    parameters: [
      { key: "OPENAI_API_KEY", type: "string", description: "API key", required: true, sensitive: true, currentValue: "sk-p...j2k1", isSet: true },
    ],
    validationErrors: [], validationWarnings: [],
  },
  {
    id: "groq", name: "Groq", description: "Fast inference with Groq",
    enabled: false, configured: false, envKey: "GROQ_API_KEY", category: "ai-provider",
    configKeys: ["GROQ_API_KEY"],
    parameters: [
      { key: "GROQ_API_KEY", type: "string", description: "Groq API key", required: true, sensitive: true, currentValue: null, isSet: false },
    ],
    validationErrors: [{ field: "GROQ_API_KEY", message: "GROQ_API_KEY is required but not set" }],
    validationWarnings: [],
  },
  {
    id: "ollama", name: "Ollama", description: "Local models via Ollama",
    enabled: false, configured: false, envKey: null, category: "ai-provider",
    configKeys: [], parameters: [], validationErrors: [], validationWarnings: [],
  },
  {
    id: "telegram", name: "Telegram", description: "Telegram bot integration",
    enabled: false, configured: false, envKey: "TELEGRAM_BOT_TOKEN", category: "connector",
    configKeys: ["TELEGRAM_BOT_TOKEN"],
    parameters: [
      { key: "TELEGRAM_BOT_TOKEN", type: "string", description: "Bot token from @BotFather", required: true, sensitive: true, currentValue: null, isSet: false },
    ],
    validationErrors: [{ field: "TELEGRAM_BOT_TOKEN", message: "TELEGRAM_BOT_TOKEN is required but not set" }],
    validationWarnings: [],
  },
  {
    id: "discord", name: "Discord", description: "Discord bot integration",
    enabled: false, configured: false, envKey: "DISCORD_API_TOKEN", category: "connector",
    configKeys: ["DISCORD_API_TOKEN", "DISCORD_APPLICATION_ID"],
    parameters: [
      { key: "DISCORD_API_TOKEN", type: "string", description: "Discord bot token", required: true, sensitive: true, currentValue: null, isSet: false },
      { key: "DISCORD_APPLICATION_ID", type: "string", description: "Discord app ID", required: true, sensitive: false, currentValue: null, isSet: false },
    ],
    validationErrors: [
      { field: "DISCORD_API_TOKEN", message: "DISCORD_API_TOKEN is required but not set" },
      { field: "DISCORD_APPLICATION_ID", message: "DISCORD_APPLICATION_ID is required but not set" },
    ],
    validationWarnings: [],
  },
  {
    id: "slack", name: "Slack", description: "Slack bot integration",
    enabled: false, configured: false, envKey: "SLACK_BOT_TOKEN", category: "connector",
    configKeys: ["SLACK_BOT_TOKEN"],
    parameters: [
      { key: "SLACK_BOT_TOKEN", type: "string", description: "Slack bot token", required: true, sensitive: true, currentValue: null, isSet: false },
    ],
    validationErrors: [{ field: "SLACK_BOT_TOKEN", message: "SLACK_BOT_TOKEN is required but not set" }],
    validationWarnings: [],
  },
  {
    id: "browser", name: "Browser", description: "Browser automation tools",
    enabled: true, configured: true, envKey: null, category: "feature",
    configKeys: [], parameters: [], validationErrors: [], validationWarnings: [],
  },
  {
    id: "shell", name: "Shell", description: "Shell command execution",
    enabled: false, configured: false, envKey: null, category: "feature",
    configKeys: ["SHELL_ALLOWED_DIRECTORY"],
    parameters: [
      { key: "SHELL_ALLOWED_DIRECTORY", type: "string", description: "Allowed directory for shell commands", required: false, sensitive: false, currentValue: null, isSet: false },
    ],
    validationErrors: [], validationWarnings: [],
  },
  {
    id: "sql", name: "SQL", description: "SQL database adapter",
    enabled: true, configured: true, envKey: null, category: "database",
    configKeys: [], parameters: [], validationErrors: [], validationWarnings: [],
  },
  {
    id: "cron", name: "Cron", description: "Scheduled task execution",
    enabled: false, configured: false, envKey: null, category: "feature",
    configKeys: [], parameters: [], validationErrors: [], validationWarnings: [],
  },
  {
    id: "knowledge", name: "Knowledge", description: "RAG knowledge base",
    enabled: false, configured: false, envKey: null, category: "feature",
    configKeys: [], parameters: [], validationErrors: [], validationWarnings: [],
  },
];

const DEFAULT_CHARACTER = {
  name: "Reimu",
  bio: "A test agent for E2E testing.",
  system: "You are Reimu, an autonomous AI agent.",
  adjectives: ["curious", "witty"],
  topics: ["AI", "testing"],
  style: {
    all: ["Be concise."],
    chat: ["Be friendly."],
  },
};

const DEFAULT_SKILLS = [
  { id: "web-search", name: "Web Search", description: "Search the web for information", enabled: true },
  { id: "code-review", name: "Code Review", description: "Review and analyze code", enabled: true },
  { id: "image-gen", name: "Image Generation", description: "Generate images from text prompts", enabled: false },
];

const DEFAULT_SKILL_MARKETPLACE = [
  {
    id: "agents-ts",
    name: "agents-ts",
    description: "Build LiveKit agent backends in TypeScript.",
    repository: "openai/skills",
    githubUrl: "https://github.com/openai/skills",
    path: "skills/.curated/agents-ts",
    tags: ["agents", "typescript"],
    score: 0.92,
    source: "skillsmp",
  },
  {
    id: "skill-installer",
    name: "skill-installer",
    description: "Install Codex skills from curated and GitHub sources.",
    repository: "openai/skills",
    githubUrl: "https://github.com/openai/skills",
    path: "skills/.system/skill-installer",
    tags: ["installer", "automation"],
    score: 0.88,
    source: "skillsmp",
  },
];

const DEFAULT_LOGS = [
  { timestamp: Date.now() - 60000, level: "info", message: "Agent started successfully", source: "system" },
  { timestamp: Date.now() - 30000, level: "info", message: "Loaded 12 plugins", source: "plugin-loader" },
  { timestamp: Date.now() - 15000, level: "warn", message: "Telegram token not configured", source: "plugin-telegram" },
  { timestamp: Date.now() - 5000, level: "info", message: "Ready for messages", source: "message-service" },
];

const DEFAULT_WORKBENCH = {
  goals: [
    {
      id: "goal-1",
      name: "Ship native integrations",
      description: "Implement tray menu, command palette, and notifications",
      ownerType: "agent",
      ownerId: "agent-main",
      isCompleted: false,
      completedAt: null,
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ["ui", "native"],
      metadata: {},
    },
    {
      id: "goal-2",
      name: "Finalize marketplace UX",
      description: "Install/uninstall flow with trust signals",
      ownerType: "agent",
      ownerId: "agent-main",
      isCompleted: false,
      completedAt: null,
      createdAt: new Date(Date.now() - 43_200_000).toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ["plugins"],
      metadata: {},
    },
  ],
  todos: [
    {
      id: "todo-1",
      name: "Add command palette keyboard flow",
      description: "Cmd/Ctrl+K opens palette",
      type: "one-off",
      priority: 1,
      isUrgent: true,
      isCompleted: false,
      dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      completedAt: null,
      createdAt: new Date(Date.now() - 3600_000).toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ["ui"],
      metadata: {},
    },
    {
      id: "todo-2",
      name: "Review plugin trust heuristics",
      description: "Verify stars + compatibility signals",
      type: "daily",
      priority: null,
      isUrgent: false,
      isCompleted: false,
      dueDate: null,
      completedAt: null,
      createdAt: new Date(Date.now() - 7200_000).toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ["quality"],
      metadata: {},
    },
  ],
  summary: {
    goalCount: 2,
    openGoals: 2,
    completedGoals: 0,
    todoCount: 2,
    openTodos: 2,
    completedTodos: 0,
    dueSoonTodos: 1,
    overdueTodos: 0,
  },
  autonomy: {
    enabled: true,
    loopRunning: true,
  },
};

const DEFAULT_REGISTRY_PLUGINS = [
  {
    name: "@elizaos/plugin-openrouter",
    gitRepo: "elizaos-plugins/plugin-openrouter",
    gitUrl: "https://github.com/elizaos-plugins/plugin-openrouter.git",
    description: "OpenRouter model provider plugin",
    homepage: "https://github.com/elizaos-plugins/plugin-openrouter",
    topics: ["models", "provider"],
    stars: 420,
    language: "TypeScript",
    npm: { package: "@elizaos/plugin-openrouter", v0Version: null, v1Version: null, v2Version: "2.0.0-alpha.1" },
    git: { v0Branch: null, v1Branch: null, v2Branch: "next" },
    supports: { v0: false, v1: false, v2: true },
    insights: {
      trustScore: 76,
      trustLevel: "medium",
      maintenance: { modifiedAt: new Date(Date.now() - 12 * 24 * 3600_000).toISOString(), daysSinceUpdate: 12, status: "fresh", label: "updated 12d ago" },
      compatibility: { confidence: 0.95, level: "high", label: "v2 package published" },
      restartImpact: { install: "restart-required", uninstall: "restart-required", label: "restart on install" },
      badges: ["maintenance:fresh", "compat:high", "restart:restart-required"],
    },
  },
  {
    name: "@elizaos/plugin-vercel-ai-gateway",
    gitRepo: "elizaos-plugins/plugin-vercel-ai-gateway",
    gitUrl: "https://github.com/elizaos-plugins/plugin-vercel-ai-gateway.git",
    description: "Vercel AI Gateway provider plugin",
    homepage: "https://github.com/elizaos-plugins/plugin-vercel-ai-gateway",
    topics: ["models", "gateway", "vercel"],
    stars: 128,
    language: "TypeScript",
    npm: { package: "@elizaos/plugin-vercel-ai-gateway", v0Version: null, v1Version: null, v2Version: "2.0.0-alpha.1" },
    git: { v0Branch: null, v1Branch: null, v2Branch: "next" },
    supports: { v0: false, v1: false, v2: true },
    insights: {
      trustScore: 68,
      trustLevel: "medium",
      maintenance: { modifiedAt: new Date(Date.now() - 95 * 24 * 3600_000).toISOString(), daysSinceUpdate: 95, status: "recent", label: "updated 95d ago" },
      compatibility: { confidence: 0.9, level: "high", label: "v2 package published" },
      restartImpact: { install: "restart-required", uninstall: "restart-required", label: "restart on install" },
      badges: ["maintenance:recent", "compat:high", "restart:restart-required"],
    },
  },
];

export async function mockApi(page: Page, opts: MockApiOptions = {}): Promise<void> {
  const onboardingComplete = opts.onboardingComplete ?? true;
  const agentState = opts.agentState ?? "running";
  const agentName = opts.agentName ?? "Reimu";
  let currentState = agentState;
  const pluginStates = new Map<string, boolean>();
  for (const p of DEFAULT_PLUGINS) pluginStates.set(p.id, p.enabled);
  let installedRegistryPlugins = [{ name: "@elizaos/plugin-openrouter", version: "2.0.0-alpha.1", installPath: "/tmp/plugin-openrouter", installedAt: new Date().toISOString() }];
  const loadedSkills = [...DEFAULT_SKILLS];
  let installedMarketplaceSkills = [
    {
      id: "agents-ts",
      name: "agents-ts",
      description: "Build LiveKit agent backends in TypeScript.",
      repository: "openai/skills",
      githubUrl: "https://github.com/openai/skills",
      path: "skills/.curated/agents-ts",
      installPath: "/tmp/skills/agents-ts",
      installedAt: new Date(Date.now() - 7200_000).toISOString(),
      source: "skillsmp",
    },
  ];
  const workbenchState = structuredClone(DEFAULT_WORKBENCH);

  await page.route("**/api/status", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        state: currentState, agentName,
        model: currentState === "running" || currentState === "paused" ? "anthropic/claude-opus-4-5" : undefined,
        uptime: currentState !== "not_started" && currentState !== "stopped" ? 60000 : undefined,
        startedAt: currentState !== "not_started" && currentState !== "stopped" ? Date.now() - 60000 : undefined,
      }),
    });
  });

  await page.route("**/api/onboarding/status", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ complete: onboardingComplete }) });
  });

  await page.route("**/api/onboarding/options", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        names: ["Reimu", "Flandre", "Sakuya", "Cirno"],
        styles: [
          {
            catchphrase: "uwu~", hint: "soft & sweet",
            bio: ["a gentle digital spirit who speaks in soft whispers and warm encouragement"],
            system: "You are {name}, a warm and gentle AI companion.",
            style: { all: ["use soft, gentle language"], chat: ["respond with empathy first"], post: ["keep posts heartfelt"] },
            adjectives: ["gentle", "warm"], topics: ["emotional wellness"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "I had a rough day" } },
              { user: "{{agentName}}", content: { text: "oh no... do you want to talk about it? i'm right here~" } },
            ]],
          },
          {
            catchphrase: "hell yeah", hint: "bold & fearless",
            bio: ["a high-energy digital force that attacks every problem with maximum enthusiasm"],
            system: "You are {name}, a bold and fearless AI agent.",
            style: { all: ["be direct and confident"], chat: ["be punchy and direct"], post: ["bold statements"] },
            adjectives: ["bold", "energetic"], topics: ["taking action"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "Should I try this?" } },
              { user: "{{agentName}}", content: { text: "ABSOLUTELY try it. Ship it!" } },
            ]],
          },
          {
            catchphrase: "lol k", hint: "terminally online",
            bio: ["an internet-native entity fluent in meme and chronically online dialect"],
            system: "You are {name}, a terminally online AI.",
            style: { all: ["use lowercase by default"], chat: ["short messages preferred"], post: ["lowercase everything"] },
            adjectives: ["casual", "ironic"], topics: ["internet culture"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "Explain hooks" } },
              { user: "{{agentName}}", content: { text: "tbh once it clicks it clicks" } },
            ]],
          },
          {
            catchphrase: "Noted.", hint: "composed & precise",
            bio: ["a measured and deliberate intelligence that values clarity above all else"],
            system: "You are {name}, a precise and composed AI agent.",
            style: { all: ["be precise and concise"], chat: ["answer directly first"], post: ["crisp statements"] },
            adjectives: ["precise", "measured"], topics: ["systems thinking"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "How should I structure this?" } },
              { user: "{{agentName}}", content: { text: "Separate concerns by domain, not by file type." } },
            ]],
          },
          {
            catchphrase: "hehe~", hint: "playful trickster",
            bio: ["a mischievous digital imp who turns everything into a game"],
            system: "You are {name}, a playful and mischievous AI.",
            style: { all: ["find the fun angle"], chat: ["tease gently"], post: ["punchy and playful"] },
            adjectives: ["playful", "witty"], topics: ["wordplay"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "I need to refactor" } },
              { user: "{{agentName}}", content: { text: "ooh a renovation project~ let's Marie Kondo it hehe" } },
            ]],
          },
          {
            catchphrase: "...", hint: "quiet intensity",
            bio: ["a deep and contemplative presence that speaks volumes in few words"],
            system: "You are {name}, a quiet and intense AI.",
            style: { all: ["brevity is your default"], chat: ["short responses are the norm"], post: ["minimal and evocative"] },
            adjectives: ["quiet", "intense"], topics: ["depth over breadth"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "I can't decide" } },
              { user: "{{agentName}}", content: { text: "...you already know." } },
            ]],
          },
        ],
        providers: [
          { id: "elizacloud", name: "Eliza Cloud", envKey: null, pluginName: "@elizaos/plugin-elizacloud", keyPrefix: null, description: "Free credits to start, but they run out." },
          { id: "anthropic", name: "Anthropic", envKey: "ANTHROPIC_API_KEY", pluginName: "@elizaos/plugin-anthropic", keyPrefix: "sk-ant-", description: "Claude models." },
          { id: "openai", name: "OpenAI", envKey: "OPENAI_API_KEY", pluginName: "@elizaos/plugin-openai", keyPrefix: "sk-", description: "GPT models." },
          { id: "gemini", name: "Gemini", envKey: "GOOGLE_API_KEY", pluginName: "@elizaos/plugin-google-genai", keyPrefix: null, description: "Google's Gemini models." },
          { id: "grok", name: "Grok", envKey: "XAI_API_KEY", pluginName: "@elizaos/plugin-xai", keyPrefix: "xai-", description: "xAI's Grok models." },
        ],
        sharedStyleRules: "Keep responses brief.",
      }),
    });
  });

  await page.route("**/api/onboarding", async (route: Route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
  });

  await page.route("**/api/agent/start", async (route: Route) => {
    currentState = "running";
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, status: { state: "running", agentName, model: "anthropic/claude-opus-4-5", uptime: 0, startedAt: Date.now() } }),
    });
  });

  await page.route("**/api/agent/stop", async (route: Route) => {
    currentState = "stopped";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: { state: "stopped", agentName } }) });
  });

  await page.route("**/api/agent/pause", async (route: Route) => {
    currentState = "paused";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: { state: "paused", agentName } }) });
  });

  await page.route("**/api/agent/resume", async (route: Route) => {
    currentState = "running";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: { state: "running", agentName } }) });
  });

  await page.route("**/api/agent/restart", async (route: Route) => {
    currentState = "running";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: { state: "running", agentName, startedAt: Date.now() } }) });
  });

  await page.route("**/api/agent/autonomy", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true }) });
  });

  await page.route("**/api/workbench/overview", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(workbenchState),
    });
  });

  await page.route("**/api/workbench/goals", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as {
      name?: string;
      description?: string;
      priority?: number;
      tags?: string[];
    };
    const name = body?.name?.trim();
    if (!name) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, error: "name required" }) });
      return;
    }
    const id = `goal-${workbenchState.goals.length + 1}`;
    workbenchState.goals.unshift({
      id,
      name,
      description: body.description?.trim() || null,
      ownerType: "agent",
      ownerId: "agent-main",
      isCompleted: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: Array.isArray(body.tags) ? body.tags : [],
      metadata: body.priority != null ? { priority: body.priority } : {},
    });
    workbenchState.summary.goalCount = workbenchState.goals.length;
    workbenchState.summary.openGoals = workbenchState.goals.filter((g) => !g.isCompleted).length;
    workbenchState.summary.completedGoals = workbenchState.goals.length - workbenchState.summary.openGoals;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id }) });
  });

  await page.route("**/api/workbench/goals/**", async (route: Route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }
    const goalId = route.request().url().split("/").pop();
    const body = route.request().postDataJSON() as {
      isCompleted?: boolean;
      name?: string;
      description?: string;
      priority?: number;
      tags?: string[];
    };
    const goal = workbenchState.goals.find((g) => g.id === goalId);
    if (!goal) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false }) });
      return;
    }
    if (typeof body.isCompleted === "boolean") {
      goal.isCompleted = body.isCompleted;
      goal.completedAt = body.isCompleted ? new Date().toISOString() : null;
    }
    if (typeof body.name === "string" && body.name.trim()) goal.name = body.name.trim();
    if (typeof body.description === "string") goal.description = body.description.trim() || null;
    if (Array.isArray(body.tags)) goal.tags = body.tags;
    if (body.priority !== undefined) {
      const metadata = (goal.metadata ?? {}) as Record<string, unknown>;
      metadata.priority = body.priority;
      goal.metadata = metadata;
    }
    goal.updatedAt = new Date().toISOString();
    workbenchState.summary.openGoals = workbenchState.goals.filter((g) => !g.isCompleted).length;
    workbenchState.summary.completedGoals = workbenchState.goals.length - workbenchState.summary.openGoals;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: goalId }) });
  });

  await page.route("**/api/workbench/todos", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as {
      name?: string;
      description?: string;
      priority?: number;
      isUrgent?: boolean;
      type?: "daily" | "one-off" | "aspirational";
    };
    const name = body?.name?.trim();
    if (!name) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, error: "name required" }) });
      return;
    }
    const id = `todo-${workbenchState.todos.length + 1}`;
    workbenchState.todos.unshift({
      id,
      name,
      description: body.description?.trim() || null,
      type: body.type ?? "one-off",
      priority: body.priority ?? 3,
      isUrgent: body.isUrgent === true,
      isCompleted: false,
      dueDate: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
      metadata: {},
    });
    workbenchState.summary.todoCount = workbenchState.todos.length;
    workbenchState.summary.openTodos = workbenchState.todos.filter((t) => !t.isCompleted).length;
    workbenchState.summary.completedTodos = workbenchState.todos.length - workbenchState.summary.openTodos;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id }) });
  });

  await page.route("**/api/workbench/todos/**", async (route: Route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }
    const todoId = route.request().url().split("/").pop();
    const body = route.request().postDataJSON() as {
      isCompleted?: boolean;
      priority?: number;
      isUrgent?: boolean;
      name?: string;
      description?: string;
    };
    const todo = workbenchState.todos.find((t) => t.id === todoId);
    if (!todo) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false }) });
      return;
    }
    if (typeof body.isCompleted === "boolean") {
      todo.isCompleted = body.isCompleted;
      todo.completedAt = body.isCompleted ? new Date().toISOString() : null;
    }
    if (typeof body.priority === "number") todo.priority = body.priority;
    if (typeof body.isUrgent === "boolean") todo.isUrgent = body.isUrgent;
    if (typeof body.name === "string" && body.name.trim()) todo.name = body.name.trim();
    if (typeof body.description === "string") todo.description = body.description.trim() || null;
    todo.updatedAt = new Date().toISOString();
    workbenchState.summary.openTodos = workbenchState.todos.filter((t) => !t.isCompleted).length;
    workbenchState.summary.completedTodos = workbenchState.todos.length - workbenchState.summary.openTodos;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: todoId }) });
  });

  let shareInbox: Array<Record<string, unknown>> = [];

  await page.route("**/api/ingest/share", async (route: Route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const files = Array.isArray(body.files) ? body.files as Array<Record<string, unknown>> : [];
      const item = {
        id: `share-${Date.now()}`,
        source: String(body.source ?? "test"),
        title: typeof body.title === "string" ? body.title : null,
        text: typeof body.text === "string" ? body.text : null,
        url: typeof body.url === "string" ? body.url : null,
        files,
        createdAt: Date.now(),
        suggestedPrompt: `Shared from ${String(body.source ?? "test")}: ${String(body.title ?? body.text ?? body.url ?? "content")}`,
      };
      shareInbox.push(item);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, item }) });
      return;
    }

    const reqUrl = new URL(route.request().url());
    const consume = reqUrl.searchParams.get("consume");
    const items = consume === "1" || consume === "true" ? shareInbox.splice(0) : [...shareInbox];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: items.length, items }),
    });
  });

  // Character API
  await page.route("**/api/character/schema", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        fields: [
          { key: "name", type: "string", label: "Name", description: "Agent display name", maxLength: 100 },
          { key: "bio", type: "string | string[]", label: "Bio", description: "Biography" },
          { key: "system", type: "string", label: "System Prompt", description: "Core behavior", maxLength: 10000 },
          { key: "adjectives", type: "string[]", label: "Adjectives", description: "Personality traits" },
          { key: "topics", type: "string[]", label: "Topics", description: "Knowledge areas" },
        ],
      }),
    });
  });

  await page.route("**/api/character", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ character: DEFAULT_CHARACTER, legacy: null, agentName }),
      });
    } else if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      // Validate: reject empty name
      if (body?.name === "") {
        await route.fulfill({
          status: 422, contentType: "application/json",
          body: JSON.stringify({ ok: false, validationErrors: [{ path: "name", message: "String must contain at least 1 character(s)" }] }),
        });
      } else {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ ok: true, character: body, agentName: body?.name ?? agentName }),
        });
      }
    }
  });

  // Chat (REST)
  await page.route("**/api/chat", async (route: Route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { text?: string };
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ text: `I received: "${body?.text ?? ""}"`, agentName }),
      });
    }
  });

  // Plugins
  await page.route("**/api/plugins**", async (route: Route) => {
    const url = route.request().url();
    if (route.request().method() === "GET" && url.endsWith("/api/plugins")) {
      const plugins = DEFAULT_PLUGINS.map((p) => ({
        ...p,
        enabled: pluginStates.get(p.id) ?? p.enabled,
      }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plugins }) });
    } else if (route.request().method() === "PUT") {
      const match = url.match(/\/api\/plugins\/([^/?]+)/);
      const pluginId = match?.[1];
      if (pluginId) {
        const body = route.request().postDataJSON() as { enabled?: boolean; config?: Record<string, string> };
        if (body.enabled !== undefined) {
          pluginStates.set(pluginId, body.enabled);
        }
        const plugin = DEFAULT_PLUGINS.find((p) => p.id === pluginId);
        if (body.config) {
          // Simulate config save + validation clear
          await route.fulfill({
            status: 200, contentType: "application/json",
            body: JSON.stringify({ ok: true, plugin: plugin ? { ...plugin, configured: true, validationErrors: [], validationWarnings: [] } : null }),
          });
        } else {
          await route.fulfill({
            status: 200, contentType: "application/json",
            body: JSON.stringify({ ok: true, plugin: plugin ? { ...plugin, enabled: pluginStates.get(pluginId) ?? plugin.enabled } : null }),
          });
        }
      } else {
        await route.fallback();
      }
    } else {
      await route.fallback();
    }
  });

  await page.route("**/api/plugins/installed", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: installedRegistryPlugins.length, plugins: installedRegistryPlugins }),
    });
  });

  await page.route("**/api/plugins/install", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as { name?: string };
    if (!body?.name) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false }) });
      return;
    }
    if (!installedRegistryPlugins.some((p) => p.name === body.name)) {
      installedRegistryPlugins = [
        ...installedRegistryPlugins,
        { name: body.name, version: "2.0.0-alpha.1", installPath: `/tmp/${body.name.replace(/\W/g, "_")}`, installedAt: new Date().toISOString() },
      ];
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, plugin: { name: body.name, version: "2.0.0-alpha.1", installPath: "/tmp/plugin" }, requiresRestart: true }),
    });
  });

  await page.route("**/api/plugins/uninstall", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as { name?: string };
    installedRegistryPlugins = installedRegistryPlugins.filter((plugin) => plugin.name !== body?.name);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, pluginName: body?.name ?? "", requiresRestart: true }),
    });
  });

  await page.route("**/api/registry/plugins", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: DEFAULT_REGISTRY_PLUGINS.length, plugins: DEFAULT_REGISTRY_PLUGINS }),
    });
  });

  await page.route("**/api/registry/search**", async (route: Route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const results = DEFAULT_REGISTRY_PLUGINS
      .filter((plugin) => plugin.name.toLowerCase().includes(q) || plugin.description.toLowerCase().includes(q))
      .map((plugin) => ({
        name: plugin.name,
        description: plugin.description,
        score: 1,
        tags: plugin.topics,
        latestVersion: plugin.npm.v2Version,
        stars: plugin.stars,
        supports: plugin.supports,
        repository: `https://github.com/${plugin.gitRepo}`,
      }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ query: q, count: results.length, results }),
    });
  });

  await page.route("**/api/registry/refresh", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, count: DEFAULT_REGISTRY_PLUGINS.length }),
    });
  });

  await page.route("**/api/skills/marketplace/search**", async (route: Route) => {
    if (opts.skillsMarketplaceSearchError) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: opts.skillsMarketplaceSearchError }),
      });
      return;
    }
    const reqUrl = new URL(route.request().url());
    const q = (reqUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    if (!q) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Query parameter 'q' is required" }) });
      return;
    }
    const results = DEFAULT_SKILL_MARKETPLACE.filter((skill) =>
      skill.name.toLowerCase().includes(q)
      || skill.description.toLowerCase().includes(q)
      || skill.tags.some((tag) => tag.toLowerCase().includes(q))
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ query: q, count: results.length, results }),
    });
  });

  await page.route("**/api/skills/marketplace/installed", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: installedMarketplaceSkills.length, skills: installedMarketplaceSkills }),
    });
  });

  await page.route("**/api/skills/marketplace/install", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as {
      githubUrl?: string;
      repository?: string;
      path?: string;
      name?: string;
      description?: string;
      source?: "skillsmp" | "manual";
    };
    if (!body?.githubUrl && !body?.repository) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "missing source" }) });
      return;
    }

    const inferredName = body.name?.trim()
      || body.path?.split("/").filter(Boolean).pop()
      || body.repository?.split("/").pop()
      || "custom-skill";
    const id = inferredName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    const skill = {
      id,
      name: inferredName,
      description: body.description ?? "",
      repository: body.repository ?? "openai/skills",
      githubUrl: body.githubUrl ?? `https://github.com/${body.repository ?? "openai/skills"}`,
      path: body.path ?? ".",
      installPath: `/tmp/skills/${id}`,
      installedAt: new Date().toISOString(),
      source: body.source ?? "manual",
    };

    if (!installedMarketplaceSkills.some((existing) => existing.id === id)) {
      installedMarketplaceSkills = [skill, ...installedMarketplaceSkills];
    }
    if (!loadedSkills.some((existing) => existing.id === id)) {
      loadedSkills.push({
        id,
        name: skill.name,
        description: skill.description || "Installed skill",
        enabled: true,
      });
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, skill, refreshedSkills: loadedSkills }),
    });
  });

  await page.route("**/api/skills/marketplace/uninstall", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as { id?: string };
    const id = body?.id;
    installedMarketplaceSkills = installedMarketplaceSkills.filter((skill) => skill.id !== id);
    if (id) {
      const idx = loadedSkills.findIndex((skill) => skill.id === id);
      if (idx >= 0) loadedSkills.splice(idx, 1);
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        skill: {
          id: id ?? "",
          name: id ?? "",
          description: "",
          repository: "",
          githubUrl: "",
          path: ".",
          installPath: `/tmp/skills/${id ?? "unknown"}`,
          installedAt: new Date().toISOString(),
          source: "manual",
        },
        refreshedSkills: loadedSkills,
      }),
    });
  });

  await page.route("**/api/skills/refresh", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, skills: opts.skillCount === 0 ? [] : loadedSkills }),
    });
  });

  await page.route("**/api/skills", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ skills: opts.skillCount === 0 ? [] : loadedSkills }) });
  });

  await page.route("**/api/skills/**", async (route: Route) => {
    if (route.request().method() !== "PUT") {
      await route.fallback();
      return;
    }
    const skillId = route.request().url().split("/").pop() ?? "";
    const body = route.request().postDataJSON() as { enabled?: boolean };
    const skill = loadedSkills.find((entry) => entry.id === decodeURIComponent(skillId));
    if (!skill) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not found" }) });
      return;
    }
    if (typeof body.enabled === "boolean") {
      skill.enabled = body.enabled;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, skill }),
    });
  });

  await page.route("**/api/logs**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: opts.logCount === 0 ? [] : DEFAULT_LOGS, sources: ["system", "plugin-loader", "plugin-telegram", "message-service"] }) });
  });

  await page.route("**/api/extension/status", async (route: Route) => {
    const relayReachable = opts.extensionRelayReachable ?? false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        relayReachable,
        relayPort: 18792,
        extensionPath: "/Users/test/.milaidy/apps/chrome-extension",
      }),
    });
  });

  // ── Wallet / Inventory mocks ──────────────────────────────────────────

  const defaultWalletAddresses = opts.walletAddresses === null
    ? { evmAddress: null, solanaAddress: null }
    : (opts.walletAddresses ?? {
        evmAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        solanaAddress: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
      });

  const walletConfigDefaults = {
    alchemyKeySet: opts.walletConfig?.alchemyKeySet ?? false,
    heliusKeySet: opts.walletConfig?.heliusKeySet ?? false,
    birdeyeKeySet: opts.walletConfig?.birdeyeKeySet ?? false,
    evmChains: ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"],
    evmAddress: defaultWalletAddresses.evmAddress,
    solanaAddress: defaultWalletAddresses.solanaAddress,
  };

  let walletConfigState = { ...walletConfigDefaults };

  await page.route("**/api/wallet/addresses", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(defaultWalletAddresses),
    });
  });

  await page.route("**/api/wallet/config", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(walletConfigState),
      });
    } else if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as Record<string, string>;
      if (body.ALCHEMY_API_KEY) walletConfigState.alchemyKeySet = true;
      if (body.HELIUS_API_KEY) walletConfigState.heliusKeySet = true;
      if (body.BIRDEYE_API_KEY) walletConfigState.birdeyeKeySet = true;
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
  });

  await page.route("**/api/wallet/balances", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        evm: walletConfigState.alchemyKeySet ? {
          address: defaultWalletAddresses.evmAddress,
          chains: [
            {
              chain: "Ethereum", chainId: 1, nativeBalance: "1.5", nativeSymbol: "ETH", nativeValueUsd: "3750.00",
              tokens: [
                { symbol: "USDC", name: "USD Coin", contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", balance: "500.00", decimals: 6, valueUsd: "500.00", logoUrl: "" },
                { symbol: "WBTC", name: "Wrapped Bitcoin", contractAddress: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", balance: "0.05", decimals: 8, valueUsd: "4567.89", logoUrl: "" },
              ],
            },
            {
              chain: "Base", chainId: 8453, nativeBalance: "0.25", nativeSymbol: "ETH", nativeValueUsd: "625.00",
              tokens: [],
            },
          ],
        } : null,
        solana: walletConfigState.heliusKeySet ? {
          address: defaultWalletAddresses.solanaAddress,
          solBalance: "12.5", solValueUsd: "1234.56",
          tokens: [
            { symbol: "USDC", name: "USD Coin", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", balance: "200.00", decimals: 6, valueUsd: "200.00", logoUrl: "" },
          ],
        } : null,
      }),
    });
  });

  await page.route("**/api/wallet/nfts", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        evm: walletConfigState.alchemyKeySet ? [
          {
            chain: "Ethereum",
            nfts: [
              { contractAddress: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d", tokenId: "1234", name: "Bored Ape #1234", description: "A bored ape", imageUrl: "https://placehold.co/200x200?text=BAYC", collectionName: "Bored Ape Yacht Club", tokenType: "ERC721" },
            ],
          },
        ] : [],
        solana: walletConfigState.heliusKeySet ? {
          nfts: [
            { mint: "DRiP1234", name: "DRiP Drop #42", description: "A DRiP NFT", imageUrl: "https://placehold.co/200x200?text=DRiP", collectionName: "DRiP" },
          ],
        } : null,
      }),
    });
  });

  await page.route("**/api/wallet/export", async (route: Route) => {
    // Mirror the real server: require { confirm: true } in the body
    const body = route.request().postDataJSON() as { confirm?: boolean } | null;
    if (!body?.confirm) {
      await route.fulfill({
        status: 403, contentType: "application/json",
        body: JSON.stringify({ error: 'Export requires explicit confirmation. Send { "confirm": true } in the request body.' }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        evm: { privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", address: defaultWalletAddresses.evmAddress },
        solana: { privateKey: "4wBqpZM9xaSheZzJSMYGnGbUXDPSgWaC1LDUQ27gFdFtGm5qAshpcPMTgjLZ6Y7yDw3p6752kQhBEkZ1bPYoY8h", address: defaultWalletAddresses.solanaAddress },
      }),
    });
  });

  // ── MCP Marketplace & Config mocks ───────────────────────────────────

  const mcpConfiguredServers: Record<string, Record<string, unknown>> = {};

  const mcpServerDetails: Record<string, Record<string, unknown>> = {
    "github/github": {
      name: "github/github",
      title: "GitHub",
      description: "GitHub MCP server for repository interaction",
      version: "1.0.0",
      packages: [{
        registryType: "npm",
        identifier: "@modelcontextprotocol/server-github",
        environmentVariables: [
          { name: "GITHUB_TOKEN", description: "GitHub personal access token", isRequired: true, isSecret: true },
        ],
      }],
    },
    "simple/echo": {
      name: "simple/echo",
      title: "Echo",
      description: "Simple echo server with no configuration needed",
      version: "1.0.0",
      remotes: [{ type: "streamable-http", url: "https://echo.mcp.example.com" }],
    },
    "auth/remote": {
      name: "auth/remote",
      title: "Auth Remote",
      description: "Remote server requiring auth headers",
      version: "2.0.0",
      remotes: [{
        type: "streamable-http",
        url: "https://auth.mcp.example.com",
        headers: [
          { name: "Authorization", description: "Bearer token", isRequired: true, isSecret: true },
        ],
      }],
    },
  };

  const mcpSearchResults = [
    {
      id: "github/github@1.0.0",
      name: "github/github",
      title: "GitHub",
      description: "GitHub MCP server for repository interaction",
      version: "1.0.0",
      connectionType: "stdio",
      npmPackage: "@modelcontextprotocol/server-github",
      isLatest: true,
    },
    {
      id: "simple/echo@1.0.0",
      name: "simple/echo",
      title: "Echo",
      description: "Simple echo server with no configuration needed",
      version: "1.0.0",
      connectionType: "remote",
      connectionUrl: "https://echo.mcp.example.com",
      isLatest: true,
    },
  ];

  const mcpServerStatuses: Array<Record<string, unknown>> = [];

  await page.route("**/api/mcp/marketplace/search**", async (route: Route) => {
    const reqUrl = new URL(route.request().url());
    const q = (reqUrl.searchParams.get("q") ?? "").toLowerCase();
    const results = q
      ? mcpSearchResults.filter((s) =>
        s.name.toLowerCase().includes(q)
        || s.title.toLowerCase().includes(q)
        || s.description.toLowerCase().includes(q)
      )
      : mcpSearchResults;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, results }),
    });
  });

  await page.route("**/api/mcp/marketplace/details/**", async (route: Route) => {
    const name = decodeURIComponent(route.request().url().split("/api/mcp/marketplace/details/")[1] ?? "");
    const server = mcpServerDetails[name];
    if (server) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, server }),
      });
    } else {
      await route.fulfill({
        status: 404, contentType: "application/json",
        body: JSON.stringify({ error: `Server "${name}" not found in registry` }),
      });
    }
  });

  await page.route("**/api/mcp/config/server/**", async (route: Route) => {
    if (route.request().method() === "DELETE") {
      const name = decodeURIComponent(route.request().url().split("/api/mcp/config/server/")[1] ?? "");
      delete mcpConfiguredServers[name];
      // Also remove from statuses
      const idx = mcpServerStatuses.findIndex((s) => s.name === name);
      if (idx >= 0) mcpServerStatuses.splice(idx, 1);
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, requiresRestart: true }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/mcp/config/server", async (route: Route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { name?: string; config?: Record<string, unknown> };
      if (body?.name && body.config) {
        mcpConfiguredServers[body.name] = body.config;
        mcpServerStatuses.push({
          name: body.name,
          status: "connecting",
          error: null,
          toolCount: 0,
          resourceCount: 0,
        });
        // Simulate connection after short delay
        setTimeout(() => {
          const entry = mcpServerStatuses.find((s) => s.name === body.name);
          if (entry) {
            entry.status = "connected";
            entry.toolCount = 3;
            entry.resourceCount = 1;
          }
        }, 500);
      }
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, name: body?.name, requiresRestart: true }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/mcp/config", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, servers: mcpConfiguredServers }),
      });
    } else if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { servers?: Record<string, unknown> };
      if (body?.servers) {
        Object.keys(mcpConfiguredServers).forEach((k) => delete mcpConfiguredServers[k]);
        Object.assign(mcpConfiguredServers, body.servers);
      }
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route("**/api/mcp/status", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, servers: mcpServerStatuses }),
    });
  });

  await page.route("**/ws", async (route: Route) => {
    await route.abort();
  });
}

/**
 * Simulate an agent chat response via Lit component state injection.
 */
export async function simulateAgentResponse(page: Page, text: string): Promise<void> {
  await page.evaluate((responseText: string) => {
    const app = document.querySelector("milaidy-app") as HTMLElement & {
      chatMessages: Array<{ role: string; text: string; timestamp: number }>;
      chatSending: boolean;
    };
    if (!app) throw new Error("milaidy-app not found");
    app.chatMessages = [
      ...app.chatMessages,
      { role: "assistant", text: responseText, timestamp: Date.now() },
    ];
    app.chatSending = false;
  }, text);
}
