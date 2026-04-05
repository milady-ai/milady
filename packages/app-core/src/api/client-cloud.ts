/**
 * Cloud domain methods — cloud billing, compat agents, sandbox,
 * export/import, direct cloud auth, bug reports.
 */

import { MiladyClient } from "./client-base";
import type {
  CloudBillingCheckoutRequest,
  CloudBillingCheckoutResponse,
  CloudBillingCryptoQuoteRequest,
  CloudBillingCryptoQuoteResponse,
  CloudBillingHistoryItem,
  CloudBillingPaymentMethod,
  CloudBillingSettings,
  CloudBillingSettingsUpdateRequest,
  CloudBillingSummary,
  CloudCompatAgent,
  CloudCompatAgentStatus,
  CloudCompatJob,
  CloudCompatLaunchResult,
  CloudCompatManagedDiscordStatus,
  CloudCredits,
  CloudLoginPollResponse,
  CloudLoginResponse,
  CloudStatus,
  SandboxBrowserEndpoints,
  SandboxPlatformStatus,
  SandboxScreenshotPayload,
  SandboxScreenshotRegion,
  SandboxStartResponse,
  SandboxWindowInfo,
} from "./client-types";

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------

const AGENT_TRANSFER_MIN_PASSWORD_LENGTH = 4;

// ---------------------------------------------------------------------------
// Declaration merging
// ---------------------------------------------------------------------------

