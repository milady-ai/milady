import type { LifeOpsBrowserCompanionSyncResponse } from "../../../../packages/shared/src/contracts/lifeops";
import type {
  CompanionConfig,
  CompanionSessionCompleteRequest,
  CompanionSessionProgressRequest,
  CompanionSyncRequest,
} from "./protocol";

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
    };
    return (
      payload.error ??
      payload.message ??
      `${response.status} ${response.statusText}`
    );
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export class LifeOpsBrowserRelayClient {
  constructor(private readonly config: CompanionConfig) {}

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.pairingToken}`,
      "Content-Type": "application/json",
      "X-Milady-Browser-Companion-Id": this.config.companionId,
    };
  }

  async sync(
    request: CompanionSyncRequest,
  ): Promise<LifeOpsBrowserCompanionSyncResponse> {
    const response = await fetch(
      joinUrl(this.config.apiBaseUrl, "/api/lifeops/browser/companions/sync"),
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(request),
      },
    );
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    return (await response.json()) as LifeOpsBrowserCompanionSyncResponse;
  }

  async updateSessionProgress(
    sessionId: string,
    request: CompanionSessionProgressRequest,
  ): Promise<void> {
    const response = await fetch(
      joinUrl(
        this.config.apiBaseUrl,
        `/api/lifeops/browser/companions/sessions/${encodeURIComponent(sessionId)}/progress`,
      ),
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(request),
      },
    );
    if (!response.ok) {
      throw new Error(await readError(response));
    }
  }

  async completeSession(
    sessionId: string,
    request: CompanionSessionCompleteRequest,
  ): Promise<void> {
    const response = await fetch(
      joinUrl(
        this.config.apiBaseUrl,
        `/api/lifeops/browser/companions/sessions/${encodeURIComponent(sessionId)}/complete`,
      ),
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(request),
      },
    );
    if (!response.ok) {
      throw new Error(await readError(response));
    }
  }
}
