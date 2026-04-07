import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
// Dynamic import: plugin-agent-orchestrator is desktop-only and may be absent
// in Docker, cloud, or headless environments.
let baseModule: Record<string, unknown> = {};
try {
  baseModule = await import("@elizaos/plugin-agent-orchestrator");
} catch {
  // Package not available — orchestrator features gracefully disabled
}

type AdapterId = "claude" | "codex" | "gemini" | "aider";
type FrameworkId = AdapterId | "pi";
type SessionStatus =
  | "ready"
  | "busy"
  | "starting"
  | "authenticating"
  | "running"
  | "idle"
  | "blocked"
  | "completed"
  | "error"
  | "stopped"
  | string;

interface AdapterPreflight {
  adapter?: string;
  installed?: boolean;
  installCommand?: string;
  docsUrl?: string;
}

interface SessionSummary {
  id: string;
  name: string;
  agentType: string;
  workdir: string;
  status: SessionStatus;
  createdAt: Date;
  lastActivityAt: Date;
  metadata?: Record<string, unknown>;
}

interface WorkspaceSummary {
  id: string;
  label?: string;
  repo?: string;
  branch?: string;
  path: string;
}

interface PendingConfirmation {
  sessionId: string;
  promptText: string;
  llmDecision: {
    action?: string;
    response?: string;
  };
  taskContext: TaskSummary;
  createdAt: number;
}

interface TaskSummary {
  sessionId: string;
  agentType: string;
  label: string;
  originalTask: string;
  workdir: string;
  repo?: string;
  status: string;
  decisions: Array<{
    decision: string;
    reasoning: string;
    response?: string;
  }>;
  autoResolvedCount: number;
  registeredAt: number;
  lastActivityAt: number;
  completionSummary?: string;
}

interface CoordinatorLike {
  getAllTaskContexts?: () => TaskSummary[];
  getTaskContext?: (sessionId: string) => TaskSummary | undefined;
  getPendingConfirmations?: () => PendingConfirmation[];
  getSupervisionLevel?: () => string;
}

interface PTYServiceLike {
  defaultApprovalPreset: string;
  agentSelectionStrategy: string;
  defaultAgentType: string;
  listSessions: () => Promise<SessionSummary[]>;
  checkAvailableAgents: (types?: AdapterId[]) => Promise<AdapterPreflight[]>;
  resolveAgentType?: () => Promise<string>;
}

interface WorkspaceServiceLike {
  listWorkspaces: () => WorkspaceSummary[];
}

type RuntimeWithServices = IAgentRuntime & {
  getService: (name: string) => unknown;
};

type PatchedRouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method?: string,
) => Promise<boolean>;

type RouteHandlerFactory = (
  runtime: IAgentRuntime,
  coordinator?: unknown,
) => PatchedRouteHandler;

interface FrameworkAvailability {
  id: FrameworkId;
  label: string;
  installed: boolean;
  authReady: boolean;
  subscriptionReady: boolean;
  recommended: boolean;
  reason: string;
  installCommand?: string;
  docsUrl?: string;
}

interface PreferredFramework {
  id: FrameworkId;
  reason: string;
}

interface FrameworkState {
  configuredSubscriptionProvider?: string;
  frameworks: FrameworkAvailability[];
  preferred: PreferredFramework;
}

const basePlugin = resolveBasePlugin();
const baseProviderMap = new Map(
  (basePlugin.providers ?? []).map((provider) => [provider.name, provider]),
);
const baseActionMap = new Map(
  (basePlugin.actions ?? []).map((action) => [action.name, action]),
);

const FRAMEWORK_LABELS: Record<FrameworkId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  aider: "Aider",
  pi: "Pi",
};
const STANDARD_FRAMEWORKS: AdapterId[] = [
  "claude",
  "codex",
  "gemini",
  "aider",
];

const TASK_AGENT_COMPLEXITY_RE =
  /\b(repo|repository|code|coding|debug|fix|implement|investigate|research|analyze|analysis|summarize|summary|write|draft|document|plan|workflow|automation|parallel|delegate|subtask|agent|orchestrate|coordinate|compare|test|tests|pull request|pr\b|branch|commit)\b/i;

let frameworkStateCache:
  | {
      expiresAt: number;
      value: FrameworkState;
    }
  | undefined;

let patched = false;

function getBaseExport<T = unknown>(name: string): T | undefined {
  if (!Reflect.has(baseModule as object, name)) {
    return undefined;
  }
  return Reflect.get(baseModule as object, name) as T | undefined;
}