declare module "./client-base" {
  interface MiladyClient {
    getCloudStatus(): Promise<CloudStatus>;
    getCloudCredits(): Promise<CloudCredits>;
    getCloudBillingSummary(): Promise<CloudBillingSummary>;
    getCloudBillingSettings(): Promise<CloudBillingSettings>;
    updateCloudBillingSettings(
      request: CloudBillingSettingsUpdateRequest,
    ): Promise<CloudBillingSettings>;
    getCloudBillingPaymentMethods(): Promise<{
      success?: boolean;
      data?: CloudBillingPaymentMethod[];
      items?: CloudBillingPaymentMethod[];
      paymentMethods?: CloudBillingPaymentMethod[];
      [key: string]: unknown;
    }>;
    getCloudBillingHistory(): Promise<{
      success?: boolean;
      data?: CloudBillingHistoryItem[];
      items?: CloudBillingHistoryItem[];
      history?: CloudBillingHistoryItem[];
      [key: string]: unknown;
    }>;
    createCloudBillingCheckout(
      request: CloudBillingCheckoutRequest,
    ): Promise<CloudBillingCheckoutResponse>;
    createCloudBillingCryptoQuote(
      request: CloudBillingCryptoQuoteRequest,
    ): Promise<CloudBillingCryptoQuoteResponse>;
    cloudLogin(): Promise<CloudLoginResponse>;
    cloudLoginPoll(sessionId: string): Promise<CloudLoginPollResponse>;
    cloudDisconnect(): Promise<{ ok: boolean }>;
    getCloudCompatAgents(): Promise<{
      success: boolean;
      data: CloudCompatAgent[];
    }>;
    createCloudCompatAgent(opts: {
      agentName: string;
      agentConfig?: Record<string, unknown>;
      environmentVars?: Record<string, string>;
    }): Promise<{
      success: boolean;
      data: {
        agentId: string;
        agentName: string;
        jobId: string;
        status: string;
        nodeId: string | null;
        message: string;
      };
    }>;
    getCloudCompatAgent(agentId: string): Promise<{
      success: boolean;
      data: CloudCompatAgent;
    }>;
    getCloudCompatAgentManagedDiscord(agentId: string): Promise<{
      success: boolean;
      data: CloudCompatManagedDiscordStatus;
    }>;
    createCloudCompatAgentManagedDiscordOauth(
      agentId: string,
      request?: {
        returnUrl?: string;
        botNickname?: string;
      },
    ): Promise<{
      success: boolean;
      data: {
        authorizeUrl: string;
        applicationId: string | null;
      };
    }>;
    disconnectCloudCompatAgentManagedDiscord(agentId: string): Promise<{
      success: boolean;
      data: CloudCompatManagedDiscordStatus;
    }>;
    deleteCloudCompatAgent(agentId: string): Promise<{
      success: boolean;
      data: { jobId: string; status: string; message: string };
    }>;
    getCloudCompatAgentStatus(agentId: string): Promise<{
      success: boolean;
      data: CloudCompatAgentStatus;
    }>;
    getCloudCompatAgentLogs(
      agentId: string,
      tail?: number,
    ): Promise<{ success: boolean; data: string }>;
    restartCloudCompatAgent(agentId: string): Promise<{
      success: boolean;
      data: { jobId: string; status: string; message: string };
    }>;
    suspendCloudCompatAgent(agentId: string): Promise<{
      success: boolean;
      data: { jobId: string; status: string; message: string };
    }>;
    resumeCloudCompatAgent(agentId: string): Promise<{
      success: boolean;
      data: { jobId: string; status: string; message: string };
    }>;
    launchCloudCompatAgent(agentId: string): Promise<{
      success: boolean;
      data: CloudCompatLaunchResult;
    }>;
    /** Fetch a pairing token for a cloud agent (for opening Web UI in a new tab). */
    getCloudCompatPairingToken(agentId: string): Promise<{
      success: boolean;
      data: { token: string; redirectUrl: string; expiresIn: number };
    }>;
    getCloudCompatAvailability(): Promise<{
      success: boolean;
      data: {
        totalSlots: number;
        usedSlots: number;
        availableSlots: number;
        acceptingNewAgents: boolean;
      };
    }>;
    getCloudCompatJobStatus(jobId: string): Promise<{
      success: boolean;
      data: CloudCompatJob;
    }>;
    exportAgent(password: string, includeLogs?: boolean): Promise<Response>;
    getExportEstimate(): Promise<{
      estimatedBytes: number;
      memoriesCount: number;
      entitiesCount: number;
      roomsCount: number;
      worldsCount: number;
      tasksCount: number;
    }>;
    importAgent(
      password: string,
      fileBuffer: ArrayBuffer,
    ): Promise<{
      success: boolean;
      agentId: string;
      agentName: string;
      counts: Record<string, number>;
    }>;
    getSandboxPlatform(): Promise<SandboxPlatformStatus>;
    getSandboxBrowser(): Promise<SandboxBrowserEndpoints>;
    getSandboxScreenshot(
      region?: SandboxScreenshotRegion,
    ): Promise<SandboxScreenshotPayload>;
    getSandboxWindows(): Promise<{
      windows: SandboxWindowInfo[];
      error?: string;
    }>;
    startDocker(): Promise<SandboxStartResponse>;
    cloudLoginDirect(cloudApiBase: string): Promise<{
      ok: boolean;
      browserUrl?: string;
      sessionId?: string;
      error?: string;
    }>;
    cloudLoginPollDirect(
      cloudApiBase: string,
      sessionId: string,
    ): Promise<{
      status: "pending" | "authenticated" | "expired" | "error";
      token?: string;
      userId?: string;
      error?: string;
    }>;
    provisionCloudSandbox(options: {
      cloudApiBase: string;
      authToken: string;
      name: string;
      bio?: string[];
      onProgress?: (status: string, detail?: string) => void;
    }): Promise<{ bridgeUrl: string; agentId: string }>;
    checkBugReportInfo(): Promise<{
      nodeVersion?: string;
      platform?: string;
      submissionMode?: "remote" | "github" | "fallback";
    }>;
    submitBugReport(report: {
      description: string;
      stepsToReproduce: string;
      expectedBehavior?: string;
      actualBehavior?: string;
      environment?: string;
      nodeVersion?: string;
      modelProvider?: string;
      logs?: string;
      category?: "general" | "startup-failure";
      appVersion?: string;
      releaseChannel?: string;
      startup?: {
        reason?: string;
        phase?: string;
        message?: string;
        detail?: string;
        status?: number;
        path?: string;
      };
    }): Promise<{
      accepted?: boolean;
      id?: string;
      url?: string;
      fallback?: string;
      destination?: "remote" | "github" | "fallback";
    }>;
  }
}

