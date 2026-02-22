/**
 * CloudLanding - Public cloud-only onboarding for milady.ai
 * Flow: Device auth (automatic) → get Headscale IP → connect to container → Discord setup
 */

import { useState, useEffect } from "react";
import { getDeviceFingerprint } from "../utils/device-fingerprint";

const DISCORD_CLIENT_ID =
  import.meta.env.VITE_DISCORD_CLIENT_ID || "YOUR_DISCORD_CLIENT_ID";
const DISCORD_REDIRECT_URI =
  import.meta.env.VITE_DISCORD_REDIRECT_URI ||
  `${window.location.origin}/discord-callback`;

type CloudStep = "landing" | "auth" | "connecting" | "discord" | "ready";

interface ContainerInfo {
  agentId: string;
  headscaleIp: string;
  agentName: string;
}

interface DeviceAuthResponse {
  userId: string;
  organizationId: string;
  apiKey: string;
  credits: number;
}

export function CloudLanding() {
  const [step, setStep] = useState<CloudStep>("landing");
  const [error, setError] = useState<string>("");
  const [retryable, setRetryable] = useState<boolean>(false);
  const [container, setContainer] = useState<ContainerInfo | null>(null);
  const [elizaAuth, setElizaAuth] = useState<DeviceAuthResponse | null>(null);

  const handleStart = async () => {
    setStep("auth");
    setError("");
    setRetryable(false);

    try {
      // Generate device fingerprint
      const deviceId = await getDeviceFingerprint();

      // Automatic device-based authentication
      const authResp = await fetch("/api/cloud/elizacloud/device-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });

      if (!authResp.ok) {
        const errData = await authResp.json().catch(() => ({}));
        throw new Error(
          errData.error || `device auth failed (${authResp.status})`,
        );
      }

      const authData: DeviceAuthResponse = await authResp.json();
      setElizaAuth(authData);

      // Store credentials in localStorage
      localStorage.setItem("elizacloud_user_id", authData.userId);
      localStorage.setItem("elizacloud_api_key", authData.apiKey);
      localStorage.setItem("elizacloud_org_id", authData.organizationId);
      localStorage.setItem("elizacloud_credits", authData.credits.toString());

      setStep("connecting");

      // Create agent container
      const createResp = await fetch(
        "https://www.elizacloud.ai/api/v1/agents",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authData.apiKey}`,
          },
          body: JSON.stringify({
            agentName: "milady",
            agentConfig: {
              theme: "milady",
              runMode: "cloud",
            },
          }),
        },
      );

      if (!createResp.ok) {
        const errData = await createResp.json().catch(() => ({}));
        throw new Error(
          errData.message || `container creation failed (${createResp.status})`,
        );
      }

      const agent = await createResp.json();

      // Wait for Headscale IP
      let headscaleIp: string | null = null;
      let ipRetries = 0;
      const MAX_IP_RETRIES = 10;

      while (!headscaleIp && ipRetries < MAX_IP_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const agentResp = await fetch(
          `https://www.elizacloud.ai/api/v1/agents/${agent.agentId}`,
          {
            headers: { Authorization: `Bearer ${authData.apiKey}` },
          },
        );

        if (agentResp.ok) {
          const agentData = await agentResp.json();
          headscaleIp = agentData.networking?.headscaleIp;
        }

        ipRetries++;
      }

      if (!headscaleIp) {
        throw new Error(
          "container ready but network pending — refresh in 30s",
        );
      }

      setContainer({
        agentId: agent.agentId,
        headscaleIp,
        agentName: agent.agentName || "milady",
      });

      localStorage.setItem("container_ip", headscaleIp);
      localStorage.setItem("agent_id", agent.agentId);

      setStep("discord");
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      setError(message);
      setRetryable(true);
      setStep("landing");
    }
  };

  const handleDiscordSetup = () => {
    const scopes = ["bot", "applications.commands"].join(" ");
    const permissions = "8";
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(DISCORD_CLIENT_ID)}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&permissions=${permissions}`;
    window.location.href = discordAuthUrl;
  };

  const handleRetry = () => {
    setError("");
    setRetryable(false);
    handleStart();
  };

  // Landing
  if (step === "landing") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--bg)]">
        <div className="max-w-[520px] w-full">
          <div className="mb-8 text-center">
            <img
              src="/android-chrome-512x512.png"
              alt="milady"
              className="w-[140px] h-[140px] rounded-full object-cover border-[3px] border-border mx-auto mb-5 block"
            />
            <h1 className="text-[28px] font-normal mb-1 text-txt-strong">
              ohhh uhhhh hey there!
            </h1>
            <h1 className="text-[28px] font-normal mb-1 text-txt-strong">
              welcome to milady!
            </h1>
          </div>

          <div className="border border-[var(--border)] bg-[var(--card)] p-6 mb-6 rounded-xl">
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-txt-strong font-bold mb-1">instant deploy</div>
                <div className="text-muted text-[13px]">ur agent, live in 30 seconds</div>
              </div>
              <div>
                <div className="text-txt-strong font-bold mb-1">automatic auth</div>
                <div className="text-muted text-[13px]">no sign-up, just click deploy</div>
              </div>
              <div>
                <div className="text-txt-strong font-bold mb-1">discord ready</div>
                <div className="text-muted text-[13px]">one-click oauth after deploy</div>
              </div>
              <div>
                <div className="text-txt-strong font-bold mb-1">private & secure</div>
                <div className="text-muted text-[13px]">isolated container, headscale vpn</div>
              </div>
            </div>
          </div>

          {error && (
            <div className="border border-[var(--destructive)] bg-[var(--card)] p-4 mb-6 rounded-xl">
              <div className="text-[var(--destructive)] mb-2 text-sm font-bold">error</div>
              <div className="text-muted text-[13px]">{error}</div>
            </div>
          )}

          {retryable && error ? (
            <button
              type="button"
              onClick={handleRetry}
              className="w-full px-6 py-3 bg-[var(--accent)] text-[var(--accent-fg)] font-bold text-sm rounded-xl border border-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors"
            >
              retry
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              className="w-full px-6 py-3 bg-[var(--accent)] text-[var(--accent-fg)] font-bold text-sm rounded-xl border border-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors"
            >
              deploy
            </button>
          )}

          <div className="text-center mt-6 text-xs text-muted">
            powered by elizacloud
          </div>
        </div>
      </div>
    );
  }

  // Auth in progress
  if (step === "auth") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--bg)]">
        <div className="max-w-[480px] w-full text-center">
          <div className="text-txt-strong text-sm mb-3">connecting your device...</div>
          <div className="text-muted text-[13px]">
            automatic authentication via device fingerprint
          </div>
        </div>
      </div>
    );
  }

  // Connecting to container
  if (step === "connecting") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--bg)]">
        <div className="max-w-[520px] w-full">
          <div className="text-txt-strong text-sm mb-6 text-center">
            setting up ur agent...
          </div>

          <div className="border border-[var(--border)] bg-[var(--card)] p-6 rounded-xl">
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[var(--ok)]" />
                <span className="text-txt">authenticated</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                <span className="text-txt">creating container</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full border border-[var(--border)]" />
                <span className="text-muted">network init</span>
              </div>
            </div>
          </div>

          <div className="text-center mt-6 text-xs text-muted">
            ~30 seconds
          </div>
        </div>
      </div>
    );
  }

  // Discord setup
  if (step === "discord") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--bg)]">
        <div className="max-w-[560px] w-full">
          <div className="mb-8 text-center">
            <div className="text-[var(--ok)] text-sm font-bold mb-2">
              agent ready!
            </div>
            <div className="text-txt text-sm font-bold">
              {container?.agentName}
            </div>
            <div className="text-muted text-xs mt-2">
              {container?.headscaleIp}
            </div>
          </div>

          <div className="border border-[var(--border)] bg-[var(--card)] p-6 mb-6 rounded-xl">
            <div className="text-sm text-muted mb-4">
              next: connect to discord
            </div>
            <button
              type="button"
              onClick={handleDiscordSetup}
              className="w-full px-6 py-3 mb-3 bg-[var(--accent)] text-[var(--accent-fg)] font-bold text-sm rounded-xl border border-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors"
            >
              authorize bot
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = "/")}
              className="w-full px-6 py-2 bg-transparent text-muted text-xs rounded-xl border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              skip for now
            </button>
          </div>

          <div className="text-xs text-muted text-center">
            container: {container?.agentId.slice(0, 8)}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