function resolveBasePlugin(): Plugin {
  const plugin = getBaseExport("default") ?? getBaseExport("codingAgentPlugin");
  if (!plugin || typeof plugin !== "object") {
    // Return a no-op stub when orchestrator is unavailable
    return {
      name: "agent-orchestrator-stub",
      description: "Stub: plugin-agent-orchestrator not available in this environment",
      actions: [],
      providers: [],
      services: [],
    } as unknown as Plugin;
  }
  return plugin as Plugin;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function extractOauthAccessToken(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  const direct = record.accessToken ?? record.access_token;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  for (const nested of Object.values(record)) {
    const token = extractOauthAccessToken(nested);
    if (token) return token;
  }
  return;
}

function resolveMiladyConfigPath(): string {
  const explicit =
    process.env.MILADY_CONFIG_PATH?.trim() ||
    process.env.ELIZA_CONFIG_PATH?.trim();
  if (explicit) return explicit;

  const stateDir =
    process.env.MILADY_STATE_DIR?.trim() ||
    process.env.ELIZA_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".milady");
  const namespace = process.env.ELIZA_NAMESPACE?.trim();
  const filename =
    !namespace || namespace === "milady" ? "milady.json" : `${namespace}.json`;
  return path.join(stateDir, filename);
}

function readConfiguredSubscriptionProvider(): string | undefined {
  const config = readJsonFile(resolveMiladyConfigPath());
  if (!config || typeof config !== "object" || Array.isArray(config)) return;
  const agents = (config as Record<string, unknown>).agents;
  if (!agents || typeof agents !== "object" || Array.isArray(agents)) return;
  const defaults = (agents as Record<string, unknown>).defaults;
  if (!defaults || typeof defaults !== "object" || Array.isArray(defaults))
    return;
  const provider = (defaults as Record<string, unknown>).subscriptionProvider;
  return typeof provider === "string" && provider.trim()
    ? provider.trim()
    : undefined;
}

function hasClaudeSubscriptionAuth(): boolean {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return true;

  const credentialsPath = path.join(os.homedir(), ".claude", ".credentials.json");
  const fileToken = extractOauthAccessToken(readJsonFile(credentialsPath));
  if (fileToken) return true;

  if (process.platform !== "darwin") return false;
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (!raw) return false;
    return Boolean(extractOauthAccessToken(JSON.parse(raw)));
  } catch {
    return false;
  }
}

function hasCodexSubscriptionAuth(): boolean {
  if (process.env.OPENAI_API_KEY?.trim()) return true;
  const authPath = path.join(os.homedir(), ".codex", "auth.json");
  const auth = readJsonFile(authPath);
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) return false;
  const key = (auth as Record<string, unknown>).OPENAI_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

function hasGeminiCredential(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim(),
  );
}

