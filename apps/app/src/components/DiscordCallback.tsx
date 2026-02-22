/**
 * DiscordCallback - Handles OAuth redirect from Discord and configures the cloud container
 */

import { useEffect, useState } from "react";

export function DiscordCallback() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Extract OAuth code from URL
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        if (!code) {
          throw new Error("No authorization code received from Discord");
        }

        // Get container IP from localStorage (set during cloud deployment)
        const containerIp = localStorage.getItem("container_ip");
        const agentId = localStorage.getItem("agent_id");

        if (!containerIp) {
          throw new Error("Container IP not found - please redeploy");
        }

        setStatus("processing");

        // Send OAuth code to backend proxy which will configure the container
        const response = await fetch("/api/cloud/discord/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            containerIp,
            agentId,
            redirectUri: `${window.location.origin}/discord-callback`,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Connection failed (${response.status})`);
        }

        const data = await response.json();
        
        // Store Discord connection status
        localStorage.setItem("discord_connected", "true");
        localStorage.setItem("discord_guild_id", data.guildId || "");

        setStatus("success");

        // Redirect to main app after 2 seconds
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);

      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error occurred";
        setError(message);
        setStatus("error");
      }
    };

    handleCallback();
  }, []);

  if (status === "processing") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--bg)]">
        <div className="max-w-[520px] w-full text-center">
          <div className="animate-pulse mb-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-[var(--accent)] opacity-20" />
          </div>
          <div className="text-txt-strong text-sm mb-3">verifying discord connection...</div>
          <div className="text-muted text-[13px]">
            configuring your cloud container
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--bg)]">
        <div className="max-w-[520px] w-full">
          <div className="border border-[var(--destructive)] bg-[var(--card)] p-6 rounded-xl mb-6">
            <div className="text-[var(--destructive)] mb-2 text-sm font-bold">connection failed</div>
            <div className="text-muted text-[13px] mb-4">{error}</div>
          </div>
          <button
            type="button"
            onClick={() => window.location.href = "/"}
            className="w-full px-6 py-3 bg-[var(--accent)] text-[var(--accent-fg)] font-bold text-sm rounded-xl border border-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            back to app
          </button>
        </div>
      </div>
    );
  }

  // Success
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--bg)]">
      <div className="max-w-[520px] w-full text-center">
        <div className="text-[var(--ok)] text-xl mb-3">✓</div>
        <div className="text-txt-strong text-sm mb-3">discord connected!</div>
        <div className="text-muted text-[13px]">
          redirecting to your agent...
        </div>
      </div>
    </div>
  );
}
