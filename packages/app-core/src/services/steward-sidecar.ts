/**
 * Steward Sidecar — manages Steward API as a child process for embedded wallet functionality.
 *
 * Responsibilities:
 *   - Start Steward API as a child process on a local port (default 3200)
 *   - Health check polling until Steward is ready
 *   - Auto-restart on crash (exponential backoff)
 *   - Clean shutdown on app exit
 *   - First-launch wallet creation (tenant + agent + wallet)
 *   - Subsequent launches: verify existing wallet loads
 *
 * The sidecar runs Steward in embedded mode with a local Postgres-compatible
 * database (PGLite when available, or standard Postgres via DATABASE_URL).
 *
 * Usage:
 *   const sidecar = new StewardSidecar({ dataDir: '~/.milady/steward/' });
 *   await sidecar.start();  // starts process + first-launch setup
 *   const client = sidecar.getClient();
 *   await sidecar.stop();
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StewardSidecarConfig {
  /** Directory for Steward data (PGLite storage, config, secrets). Default: ~/.milady/steward/ */
  dataDir: string;
  /** Port for the local Steward API. Default: 3200 */
  port?: number;
  /** Master password for Steward's vault encryption. Auto-generated on first launch if not set. */
  masterPassword?: string;
  /** Path to the steward API entry point (bun script). */
  stewardEntryPoint?: string;
  /** DATABASE_URL override. When empty, sidecar will look for PGLite or use dataDir-based config. */
  databaseUrl?: string;
  /** Max restart attempts before giving up. Default: 5 */
  maxRestarts?: number;
  /** Callback for status changes (for UI indicators). */
  onStatusChange?: (status: StewardSidecarStatus) => void;
  /** Callback for log output from the child process. */
  onLog?: (line: string, stream: "stdout" | "stderr") => void;
}

export interface StewardSidecarStatus {
  state: "stopped" | "starting" | "running" | "error" | "restarting";
  port: number | null;
  pid: number | null;
  error: string | null;
  restartCount: number;
  walletAddress: string | null;
  agentId: string | null;
  tenantId: string | null;
  startedAt: number | null;
}

export interface StewardWalletInfo {
  tenantId: string;
  tenantApiKey: string;
  agentId: string;
  agentName: string;
  agentToken: string;
  walletAddress: string;
}

