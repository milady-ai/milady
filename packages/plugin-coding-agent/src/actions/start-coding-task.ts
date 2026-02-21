/**
 * START_CODING_TASK action - Unified action to set up and launch coding agents
 *
 * Combines workspace provisioning and agent spawning into a single atomic action.
 * - If a repo URL is provided, clones it into a fresh workspace
 * - If no repo, creates a scratch sandbox directory
 * - Spawns the specified coding agent(s) in that workspace with the given task
 * - Supports multi-agent mode via pipe-delimited `agents` param
 *
 * This eliminates the need for multi-action chaining (PROVISION_WORKSPACE → SPAWN_CODING_AGENT)
 * and ensures agents always run in an isolated directory.
 *
 * @module actions/start-coding-task
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import type { AgentCredentials, ApprovalPreset } from "coding-agent-adapters";
import {
  type CodingAgentType,
  normalizeAgentType,
  type PTYService,
  type SessionInfo,
} from "../services/pty-service.js";
import type { CodingWorkspaceService } from "../services/workspace-service.js";

/** Create a scratch sandbox directory for non-repo tasks */
function createScratchDir(): string {
  const baseDir = path.join(os.homedir(), ".milaidy", "workspaces");
  const scratchId = randomUUID();
  const scratchDir = path.join(baseDir, scratchId);
  fs.mkdirSync(scratchDir, { recursive: true });
  return scratchDir;
}

/**
 * Generate a short semantic label from repo URL and/or task description.
 * e.g. "git-workspace-service-testbed/hello-mima" or "scratch/react-research"
 */
function generateLabel(
  repo: string | undefined,
  task: string | undefined,
): string {
  const parts: string[] = [];

  if (repo) {
    // Extract repo name from URL: "https://github.com/owner/my-repo.git" → "my-repo"
    const match = repo.match(/\/([^/]+?)(?:\.git)?$/);
    parts.push(match ? match[1] : "repo");
  } else {
    parts.push("scratch");
  }

  if (task) {
    // Extract a slug from the first few meaningful words of the task
    const slug = task
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 2 &&
          !["the", "and", "for", "with", "that", "this", "from"].includes(w),
      )
      .slice(0, 3)
      .join("-");
    if (slug) parts.push(slug);
  }

  return parts.join("/");
}

/** Register lifecycle event handlers for a spawned session */
function registerSessionEvents(
  ptyService: PTYService,
  runtime: IAgentRuntime,
  sessionId: string,
  label: string,
  scratchDir: string | null,
  callback?: HandlerCallback,
): void {
  ptyService.onSessionEvent((sid, event, data) => {
    if (sid !== sessionId) return;

    if (event === "blocked" && callback) {
      callback({
        text: `Agent "${label}" is waiting for input: ${(data as { prompt?: string }).prompt ?? "unknown prompt"}`,
      });
    }
    if (event === "task_complete") {
      if (callback) {
        const response = (data as { response?: string }).response ?? "";
        const preview =
          response.length > 500 ? `${response.slice(0, 500)}...` : response;
        callback({
          text: preview
            ? `Agent "${label}" completed the task.\n\n${preview}`
            : `Agent "${label}" completed the task.`,
        });
      }
      // Auto-stop the session after task completion. Without a websocket
      // interactive layer, the idle session can't accept follow-up input
      // and just leaks resources.
      ptyService.stopSession(sessionId).catch((err) => {
        console.warn(
          `[START_CODING_TASK] Failed to stop session for "${label}" after task complete: ${err}`,
        );
      });
    }
    if (event === "error" && callback) {
      callback({
        text: `Agent "${label}" encountered an error: ${(data as { message?: string }).message ?? "unknown error"}`,
      });
    }

    // Auto-cleanup scratch directories when the session exits
    if (
      (event === "stopped" || event === "task_complete" || event === "error") &&
      scratchDir
    ) {
      const wsService = runtime.getService(
        "CODING_WORKSPACE_SERVICE",
      ) as unknown as CodingWorkspaceService | undefined;
      if (wsService) {
        wsService.removeScratchDir(scratchDir).catch((err) => {
          console.warn(
            `[START_CODING_TASK] Failed to cleanup scratch dir for "${label}": ${err}`,
          );
        });
      }
    }
  });
}