function hasPiBinary(): boolean {
  const command = process.platform === "win32" ? "where" : "which";
  const args = process.platform === "win32" ? ["pi.exe"] : ["pi"];
  try {
    execFileSync(command, args, {
      encoding: "utf8",
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

async function computeFrameworkState(
  runtime: IAgentRuntime,
  ptyService?: PTYServiceLike,
): Promise<FrameworkState> {
  const configuredSubscriptionProvider = readConfiguredSubscriptionProvider();
  const preflightRecords = new Map<AdapterId, AdapterPreflight>();

  if (ptyService) {
    try {
      const results = await ptyService.checkAvailableAgents([
        "claude",
        "codex",
        "gemini",
        "aider",
      ]);
      for (const result of results) {
        const adapter = result.adapter;
        if (
          adapter === "claude" ||
          adapter === "codex" ||
          adapter === "gemini" ||
          adapter === "aider"
        ) {
          preflightRecords.set(adapter, result);
        }
      }
    } catch {
      // Keep the provider/status surface alive even if preflight is temporarily unavailable.
    }
  }

  const claudeReady = hasClaudeSubscriptionAuth();
  const codexReady = hasCodexSubscriptionAuth();
  const geminiReady = hasGeminiCredential();
  const piReady = hasPiBinary();

  const providerPrefersClaude =
    configuredSubscriptionProvider === "anthropic-subscription";
  const providerPrefersCodex =
    configuredSubscriptionProvider === "openai-codex" ||
    configuredSubscriptionProvider === "openai-subscription";

  const frameworks: FrameworkAvailability[] = STANDARD_FRAMEWORKS.map((id) => {
    const preflight = preflightRecords.get(id);
    const installed = preflight?.installed === true;
    const subscriptionReady =
      id === "claude"
        ? claudeReady
        : id === "codex"
          ? codexReady
          : false;
    const authReady =
      id === "claude"
        ? claudeReady
        : id === "codex"
          ? codexReady
          : id === "gemini"
            ? geminiReady
            : claudeReady || codexReady || geminiReady;
    const reason =
      id === "claude" && subscriptionReady
        ? "ready to use the user's Claude subscription"
        : id === "codex" && subscriptionReady
          ? "ready to use the user's OpenAI subscription"
          : installed
            ? authReady
              ? "installed with credentials available"
              : "installed but credentials were not detected"
            : "CLI not detected";
    return {
      id,
      label: FRAMEWORK_LABELS[id],
      installed,
      authReady,
      subscriptionReady,
      recommended: false,
      reason,
      installCommand: preflight?.installCommand,
      docsUrl: preflight?.docsUrl,
    };
  });

  frameworks.push({
    id: "pi",
    label: FRAMEWORK_LABELS.pi,
    installed: piReady,
    authReady: piReady,
    subscriptionReady: false,
    recommended: false,
    reason: piReady ? "CLI detected" : "CLI not detected",
  });

  const explicitDefault =
    (runtime.getSetting("PARALLAX_DEFAULT_AGENT_TYPE") as string | undefined)
      ?.trim()
      .toLowerCase() ?? "";
  let preferred: PreferredFramework | undefined;

  const byId = new Map(frameworks.map((framework) => [framework.id, framework]));
  if (
    (explicitDefault === "claude" ||
      explicitDefault === "codex" ||
      explicitDefault === "gemini" ||
      explicitDefault === "aider" ||
      explicitDefault === "pi") &&
    byId.get(explicitDefault as FrameworkId)?.installed
  ) {
    preferred = {
      id: explicitDefault as FrameworkId,
      reason: "explicit PARALLAX_DEFAULT_AGENT_TYPE override",
    };
  } else if (providerPrefersClaude && byId.get("claude")?.installed && claudeReady) {
    preferred = {
      id: "claude",
      reason: "configured Claude subscription should drive Claude Code first",
    };
  } else if (providerPrefersCodex && byId.get("codex")?.installed && codexReady) {
    preferred = {
      id: "codex",
      reason: "configured OpenAI subscription should drive Codex first",
    };
  } else if (byId.get("claude")?.installed && claudeReady) {
    preferred = {
      id: "claude",
      reason: "Claude Code is installed and a Claude credential is available",
    };
  } else if (byId.get("codex")?.installed && codexReady) {
    preferred = {
      id: "codex",
      reason: "Codex is installed and an OpenAI credential is available",
    };
  } else if (byId.get("gemini")?.installed && geminiReady) {
    preferred = {
      id: "gemini",
      reason: "Gemini CLI is installed and a Google credential is available",
    };
  } else {
    const fallback =
      frameworks.find((framework) => framework.installed) ??
      frameworks[0];
    preferred = {
      id: fallback.id,
      reason: fallback.installed
        ? "best available installed framework"
        : "default fallback while no task-agent CLI is installed",
    };
  }

  for (const framework of frameworks) {
    framework.recommended = framework.id === preferred.id;
  }

  return {
    configuredSubscriptionProvider,
    frameworks,
    preferred,
  };
}

async function getFrameworkState(
  runtime: IAgentRuntime,
  ptyService?: PTYServiceLike,
): Promise<FrameworkState> {
  if (frameworkStateCache && frameworkStateCache.expiresAt > Date.now()) {
    return frameworkStateCache.value;
  }
  const value = await computeFrameworkState(runtime, ptyService);
  frameworkStateCache = {
    expiresAt: Date.now() + 15_000,
    value,
  };
  return value;
}

function formatFrameworkLine(framework: FrameworkAvailability): string {
  const parts = [
    framework.installed ? "installed" : "not installed",
    framework.authReady ? "credentials ready" : "credentials missing",
  ];
  if (framework.subscriptionReady) {
    parts.push("uses the user's subscription");
  }
  if (framework.recommended) {
    parts.push("recommended");
  }
  return `- ${framework.label}: ${parts.join(", ")}. ${framework.reason}.`;
}

function looksLikeTaskRequest(text: string): boolean {
  return TASK_AGENT_COMPLEXITY_RE.test(text);
}

function formatStatus(status: string): string {
  switch (status) {
    case "ready":
      return "idle";
    case "busy":
      return "working";
    case "starting":
      return "starting";
    case "authenticating":
      return "authenticating";
    default:
      return status;
  }
}

function truncateText(text: string, max = 120): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function resolveCoordinator(
  runtime: IAgentRuntime,
): CoordinatorLike | undefined {
  const fromRuntime = (runtime as RuntimeWithServices).getService(
    "SWARM_COORDINATOR",
  );
  if (fromRuntime) return fromRuntime as CoordinatorLike;

  const helper =
    getBaseExport<(runtime: IAgentRuntime) => unknown>("getCoordinator");
  if (typeof helper === "function") {
    return helper(runtime) as CoordinatorLike | undefined;
  }
  return;
}

function getPtyService(runtime: IAgentRuntime): PTYServiceLike | undefined {
  const service = (runtime as RuntimeWithServices).getService("PTY_SERVICE");
  return service as unknown as PTYServiceLike | undefined;
}

function getWorkspaceService(
  runtime: IAgentRuntime,
): WorkspaceServiceLike | undefined {
  const service = (runtime as RuntimeWithServices).getService(
    "CODING_WORKSPACE_SERVICE",
  );
  return service as unknown as WorkspaceServiceLike | undefined;
}

function createTaskAgentExamplesProvider(): Provider {
  const baseProvider = baseProviderMap.get("CODING_AGENT_EXAMPLES");
  return {
    name: "TASK_AGENT_EXAMPLES",
    description:
      "Structured examples showing how to use open-ended task-agent actions, framework availability, and subscription-aware defaults",
    position: baseProvider?.position ?? -1,
    get: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State,
    ): Promise<ProviderResult> => {
      const userText =
        (typeof message.content === "string"
          ? message.content
          : message.content?.text) ?? "";
      const ptyService = getPtyService(runtime);
      const frameworkState = await getFrameworkState(runtime, ptyService);
      const frameworkLines = frameworkState.frameworks.map(formatFrameworkLine);

      const compactText = [
        "# Task Agent Action Call Examples",
        "Use task agents for anything more complicated than a simple direct reply.",
        "They are asynchronous, open-ended workers that can code, debug, research, write, analyze, plan, document, and automate while you stay free to keep talking with the user.",
        "",
        `Recommended default right now: ${FRAMEWORK_LABELS[frameworkState.preferred.id]} (${frameworkState.preferred.reason}).`,
        ...(frameworkState.configuredSubscriptionProvider
          ? [
              `Configured Milady subscription provider: ${frameworkState.configuredSubscriptionProvider}. Prefer the matching user-backed CLI first so Milady does not waste cloud chat capacity.`,
            ]
          : []),
        "",
        "Current task-agent frameworks:",
        ...frameworkLines,
        "",
        "Canonical actions:",
        "- CREATE_TASK: launch one or more background task agents, optionally against a repo or workspace.",
        "- SPAWN_AGENT: start a specific task agent in an existing workspace when you need direct control.",
        "- SEND_TO_AGENT: reply to a running agent or send keys to unblock it.",
        "- LIST_AGENTS: inspect active task agents and current task status.",
        "- STOP_AGENT: cancel a running task agent.",
        "- PROVISION_WORKSPACE / FINALIZE_WORKSPACE: manage workspaces before or after agent work when needed.",
      ].join("\n");

      if (!looksLikeTaskRequest(userText)) {
        return {
          data: {
            preferredTaskAgent: frameworkState.preferred.id,
            frameworks: frameworkState.frameworks,
          },
          values: { taskAgentExamples: compactText },
          text: compactText,
        };
      }

      const detailedText = [
        compactText,
        "",
        "Examples:",
        'User: "Investigate why the production login flow started returning 401s in https://github.com/acme/app and fix it."',
        "Assistant:",
        "<actions>",
        "  <action>REPLY</action>",
        "  <action>CREATE_TASK</action>",
        "</actions>",
        "<params>",
        "  <CREATE_TASK>",
        "    <repo>https://github.com/acme/app</repo>",
        "    <task>Investigate the production login 401s, implement the fix, run the relevant tests, and summarize the root cause.</task>",
        "  </CREATE_TASK>",
        "</params>",
        "",
        'User: "Spin up a few sub-agents to research the current browser automation options, compare them, and draft a recommendation doc."',
        "Assistant:",
        "<actions>",
        "  <action>REPLY</action>",
        "  <action>CREATE_TASK</action>",
        "</actions>",
        "<params>",
        "  <CREATE_TASK>",
        "    <agents>Research Playwright tradeoffs and browser sandboxing. Your identifier is \"research\". | Compare Stagehand, Playwright, and browser-use for Milady. Your identifier is \"comparison\". | Draft a recommendation memo in TASK_AGENTS.md using the findings. Your identifier is \"writer\".</agents>",
        "  </CREATE_TASK>",
        "</params>",
        "",
        'User: "Tell the running sub-agent to accept that prompt and continue."',
        "Assistant:",
        "<actions>",
        "  <action>REPLY</action>",
        "  <action>SEND_TO_AGENT</action>",
        "</actions>",
        "<params>",
        "  <SEND_TO_AGENT>",
        "    <input>Yes, accept it and continue.</input>",
        "  </SEND_TO_AGENT>",
        "</params>",
        "",
        "Guidance:",
        "- Prefer CREATE_TASK whenever the work is open-ended, multi-step, or can continue asynchronously.",
        "- If the task references a real repository or prior workspace, include the repo/workspace context instead of dropping the agent into scratch space.",
        "- Use multiple agents only when the subtasks are clearly separable and benefit from parallelism.",
      ].join("\n");

      return {
        data: {
          preferredTaskAgent: frameworkState.preferred.id,
          frameworks: frameworkState.frameworks,
        },
        values: { taskAgentExamples: detailedText },
        text: detailedText,
      };
    },
  };
}

function createActiveWorkspaceContextProvider(): Provider {
  const baseProvider = baseProviderMap.get("ACTIVE_WORKSPACE_CONTEXT");
  return {
    name: "ACTIVE_WORKSPACE_CONTEXT",
    description: "Live status of active workspaces, task-agent sessions, and current task progress",
    position: baseProvider?.position ?? 1,
    get: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
    ): Promise<ProviderResult> => {
      const ptyService = getPtyService(runtime);
      const workspaceService = getWorkspaceService(runtime);
      const coordinator = resolveCoordinator(runtime);
      const frameworkState = await getFrameworkState(runtime, ptyService);

      const sessions = ptyService
        ? await Promise.race([
            ptyService.listSessions(),
            new Promise<SessionSummary[]>((resolve) =>
              setTimeout(() => resolve([]), 2000),
            ),
          ])
        : [];
      const workspaces = workspaceService?.listWorkspaces() ?? [];
      const tasks = uniqueTaskList(coordinator?.getAllTaskContexts?.() ?? []);

      const lines: string[] = ["# Active Workspaces & Task Agents"];
      lines.push(
        `Preferred framework: ${FRAMEWORK_LABELS[frameworkState.preferred.id]} (${frameworkState.preferred.reason}).`,
      );

      if (workspaces.length === 0 && sessions.length === 0 && tasks.length === 0) {
        lines.push("No active workspaces or task-agent sessions.");
        lines.push(
          "Use CREATE_TASK when the user needs anything more involved than a simple direct reply.",
        );
      } else {
        if (workspaces.length > 0) {
          lines.push("");
          lines.push(`## Workspaces (${workspaces.length})`);
          for (const workspace of workspaces) {
            const workspaceSessions = sessions.filter(
              (session) => session.workdir === workspace.path,
            );
            const agentSummary =
              workspaceSessions.length > 0
                ? workspaceSessions
                    .map(
                      (session) =>
                        `${session.agentType}:${formatStatus(session.status)}`,
                    )
                    .join(", ")
                : "no task agents";
            lines.push(
              `- "${workspace.label ?? workspace.id.slice(0, 8)}" -> ${workspace.repo ?? "scratch"} (${workspace.branch ?? "no branch"}, ${agentSummary})`,
            );
          }
        }

        const trackedPaths = new Set(workspaces.map((workspace) => workspace.path));
        const standaloneSessions = sessions.filter(
          (session) => !trackedPaths.has(session.workdir),
        );

        if (standaloneSessions.length > 0) {
          lines.push("");
          lines.push(`## Standalone Sessions (${standaloneSessions.length})`);
          for (const session of standaloneSessions) {
            const label =
              typeof session.metadata?.label === "string"
                ? session.metadata.label
                : session.name;
            lines.push(
              `- "${label}" (${session.agentType}, ${formatStatus(session.status)}) [session: ${session.id}]`,
            );
          }
        }

        if (tasks.length > 0) {
          lines.push("");
          lines.push(`## Current Task Status (${tasks.length})`);
          for (const task of tasks
            .slice()
            .sort((left, right) => right.registeredAt - left.registeredAt)) {
            const latestDecision = task.decisions.at(-1);
            const detail =
              task.completionSummary ||
              latestDecision?.reasoning ||
              truncateText(task.originalTask, 110);
            lines.push(
              `- [${task.status}] "${task.label}" (${task.agentType}) -> ${detail}`,
            );
          }
        }

        const pending = coordinator?.getPendingConfirmations?.() ?? [];
        if (pending.length > 0) {
          lines.push("");
          lines.push(
            `## Pending Confirmations (${pending.length}) — supervision: ${coordinator?.getSupervisionLevel?.() ?? "unknown"}`,
          );
          for (const confirmation of pending) {
            lines.push(
              `- "${confirmation.taskContext.label}" blocked on "${truncateText(confirmation.promptText, 140)}" -> suggested: ${confirmation.llmDecision.action ?? "review"}`,
            );
          }
        }
      }

      if (sessions.length > 0 || tasks.length > 0) {
        lines.push("");
        lines.push(
          "Use SEND_TO_AGENT to unblock a running agent, LIST_AGENTS to inspect progress, STOP_AGENT to cancel, and FINALIZE_WORKSPACE when the work should be published or wrapped up.",
        );
      }

      const text = lines.join("\n");
      return {
        data: {
          activeWorkspaces: workspaces,
          activeSessions: sessions,
          currentTasks: tasks,
          preferredTaskAgent: frameworkState.preferred,
          frameworks: frameworkState.frameworks,
        },
        values: { activeWorkspaceContext: text },
        text,
      };
    },
  };
}

function uniqueTaskList(tasks: TaskSummary[]): TaskSummary[] {
  const seen = new Set<string>();
  const result: TaskSummary[] = [];
  for (const task of tasks) {
    if (seen.has(task.sessionId)) continue;
    seen.add(task.sessionId);
    result.push(task);
  }
  return result;
}

function patchAction(
  currentName: string,
  nextName: string,
  description: string,
  examples: Action["examples"],
  extraSimiles: string[] = [],
): void {
  const action = baseActionMap.get(currentName);
  if (!action) return;
  action.name = nextName;
  action.description = description;
  action.examples = examples;
  action.similes = uniqueStrings([
    currentName,
    nextName,
    ...(action.similes ?? []),
    ...extraSimiles,
  ]);
  baseActionMap.set(nextName, action);
}

function createActionExamples(
  userText: string,
  assistantText: string,
  actionName: string,
): NonNullable<Action["examples"]> {
  return [
    [
      {
        name: "{{user1}}",
        content: {
          text: userText,
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: assistantText,
          action: actionName,
        },
      },
    ],
  ];
}

function wrapActionHandler(
  action: Action | undefined,
  rewrite: (text: string) => string,
): void {
  if (!action?.handler) return;
  const originalHandler = action.handler.bind(action);
  action.handler = async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: HandlerOptions,
    callback?: HandlerCallback,
  ) =>
    originalHandler(
      runtime,
      message,
      state,
      options,
      callback
        ? async (content) => {
            const nextContent =
              content && typeof content === "object" && "text" in content
                ? {
                    ...content,
                    text:
                      typeof content.text === "string"
                        ? rewrite(content.text)
                        : content.text,
                  }
                : content;
            return callback(nextContent);
          }
        : undefined,
    );
}

function renameTaskAgentText(text: string): string {
  return text
    .replace(/\bcoding agents\b/gi, "task agents")
    .replace(/\bcoding agent\b/gi, "task agent")
    .replace(/\bcoding sessions\b/gi, "task-agent sessions")
    .replace(/\bcoding session\b/gi, "task-agent session");
}

function injectPreferredAgentType(action: Action | undefined): void {
  if (!action?.handler) return;
  const originalHandler = action.handler.bind(action);
  action.handler = async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    const parameters =
      (options?.parameters as Record<string, unknown> | undefined) ?? {};
    const content =
      message.content && typeof message.content === "object"
        ? (message.content as Record<string, unknown>)
        : {};
    const explicitAgentType =
      typeof parameters.agentType === "string"
        ? parameters.agentType
        : typeof content.agentType === "string"
          ? content.agentType
          : undefined;

    if (explicitAgentType) {
      return originalHandler(runtime, message, state, options, callback);
    }

    const ptyService = getPtyService(runtime);
    const frameworkState = await getFrameworkState(runtime, ptyService);
    const preferredAgentType =
      frameworkState.preferred.id === "pi"
        ? "pi"
        : frameworkState.preferred.id;

    const nextMessage = {
      ...message,
      content: {
        ...content,
        agentType: preferredAgentType,
      },
    } as Memory;
    const nextOptions = {
      ...(options ?? {}),
      parameters: {
        ...parameters,
        agentType: preferredAgentType,
      },
    } as HandlerOptions;

    return originalHandler(runtime, nextMessage, state, nextOptions, callback);
  };
}

