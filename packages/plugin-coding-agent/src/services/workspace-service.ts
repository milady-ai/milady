/**
 * Coding Workspace Service - Manages git workspaces for coding tasks
 *
 * Wraps git-workspace-service to provide:
 * - Workspace provisioning (clone/worktree)
 * - Branch management
 * - Commit, push, and PR creation
 * - Credential management
 *
 * @module services/workspace-service
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import {
  type CreateIssueOptions,
  CredentialService,
  GitHubPatClient,
  type IssueComment,
  type IssueInfo,
  type IssueState,
  MemoryTokenStore,
  OAuthDeviceFlow,
  type PullRequestInfo,
  type WorkspaceConfig,
  type WorkspaceEvent,
  type WorkspaceFinalization,
  WorkspaceService,
  type WorkspaceStatus,
} from "git-workspace-service";

/**
 * Callback for surfacing auth prompts to the user.
 * Returns the auth prompt text so Milady can relay it through chat.
 */
export type AuthPromptCallback = (prompt: {
  verificationUri: string;
  userCode: string;
  expiresIn: number;
}) => void;

export interface CodingWorkspaceConfig {
  /** Base directory for workspaces (default: ~/.milaidy/workspaces) */
  baseDir?: string;
  /** Branch prefix (default: "milaidy") */
  branchPrefix?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Max age for orphaned workspace directories in ms (default: 24 hours). Set to 0 to disable GC. */
  workspaceTtlMs?: number;
}

export interface ProvisionWorkspaceOptions {
  /** Git repository URL */
  repo: string;
  /** Base branch to create from (default: "main") */
  baseBranch?: string;
  /** Exact branch name to use (overrides auto-generated name) */
  branchName?: string;
  /** Use worktree instead of clone */
  useWorktree?: boolean;
  /** Parent workspace ID for worktree */
  parentWorkspaceId?: string;
  /** Execution context */
  execution?: { id: string; patternName: string };
  /** Task context */
  task?: { id: string; role: string; slug?: string };
  /** User-provided credentials */
  userCredentials?: { type: "pat" | "oauth" | "ssh"; token?: string };
}

export interface WorkspaceResult {
  id: string;
  path: string;
  branch: string;
  baseBranch: string;
  isWorktree: boolean;
  repo: string;
  status: WorkspaceStatus;
  /** Semantic label for referencing this workspace (e.g. "auth-bugfix", "api-tests") */
  label?: string;
}

export interface CommitOptions {
  message: string;
  all?: boolean;
}

export interface PushOptions {
  setUpstream?: boolean;
  force?: boolean;
}

export interface PROptions {
  title: string;
  body: string;
  base?: string;
  draft?: boolean;
  labels?: string[];
  reviewers?: string[];
}

export interface WorkspaceStatusResult {
  branch: string;
  clean: boolean;
  modified: string[];
  staged: string[];
  untracked: string[];
}

type WorkspaceEventCallback = (event: WorkspaceEvent) => void;

export class CodingWorkspaceService {
  static serviceType = "CODING_WORKSPACE_SERVICE";
  capabilityDescription = "Manages git workspaces for coding tasks";

  private runtime: IAgentRuntime;
  private workspaceService: WorkspaceService | null = null;
  private credentialService: CredentialService | null = null;
  private githubClient: GitHubPatClient | null = null;
  private githubAuthInProgress: Promise<GitHubPatClient> | null = null;
  private serviceConfig: CodingWorkspaceConfig;
  private workspaces: Map<string, WorkspaceResult> = new Map();
  private labels: Map<string, string> = new Map(); // label → workspaceId
  private eventCallbacks: WorkspaceEventCallback[] = [];
  private authPromptCallback: AuthPromptCallback | null = null;

