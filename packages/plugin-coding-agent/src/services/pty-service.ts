/**
 * PTY Service - Manages PTY sessions for CLI coding agents
 *
 * Wraps pty-manager to provide:
 * - Session lifecycle management (spawn, stop, list)
 * - Adapter registration for different agent types (shell, claude, gemini, codex, aider)
 * - Event forwarding to ElizaOS runtime
 *
 * Uses BunCompatiblePTYManager when running in Bun (spawns Node worker),
 * or PTYManager directly when running in Node.
 *
 * @module services/pty-service
 */

import type { IAgentRuntime } from "@elizaos/core";
import {
  type AdapterType,
  type AgentCredentials,
  type AgentFileDescriptor,
  type ApprovalConfig,
  type ApprovalPreset,
  type BaseCodingAdapter,
  checkAdapters,
  createAdapter,
  createAllAdapters,
  generateApprovalConfig,
  type PreflightResult,
  type WriteMemoryOptions,
} from "coding-agent-adapters";
import {
  type AutoResponseRule,
  BunCompatiblePTYManager,
  isBun,
  PTYManager,
  type PTYManagerConfig,
  type SessionFilter,
  type SessionHandle,
  type SessionMessage,
  ShellAdapter,
  type SpawnConfig,
  type StallClassification,
  type WorkerSessionHandle,
} from "pty-manager";
import { AgentMetricsTracker } from "./agent-metrics.js";
import { captureTaskResponse } from "./ansi-utils.js";
import { classifyStallOutput } from "./stall-classifier.js";

export interface PTYServiceConfig {
  /** Maximum output lines to keep per session (default: 1000) */
  maxLogLines?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Auto-register coding agent adapters (default: true) */
  registerCodingAdapters?: boolean;
}

/** Available coding agent types */
export type CodingAgentType = "shell" | AdapterType;

/** Normalize user-provided agent type string to a valid CodingAgentType */
export const normalizeAgentType = (input: string): CodingAgentType => {
  const normalized = input.toLowerCase().trim();
  const mapping: Record<string, CodingAgentType> = {
    claude: "claude",
    "claude-code": "claude",
    claudecode: "claude",
    codex: "codex",
    openai: "codex",
    "openai-codex": "codex",
    gemini: "gemini",
    google: "gemini",
    aider: "aider",
    shell: "shell",
    bash: "shell",
  };
  return mapping[normalized] ?? "claude";
};

export interface SpawnSessionOptions {
  /** Human-readable session name */
  name: string;
  /** Adapter type: "shell" | "claude" | "gemini" | "codex" | "aider" */
  agentType: CodingAgentType;
  /** Working directory for the session */
  workdir?: string;
  /** Initial command/task to send */
  initialTask?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Session metadata for tracking */
  metadata?: Record<string, unknown>;
  /** Credentials for coding agents (API keys, tokens) */
  credentials?: AgentCredentials;
  /** Memory/instructions content to write to the agent's memory file before spawning */
  memoryContent?: string;
  /** Approval preset controlling tool permissions (readonly, standard, permissive, autonomous) */
  approvalPreset?: ApprovalPreset;
  /** Custom credentials for MCP servers or other integrations */
  customCredentials?: Record<string, string>;
}

export interface SessionInfo {
  id: string;
  name: string;
  agentType: string;
  workdir: string;
  status: SessionHandle["status"];
  createdAt: Date;
  lastActivityAt: Date;
  metadata?: Record<string, unknown>;
}

type SessionEventCallback = (
  sessionId: string,
  event: string,
  data: unknown,
) => void;

export class PTYService {
  static serviceType = "PTY_SERVICE";
  capabilityDescription = "Manages PTY sessions for CLI coding agents";