function installListAgentsHandler(action: Action | undefined): void {
  if (!action) return;
  action.handler = async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    const ptyService = getPtyService(runtime);
    if (!ptyService) {
      if (callback) {
        await callback({ text: "PTY Service is not available." });
      }
      return { success: false, error: "SERVICE_UNAVAILABLE" };
    }

    const sessions = await ptyService.listSessions();
    const coordinator = resolveCoordinator(runtime);
    const tasks = uniqueTaskList(coordinator?.getAllTaskContexts?.() ?? []);
    const frameworkState = await getFrameworkState(runtime, ptyService);

    if (sessions.length === 0 && tasks.length === 0) {
      const text =
        `No active task agents. ` +
        `Recommended default: ${FRAMEWORK_LABELS[frameworkState.preferred.id]} (${frameworkState.preferred.reason}). ` +
        `Use CREATE_TASK when the user needs substantial background work.`;
      if (callback) {
        await callback({ text });
      }
      return {
        success: true,
        text,
        data: {
          sessions: [],
          tasks: [],
          preferredTaskAgent: frameworkState.preferred,
        },
      };
    }

    const lines: string[] = [];
    if (sessions.length > 0) {
      lines.push(`Active task agents (${sessions.length}):`);
      for (const session of sessions) {
        const label =
          typeof session.metadata?.label === "string"
            ? session.metadata.label
            : session.name;
        lines.push(
          `- "${label}" (${session.agentType}, ${formatStatus(session.status)}) [session: ${session.id}]`,
        );
      }
    }

    if (tasks.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push(`Current task status (${tasks.length}):`);
      for (const task of tasks
        .slice()
        .sort((left, right) => right.registeredAt - left.registeredAt)) {
        const detail =
          task.completionSummary ||
          task.decisions.at(-1)?.reasoning ||
          truncateText(task.originalTask, 110);
        lines.push(`- [${task.status}] "${task.label}" (${task.agentType}) -> ${detail}`);
      }
    }

    const pending = coordinator?.getPendingConfirmations?.() ?? [];
    if (pending.length > 0) {
      lines.push("");
      lines.push(
        `Pending confirmations: ${pending.length} (${coordinator?.getSupervisionLevel?.() ?? "unknown"} supervision).`,
      );
    }

    const text = lines.join("\n");
    if (callback) {
      await callback({ text });
    }
    return {
      success: true,
      text,
      data: {
        sessions: sessions.map((session) => ({
          id: session.id,
          agentType: session.agentType,
          status: session.status,
          workdir: session.workdir,
          createdAt: session.createdAt.toISOString(),
          lastActivity: session.lastActivityAt.toISOString(),
          label:
            typeof session.metadata?.label === "string"
              ? session.metadata.label
              : session.name,
        })),
        tasks: tasks.map((task) => ({
          sessionId: task.sessionId,
          agentType: task.agentType,
          label: task.label,
          status: task.status,
          originalTask: task.originalTask,
          completionSummary: task.completionSummary,
        })),
        pendingConfirmations: pending.length,
        preferredTaskAgent: frameworkState.preferred,
      },
    };
  };
}

