import type {
  AccountStatus,
  ProxyApiResponse,
  ResolvedWechatAccount,
} from "./types";

const SUCCESS = 1000;
const LOGIN_NEEDED = 1001;

export class ProxyClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly accountId: string;

  constructor(account: ResolvedWechatAccount) {
    this.apiKey = account.apiKey;
    this.baseUrl = account.proxyUrl.replace(/\/$/, "");
    this.accountId = account.id;
  }

  private async request<T>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<ProxyApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
      "X-Account-ID": this.accountId,
    };

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (res.status === 429) {
          const retryAfter = res.headers.get("Retry-After");
          const delay = retryAfter
            ? Number.parseInt(retryAfter, 10) * 1000
            : Math.min(1000 * 2 ** attempt, 8000);
          await sleep(delay);
          continue;
        }

        const json = (await res.json()) as ProxyApiResponse<T>;
        return json;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const delay = Math.min(1000 * 2 ** attempt, 8000);
        await sleep(delay);
      }
    }

    throw lastError ?? new Error(`Request failed after 3 attempts: ${path}`);
  }

  async getStatus(): Promise<AccountStatus> {
    const res = await this.request<AccountStatus>("/api/status");
    if (res.code === LOGIN_NEEDED) {
      return {
        valid: true,
        loginState: "waiting",
      };
    }
    if (res.code !== SUCCESS && res.code !== 1002) {
      throw new Error(`getStatus failed: ${res.message ?? res.code}`);
    }
    return res.data!;
  }

  async getQRCode(): Promise<string> {
    const res = await this.request<{ qrCodeUrl: string }>("/api/qrcode");
    if (res.code !== SUCCESS) {
      throw new Error(`getQRCode failed: ${res.message ?? res.code}`);
    }
    return res.data!.qrCodeUrl;
  }

  async checkLogin(): Promise<{
    status: "waiting" | "need_verify" | "logged_in";
    verifyUrl?: string;
    wcId?: string;
    nickName?: string;
  }> {
    const res = await this.request<{
      status: "waiting" | "need_verify" | "logged_in";
      verifyUrl?: string;
      wcId?: string;
      nickName?: string;
    }>("/api/check-login");
    if (res.code !== SUCCESS && res.code !== 1002) {
      throw new Error(`checkLogin failed: ${res.message ?? res.code}`);
    }
    return res.data!;
  }

  async sendText(to: string, text: string): Promise<void> {
    const res = await this.request("/api/send-text", { to, text });
    if (res.code === LOGIN_NEEDED) {
      throw new LoginExpiredError();
    }
    if (res.code !== SUCCESS && res.code !== 1002) {
      throw new Error(`sendText failed: ${res.message ?? res.code}`);
    }
  }

  async sendImage(to: string, imagePath: string, text?: string): Promise<void> {
    const res = await this.request("/api/send-image", {
      to,
      imagePath,
      text,
    });
    if (res.code === LOGIN_NEEDED) {
      throw new LoginExpiredError();
    }
    if (res.code !== SUCCESS && res.code !== 1002) {
      throw new Error(`sendImage failed: ${res.message ?? res.code}`);
    }
  }

  async getContacts(): Promise<{
    friends: Array<{ wxid: string; name: string }>;
    chatrooms: Array<{ wxid: string; name: string }>;
  }> {
    const res = await this.request<{
      friends: Array<{ wxid: string; name: string }>;
      chatrooms: Array<{ wxid: string; name: string }>;
    }>("/api/contacts");
    if (res.code !== SUCCESS) {
      throw new Error(`getContacts failed: ${res.message ?? res.code}`);
    }
    return res.data!;
  }

  async registerWebhook(url: string): Promise<void> {
    const res = await this.request("/api/webhook/register", {
      webhookUrl: url,
    });
    if (res.code !== SUCCESS && res.code !== 1002) {
      throw new Error(`registerWebhook failed: ${res.message ?? res.code}`);
    }
  }

  get needsLogin(): boolean {
    return false; // Caller checks via getStatus()
  }
}

export class LoginExpiredError extends Error {
  constructor() {
    super("WeChat login expired — re-login required");
    this.name = "LoginExpiredError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