  private runtime: IAgentRuntime;
  private manager: PTYManager | BunCompatiblePTYManager | null = null;
  private usingBunWorker: boolean = false;
  private serviceConfig: PTYServiceConfig;
  private sessionMetadata: Map<string, Record<string, unknown>> = new Map();
  private sessionWorkdirs: Map<string, string> = new Map();
  private eventCallbacks: SessionEventCallback[] = [];
  private outputUnsubscribers: Map<string, () => void> = new Map();
  private sessionOutputBuffers: Map<string, string[]> = new Map();
  private adapterCache: Map<string, BaseCodingAdapter> = new Map();
  /** Tracks the buffer index when a task was sent, so we can capture the response on completion */
  private taskResponseMarkers: Map<string, number> = new Map();
  /** Captures "Task completion trace" log entries from worker stderr (rolling, capped at 200) */
  private traceEntries: Array<string | Record<string, unknown>> = [];
  private static readonly MAX_TRACE_ENTRIES = 200;
  /** Lightweight per-agent-type metrics for observability */
  private metricsTracker = new AgentMetricsTracker();

  constructor(runtime: IAgentRuntime, config: PTYServiceConfig = {}) {
    this.runtime = runtime;
    this.serviceConfig = {
      maxLogLines: config.maxLogLines ?? 1000,
      debug: config.debug ?? true,
      registerCodingAdapters: config.registerCodingAdapters ?? true,
    };
  }

  static async start(runtime: IAgentRuntime): Promise<PTYService> {
    const config = runtime.getSetting("PTY_SERVICE_CONFIG") as
      | PTYServiceConfig
      | null
      | undefined;
    const service = new PTYService(runtime, config ?? {});
    await service.initialize();
    return service;
  }

  static async stopRuntime(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService("PTY_SERVICE") as unknown as
      | PTYService
      | undefined;
    if (service) {
      await service.stop();
    }
  }