function patchPluginSurface(): void {
  if (patched) return;
  patched = true;

  basePlugin.description =
    "Orchestrate open-ended task agents (Claude Code, Codex, Gemini CLI, Aider, Pi, etc.) via PTY sessions, " +
    "manage workspaces, track current task status, and keep background work moving while the main agent stays in conversation.";

  patchAction(
    "START_CODING_TASK",
    "CREATE_TASK",
    "Create one or more asynchronous task agents for any open-ended multi-step job. " +
      "Use this whenever the user needs work that should continue in the background: coding, debugging, research, writing, analysis, planning, documentation, or automation. " +
      "If a repo URL is provided it provisions the workspace automatically; otherwise the agent can run in scratch space.",
    [
      ...createActionExamples(
        "Take a complicated pass on https://github.com/acme/app: debug the failing login flow, fix it, run the tests, and summarize what changed.",
        "I'll create a background task agent for that repo, keep track of its status, and report back as it progresses.",
        "CREATE_TASK",
      ),
      ...createActionExamples(
        "Spin up a couple of sub-agents to research browser automation frameworks, compare them, and draft a recommendation.",
        "I'll coordinate a few task agents in parallel and keep the summary grounded in their findings.",
        "CREATE_TASK",
      ),
    ],
    ["START_AGENT_TASK", "LAUNCH_TASK", "CREATE_SUBTASK"],
  );

  patchAction(
    "SPAWN_CODING_AGENT",
    "SPAWN_AGENT",
    "Spawn a specific task agent inside an existing workspace when you need direct control. " +
      "These agents are intentionally open-ended and can handle far more than code: investigation, writing, planning, testing, synthesis, and repo work.",
    [
      ...createActionExamples(
        "Start a Codex task agent in that workspace and have it continue the investigation.",
        "I'll spawn a task agent in the current workspace and hand it the next chunk of work.",
        "SPAWN_AGENT",
      ),
    ],
    ["SPAWN_SUB_AGENT", "START_TASK_AGENT", "CREATE_AGENT"],
  );

  patchAction(
    "SEND_TO_CODING_AGENT",
    "SEND_TO_AGENT",
    "Send text or key presses to a running task agent. Use this when a sub-agent asks a question, needs approval, or should keep going with new instructions.",
    [
      ...createActionExamples(
        "Tell the running sub-agent to accept the change and keep going.",
        "I'll send that instruction to the running task agent.",
        "SEND_TO_AGENT",
      ),
    ],
    ["MESSAGE_AGENT", "RESPOND_TO_AGENT", "TELL_TASK_AGENT"],
  );

  patchAction(
    "STOP_CODING_AGENT",
    "STOP_AGENT",
    "Stop a running task agent or cancel all currently active task-agent sessions.",
    [
      ...createActionExamples(
        "Stop that task agent before it does more work.",
        "I'll stop the running task agent.",
        "STOP_AGENT",
      ),
    ],
    ["CANCEL_TASK_AGENT", "TERMINATE_AGENT", "STOP_SUB_AGENT"],
  );

  patchAction(
    "LIST_CODING_AGENTS",
    "LIST_AGENTS",
    "List active task agents together with current task progress so the main agent can keep the user updated while work continues asynchronously.",
    [
      ...createActionExamples(
        "What task agents are running right now and what are they doing?",
        "I'll pull the current task-agent status.",
        "LIST_AGENTS",
      ),
    ],
    ["SHOW_TASK_AGENTS", "LIST_SUB_AGENTS", "SHOW_TASK_STATUS"],
  );

  const provisionWorkspaceAction = baseActionMap.get("PROVISION_WORKSPACE");
  if (provisionWorkspaceAction) {
    provisionWorkspaceAction.description = renameTaskAgentText(
      provisionWorkspaceAction.description ?? "",
    );
  }

  const finalizeWorkspaceAction = baseActionMap.get("FINALIZE_WORKSPACE");
  if (finalizeWorkspaceAction) {
    finalizeWorkspaceAction.description = renameTaskAgentText(
      finalizeWorkspaceAction.description ?? "",
    );
  }

  for (const actionName of [
    "CREATE_TASK",
    "SPAWN_AGENT",
    "SEND_TO_AGENT",
    "STOP_AGENT",
  ]) {
    wrapActionHandler(baseActionMap.get(actionName), renameTaskAgentText);
  }

  injectPreferredAgentType(baseActionMap.get("SPAWN_AGENT"));
  installListAgentsHandler(baseActionMap.get("LIST_AGENTS"));

  basePlugin.providers = [
    createActiveWorkspaceContextProvider(),
    createTaskAgentExamplesProvider(),
  ];
}