// ---------------------------------------------------------------------------
// Prototype augmentation
// ---------------------------------------------------------------------------

MiladyClient.prototype.getCloudStatus = async function (this: MiladyClient) {
  return this.fetch("/api/cloud/status");
};

MiladyClient.prototype.getCloudCredits = async function (this: MiladyClient) {
  return this.fetch("/api/cloud/credits");
};

MiladyClient.prototype.getCloudBillingSummary = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/cloud/billing/summary");
};

MiladyClient.prototype.getCloudBillingSettings = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/cloud/billing/settings");
};

MiladyClient.prototype.updateCloudBillingSettings = async function (
  this: MiladyClient,
  request,
) {
  return this.fetch("/api/cloud/billing/settings", {
    method: "PUT",
    body: JSON.stringify(request),
  });
};

MiladyClient.prototype.getCloudBillingPaymentMethods = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/cloud/billing/payment-methods");
};

MiladyClient.prototype.getCloudBillingHistory = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/cloud/billing/history");
};

MiladyClient.prototype.createCloudBillingCheckout = async function (
  this: MiladyClient,
  request,
) {
  return this.fetch("/api/cloud/billing/checkout", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

MiladyClient.prototype.createCloudBillingCryptoQuote = async function (
  this: MiladyClient,
  request,
) {
  return this.fetch("/api/cloud/billing/crypto/quote", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

MiladyClient.prototype.cloudLogin = async function (this: MiladyClient) {
  return this.fetch("/api/cloud/login", { method: "POST" });
};

MiladyClient.prototype.cloudLoginPoll = async function (
  this: MiladyClient,
  sessionId,
) {
  return this.fetch(
    `/api/cloud/login/status?sessionId=${encodeURIComponent(sessionId)}`,
  );
};

MiladyClient.prototype.cloudDisconnect = async function (this: MiladyClient) {
  return this.fetch("/api/cloud/disconnect", { method: "POST" });
};

MiladyClient.prototype.getCloudCompatAgents = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/cloud/compat/agents");
};

MiladyClient.prototype.createCloudCompatAgent = async function (
  this: MiladyClient,
  opts,
) {
  return this.fetch("/api/cloud/compat/agents", {
    method: "POST",
    body: JSON.stringify(opts),
  });
};

MiladyClient.prototype.getCloudCompatAgent = async function (
  this: MiladyClient,
  agentId,
) {
  return this.fetch(`/api/cloud/compat/agents/${encodeURIComponent(agentId)}`);
};

MiladyClient.prototype.getCloudCompatAgentManagedDiscord = async function (
  this: MiladyClient,
  agentId,
) {
  return this.fetch(
    `/api/cloud/v1/milady/agents/${encodeURIComponent(agentId)}/discord`,
  );
};

MiladyClient.prototype.createCloudCompatAgentManagedDiscordOauth =
  async function (this: MiladyClient, agentId, request = {}) {
    return this.fetch(
      `/api/cloud/v1/milady/agents/${encodeURIComponent(agentId)}/discord/oauth`,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    );
  };

MiladyClient.prototype.disconnectCloudCompatAgentManagedDiscord =
  async function (this: MiladyClient, agentId) {
    return this.fetch(
      `/api/cloud/v1/milady/agents/${encodeURIComponent(agentId)}/discord`,
      {
        method: "DELETE",
      },
    );
  };

MiladyClient.prototype.deleteCloudCompatAgent = async function (
  this: MiladyClient,
  agentId,
) {
  return this.fetch(`/api/cloud/compat/agents/${encodeURIComponent(agentId)}`, {
    method: "DELETE",
  });
};

MiladyClient.prototype.getCloudCompatAgentStatus = async function (
  this: MiladyClient,
  agentId,
) {
  return this.fetch(
    `/api/cloud/compat/agents/${encodeURIComponent(agentId)}/status`,
  );
};

MiladyClient.prototype.getCloudCompatAgentLogs = async function (
  this: MiladyClient,
  agentId,
  tail = 100,
) {
  return this.fetch(
    `/api/cloud/compat/agents/${encodeURIComponent(agentId)}/logs?tail=${tail}`,
  );
};

MiladyClient.prototype.restartCloudCompatAgent = async function (
  this: MiladyClient,
  agentId,
) {
  return this.fetch(
    `/api/cloud/compat/agents/${encodeURIComponent(agentId)}/restart`,
    { method: "POST" },
  );
};

MiladyClient.prototype.suspendCloudCompatAgent = async function (
  this: MiladyClient,
  agentId,
) {
  return this.fetch(
    `/api/cloud/compat/agents/${encodeURIComponent(agentId)}/suspend`,
    { method: "POST" },
  );
};

MiladyClient.prototype.resumeCloudCompatAgent = async function (
  this: MiladyClient,
  agentId,
) {
  return this.fetch(
    `/api/cloud/compat/agents/${encodeURIComponent(agentId)}/resume`,
    { method: "POST" },
  );
};

MiladyClient.prototype.launchCloudCompatAgent = async function (
  this: MiladyClient,
  agentId,
) {
  return this.fetch(
    `/api/cloud/compat/agents/${encodeURIComponent(agentId)}/launch`,
    { method: "POST" },
  );
};

MiladyClient.prototype.getCloudCompatPairingToken = async function (
  this: MiladyClient,
  agentId,
) {
  return this.fetch(
    `/api/cloud/v1/milady/agents/${encodeURIComponent(agentId)}/pairing-token`,
    { method: "POST" },
  );
};

MiladyClient.prototype.getCloudCompatAvailability = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/cloud/compat/availability");
};

MiladyClient.prototype.getCloudCompatJobStatus = async function (
  this: MiladyClient,
  jobId,
) {
  return this.fetch(`/api/cloud/compat/jobs/${encodeURIComponent(jobId)}`);
};

MiladyClient.prototype.exportAgent = async function (
  this: MiladyClient,
  password,
  includeLogs = false,
) {
  if (password.length < AGENT_TRANSFER_MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${AGENT_TRANSFER_MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  return this.rawRequest("/api/agent/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password, includeLogs }),
  });
};

MiladyClient.prototype.getExportEstimate = async function (this: MiladyClient) {
  return this.fetch("/api/agent/export/estimate");
};

MiladyClient.prototype.importAgent = async function (
  this: MiladyClient,
  password,
  fileBuffer,
) {
  if (password.length < AGENT_TRANSFER_MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${AGENT_TRANSFER_MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  const passwordBytes = new TextEncoder().encode(password);
  const envelope = new Uint8Array(
    4 + passwordBytes.length + fileBuffer.byteLength,
  );
  const view = new DataView(envelope.buffer);
  view.setUint32(0, passwordBytes.length, false);
  envelope.set(passwordBytes, 4);
  envelope.set(new Uint8Array(fileBuffer), 4 + passwordBytes.length);

  const res = await this.rawRequest("/api/agent/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: envelope,
  });

  const data = (await res.json()) as {
    error?: string;
    success?: boolean;
    agentId?: string;
    agentName?: string;
    counts?: Record<string, number>;
  };
  if (!data.success) {
    throw new Error(data.error ?? `Import failed (${res.status})`);
  }
  return data as {
    success: boolean;
    agentId: string;
    agentName: string;
    counts: Record<string, number>;
  };
};

MiladyClient.prototype.getSandboxPlatform = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/sandbox/platform");
};

MiladyClient.prototype.getSandboxBrowser = async function (this: MiladyClient) {
  return this.fetch("/api/sandbox/browser");
};

MiladyClient.prototype.getSandboxScreenshot = async function (
  this: MiladyClient,
  region?,
) {
  if (!region) {
    return this.fetch("/api/sandbox/screen/screenshot", {
      method: "POST",
    });
  }
  return this.fetch("/api/sandbox/screen/screenshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(region),
  });
};

MiladyClient.prototype.getSandboxWindows = async function (this: MiladyClient) {
  return this.fetch("/api/sandbox/screen/windows");
};

MiladyClient.prototype.startDocker = async function (this: MiladyClient) {
  return this.fetch("/api/sandbox/docker/start", { method: "POST" });
};

MiladyClient.prototype.cloudLoginDirect = async function (
  this: MiladyClient,
  cloudApiBase,
) {
  const sessionId = globalThis.crypto.randomUUID();
  try {
    const res = await fetch(`${cloudApiBase}/api/auth/cli-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    if (!res.ok) {
      return { ok: false, error: `Login failed (${res.status})` };
    }
    return {
      ok: true,
      sessionId,
      browserUrl: `${cloudApiBase}/auth/cli-login?session=${encodeURIComponent(sessionId)}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to reach Eliza Cloud: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
};

MiladyClient.prototype.cloudLoginPollDirect = async function (
  this: MiladyClient,
  cloudApiBase,
  sessionId,
) {
  try {
    const res = await fetch(
      `${cloudApiBase}/api/auth/cli-session/${encodeURIComponent(sessionId)}`,
    );
    if (!res.ok) {
      if (res.status === 404) {
        return {
          status: "expired" as const,
          error: "Auth session expired or not found",
        };
      }
      return {
        status: "error" as const,
        error: `Poll failed (${res.status})`,
      };
    }
    const data = await res.json();
    if (data.status === "authenticated" && data.apiKey) {
      return {
        status: "authenticated" as const,
        token: data.apiKey,
        userId: data.userId,
      };
    }
    return { status: data.status ?? ("pending" as const) };
  } catch {
    return { status: "error" as const, error: "Poll request failed" };
  }
};

MiladyClient.prototype.provisionCloudSandbox = async function (
  this: MiladyClient,
  options,
) {
  const { cloudApiBase, authToken, name, bio, onProgress } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };

  onProgress?.("creating", "Creating agent...");

  // Step 1: Create agent
  const createRes = await fetch(`${cloudApiBase}/api/v1/milady/agents`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, bio }),
  });
  if (!createRes.ok) {
    const err = await createRes.text().catch(() => "Unknown error");
    throw new Error(`Failed to create cloud agent: ${err}`);
  }
  const createData = (await createRes.json()) as { id: string };
  const agentId = createData.id;

  onProgress?.("provisioning", "Provisioning sandbox environment...");

  // Step 2: Start provisioning
  const provisionRes = await fetch(
    `${cloudApiBase}/api/v1/milady/agents/${agentId}/provision`,
    { method: "POST", headers },
  );
  if (!provisionRes.ok) {
    const err = await provisionRes.text().catch(() => "Unknown error");
    throw new Error(`Failed to start provisioning: ${err}`);
  }
  const provisionData = (await provisionRes.json()) as { jobId: string };
  const jobId = provisionData.jobId;

  // Step 3: Poll job status
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

    const jobRes = await fetch(`${cloudApiBase}/api/v1/jobs/${jobId}`, {
      headers,
    });
    if (!jobRes.ok) continue;

    const jobData = (await jobRes.json()) as {
      status: string;
      result?: { bridgeUrl?: string };
      error?: string;
    };

    if (jobData.status === "completed" && jobData.result?.bridgeUrl) {
      onProgress?.("ready", "Sandbox ready!");
      return { bridgeUrl: jobData.result.bridgeUrl, agentId };
    }

    if (jobData.status === "failed") {
      throw new Error(
        `Provisioning failed: ${jobData.error ?? "Unknown error"}`,
      );
    }

    onProgress?.("provisioning", `Status: ${jobData.status}...`);
  }

  throw new Error("Provisioning timed out after 2 minutes");
};

MiladyClient.prototype.checkBugReportInfo = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/bug-report/info");
};

MiladyClient.prototype.submitBugReport = async function (
  this: MiladyClient,
  report,
) {
  return this.fetch("/api/bug-report", {
    method: "POST",
    body: JSON.stringify(report),
  });
};
