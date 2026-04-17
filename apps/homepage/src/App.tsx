import { useEffect, useState } from "react";
import { BrandHero } from "./components/dashboard/BrandHero";
import { ConnectionModal } from "./components/dashboard/ConnectionModal";
import { InstanceGrid } from "./components/dashboard/InstanceGrid";
import { ProvisionAgentModal } from "./components/dashboard/ProvisionAgentModal";
import { QuickOpsStrip } from "./components/dashboard/QuickOpsStrip";
import { useCloudLogin } from "./components/dashboard/useCloudLogin";
import { DashboardShell } from "./components/layout/DashboardShell";
import {
  AgentProvider,
  type ManagedAgent,
  useAgents,
} from "./lib/AgentProvider";
import { openWebUI, openWebUIDirect } from "./lib/open-web-ui";
import { CLOUD_BASE, LOCAL_AGENT_BASE } from "./lib/runtime-config";
import { useAuth } from "./lib/useAuth";

type NoticeTone = "success" | "error" | "info";

interface Notice {
  tone: NoticeTone;
  text: string;
}

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function copyToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable in this browser.");
  }
  await navigator.clipboard.writeText(text);
}

function MiladyControlHub() {
  const { isAuthenticated } = useAuth();
  const {
    agents,
    loading,
    isRefreshing,
    error,
    clearError,
    refresh,
    addRemoteUrl,
    removeRemote,
    deleteCloudAgent,
    cloudClient,
  } = useAgents();
  const {
    state: loginState,
    error: loginError,
    manualLoginUrl,
    signIn,
  } = useCloudLogin({
    onAuthenticated: () => void refresh(),
  });
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const localAgent = agents.find((agent) => agent.source === "local") ?? null;
  const launchUrl =
    localAgent?.webUiUrl ?? localAgent?.sourceUrl ?? LOCAL_AGENT_BASE;

  const isLocalReady =
    !!localAgent &&
    localAgent.status !== "stopped" &&
    localAgent.status !== "unknown";
  const isLocalProbing = loading && !localAgent;

  const scrollToInstall = () => {
    if (typeof document === "undefined") return;
    const anchor = document.getElementById("quickops-heading");
    if (anchor) {
      anchor.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleOpenAgent = (agent: ManagedAgent) => {
    const url = agent.webUiUrl ?? agent.sourceUrl;
    if (!url) {
      setNotice({
        tone: "error",
        text: `${agent.name} does not expose a control URL yet.`,
      });
      return;
    }
    openWebUI(url, agent.source, agent.cloudAgentId);
  };

  const handleCopyUrl = async (agent: ManagedAgent) => {
    const url = agent.webUiUrl ?? agent.sourceUrl;
    if (!url) {
      setNotice({
        tone: "error",
        text: `${agent.name} does not expose a URL yet.`,
      });
      return;
    }
    try {
      await copyToClipboard(url);
      setNotice({
        tone: "success",
        text: `${agent.name} URL copied.`,
      });
    } catch (copyError) {
      setNotice({
        tone: "error",
        text:
          copyError instanceof Error
            ? copyError.message
            : "Clipboard copy failed.",
      });
    }
  };

  const handleForgetRemote = (agent: ManagedAgent) => {
    removeRemote(agent.id);
    setNotice({
      tone: "info",
      text: `${agent.name} removed from saved remote connections.`,
    });
  };

  const handleDeleteCloud = async (agent: ManagedAgent) => {
    if (!agent.cloudAgentId) {
      setNotice({
        tone: "error",
        text: `${agent.name} has no cloud id — cannot delete.`,
      });
      throw new Error("missing cloudAgentId");
    }
    try {
      await deleteCloudAgent(agent.cloudAgentId);
      setNotice({ tone: "success", text: `${agent.name} deleted.` });
    } catch (err) {
      setNotice({
        tone: "error",
        text:
          err instanceof Error
            ? `delete failed: ${err.message}`
            : "delete failed.",
      });
      throw err;
    }
  };

  const handleCopyCommand = async (command: string, label: string) => {
    try {
      await copyToClipboard(command);
      setNotice({
        tone: "success",
        text: `${label} install command copied.`,
      });
    } catch (copyError) {
      setNotice({
        tone: "error",
        text:
          copyError instanceof Error
            ? copyError.message
            : "Clipboard copy failed.",
      });
    }
  };

  const handleOpenLocal = () => {
    if (isLocalReady) {
      openWebUIDirect(launchUrl);
      return;
    }
    if (isLocalProbing) {
      setNotice({
        tone: "info",
        text: "still looking for local milady\u2026 give it a moment.",
      });
      return;
    }
    scrollToInstall();
    setNotice({
      tone: "info",
      text: "no local milady running. install below, then start the desktop app.",
    });
  };

  const localState: "ready" | "probing" | "offline" = isLocalReady
    ? "ready"
    : isLocalProbing
      ? "probing"
      : "offline";

  const handleSignInToCloud = () => {
    if (isAuthenticated) {
      openExternal(CLOUD_BASE);
      return;
    }
    void signIn();
  };

  return (
    <DashboardShell
      agents={agents}
      localState={localState}
      onOpenLocal={handleOpenLocal}
      onAttachRemote={() => setShowConnectModal(true)}
      onSignIn={handleSignInToCloud}
      isSigningIn={loginState === "polling"}
    >
      <div className="space-y-10 sm:space-y-12">
        <BrandHero
          isLocalReady={isLocalReady}
          isLocalProbing={isLocalProbing}
          onOpenLocal={handleOpenLocal}
          onAttachRemote={() => setShowConnectModal(true)}
        />

        <InstanceGrid
          agents={agents}
          loading={loading}
          isRefreshing={isRefreshing}
          onRefresh={() => void refresh()}
          onOpen={handleOpenAgent}
          onCopyUrl={(agent) => void handleCopyUrl(agent)}
          onForgetRemote={handleForgetRemote}
          onDeleteCloud={handleDeleteCloud}
          onAttachRemote={() => setShowConnectModal(true)}
          onOpenLocal={handleOpenLocal}
          onProvisionAgent={() => setShowProvisionModal(true)}
          canProvision={isAuthenticated && !!cloudClient}
        />

        <QuickOpsStrip
          onCopy={(cmd, label) => void handleCopyCommand(cmd, label)}
        />

        {loginError ? (
          <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-100">
            {loginError}
            {manualLoginUrl ? (
              <>
                {" "}
                <a
                  href={manualLoginUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline underline-offset-2"
                >
                  Open sign-in page manually
                </a>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Toast / notice */}
      {notice ? (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border px-4 py-2 text-[13px] shadow-2xl backdrop-blur ${
            notice.tone === "success"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
              : notice.tone === "error"
                ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                : "border-brand/30 bg-brand/10 text-brand"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      {error ? (
        <div className="fixed bottom-20 left-1/2 z-40 w-[min(100%-2rem,32rem)] -translate-x-1/2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-100 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="shrink-0 rounded-md border border-rose-200/25 px-2 py-0.5 font-mono text-[10px] lowercase tracking-wider text-rose-50 transition hover:border-rose-200/40"
            >
              dismiss
            </button>
          </div>
        </div>
      ) : null}

      {showConnectModal ? (
        <ConnectionModal
          onClose={() => setShowConnectModal(false)}
          onSubmit={(data) => {
            addRemoteUrl(data.name, data.url, data.token);
            setShowConnectModal(false);
            setNotice({
              tone: "success",
              text: `${data.name} attached.`,
            });
          }}
        />
      ) : null}

      {showProvisionModal ? (
        <ProvisionAgentModal
          cloudClient={cloudClient}
          onClose={() => setShowProvisionModal(false)}
          onProvisioned={(result) => {
            setNotice({
              tone: "success",
              text: `agent ready: ${result.name}`,
            });
          }}
          onRefreshList={() => void refresh()}
        />
      ) : null}
    </DashboardShell>
  );
}

export function Homepage() {
  return (
    <AgentProvider>
      <MiladyControlHub />
    </AgentProvider>
  );
}