function sendJson(
  res: http.ServerResponse,
  body: unknown,
  status = 200,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function handleSettingsRoute(
  runtime: IAgentRuntime,
  res: http.ServerResponse,
): Promise<boolean> {
  const ptyService = getPtyService(runtime);
  const frameworkState = await getFrameworkState(runtime, ptyService);
  sendJson(res, {
    defaultApprovalPreset: ptyService?.defaultApprovalPreset ?? "permissive",
    agentSelectionStrategy: ptyService?.agentSelectionStrategy ?? "fixed",
    defaultAgentType: frameworkState.preferred.id,
    preferredAgentType: frameworkState.preferred.id,
    preferredAgentReason: frameworkState.preferred.reason,
    configuredSubscriptionProvider: frameworkState.configuredSubscriptionProvider,
    frameworks: frameworkState.frameworks,
  });
  return true;
}

async function handleCoordinatorStatusRoute(
  runtime: IAgentRuntime,
  res: http.ServerResponse,
): Promise<boolean> {
  const coordinator = resolveCoordinator(runtime);
  if (!coordinator) return false;

  const ptyService = getPtyService(runtime);
  const frameworkState = await getFrameworkState(runtime, ptyService);
  const allTasks = uniqueTaskList(coordinator.getAllTaskContexts?.() ?? []);
  const activeTasks = allTasks.filter(
    (task) =>
      task.status !== "completed" &&
      task.status !== "stopped" &&
      task.status !== "error",
  );
  const recentTasks = allTasks
    .slice()
    .sort((left, right) => right.registeredAt - left.registeredAt)
    .slice(0, 10);

  sendJson(res, {
    supervisionLevel: coordinator.getSupervisionLevel?.() ?? "autonomous",
    taskCount: activeTasks.length,
    tasks: activeTasks.map((task) => ({
      sessionId: task.sessionId,
      agentType: task.agentType,
      label: task.label,
      originalTask: task.originalTask,
      workdir: task.workdir,
      status: task.status,
      decisionCount: task.decisions.length,
      autoResolvedCount: task.autoResolvedCount,
      completionSummary: task.completionSummary,
      lastActivityAt: task.lastActivityAt,
    })),
    recentTasks: recentTasks.map((task) => ({
      sessionId: task.sessionId,
      agentType: task.agentType,
      label: task.label,
      status: task.status,
      originalTask: task.originalTask,
      completionSummary: task.completionSummary,
      registeredAt: task.registeredAt,
      lastActivityAt: task.lastActivityAt,
    })),
    pendingConfirmations: coordinator.getPendingConfirmations?.().length ?? 0,
    preferredAgentType: frameworkState.preferred.id,
    preferredAgentReason: frameworkState.preferred.reason,
    frameworks: frameworkState.frameworks,
  });
  return true;
}

function patchPtyServiceClass(): void {
  const ptyServiceClass = getBaseExport("PTYService");
  if (!ptyServiceClass || typeof ptyServiceClass !== "function") return;

  const prototype = ptyServiceClass.prototype as Record<string, unknown>;
  const originalResolveAgentType = prototype.resolveAgentType as
    | ((this: PTYServiceLike) => Promise<string>)
    | undefined;

  if (typeof originalResolveAgentType === "function") {
    prototype.resolveAgentType = async function (this: PTYServiceLike) {
      const runtime = (this as unknown as { runtime?: IAgentRuntime }).runtime;
      if (!runtime) {
        return originalResolveAgentType.call(this);
      }
      const frameworkState = await getFrameworkState(runtime, this);
      return frameworkState.preferred.id;
    };
  }

  const originalStart = (ptyServiceClass as { start?: unknown }).start as
    | ((runtime: IAgentRuntime) => Promise<unknown>)
    | undefined;
  if (typeof originalStart === "function") {
    ((ptyServiceClass as unknown) as {
      start: (runtime: IAgentRuntime) => Promise<unknown>;
    }).start = async (runtime: IAgentRuntime) => {
        const service = await originalStart(runtime);
        if (service && typeof service === "object") {
          (
            service as {
              capabilityDescription?: string;
            }
          ).capabilityDescription =
            "Manages asynchronous PTY task-agent sessions for open-ended background work";
        }
        return service;
      };
  }
}

patchPluginSurface();
patchPtyServiceClass();

export function createCodingAgentRouteHandler(
  runtime: IAgentRuntime,
  coordinator?: unknown,
): PatchedRouteHandler {
  const baseFactory =
    getBaseExport<RouteHandlerFactory>("createCodingAgentRouteHandler");
  const baseHandler = baseFactory?.(runtime, coordinator);

  return async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    method = req.method ?? "GET",
  ): Promise<boolean> => {
    if (method === "GET" && pathname === "/api/coding-agents/settings") {
      return handleSettingsRoute(runtime, res);
    }
    if (
      method === "GET" &&
      pathname === "/api/coding-agents/coordinator/status"
    ) {
      return handleCoordinatorStatusRoute(runtime, res);
    }
    return baseHandler ? baseHandler(req, res, pathname, method) : false;
  };
}

export const PTYService = getBaseExport("PTYService");
export const CodingWorkspaceService = getBaseExport("CodingWorkspaceService");
export const getCoordinator = (runtime: IAgentRuntime): unknown =>
  resolveCoordinator(runtime);
export const codingAgentPlugin = basePlugin;

export default basePlugin;