  constructor(runtime: IAgentRuntime, config: CodingWorkspaceConfig = {}) {
    this.runtime = runtime;
    this.serviceConfig = {
      baseDir:
        config.baseDir ?? path.join(os.homedir(), ".milaidy", "workspaces"),
      branchPrefix: config.branchPrefix ?? "milaidy",
      debug: config.debug ?? false,
      workspaceTtlMs: config.workspaceTtlMs ?? 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  static async start(runtime: IAgentRuntime): Promise<CodingWorkspaceService> {
    const config = runtime.getSetting("CODING_WORKSPACE_CONFIG") as
      | CodingWorkspaceConfig
      | null
      | undefined;
    const service = new CodingWorkspaceService(runtime, config ?? {});
    await service.initialize();
    return service;
  }

  static async stopRuntime(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService("CODING_WORKSPACE_SERVICE") as unknown as
      | CodingWorkspaceService
      | undefined;
    if (service) {
      await service.stop();
    }
  }

  private async initialize(): Promise<void> {
    // Initialize credential service with memory token store
    this.credentialService = new CredentialService({
      tokenStore: new MemoryTokenStore(),
    });

    // Initialize workspace service
    this.workspaceService = new WorkspaceService({
      config: {
        baseDir: this.serviceConfig.baseDir as string,
        branchPrefix: this.serviceConfig.branchPrefix,
      },
      credentialService: this.credentialService,
      logger: this.serviceConfig.debug
        ? {
            info: (data: unknown, msg?: string) =>
              console.log(`[WorkspaceService] ${msg ?? ""}`, data),
            warn: (data: unknown, msg?: string) =>
              console.warn(`[WorkspaceService] ${msg ?? ""}`, data),
            error: (data: unknown, msg?: string) =>
              console.error(`[WorkspaceService] ${msg ?? ""}`, data),
            debug: (_data: unknown, msg?: string) => this.log(`${msg ?? ""}`),
          }
        : undefined,
    });

    await this.workspaceService.initialize();

    // Initialize GitHub PAT client for issue management (if token available)
    const githubToken = this.runtime.getSetting("GITHUB_TOKEN") as
      | string
      | undefined;
    if (githubToken) {
      this.githubClient = new GitHubPatClient({ token: githubToken });
      this.log("GitHubPatClient initialized with PAT");
    } else {
      this.log(
        "GITHUB_TOKEN not set - will use OAuth device flow when GitHub access is needed",
      );
    }

    // Set up event forwarding
    this.workspaceService.onEvent((event: WorkspaceEvent) => {
      this.emitEvent(event);
    });

    this.log("CodingWorkspaceService initialized");

    // Run startup GC in background (non-blocking)
    this.gcOrphanedWorkspaces().catch((err) => {
      console.warn("[CodingWorkspaceService] Startup GC failed:", err);
    });
  }

  async stop(): Promise<void> {
    // Clean up all workspaces
    for (const [id] of this.workspaces) {
      try {
        await this.removeWorkspace(id);
      } catch (err) {
        this.log(`Error cleaning up workspace ${id}: ${err}`);
      }
    }
    this.workspaces.clear();
    this.workspaceService = null;
    this.credentialService = null;
    this.githubClient = null;
    this.log("CodingWorkspaceService shutdown complete");
  }

  /**
   * Provision a new workspace
   */
  async provisionWorkspace(
    options: ProvisionWorkspaceOptions,
  ): Promise<WorkspaceResult> {
    if (!this.workspaceService) {
      throw new Error("CodingWorkspaceService not initialized");
    }

    // Normalize repo URL: strip trailing slashes to prevent git-workspace-service
    // from appending .git incorrectly (e.g. "repo/" → "repo/.git" instead of "repo.git")
    const repo = options.repo.replace(/\/+$/, "");

    const executionId = options.execution?.id ?? `exec-${Date.now()}`;
    const taskId = options.task?.id ?? `task-${Date.now()}`;

    const workspaceConfig: WorkspaceConfig = {
      repo,
      strategy: options.useWorktree ? "worktree" : "clone",
      parentWorkspace: options.parentWorkspaceId,
      branchStrategy: "feature_branch",
      branchName: options.branchName,
      baseBranch: options.baseBranch ?? "main",
      execution: {
        id: executionId,
        patternName: options.execution?.patternName ?? "milaidy-coding",
      },
      task: {
        id: taskId,
        role: options.task?.role ?? "coding-agent",
        slug: options.task?.slug,
      },
      userCredentials: options.userCredentials
        ? {
            type: options.userCredentials.type,
            token: options.userCredentials.token ?? "",
            provider: "github",
          }
        : undefined,
    };

    const workspace = await this.workspaceService.provision(workspaceConfig);

    const result: WorkspaceResult = {
      id: workspace.id,
      path: workspace.path,
      branch: workspace.branch.name,
      baseBranch: workspace.branch.baseBranch,
      isWorktree: workspace.strategy === "worktree",
      repo: workspace.repo,
      status: workspace.status,
    };

    this.workspaces.set(workspace.id, result);
    this.log(`Provisioned workspace ${workspace.id}`);
    return result;
  }

  /**
   * Get a workspace by ID
   */
  getWorkspace(id: string): WorkspaceResult | undefined {
    return this.workspaces.get(id);
  }

  /**
   * List all workspaces
   */
  listWorkspaces(): WorkspaceResult[] {
    return Array.from(this.workspaces.values());
  }

  /**
   * Assign a semantic label to a workspace (e.g. "auth-bugfix").
   * If the label already exists, it is reassigned to the new workspace.
   */
  setLabel(workspaceId: string, label: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    // Remove old label if this workspace already had one
    if (workspace.label) {
      this.labels.delete(workspace.label);
    }
    // Remove label from any other workspace that had it
    const existing = this.labels.get(label);
    if (existing && existing !== workspaceId) {
      const oldWs = this.workspaces.get(existing);
      if (oldWs) oldWs.label = undefined;
    }
    workspace.label = label;
    this.labels.set(label, workspaceId);
    this.log(`Labeled workspace ${workspaceId} as "${label}"`);
  }

  /**
   * Look up a workspace by its semantic label.
   */
  getWorkspaceByLabel(label: string): WorkspaceResult | undefined {
    const id = this.labels.get(label);
    return id ? this.workspaces.get(id) : undefined;
  }

  /**
   * Resolve a workspace by label or ID.
   */
  resolveWorkspace(labelOrId: string): WorkspaceResult | undefined {
    return (
      this.getWorkspaceByLabel(labelOrId) ?? this.workspaces.get(labelOrId)
    );
  }

  /**
   * Get workspace status (git status)
   */
  async getStatus(workspaceId: string): Promise<WorkspaceStatusResult> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Execute git status in workspace
    const { execFileSync } = await import("node:child_process");

    const statusOutput = execFileSync("git", ["status", "--porcelain"], {
      cwd: workspace.path,
      encoding: "utf-8",
    });

    const branchOutput = execFileSync("git", ["branch", "--show-current"], {
      cwd: workspace.path,
      encoding: "utf-8",
    }).trim();

    const lines = statusOutput.split("\n").filter(Boolean);
    const modified: string[] = [];
    const staged: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const filename = line.slice(3);

      if (indexStatus === "?" && workTreeStatus === "?") {
        untracked.push(filename);
      } else if (indexStatus !== " " && indexStatus !== "?") {
        staged.push(filename);
      } else if (workTreeStatus !== " ") {
        modified.push(filename);
      }
    }

    return {
      branch: branchOutput,
      clean: lines.length === 0,
      modified,
      staged,
      untracked,
    };
  }