export const startCodingTaskAction: Action = {
  name: "START_CODING_TASK",

  similes: [
    "LAUNCH_CODING_TASK",
    "RUN_CODING_TASK",
    "START_AGENT_TASK",
    "SPAWN_AND_PROVISION",
    "CODE_THIS",
  ],

  description:
    "Start a coding task: optionally clone a repo, then spawn a coding agent (Claude Code, Codex, Gemini, Aider) " +
    "to work on it. If no repo is provided, the agent runs in a safe scratch directory. " +
    "Use this whenever the user asks to work on code, research something with an agent, or run any agent task.",

  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "Set up a workspace for https://github.com/acme/my-app and have Claude fix the auth bug",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll clone the repo and spawn Claude to fix the auth bug.",
          action: "START_CODING_TASK",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Use a coding agent to research the latest React patterns",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll spin up an agent to research that for you.",
          action: "START_CODING_TASK",
        },
      },
    ],
  ],

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
  ): Promise<boolean> => {
    const ptyService = runtime.getService("PTY_SERVICE") as unknown as
      | PTYService
      | undefined;
    return ptyService != null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    const ptyService = runtime.getService("PTY_SERVICE") as unknown as
      | PTYService
      | undefined;
    if (!ptyService) {
      if (callback) {
        await callback({
          text: "PTY Service is not available. Cannot start coding task.",
        });
      }
      return { success: false, error: "SERVICE_UNAVAILABLE" };
    }

    const wsService = runtime.getService(
      "CODING_WORKSPACE_SERVICE",
    ) as unknown as CodingWorkspaceService | undefined;

    // Extract parameters
    const params = options?.parameters;
    const content = message.content as Record<string, unknown>;

    const rawAgentType =
      (params?.agentType as string) ??
      (content.agentType as string) ??
      "claude";
    const defaultAgentType = normalizeAgentType(rawAgentType);
    const memoryContent =
      (params?.memoryContent as string) ?? (content.memoryContent as string);
    const approvalPreset =
      (params?.approvalPreset as string) ?? (content.approvalPreset as string);

    // Repo is optional — extract from params, content, or text
    let repo = (params?.repo as string) ?? (content.repo as string);
    if (!repo && content.text) {
      const urlMatch = (content.text as string).match(
        /https?:\/\/(?:github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+(?:\.git)?/i,
      );
      if (urlMatch) {
        repo = urlMatch[0];
      }
    }

    // Build credentials (shared across all agents)
    const customCredentialKeys = runtime.getSetting("CUSTOM_CREDENTIAL_KEYS") as
      | string
      | undefined;
    let customCredentials: Record<string, string> | undefined;
    if (customCredentialKeys) {
      customCredentials = {};
      for (const key of customCredentialKeys.split(",").map((k) => k.trim())) {
        const val = runtime.getSetting(key) as string | undefined;
        if (val) customCredentials[key] = val;
      }
    }

    const credentials: AgentCredentials = {
      anthropicKey: runtime.getSetting("ANTHROPIC_API_KEY") as
        | string
        | undefined,
      openaiKey: runtime.getSetting("OPENAI_API_KEY") as string | undefined,
      googleKey: runtime.getSetting("GOOGLE_GENERATIVE_AI_API_KEY") as
        | string
        | undefined,
      githubToken: runtime.getSetting("GITHUB_TOKEN") as string | undefined,
    };

    // --- Check for multi-agent mode ---
    const agentsParam =
      (params?.agents as string) ?? (content.agents as string);

    if (agentsParam) {
      // ==================== MULTI-AGENT MODE ====================
      // Parse pipe-delimited agent specs: "task1 | task2 | agentType:task3"
      const agentSpecs = agentsParam
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);

      if (agentSpecs.length === 0) {
        if (callback) {
          await callback({
            text: "No agent tasks provided in agents parameter.",
          });
        }
        return { success: false, error: "EMPTY_AGENTS_PARAM" };
      }

      if (repo && !wsService) {
        if (callback) {
          await callback({
            text: "Workspace Service is not available. Cannot clone repository.",
          });
        }
        return { success: false, error: "WORKSPACE_SERVICE_UNAVAILABLE" };
      }

      if (callback) {
        await callback({
          text: `Launching ${agentSpecs.length} agents${repo ? ` on ${repo}` : ""}...`,
        });
      }

      const results: Array<{
        sessionId: string;
        agentType: string;
        workdir: string;
        workspaceId?: string;
        branch?: string;
        label: string;
        status: string;
        error?: string;
      }> = [];

      for (const [i, spec] of agentSpecs.entries()) {
        // Parse optional "agentType:task" prefix
        let specAgentType = defaultAgentType;
        let specTask = spec;
        const colonIdx = spec.indexOf(":");
        if (colonIdx > 0 && colonIdx < 20) {
          const prefix = spec.slice(0, colonIdx).trim().toLowerCase();
          const knownTypes = [
            "claude",
            "claude-code",
            "claudecode",
            "codex",
            "openai",
            "gemini",
            "google",
            "aider",
            "shell",
            "bash",
          ];
          if (knownTypes.includes(prefix)) {
            specAgentType = normalizeAgentType(prefix);
            specTask = spec.slice(colonIdx + 1).trim();
          }
        }

        // Generate label for this specific agent
        const explicitLabel = params?.label as string | undefined;
        const specLabel = explicitLabel
          ? `${explicitLabel}-${i + 1}`
          : generateLabel(repo, specTask);

        try {
          // Provision workspace (each agent gets its own clone or scratch dir)
          let workdir: string;
          let workspaceId: string | undefined;
          let branch: string | undefined;

          if (repo && wsService) {
            const workspace = await wsService.provisionWorkspace({ repo });
            workdir = workspace.path;
            workspaceId = workspace.id;
            branch = workspace.branch;
            wsService.setLabel(workspace.id, specLabel);
          } else {
            workdir = createScratchDir();
          }

          // Preflight check
          if (specAgentType !== "shell") {
            const [preflight] = await ptyService.checkAvailableAgents([
              specAgentType as Exclude<CodingAgentType, "shell">,
            ]);
            if (preflight && !preflight.installed) {
              results.push({
                sessionId: "",
                agentType: specAgentType,
                workdir,
                label: specLabel,
                status: "failed",
                error: `${preflight.adapter} CLI is not installed`,
              });
              continue;
            }
          }

          // Spawn the agent
          const session: SessionInfo = await ptyService.spawnSession({
            name: `coding-${Date.now()}-${i}`,
            agentType: specAgentType,
            workdir,
            initialTask: specTask,
            memoryContent,
            credentials,
            approvalPreset: approvalPreset as ApprovalPreset | undefined,
            customCredentials,
            metadata: {
              requestedType: rawAgentType,
              messageId: message.id,
              userId: (message as unknown as Record<string, unknown>).userId,
              workspaceId,
              label: specLabel,
              multiAgentIndex: i,
            },
          });

          // Register event handler
          const isScratch = !repo;
          const scratchDir = isScratch ? workdir : null;
          registerSessionEvents(
            ptyService,
            runtime,
            session.id,
            specLabel,
            scratchDir,
            callback,
          );

          results.push({
            sessionId: session.id,
            agentType: specAgentType,
            workdir,
            workspaceId,
            branch,
            label: specLabel,
            status: session.status,
          });

          if (callback) {
            await callback({
              text: `[${i + 1}/${agentSpecs.length}] Spawned ${specAgentType} agent as "${specLabel}"`,
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[START_CODING_TASK] Failed to spawn agent ${i + 1}:`,
            errorMessage,
          );
          results.push({
            sessionId: "",
            agentType: specAgentType,
            workdir: "",
            label: specLabel,
            status: "failed",
            error: errorMessage,
          });
        }
      }

      // Store all sessions in state
      if (state) {
        state.codingSessions = results.filter((r) => r.sessionId);
      }

      const succeeded = results.filter((r) => r.sessionId);
      const failed = results.filter((r) => !r.sessionId);
      const summary = [
        `Launched ${succeeded.length}/${agentSpecs.length} agents${repo ? ` on ${repo}` : ""}:`,
        ...succeeded.map(
          (r) => `  - "${r.label}" (${r.agentType}) [session: ${r.sessionId}]`,
        ),
        ...(failed.length > 0
          ? [
              `Failed: ${failed.map((r) => `"${r.label}": ${r.error}`).join(", ")}`,
            ]
          : []),
      ].join("\n");

      if (callback) {
        await callback({ text: summary });
      }

      return {
        success: failed.length === 0,
        text: summary,
        data: { agents: results },
      };
    }

    // ==================== SINGLE-AGENT MODE ====================
    const agentType = defaultAgentType;
    const task = (params?.task as string) ?? (content.task as string);

    // Generate or use explicit label
    const explicitLabel =
      (params?.label as string) ?? (content.label as string);
    const label = explicitLabel || generateLabel(repo, task);

    // --- Step 1: Resolve workspace directory ---
    let workdir: string;
    let workspaceId: string | undefined;
    let branch: string | undefined;

    if (repo) {
      if (!wsService) {
        if (callback) {
          await callback({
            text: "Workspace Service is not available. Cannot clone repository.",
          });
        }
        return { success: false, error: "WORKSPACE_SERVICE_UNAVAILABLE" };
      }

      try {
        if (callback) {
          await callback({ text: `Cloning ${repo}...` });
        }

        const workspace = await wsService.provisionWorkspace({ repo });
        workdir = workspace.path;
        workspaceId = workspace.id;
        branch = workspace.branch;

        wsService.setLabel(workspace.id, label);

        if (state) {
          state.codingWorkspace = {
            id: workspace.id,
            path: workspace.path,
            branch: workspace.branch,
            isWorktree: workspace.isWorktree,
            label,
          };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (callback) {
          await callback({
            text: `Failed to clone repository: ${errorMessage}`,
          });
        }
        return { success: false, error: errorMessage };
      }
    } else {
      workdir = createScratchDir();
    }

    // --- Step 2: Spawn the agent ---
    try {
      if (agentType !== "shell") {
        const [preflight] = await ptyService.checkAvailableAgents([
          agentType as Exclude<CodingAgentType, "shell">,
        ]);
        if (preflight && !preflight.installed) {
          if (callback) {
            await callback({
              text: `${preflight.adapter} CLI is not installed.\nInstall with: ${preflight.installCommand}\nDocs: ${preflight.docsUrl}`,
            });
          }
          return { success: false, error: "AGENT_NOT_INSTALLED" };
        }
      }

      const session: SessionInfo = await ptyService.spawnSession({
        name: `coding-${Date.now()}`,
        agentType,
        workdir,
        initialTask: task,
        memoryContent,
        credentials,
        approvalPreset: approvalPreset as ApprovalPreset | undefined,
        customCredentials,
        metadata: {
          requestedType: rawAgentType,
          messageId: message.id,
          userId: (message as unknown as Record<string, unknown>).userId,
          workspaceId,
          label,
        },
      });

      // Register event handler
      const isScratchWorkspace = !repo;
      const scratchDir = isScratchWorkspace ? workdir : null;
      registerSessionEvents(
        ptyService,
        runtime,
        session.id,
        label,
        scratchDir,
        callback,
      );

      if (state) {
        state.codingSession = {
          id: session.id,
          agentType: session.agentType,
          workdir: session.workdir,
          status: session.status,
        };
      }

      const summary = repo
        ? `Cloned ${repo} and started ${agentType} agent as "${label}"${task ? ` with task: "${task}"` : ""}`
        : `Started ${agentType} agent as "${label}" in scratch workspace${task ? ` with task: "${task}"` : ""}`;

      if (callback) {
        await callback({ text: `${summary}\nSession ID: ${session.id}` });
      }

      return {
        success: true,
        text: summary,
        data: {
          sessionId: session.id,
          agentType: session.agentType,
          workdir: session.workdir,
          workspaceId,
          branch,
          label,
          status: session.status,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[START_CODING_TASK] Failed to spawn agent:", errorMessage);

      if (callback) {
        await callback({
          text: `Failed to start coding agent: ${errorMessage}`,
        });
      }
      return { success: false, error: errorMessage };
    }
  },

  parameters: [
    {
      name: "repo",
      description:
        "Git repository URL to clone (e.g. https://github.com/owner/repo). " +
        "If omitted, the agent runs in an isolated scratch directory.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "agentType",
      description:
        "Type of coding agent to spawn (default for all agents). Options: claude, codex, gemini, aider, shell.",
      required: false,
      schema: { type: "string" as const, default: "claude" },
    },
    {
      name: "task",
      description:
        "The task or prompt to send to the agent once it's ready. Used for single-agent mode.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "agents",
      description:
        "Pipe-delimited list of agent tasks for multi-agent mode. Each segment is a task description. " +
        "Optionally prefix with agent type: 'claude:Fix auth | gemini:Write tests | codex:Update docs'. " +
        "Each agent gets its own workspace clone. If provided, the 'task' parameter is ignored.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "memoryContent",
      description:
        "Instructions/context to write to each agent's memory file (e.g. CLAUDE.md) before spawning.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "label",
      description:
        "Short semantic label for this workspace. In multi-agent mode, each agent gets '{label}-1', '{label}-2', etc. " +
        "Auto-generated from repo/task if not provided.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "approvalPreset",
      description:
        "Permission level for all agents: readonly, standard, permissive, autonomous.",
      required: false,
      schema: {
        type: "string" as const,
        enum: ["readonly", "standard", "permissive", "autonomous"],
      },
    },
  ],
};