interface StewardCredentials {
  tenantId: string;
  tenantApiKey: string;
  agentId: string;
  agentToken: string;
  walletAddress: string;
  masterPassword: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 3200;
const DEFAULT_MAX_RESTARTS = 5;
const HEALTH_CHECK_INTERVAL_MS = 500;
const HEALTH_CHECK_TIMEOUT_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const DEFAULT_TENANT_ID = "milady-desktop";
const DEFAULT_TENANT_NAME = "Milady Desktop";
const DEFAULT_AGENT_ID = "milady-wallet";
const DEFAULT_AGENT_NAME = "milady-wallet";
const CREDENTIALS_FILE = "credentials.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveDataDir(dataDir: string): string {
  if (dataDir.startsWith("~")) {
    const home =
      typeof process !== "undefined"
        ? process.env.HOME || process.env.USERPROFILE || ""
        : "";
    return dataDir.replace(/^~/, home);
  }
  return dataDir;
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `stw_${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

function generateMasterPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// StewardSidecar
// ---------------------------------------------------------------------------

export class StewardSidecar {
  private config: Required<
    Pick<StewardSidecarConfig, "dataDir" | "port" | "maxRestarts">
  > &
    StewardSidecarConfig;
  private status: StewardSidecarStatus;
  private process: {
    kill: (signal?: string) => void;
    pid?: number | null;
    exitCode?: number | null;
    exited?: Promise<number>;
  } | null = null;
  private stopping = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private credentials: StewardCredentials | null = null;
  private healthCheckAbort: AbortController | null = null;

  constructor(config: StewardSidecarConfig) {
    this.config = {
      port: DEFAULT_PORT,
      maxRestarts: DEFAULT_MAX_RESTARTS,
      ...config,
      dataDir: resolveDataDir(config.dataDir),
    };

    this.status = {
      state: "stopped",
      port: null,
      pid: null,
      error: null,
      restartCount: 0,
      walletAddress: null,
      agentId: null,
      tenantId: null,
      startedAt: null,
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Start the Steward sidecar process and wait until it's healthy.
   * On first launch, creates tenant + agent + wallet.
   * On subsequent launches, verifies existing wallet.
   */
  async start(): Promise<StewardSidecarStatus> {
    if (this.status.state === "running") {
      return this.status;
    }

    this.stopping = false;
    this.updateStatus({ state: "starting", error: null });

    try {
      // Ensure data directory exists
      await this.ensureDataDir();

      // Load or generate master password
      await this.loadOrCreateCredentials();

      // Spawn steward process
      await this.spawnProcess();

      // Wait for health check
      await this.waitForHealthy();

      // First-launch setup or verification
      await this.ensureWalletSetup();

      this.updateStatus({
        state: "running",
        port: this.config.port,
        startedAt: Date.now(),
      });

      return this.status;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.updateStatus({ state: "error", error });
      throw err;
    }
  }

  /** Stop the Steward sidecar process gracefully. */
  async stop(): Promise<void> {
    this.stopping = true;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.healthCheckAbort) {
      this.healthCheckAbort.abort();
      this.healthCheckAbort = null;
    }

    if (this.process) {
      try {
        this.process.kill("SIGTERM");
        // Wait up to 5s for graceful shutdown
        const timeout = setTimeout(() => {
          try {
            this.process?.kill("SIGKILL");
          } catch {
            // already dead
          }
        }, 5_000);

        if (this.process.exited) {
          await this.process.exited;
        }
        clearTimeout(timeout);
      } catch {
        // process already dead
      }
      this.process = null;
    }

    this.updateStatus({
      state: "stopped",
      port: null,
      pid: null,
      startedAt: null,
    });
  }

  /** Restart the sidecar (stop + start). */
  async restart(): Promise<StewardSidecarStatus> {
    await this.stop();
    this.status.restartCount = 0;
    return this.start();
  }

  /** Get current sidecar status. */
  getStatus(): StewardSidecarStatus {
    return { ...this.status };
  }

  /** Get the API base URL for Steward. */
  getApiBase(): string {
    return `http://127.0.0.1:${this.config.port}`;
  }

  /** Get stored wallet credentials (null if not initialized). */
  getCredentials(): StewardCredentials | null {
    return this.credentials ? { ...this.credentials } : null;
  }

  /** Get tenant API key for making authenticated requests. */
  getTenantApiKey(): string | null {
    return this.credentials?.tenantApiKey ?? null;
  }

  /** Get agent token for making agent-scoped requests. */
  getAgentToken(): string | null {
    return this.credentials?.agentToken ?? null;
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private async ensureDataDir(): Promise<void> {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = this.config.dataDir;

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Ensure subdirs
    for (const sub of ["data", "logs"]) {
      const subDir = path.join(dir, sub);
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }
    }
  }

  private async loadOrCreateCredentials(): Promise<void> {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const credPath = path.join(this.config.dataDir, CREDENTIALS_FILE);

    if (fs.existsSync(credPath)) {
      try {
        const raw = fs.readFileSync(credPath, "utf-8");
        this.credentials = JSON.parse(raw) as StewardCredentials;

        // Backfill master password from config if credentials file doesn't have it
        if (!this.credentials.masterPassword && this.config.masterPassword) {
          this.credentials.masterPassword = this.config.masterPassword;
        }

        this.updateStatus({
          walletAddress: this.credentials.walletAddress,
          agentId: this.credentials.agentId,
          tenantId: this.credentials.tenantId,
        });
        return;
      } catch {
        console.warn(
          "[StewardSidecar] Failed to parse credentials, will recreate",
        );
      }
    }

    // First launch — generate master password if not provided
    if (!this.config.masterPassword) {
      this.config.masterPassword = generateMasterPassword();
    }
  }

  private async spawnProcess(): Promise<void> {
    const path = await import("node:path");

    // Determine steward entry point
    const entryPoint =
      this.config.stewardEntryPoint || this.findStewardEntryPoint();

    if (!entryPoint) {
      throw new Error(
        "Steward API entry point not found. Set stewardEntryPoint in config or ensure @stwd/api is installed.",
      );
    }

    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      PORT: String(this.config.port),
      STEWARD_LOCAL: "true",
      STEWARD_BIND_HOST: "127.0.0.1",
      NODE_ENV: "production",
    };

    // Set master password
    const masterPw =
      this.credentials?.masterPassword || this.config.masterPassword;
    if (masterPw) {
      env.STEWARD_MASTER_PASSWORD = masterPw;
    }

    // Set database URL
    if (this.config.databaseUrl) {
      env.DATABASE_URL = this.config.databaseUrl;
    }

    // Set data directory for PGLite
    env.STEWARD_DATA_DIR = path.join(this.config.dataDir, "data");

    // Disable Redis in embedded mode (sidecar doesn't need it)
    env.STEWARD_REDIS_DISABLED = "true";

    console.log(
      `[StewardSidecar] Spawning steward on port ${this.config.port}`,
      { entryPoint, dataDir: this.config.dataDir },
    );

    // Use Bun.spawn if available, otherwise fall back to child_process
    if (typeof globalThis.Bun !== "undefined") {
      const proc = Bun.spawn(["bun", "run", entryPoint], {
        env,
        cwd: path.dirname(entryPoint),
        stdout: "pipe",
        stderr: "pipe",
      });

      this.process = proc as unknown as typeof this.process;
      this.updateStatus({ pid: proc.pid ?? null });

      // Stream output
      this.pipeOutput(proc.stdout, "stdout");
      this.pipeOutput(proc.stderr, "stderr");

      // Handle exit
      proc.exited.then((code) => {
        if (!this.stopping) {
          console.warn(
            `[StewardSidecar] Process exited unexpectedly (code ${code})`,
          );
          void this.handleCrash(code);
        }
      });
    } else {
      // Node.js fallback
      const { spawn } = await import("node:child_process");
      const child = spawn("node", [entryPoint], {
        env,
        cwd: path.dirname(entryPoint),
        stdio: ["ignore", "pipe", "pipe"],
      });

      const exitPromise = new Promise<number>((resolve) => {
        child.on("exit", (code) => resolve(code ?? 1));
      });

      this.process = {
        kill: (signal?: string) =>
          child.kill((signal as NodeJS.Signals) ?? "SIGTERM"),
        pid: child.pid ?? null,
        exited: exitPromise,
      };

      this.updateStatus({ pid: child.pid ?? null });

      if (child.stdout) {
        child.stdout.on("data", (chunk: Buffer) => {
          const line = chunk.toString().trimEnd();
          if (line) {
            console.log(`[Steward] ${line}`);
            this.config.onLog?.(line, "stdout");
          }
        });
      }

      if (child.stderr) {
        child.stderr.on("data", (chunk: Buffer) => {
          const line = chunk.toString().trimEnd();
          if (line) {
            console.error(`[Steward:err] ${line}`);
            this.config.onLog?.(line, "stderr");
          }
        });
      }

      exitPromise.then((code) => {
        if (!this.stopping) {
          console.warn(
            `[StewardSidecar] Process exited unexpectedly (code ${code})`,
          );
          void this.handleCrash(code);
        }
      });
    }
  }

  private async pipeOutput(
    stream: ReadableStream<Uint8Array> | null,
    name: "stdout" | "stderr",
  ): Promise<void> {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value).trimEnd();
        if (text) {
          const prefix = name === "stderr" ? "[Steward:err]" : "[Steward]";
          console.log(`${prefix} ${text}`);
          this.config.onLog?.(text, name);
        }
      }
    } catch {
      // stream closed
    }
  }

  private async waitForHealthy(): Promise<void> {
    const abort = new AbortController();
    this.healthCheckAbort = abort;
    const startTime = Date.now();
    const apiBase = this.getApiBase();

    while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT_MS) {
      if (abort.signal.aborted) {
        throw new Error("Health check aborted");
      }

      try {
        const response = await fetch(`${apiBase}/health`, {
          signal: AbortSignal.timeout(2_000),
        });

        if (response.ok) {
          const body = (await response.json()) as { status?: string };
          if (body.status === "ok") {
            console.log(
              `[StewardSidecar] Healthy after ${Date.now() - startTime}ms`,
            );
            this.healthCheckAbort = null;
            return;
          }
        }
      } catch {
        // Not ready yet
      }

      await sleep(HEALTH_CHECK_INTERVAL_MS);
    }

    this.healthCheckAbort = null;
    throw new Error(
      `Steward failed to become healthy within ${HEALTH_CHECK_TIMEOUT_MS}ms`,
    );
  }

  private async ensureWalletSetup(): Promise<void> {
    if (this.credentials?.walletAddress) {
      // Verify existing wallet by checking agent exists
      await this.verifyExistingWallet();
      return;
    }

    // First launch — create tenant + agent + wallet
    await this.performFirstLaunchSetup();
  }

  private async performFirstLaunchSetup(): Promise<void> {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const apiBase = this.getApiBase();

    console.log("[StewardSidecar] First launch — creating tenant and wallet");

    // 1. Create tenant
    const tenantApiKey = generateApiKey();
    const tenantResponse = await fetch(`${apiBase}/tenants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: DEFAULT_TENANT_ID,
        name: DEFAULT_TENANT_NAME,
        apiKeyHash: tenantApiKey, // API hashes it server-side if not pre-hashed
      }),
    });

    if (!tenantResponse.ok) {
      const body = (await tenantResponse.json()) as { error?: string };
      // If tenant already exists, that's fine (could be a partial previous setup)
      if (!body.error?.includes("already exists")) {
        throw new Error(`Failed to create tenant: ${body.error}`);
      }
    }

    // 2. Create agent with wallet
    const agentResponse = await fetch(`${apiBase}/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Steward-Tenant": DEFAULT_TENANT_ID,
        "X-Steward-Key": tenantApiKey,
      },
      body: JSON.stringify({
        id: DEFAULT_AGENT_ID,
        name: DEFAULT_AGENT_NAME,
      }),
    });

    if (!agentResponse.ok) {
      const body = (await agentResponse.json()) as { error?: string };
      throw new Error(`Failed to create agent: ${body.error}`);
    }

    const agentResult = (await agentResponse.json()) as {
      ok: boolean;
      data?: { id: string; walletAddress: string };
    };

    if (!agentResult.ok || !agentResult.data) {
      throw new Error("Agent creation returned unexpected response");
    }

    // 3. Generate agent token
    const tokenResponse = await fetch(
      `${apiBase}/agents/${DEFAULT_AGENT_ID}/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Steward-Tenant": DEFAULT_TENANT_ID,
          "X-Steward-Key": tenantApiKey,
        },
      },
    );

    let agentToken = "";
    if (tokenResponse.ok) {
      const tokenResult = (await tokenResponse.json()) as {
        ok: boolean;
        data?: { token: string };
      };
      agentToken = tokenResult.data?.token ?? "";
    }

    // 4. Save credentials
    this.credentials = {
      tenantId: DEFAULT_TENANT_ID,
      tenantApiKey,
      agentId: DEFAULT_AGENT_ID,
      agentToken,
      walletAddress: agentResult.data.walletAddress,
      masterPassword: this.config.masterPassword || generateMasterPassword(),
    };

    const credPath = path.join(this.config.dataDir, CREDENTIALS_FILE);
    fs.writeFileSync(credPath, JSON.stringify(this.credentials, null, 2), {
      mode: 0o600,
    });

    this.updateStatus({
      walletAddress: this.credentials.walletAddress,
      agentId: this.credentials.agentId,
      tenantId: this.credentials.tenantId,
    });

    console.log(
      `[StewardSidecar] Wallet created: ${this.credentials.walletAddress}`,
    );
  }

  private async verifyExistingWallet(): Promise<void> {
    if (!this.credentials) return;

    const apiBase = this.getApiBase();

    try {
      const response = await fetch(
        `${apiBase}/agents/${this.credentials.agentId}`,
        {
          headers: {
            "X-Steward-Tenant": this.credentials.tenantId,
            "X-Steward-Key": this.credentials.tenantApiKey,
          },
        },
      );

      if (response.ok) {
        const result = (await response.json()) as {
          ok: boolean;
          data?: { walletAddress?: string };
        };
        if (result.ok && result.data?.walletAddress) {
          console.log(
            `[StewardSidecar] Wallet verified: ${result.data.walletAddress}`,
          );
          this.updateStatus({ walletAddress: result.data.walletAddress });
          return;
        }
      }

      // If verification fails, log but don't crash — the wallet might still work
      console.warn(
        "[StewardSidecar] Wallet verification returned unexpected result, continuing",
      );
    } catch (err) {
      console.warn(
        "[StewardSidecar] Wallet verification failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  private async handleCrash(exitCode: number | null): Promise<void> {
    if (this.stopping) return;

    this.status.restartCount += 1;

    if (this.status.restartCount > this.config.maxRestarts) {
      this.updateStatus({
        state: "error",
        error: `Steward crashed ${this.status.restartCount} times (exit code: ${exitCode}). Giving up.`,
        pid: null,
      });
      return;
    }

    // Exponential backoff
    const backoff = Math.min(
      INITIAL_BACKOFF_MS * 2 ** (this.status.restartCount - 1),
      MAX_BACKOFF_MS,
    );

    console.log(
      `[StewardSidecar] Restarting in ${backoff}ms (attempt ${this.status.restartCount}/${this.config.maxRestarts})`,
    );

    this.updateStatus({ state: "restarting", pid: null });

    this.restartTimer = setTimeout(async () => {
      if (this.stopping) return;

      try {
        await this.spawnProcess();
        await this.waitForHealthy();
        this.updateStatus({
          state: "running",
          port: this.config.port,
          error: null,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.updateStatus({ state: "error", error });
      }
    }, backoff);
  }

  private findStewardEntryPoint(): string | null {
    try {
      const fs = require("node:fs") as typeof import("node:fs");
      const path = require("node:path") as typeof import("node:path");

      // Check common locations — prefer embedded.ts (PGLite mode) over index.ts
      const candidates = [
        // Absolute paths from env (highest priority)
        process.env.STEWARD_ENTRY_POINT,
        // Monorepo sibling — embedded entry point (PGLite, no external DB needed)
        path.resolve(
          __dirname,
          "../../../../steward-fi/packages/api/src/embedded.ts",
        ),
        // Known absolute path on dev machines
        path.join(
          process.env.HOME || process.env.USERPROFILE || "",
          "projects/steward-fi/packages/api/src/embedded.ts",
        ),
        // Monorepo sibling — regular entry point (needs DATABASE_URL)
        path.resolve(
          __dirname,
          "../../../../steward-fi/packages/api/src/index.ts",
        ),
        // Installed as dependency
        path.resolve(
          __dirname,
          "../../../node_modules/@stwd/api/src/embedded.ts",
        ),
        path.resolve(__dirname, "../../../node_modules/@stwd/api/src/index.ts"),
        // Relative to workspace
        path.resolve(
          process.cwd(),
          "node_modules/@stwd/api/src/embedded.ts",
        ),
        path.resolve(process.cwd(), "node_modules/@stwd/api/src/index.ts"),
      ].filter(Boolean) as string[];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          console.log(
            `[StewardSidecar] Found entry point: ${candidate}`,
          );
          return candidate;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private updateStatus(partial: Partial<StewardSidecarStatus>): void {
    Object.assign(this.status, partial);
    this.config.onStatusChange?.(this.getStatus());
  }
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a StewardSidecar with standard Milady Desktop defaults.
 *
 * Uses environment variables for overrides:
 *   - STEWARD_DATA_DIR: data directory (default: ~/.milady/steward/)
 *   - STEWARD_PORT: API port (default: 3200)
 *   - STEWARD_MASTER_PASSWORD: vault encryption password
 *   - STEWARD_ENTRY_POINT: path to steward API entry
 *   - DATABASE_URL: Postgres connection string
 */
export function createDesktopStewardSidecar(
  overrides?: Partial<StewardSidecarConfig>,
): StewardSidecar {
  const home = process.env.HOME || process.env.USERPROFILE || "";

  return new StewardSidecar({
    dataDir:
      process.env.STEWARD_DATA_DIR ||
      overrides?.dataDir ||
      `${home}/.milady/steward`,
    port:
      parseInt(process.env.STEWARD_PORT || "", 10) ||
      overrides?.port ||
      DEFAULT_PORT,
    masterPassword:
      process.env.STEWARD_MASTER_PASSWORD || overrides?.masterPassword,
    stewardEntryPoint:
      process.env.STEWARD_ENTRY_POINT || overrides?.stewardEntryPoint,
    databaseUrl: process.env.DATABASE_URL || overrides?.databaseUrl,
    ...overrides,
  });
}

export default StewardSidecar;