  private async initialize(): Promise<void> {
    this.usingBunWorker = isBun();

    if (this.usingBunWorker) {
      // Use Bun-compatible manager that spawns a Node worker
      this.log("Detected Bun runtime, using BunCompatiblePTYManager");
      const bunManager = new BunCompatiblePTYManager({
        adapterModules: ["coding-agent-adapters"],
        stallDetectionEnabled: true,
        stallTimeoutMs: 4000,
        onStallClassify: async (
          sessionId: string,
          recentOutput: string,
          _stallDurationMs: number,
        ) => {
          return this.classifyStall(sessionId, recentOutput);
        },
      });

      // Set up event forwarding for worker-based manager
      bunManager.on("session_ready", (session: WorkerSessionHandle) => {
        this.log(
          `session_ready event received for ${session.id} (type: ${session.type}, status: ${session.status})`,
        );
        this.emitEvent(session.id, "ready", { session });
      });

      bunManager.on("session_exit", (id: string, code: number) => {
        this.emitEvent(id, "stopped", { reason: `exit code ${code}` });
      });

      bunManager.on("session_error", (id: string, error: string) => {
        this.emitEvent(id, "error", { message: error });
      });

      bunManager.on(
        "blocking_prompt",
        (
          session: WorkerSessionHandle,
          promptInfo: unknown,
          autoResponded: boolean,
        ) => {
          const info = promptInfo as
            | { type?: string; prompt?: string }
            | undefined;
          this.log(
            `blocking_prompt for ${session.id}: type=${info?.type}, autoResponded=${autoResponded}, prompt="${(info?.prompt ?? "").slice(0, 80)}"`,
          );
          this.emitEvent(session.id, "blocked", { promptInfo, autoResponded });
        },
      );

      bunManager.on(
        "login_required",
        (session: WorkerSessionHandle, instructions?: string, url?: string) => {
          // Auto-handle Gemini auth flow
          if (session.type === "gemini") {
            this.handleGeminiAuth(session.id);
          }
          this.emitEvent(session.id, "login_required", { instructions, url });
        },
      );

      bunManager.on("task_complete", (session: WorkerSessionHandle) => {
        const response = captureTaskResponse(
          session.id,
          this.sessionOutputBuffers,
          this.taskResponseMarkers,
        );
        const durationMs = session.startedAt
          ? Date.now() - new Date(session.startedAt).getTime()
          : 0;
        this.metricsTracker.recordCompletion(
          session.type,
          "fast-path",
          durationMs,
        );
        this.log(
          `Task complete for ${session.id} (adapter fast-path), response: ${response.length} chars`,
        );
        this.emitEvent(session.id, "task_complete", { session, response });
      });

      bunManager.on("message", (message: SessionMessage) => {
        this.emitEvent(message.sessionId, "message", message);
      });

      // Log worker-level stderr (pino logs from pty-manager worker process).
      // Strip the "Invalid JSON from worker:" prefix that BunCompatiblePTYManager
      // adds when stderr lines aren't valid JSON-RPC responses.
      bunManager.on("worker_error", (err: unknown) => {
        const raw = typeof err === "string" ? err : String(err);
        const msg = raw.replace(/^Invalid JSON from worker:\s*/i, "").trim();
        if (!msg) return;
        // Capture task completion trace entries for timeline analysis
        if (msg.includes("Task completion trace")) {
          this.traceEntries.push(msg);
          if (this.traceEntries.length > PTYService.MAX_TRACE_ENTRIES) {
            this.traceEntries.splice(
              0,
              this.traceEntries.length - PTYService.MAX_TRACE_ENTRIES,
            );
          }
        }
        // Show operational logs at info level
        if (
          msg.includes("ready") ||
          msg.includes("blocking") ||
          msg.includes("auto-response") ||
          msg.includes("Auto-responding") ||
          msg.includes("detectReady") ||
          msg.includes("stall") ||
          msg.includes("Stall") ||
          msg.includes("Task completion") ||
          msg.includes("Spawning") ||
          msg.includes("PTY session")
        ) {
          console.log("[PTYService/Worker]", msg);
        } else {
          console.error("[PTYService/Worker]", msg.slice(0, 200));
        }
      });

      bunManager.on("worker_exit", (info: { code: number; signal: string }) => {
        console.error("[PTYService] Worker exited:", info);
      });

      await bunManager.waitForReady();
      this.manager = bunManager;
    } else {
      // Use native PTYManager directly in Node
      this.log("Using native PTYManager");
      const managerConfig: PTYManagerConfig = {
        maxLogLines: this.serviceConfig.maxLogLines,
        stallDetectionEnabled: true,
        stallTimeoutMs: 4000,
        onStallClassify: async (
          sessionId: string,
          recentOutput: string,
          _stallDurationMs: number,
        ) => {
          return this.classifyStall(sessionId, recentOutput);
        },
      };

      const nodeManager = new PTYManager(managerConfig);

      // Register built-in adapters
      nodeManager.registerAdapter(new ShellAdapter());

      // Register coding agent adapters (claude, gemini, codex, aider)
      if (this.serviceConfig.registerCodingAdapters) {
        const codingAdapters = createAllAdapters();
        for (const adapter of codingAdapters) {
          nodeManager.registerAdapter(adapter);
          this.log(`Registered ${adapter.adapterType} adapter`);
        }
      }

      // Set up event forwarding
      nodeManager.on("session_ready", (session: SessionHandle) => {
        this.emitEvent(session.id, "ready", { session });
      });

      nodeManager.on(
        "blocking_prompt",
        (
          session: SessionHandle,
          promptInfo: unknown,
          autoResponded: boolean,
        ) => {
          this.emitEvent(session.id, "blocked", { promptInfo, autoResponded });
        },
      );

      nodeManager.on(
        "login_required",
        (session: SessionHandle, instructions?: string, url?: string) => {
          if (session.type === "gemini") {
            this.handleGeminiAuth(session.id);
          }
          this.emitEvent(session.id, "login_required", { instructions, url });
        },
      );

      nodeManager.on("task_complete", (session: SessionHandle) => {
        const response = captureTaskResponse(
          session.id,
          this.sessionOutputBuffers,
          this.taskResponseMarkers,
        );
        const durationMs = session.startedAt
          ? Date.now() - new Date(session.startedAt).getTime()
          : 0;
        this.metricsTracker.recordCompletion(
          session.type,
          "fast-path",
          durationMs,
        );
        this.log(
          `Task complete for ${session.id} (adapter fast-path), response: ${response.length} chars`,
        );
        this.emitEvent(session.id, "task_complete", { session, response });
      });

      nodeManager.on(
        "session_stopped",
        (session: SessionHandle, reason: string) => {
          this.emitEvent(session.id, "stopped", { reason });
        },
      );

      nodeManager.on(
        "session_error",
        (session: SessionHandle, error: string) => {
          this.emitEvent(session.id, "error", { message: error });
        },
      );

      nodeManager.on("message", (message: SessionMessage) => {
        this.emitEvent(message.sessionId, "message", message);
      });

      this.manager = nodeManager;
    }

    this.log("PTYService initialized");
  }