  /**
   * Commit changes in a workspace
   */
  async commit(workspaceId: string, options: CommitOptions): Promise<string> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const { execFileSync } = await import("node:child_process");

    if (options.all) {
      execFileSync("git", ["add", "-A"], { cwd: workspace.path });
    }

    execFileSync("git", ["commit", "-m", options.message], {
      cwd: workspace.path,
    });

    const hash = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workspace.path,
      encoding: "utf-8",
    }).trim();

    this.log(`Committed ${hash.slice(0, 8)} in workspace ${workspaceId}`);
    return hash;
  }

  /**
   * Push changes to remote
   */
  async push(workspaceId: string, options?: PushOptions): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const { execFileSync } = await import("node:child_process");

    const args = ["push"];
    if (options?.setUpstream) {
      args.push("-u", "origin", workspace.branch);
    }
    if (options?.force) {
      args.push("--force");
    }

    execFileSync("git", args, { cwd: workspace.path });
    this.log(`Pushed workspace ${workspaceId}`);
  }

  /**
   * Create a pull request
   */
  async createPR(
    workspaceId: string,
    options: PROptions,
  ): Promise<PullRequestInfo> {
    if (!this.workspaceService) {
      throw new Error("CodingWorkspaceService not initialized");
    }

    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const finalization: WorkspaceFinalization = {
      push: false, // Already pushed
      createPr: true,
      pr: {
        title: options.title,
        body: options.body,
        targetBranch: options.base ?? workspace.baseBranch,
        draft: options.draft,
        labels: options.labels,
        reviewers: options.reviewers,
      },
      cleanup: false,
    };

    const result = await this.workspaceService.finalize(
      workspaceId,
      finalization,
    );
    if (!result) {
      throw new Error("Failed to create PR");
    }

    this.log(`Created PR #${result.number} for workspace ${workspaceId}`);
    return result;
  }

  // === Issue Management ===

  private parseOwnerRepo(repo: string): { owner: string; repo: string } {
    // Handle URLs like https://github.com/owner/repo or owner/repo
    const match = repo.match(/(?:github\.com\/)?([^/]+)\/([^/.]+)/);
    if (!match) {
      throw new Error(`Cannot parse owner/repo from: ${repo}`);
    }
    return { owner: match[1], repo: match[2] };
  }

  /**
   * Set a callback to surface OAuth auth prompts to the user.
   * Called with verification URL + user code when GitHub auth is needed.
   */
  setAuthPromptCallback(callback: AuthPromptCallback): void {
    this.authPromptCallback = callback;
  }

  private async ensureGitHubClient(): Promise<GitHubPatClient> {
    // Already have a client
    if (this.githubClient) return this.githubClient;

    // Auth already in progress (another call triggered it) - wait for it
    if (this.githubAuthInProgress) return this.githubAuthInProgress;

    // Check for PAT (re-check in case it was set after init)
    const githubToken = this.runtime.getSetting("GITHUB_TOKEN") as
      | string
      | undefined;
    if (githubToken) {
      this.githubClient = new GitHubPatClient({ token: githubToken });
      this.log("GitHubPatClient initialized with PAT (late binding)");
      return this.githubClient;
    }

    // Try OAuth device flow (explicit user consent, scoped permissions)
    const clientId = this.runtime.getSetting("GITHUB_OAUTH_CLIENT_ID") as
      | string
      | undefined;
    if (!clientId) {
      throw new Error(
        "GitHub access required but no credentials available. " +
          "Set GITHUB_TOKEN (PAT) or GITHUB_OAUTH_CLIENT_ID (for OAuth device flow).",
      );
    }

    // Start OAuth - deduplicate concurrent requests
    this.githubAuthInProgress = this.performOAuthFlow(clientId);
    try {
      const client = await this.githubAuthInProgress;
      return client;
    } finally {
      this.githubAuthInProgress = null;
    }
  }

  private async performOAuthFlow(clientId: string): Promise<GitHubPatClient> {
    const clientSecret = this.runtime.getSetting(
      "GITHUB_OAUTH_CLIENT_SECRET",
    ) as string | undefined;

    const oauth = new OAuthDeviceFlow({
      clientId,
      clientSecret,
      permissions: {
        repositories: { type: "public" },
        contents: "write",
        issues: "write",
        pullRequests: "write",
        metadata: "read",
      },
      timeout: 300, // 5 minutes
    });

    // Step 1: Request device code
    const deviceCode = await oauth.requestDeviceCode();

    // Step 2: Surface the auth prompt to the user
    if (this.authPromptCallback) {
      this.authPromptCallback({
        verificationUri: deviceCode.verificationUri,
        userCode: deviceCode.userCode,
        expiresIn: deviceCode.expiresIn,
      });
    } else {
      // Fallback: log to console
      console.log(
        `\n[GitHub Auth] Go to ${deviceCode.verificationUri} and enter code: ${deviceCode.userCode}\n`,
      );
    }

    // Step 3: Poll until user completes auth
    const token = await oauth.pollForToken(deviceCode);

    // Step 4: Create client with the obtained token
    this.githubClient = new GitHubPatClient({ token: token.accessToken });
    this.log("GitHubPatClient initialized via OAuth device flow");
    return this.githubClient;
  }

  async createIssue(
    repo: string,
    options: CreateIssueOptions,
  ): Promise<IssueInfo> {
    const client = await this.ensureGitHubClient();
    const { owner, repo: repoName } = this.parseOwnerRepo(repo);
    const issue = await client.createIssue(owner, repoName, options);
    this.log(`Created issue #${issue.number}: ${issue.title}`);
    return issue;
  }

  async getIssue(repo: string, issueNumber: number): Promise<IssueInfo> {
    const client = await this.ensureGitHubClient();
    const { owner, repo: repoName } = this.parseOwnerRepo(repo);
    return client.getIssue(owner, repoName, issueNumber);
  }

  async listIssues(
    repo: string,
    options?: {
      state?: IssueState | "all";
      labels?: string[];
      assignee?: string;
    },
  ): Promise<IssueInfo[]> {
    const client = await this.ensureGitHubClient();
    const { owner, repo: repoName } = this.parseOwnerRepo(repo);
    return client.listIssues(owner, repoName, options);
  }

  async updateIssue(
    repo: string,
    issueNumber: number,
    options: {
      title?: string;
      body?: string;
      state?: IssueState;
      labels?: string[];
      assignees?: string[];
    },
  ): Promise<IssueInfo> {
    const client = await this.ensureGitHubClient();
    const { owner, repo: repoName } = this.parseOwnerRepo(repo);
    return client.updateIssue(owner, repoName, issueNumber, options);
  }

  async addComment(
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<IssueComment> {
    const client = await this.ensureGitHubClient();
    const { owner, repo: repoName } = this.parseOwnerRepo(repo);
    return client.addComment(owner, repoName, issueNumber, { body });
  }

  async listComments(
    repo: string,
    issueNumber: number,
  ): Promise<IssueComment[]> {
    const client = await this.ensureGitHubClient();
    const { owner, repo: repoName } = this.parseOwnerRepo(repo);
    return client.listComments(owner, repoName, issueNumber);
  }

  async closeIssue(repo: string, issueNumber: number): Promise<IssueInfo> {
    const client = await this.ensureGitHubClient();
    const { owner, repo: repoName } = this.parseOwnerRepo(repo);
    const issue = await client.closeIssue(owner, repoName, issueNumber);
    this.log(`Closed issue #${issueNumber}`);
    return issue;
  }

  async reopenIssue(repo: string, issueNumber: number): Promise<IssueInfo> {
    const client = await this.ensureGitHubClient();
    const { owner, repo: repoName } = this.parseOwnerRepo(repo);
    return client.reopenIssue(owner, repoName, issueNumber);
  }

  async addLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    const client = await this.ensureGitHubClient();
    const { owner, repo: repoName } = this.parseOwnerRepo(repo);
    await client.addLabels(owner, repoName, issueNumber, labels);
  }

  /**
   * Remove a workspace
   */
  async removeWorkspace(workspaceId: string): Promise<void> {
    if (!this.workspaceService) {
      throw new Error("CodingWorkspaceService not initialized");
    }

    await this.workspaceService.cleanup(workspaceId);
    // Clean up label mapping
    const workspace = this.workspaces.get(workspaceId);
    if (workspace?.label) {
      this.labels.delete(workspace.label);
    }
    this.workspaces.delete(workspaceId);
    this.log(`Removed workspace ${workspaceId}`);
  }

  /**
   * Register a callback for workspace events
   */
  onEvent(callback: WorkspaceEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      const index = this.eventCallbacks.indexOf(callback);
      if (index !== -1) {
        this.eventCallbacks.splice(index, 1);
      }
    };
  }

  private emitEvent(event: WorkspaceEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (err) {
        this.log(`Event callback error: ${err}`);
      }
    }
  }

  /**
   * Remove a scratch directory (non-git workspace used for ad-hoc tasks).
   * Safe to call for any path under the workspaces base dir.
   */
  async removeScratchDir(dirPath: string): Promise<void> {
    const baseDir = this.serviceConfig.baseDir as string;
    // Safety: only remove directories under our base dir
    const resolved = path.resolve(dirPath);
    const resolvedBase = path.resolve(baseDir) + path.sep;
    if (
      !resolved.startsWith(resolvedBase) &&
      resolved !== path.resolve(baseDir)
    ) {
      console.warn(
        `[CodingWorkspaceService] Refusing to remove dir outside base: ${resolved}`,
      );
      return;
    }
    try {
      await fs.promises.rm(resolved, { recursive: true, force: true });
      this.log(`Removed scratch dir ${resolved}`);
    } catch (err) {
      console.warn(
        `[CodingWorkspaceService] Failed to remove scratch dir ${resolved}:`,
        err,
      );
    }
  }

  /**
   * Garbage-collect orphaned workspace directories on startup.
   * Removes directories older than workspaceTtlMs that aren't tracked by the current session.
   */
  private async gcOrphanedWorkspaces(): Promise<void> {
    const ttl = this.serviceConfig.workspaceTtlMs;
    if (ttl === 0) {
      this.log("Workspace GC disabled (workspaceTtlMs=0)");
      return;
    }

    const baseDir = this.serviceConfig.baseDir as string;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(baseDir, { withFileTypes: true });
    } catch {
      // Base dir doesn't exist yet — nothing to clean
      return;
    }

    const now = Date.now();
    let removed = 0;
    let skipped = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip directories tracked by the current session
      if (this.workspaces.has(entry.name)) {
        skipped++;
        continue;
      }

      const dirPath = path.join(baseDir, entry.name);
      try {
        const stat = await fs.promises.stat(dirPath);
        const age = now - stat.mtimeMs;

        if (age > (ttl ?? 24 * 60 * 60 * 1000)) {
          await fs.promises.rm(dirPath, { recursive: true, force: true });
          removed++;
        } else {
          skipped++;
        }
      } catch (err) {
        // Stat or remove failed — skip
        this.log(`GC: skipping ${entry.name}: ${err}`);
        skipped++;
      }
    }

    if (removed > 0 || skipped > 0) {
      console.log(
        `[CodingWorkspaceService] Startup GC: removed ${removed} orphaned workspace(s), kept ${skipped}`,
      );
    }
  }

  private log(message: string): void {
    if (this.serviceConfig.debug) {
      console.log(`[CodingWorkspaceService] ${message}`);
    }
  }
}