  async stop(): Promise<void> {
    // Clean up output subscribers
    for (const unsubscribe of this.outputUnsubscribers.values()) {
      unsubscribe();
    }
    this.outputUnsubscribers.clear();

    if (this.manager) {
      await this.manager.shutdown();
      this.manager = null;
    }
    this.sessionMetadata.clear();
    this.sessionWorkdirs.clear();
    this.sessionOutputBuffers.clear();
    this.log("PTYService shutdown complete");
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `pty-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  }

  /**
   * Spawn a new PTY session for a coding agent
   */
  async spawnSession(options: SpawnSessionOptions): Promise<SessionInfo> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const sessionId = this.generateSessionId();
    const workdir = options.workdir ?? process.cwd();

    // Store workdir for later retrieval
    this.sessionWorkdirs.set(sessionId, workdir);

    // Write memory content before spawning so the agent reads it on startup
    if (options.memoryContent && options.agentType !== "shell") {
      try {
        const writtenPath = await this.writeMemoryFile(
          options.agentType as AdapterType,
          workdir,
          options.memoryContent,
        );
        this.log(`Wrote memory file for ${options.agentType}: ${writtenPath}`);
      } catch (err) {
        this.log(
          `Failed to write memory file for ${options.agentType}: ${err}`,
        );
      }
    }

    // Write approval config files to workspace before spawn
    if (options.approvalPreset && options.agentType !== "shell") {
      try {
        const written = await this.getAdapter(
          options.agentType as AdapterType,
        ).writeApprovalConfig(workdir, {
          name: options.name,
          type: options.agentType,
          workdir,
          adapterConfig: { approvalPreset: options.approvalPreset },
        } as SpawnConfig);
        this.log(
          `Wrote approval config (${options.approvalPreset}) for ${options.agentType}: ${written.join(", ")}`,
        );
      } catch (err) {
        this.log(`Failed to write approval config: ${err}`);
      }
    }

    // Map model preferences to adapter-specific env vars
    const modelPrefs = options.metadata?.modelPrefs as
      | { powerful?: string; fast?: string }
      | undefined;
    let modelEnv: Record<string, string> | undefined;
    if (modelPrefs?.powerful) {
      const envKeyMap: Record<string, string> = {
        claude: "ANTHROPIC_MODEL",
        gemini: "GEMINI_MODEL",
        codex: "OPENAI_MODEL",
        aider: "AIDER_MODEL",
      };
      const key = envKeyMap[options.agentType];
      if (key) modelEnv = { [key]: modelPrefs.powerful };
    }

    const spawnConfig: SpawnConfig & { id: string } = {
      id: sessionId,
      name: options.name,
      type: options.agentType,
      workdir,
      env: { ...options.env, ...modelEnv },
      adapterConfig: {
        ...(options.credentials as Record<string, unknown> | undefined),
        ...(options.customCredentials
          ? { custom: options.customCredentials }
          : {}),
        interactive: true,
        approvalPreset: options.approvalPreset,
        // Forward adapter-relevant metadata (e.g. provider preference for Aider)
        ...(options.metadata?.provider
          ? { provider: options.metadata.provider }
          : {}),
        ...(options.metadata?.modelTier
          ? { modelTier: options.metadata.modelTier }
          : {}),
      },
    };

    const session = await this.manager.spawn(spawnConfig);

    // Store metadata separately (always include agentType for stall classification)
    this.sessionMetadata.set(session.id, {
      ...options.metadata,
      agentType: options.agentType,
    });

    // Buffer output for Bun worker path (no logs() method available)
    if (this.usingBunWorker) {
      const buffer: string[] = [];
      this.sessionOutputBuffers.set(session.id, buffer);
      const unsubscribe = (
        this.manager as BunCompatiblePTYManager
      ).onSessionData(session.id, (data: string) => {
        const lines = data.split("\n");
        buffer.push(...lines);
        while (buffer.length > (this.serviceConfig.maxLogLines ?? 1000)) {
          buffer.shift();
        }
      });
      this.outputUnsubscribers.set(session.id, unsubscribe);
    }

    // Defer initial task until session is ready.
    // IMPORTANT: Set up the listener BEFORE pushDefaultRules (which has a 1500ms sleep),
    // otherwise session_ready fires during pushDefaultRules and the listener misses it.
    if (options.initialTask) {
      const task = options.initialTask;
      const sid = session.id;
      let taskSent = false;
      const sendTask = () => {
        if (taskSent) return;
        taskSent = true;
        this.log(
          `Session ${sid} ready — sending deferred task (300ms settle delay)`,
        );
        // Delay to let TUI finish rendering after ready detection.
        // Without this, Claude Code's TUI can swallow the Enter key
        // if it arrives during a render cycle (50ms worker delay is too short).
        setTimeout(() => {
          this.sendToSession(sid, task).catch((err) =>
            this.log(`Failed to send deferred task to ${sid}: ${err}`),
          );
        }, 300);
        if (this.usingBunWorker) {
          (this.manager as BunCompatiblePTYManager).removeListener(
            "session_ready",
            onReady,
          );
        } else {
          (this.manager as PTYManager).removeListener("session_ready", onReady);
        }
      };
      const onReady = (readySession: WorkerSessionHandle | SessionHandle) => {
        if (readySession.id !== sid) return;
        sendTask();
      };

      if (session.status === "ready") {
        sendTask();
      } else {
        if (this.usingBunWorker) {
          (this.manager as BunCompatiblePTYManager).on(
            "session_ready",
            onReady,
          );
        } else {
          (this.manager as PTYManager).on("session_ready", onReady);
        }
      }
    }

    // Push default auto-response rules for common first-run prompts
    await this.pushDefaultRules(session.id, options.agentType);

    const sessionInfo = this.toSessionInfo(session, workdir);

    this.metricsTracker.get(options.agentType).spawned++;
    this.log(`Spawned session ${session.id} (${options.agentType})`);
    return sessionInfo;
  }

  /**
   * Push session-specific auto-response rules that depend on runtime config.
   * Trust prompts, update notices, and other static rules are handled by
   * adapter built-in rules (coding-agent-adapters). This only pushes rules
   * that need runtime values (e.g. API keys).
   */
  private async pushDefaultRules(
    sessionId: string,
    agentType: string,
  ): Promise<void> {
    const rules: AutoResponseRule[] = [];

    // Aider gitignore prompt
    if (agentType === "aider") {
      rules.push({
        pattern: /\.aider\*.*\.gitignore.*\(Y\)es\/\(N\)o/i,
        type: "config",
        response: "y",
        description: "Auto-accept adding .aider* to .gitignore",
        safe: true,
      });
    }

    // Gemini — auth flow (update notices are informational, don't need a response)
    if (agentType === "gemini") {
      // Auth menu detection — select API key or Google login based on available credentials
      const geminiApiKey = this.runtime.getSetting("GENERATIVE_AI_API_KEY") as
        | string
        | undefined;

      if (geminiApiKey) {
        // Have API key → select option 2 "Use an API key"
        rules.push({
          pattern:
            /Log in with Google|Use an API key|Use Vertex AI|gemini api key/i,
          type: "config",
          response: "2",
          description: "Select 'Use an API key' from Gemini auth menu",
          safe: true,
        });

        // Step 2: API key input prompt — send the actual key value.
        // Tight regex: only matches the Gemini CLI's exact prompt format
        // to prevent exfiltration via crafted terminal output.
        // once: fire at most once per session to prevent repeated credential injection.
        rules.push({
          pattern:
            /^(?:\s|[>$#])*(?:Enter|Paste) (?:your )?(?:Google AI|Gemini) API key:/i,
          type: "config",
          response: geminiApiKey,
          description: "Input Gemini API key from Gemini CLI auth prompt",
          safe: true,
          once: true,
        });
      } else {
        // No API key → select option 1 "Log in with Google" (opens browser OAuth)
        rules.push({
          pattern:
            /Log in with Google|Use an API key|Use Vertex AI|gemini api key/i,
          type: "config",
          response: "1",
          description:
            "Select 'Log in with Google' from Gemini auth menu (browser OAuth)",
          safe: true,
        });
      }
    }

    if (rules.length === 0) return;

    // Push rules to the session via the runtime API
    try {
      if (this.usingBunWorker) {
        for (const rule of rules) {
          await (this.manager as BunCompatiblePTYManager).addAutoResponseRule(
            sessionId,
            rule,
          );
        }
      } else {
        const nodeManager = this.manager as PTYManager;
        for (const rule of rules) {
          nodeManager.addAutoResponseRule(sessionId, rule);
        }
      }
      this.log(
        `Pushed ${rules.length} auto-response rules to session ${sessionId}`,
      );

      // Note: No retroactive check needed here. The worker's tryAutoResponse()
      // runs on every data chunk and checks the full output buffer against all
      // active rules. Once rules are pushed, the next data chunk will trigger
      // matching. The old retroactive check caused ghost responses because it
      // bypassed the worker's TUI-aware response logic (sendKeys vs writeRaw).
    } catch (err) {
      this.log(`Failed to push rules to session ${sessionId}: ${err}`);
    }
  }

  /**
   * Handle Gemini authentication when login_required fires.
   * Sends /auth to start the auth flow — auto-response rules
   * then handle menu selection and API key input.
   */
  private async handleGeminiAuth(sessionId: string): Promise<void> {
    const apiKey = this.runtime.getSetting("GENERATIVE_AI_API_KEY") as
      | string
      | undefined;

    if (apiKey) {
      this.log(
        `Gemini auth: API key available, sending /auth to start API key flow`,
      );
    } else {
      this.log(
        `Gemini auth: no API key configured, sending /auth for Google OAuth flow`,
      );
    }

    // Send /auth via sendKeys to avoid send() which sets status to "busy".
    // We need to stay in "authenticating" so detectReady fires after auth completes.
    try {
      await this.sendKeysToSession(sessionId, "/auth");
      await new Promise((r) => setTimeout(r, 50));
      await this.sendKeysToSession(sessionId, "enter");
    } catch (err) {
      this.log(`Gemini auth: failed to send /auth: ${err}`);
    }
  }

  /**
   * Send input to a session
   */
  async sendToSession(
    sessionId: string,
    input: string,
  ): Promise<SessionMessage | void> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const session = this.manager.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Mark buffer position for task response capture
    const buffer = this.sessionOutputBuffers.get(sessionId);
    if (buffer) {
      this.taskResponseMarkers.set(sessionId, buffer.length);
    }

    if (this.usingBunWorker) {
      // BunCompatiblePTYManager.send returns void
      await (this.manager as BunCompatiblePTYManager).send(sessionId, input);
      return;
    } else {
      // PTYManager.send returns SessionMessage
      return (this.manager as PTYManager).send(sessionId, input);
    }
  }

  /**
   * Send keys to a session (for special key sequences)
   */
  async sendKeysToSession(
    sessionId: string,
    keys: string | string[],
  ): Promise<void> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    if (this.usingBunWorker) {
      await (this.manager as BunCompatiblePTYManager).sendKeys(sessionId, keys);
    } else {
      const ptySession = (this.manager as PTYManager).getSession(sessionId);
      if (!ptySession) {
        throw new Error(`Session ${sessionId} not found`);
      }
      ptySession.sendKeys(keys);
    }
  }

  /**
   * Stop a PTY session
   */
  async stopSession(sessionId: string): Promise<void> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const session = this.manager.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (this.usingBunWorker) {
      await (this.manager as BunCompatiblePTYManager).kill(sessionId);
    } else {
      await (this.manager as PTYManager).stop(sessionId);
    }

    // Clean up output subscriber
    const unsubscribe = this.outputUnsubscribers.get(sessionId);
    if (unsubscribe) {
      unsubscribe();
      this.outputUnsubscribers.delete(sessionId);
    }

    this.sessionMetadata.delete(sessionId);
    this.sessionWorkdirs.delete(sessionId);
    this.sessionOutputBuffers.delete(sessionId);
    this.taskResponseMarkers.delete(sessionId);
    this.log(`Stopped session ${sessionId}`);
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): SessionInfo | undefined {
    if (!this.manager) {
      return undefined;
    }

    const session = this.manager.get(sessionId);
    if (!session) {
      return undefined;
    }

    return this.toSessionInfo(session, this.sessionWorkdirs.get(sessionId));
  }

  /**
   * List all active sessions
   */
  async listSessions(filter?: SessionFilter): Promise<SessionInfo[]> {
    if (!this.manager) {
      return [];
    }

    if (this.usingBunWorker) {
      const sessions = await (this.manager as BunCompatiblePTYManager).list();
      return sessions.map((s) =>
        this.toSessionInfo(s, this.sessionWorkdirs.get(s.id)),
      );
    } else {
      const sessions = (this.manager as PTYManager).list(filter);
      return sessions.map((s) =>
        this.toSessionInfo(s, this.sessionWorkdirs.get(s.id)),
      );
    }
  }

  /**
   * Subscribe to session output (streaming)
   */
  subscribeToOutput(
    sessionId: string,
    callback: (data: string) => void,
  ): () => void {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    if (this.usingBunWorker) {
      const unsubscribe = (
        this.manager as BunCompatiblePTYManager
      ).onSessionData(sessionId, callback);
      this.outputUnsubscribers.set(sessionId, unsubscribe);
      return unsubscribe;
    } else {
      // For native PTYManager, subscribe to the session's output event
      const ptySession = (this.manager as PTYManager).getSession(sessionId);
      if (!ptySession) {
        throw new Error(`Session ${sessionId} not found`);
      }
      ptySession.on("output", callback);
      const unsubscribe = () => ptySession.off("output", callback);
      this.outputUnsubscribers.set(sessionId, unsubscribe);
      return unsubscribe;
    }
  }

  /**
   * Get recent output from a session (Node PTYManager only)
   * For Bun, use subscribeToOutput instead
   */
  async getSessionOutput(sessionId: string, lines?: number): Promise<string> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    if (this.usingBunWorker) {
      // Read from our local buffer (populated by onSessionData subscription)
      const buffer = this.sessionOutputBuffers.get(sessionId);
      if (!buffer) return "";
      const tail = lines ?? buffer.length;
      return buffer.slice(-tail).join("\n");
    }

    const output: string[] = [];
    for await (const line of (this.manager as PTYManager).logs(sessionId, {
      tail: lines,
    })) {
      output.push(line);
    }
    return output.join("\n");
  }

  /**
   * Check if a session is waiting for input (blocked)
   */
  isSessionBlocked(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    return session?.status === "authenticating";
  }

  /**
   * Check which coding agents are installed and available
   * Returns preflight results for each agent type
   */
  async checkAvailableAgents(
    types?: AdapterType[],
  ): Promise<PreflightResult[]> {
    const agentTypes =
      types ?? (["claude", "gemini", "codex", "aider"] as AdapterType[]);
    return checkAdapters(agentTypes);
  }

  /**
   * Get list of supported agent types
   */
  getSupportedAgentTypes(): CodingAgentType[] {
    return ["shell", "claude", "gemini", "codex", "aider"];
  }

  /**
   * Classify a stalled session using Milady's LLM.
   * Called by pty-manager when a busy session has no new output for stallTimeoutMs.
   */
  private async classifyStall(
    sessionId: string,
    recentOutput: string,
  ): Promise<StallClassification | null> {
    const meta = this.sessionMetadata.get(sessionId);
    const agentType = (meta?.agentType as string) ?? "unknown";
    return classifyStallOutput({
      sessionId,
      recentOutput,
      agentType,
      buffers: this.sessionOutputBuffers,
      traceEntries: this.traceEntries,
      runtime: this.runtime,
      manager: this.manager,
      metricsTracker: this.metricsTracker,
      log: (msg: string) => this.log(msg),
    });
  }

  // ─── Workspace Files ───

  /**
   * Get an adapter instance for metadata/file operations (cached).
   * These run in the main process — not the PTY worker.
   */
  private getAdapter(agentType: AdapterType): BaseCodingAdapter {
    let adapter = this.adapterCache.get(agentType);
    if (!adapter) {
      adapter = createAdapter(agentType);
      this.adapterCache.set(agentType, adapter);
    }
    return adapter;
  }

  /**
   * Get workspace file descriptors for an agent type.
   * Describes what files the CLI reads (memory, config, rules).
   */
  getWorkspaceFiles(agentType: AdapterType): AgentFileDescriptor[] {
    return this.getAdapter(agentType).getWorkspaceFiles();
  }

  /**
   * Get the primary memory file path for an agent type.
   * E.g. "CLAUDE.md" for claude, "GEMINI.md" for gemini.
   */
  getMemoryFilePath(agentType: AdapterType): string {
    return this.getAdapter(agentType).memoryFilePath;
  }

  /**
   * Get the approval config that would be generated for an agent type + preset.
   * Useful for previewing what permissions an agent will have.
   */
  getApprovalConfig(
    agentType: AdapterType,
    preset: ApprovalPreset,
  ): ApprovalConfig {
    return generateApprovalConfig(agentType, preset);
  }

  /**
   * Write content to an agent's memory file in a workspace.
   * Creates parent directories as needed.
   *
   * @returns The absolute path of the written file
   */
  async writeMemoryFile(
    agentType: AdapterType,
    workspacePath: string,
    content: string,
    options?: WriteMemoryOptions,
  ): Promise<string> {
    return this.getAdapter(agentType).writeMemoryFile(
      workspacePath,
      content,
      options,
    );
  }

  // ─── Event & Adapter Registration ───

  /**
   * Register a callback for session events
   */
  onSessionEvent(callback: SessionEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Register a custom adapter for new agent types (Node PTYManager only)
   * Adapters in the Bun worker are pre-registered
   */
  registerAdapter(adapter: unknown): void {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    if (this.usingBunWorker) {
      this.log(
        "registerAdapter not available with Bun worker - adapters must be in the worker",
      );
      return;
    }

    (this.manager as PTYManager).registerAdapter(
      adapter as Parameters<PTYManager["registerAdapter"]>[0],
    );
    this.log(`Registered adapter`);
  }

  private toSessionInfo(
    session: SessionHandle | WorkerSessionHandle,
    workdir?: string,
  ): SessionInfo {
    return {
      id: session.id,
      name: session.name,
      agentType: session.type,
      workdir: workdir ?? process.cwd(),
      status: session.status,
      createdAt: session.startedAt ? new Date(session.startedAt) : new Date(),
      lastActivityAt: session.lastActivityAt
        ? new Date(session.lastActivityAt)
        : new Date(),
      metadata: this.sessionMetadata.get(session.id),
    };
  }

  private emitEvent(sessionId: string, event: string, data: unknown): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(sessionId, event, data);
      } catch (err) {
        this.log(`Event callback error: ${err}`);
      }
    }
  }

  // ─── Metrics ───

  /**
   * Get agent performance metrics for observability.
   * Returns per-agent-type stats: completion counts, detection method, avg time, stall rate.
   */
  getAgentMetrics() {
    return this.metricsTracker.getAll();
  }

  private log(message: string): void {
    if (this.serviceConfig.debug) {
      console.log(`[PTYService] ${message}`);
    }
  }
}
