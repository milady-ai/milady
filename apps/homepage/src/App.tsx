import { useCallback, useEffect, useRef, useState } from "react";
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
import { CloudAgentsNotAvailableError } from "./lib/cloud-api";
import {
  openWebUI,
  openWebUIDirect,
  redirectPopupToCloudAgent,
  renderPopupConnectingState,
  updatePopupMessage,
} from "./lib/open-web-ui";
import { CLOUD_BASE, LOCAL_AGENT_BASE } from "./lib/runtime-config";
import { useAuth } from "./lib/useAuth";

const PROVISION_TIMEOUT_MS = 180000;

function generateCloudAgentName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `milady-${suffix}`;
}

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
  const [cloudOpenState, setCloudOpenState] = useState<"idle" | "preparing">(
    "idle",
  );
  const cloudPopupRef = useRef<Window | null>(null);
  const pendingCloudOpenRef = useRef(false);
  const cloudOpenTimeoutRef = useRef<number | null>(null);

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

  const closeCloudPopup = useCallback(() => {
    const popup = cloudPopupRef.current;
    cloudPopupRef.current = null;
    if (cloudOpenTimeoutRef.current !== null) {
      window.clearTimeout(cloudOpenTimeoutRef.current);
      cloudOpenTimeoutRef.current = null;
    }
    if (popup && !popup.closed) popup.close();
  }, []);

  const continueCloudOpen = useCallback(async () => {
    const popup = cloudPopupRef.current;
    if (!popup || popup.closed) {
      setCloudOpenState("idle");
      return;
    }
    if (!cloudClient) {
      closeCloudPopup();
      setCloudOpenState("idle");
      setNotice({
        tone: "error",
        text: "cloud client not ready, try again.",
      });
      return;
    }

    try {
      let cloudAgentId: string | undefined;

      const cloudAgents = agents.filter(
        (a) => a.source === "cloud" && a.cloudAgentId,
      );
      const existingCloud =
        cloudAgents.find((a) => a.status === "running") ??
        cloudAgents.find((a) => a.status === "paused") ??
        null;
      if (existingCloud?.cloudAgentId) {
        cloudAgentId = existingCloud.cloudAgentId;
        updatePopupMessage(popup, `Opening ${existingCloud.name}…`);
      } else {
        updatePopupMessage(popup, "Creating your cloud agent…");
        const created = await cloudClient.createAgent({
          name: generateCloudAgentName(),
        });
        if (!created.id) {
          throw new Error("agent created but no id was returned.");
        }
        cloudAgentId = created.id;

        updatePopupMessage(popup, "Provisioning sandbox… (~45s)");
        const provResult = await cloudClient.provisionAgent(cloudAgentId);
        if (provResult.jobId) {
          const startedAt = Date.now();
          const provisioningStages: ReadonlyArray<{
            afterMs: number;
            text: string;
          }> = [
            { afterMs: 8000, text: "Booting your container…" },
            {
              afterMs: 16000,
              text: "Almost there… warming up dependencies.",
            },
            { afterMs: 24000, text: "Finishing the boot sequence…" },
            {
              afterMs: 32000,
              text: "Still booting — this is taking longer than usual…",
            },
          ];
          const rotateId = window.setInterval(() => {
            const live = cloudPopupRef.current;
            if (!live || live.closed) return;
            const elapsed = Date.now() - startedAt;
            let next = "Provisioning sandbox… (~45s)";
            for (const stage of provisioningStages) {
              if (elapsed >= stage.afterMs) next = stage.text;
            }
            updatePopupMessage(live, next);
          }, 1000);
          try {
            const job = await cloudClient.pollJobUntilDone(
              provResult.jobId,
              PROVISION_TIMEOUT_MS,
            );
            if (job.status === "failed") {
              throw new Error(job.error ?? "provisioning failed.");
            }
          } finally {
            window.clearInterval(rotateId);
          }
        }
        void refresh();
      }

      if (popup.closed) {
        setCloudOpenState("idle");
        cloudPopupRef.current = null;
        return;
      }

      updatePopupMessage(popup, "Authenticating…");
      await redirectPopupToCloudAgent(
        popup,
        cloudAgentId,
        cloudClient.getToken(),
      );
      cloudPopupRef.current = null;
      setCloudOpenState("idle");
    } catch (err) {
      closeCloudPopup();
      setCloudOpenState("idle");
      if (err instanceof CloudAgentsNotAvailableError) {
        setNotice({
          tone: "error",
          text: "cloud agent hosting isn't deployed on this Eliza Cloud instance yet.",
        });
        return;
      }
      setNotice({
        tone: "error",
        text:
          err instanceof Error
            ? `cloud open failed: ${err.message}`
            : "cloud open failed.",
      });
    }
  }, [agents, cloudClient, closeCloudPopup, refresh]);

  const handleOpenCloud = useCallback(() => {
    if (cloudOpenState === "preparing") return;
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice({
        tone: "error",
        text: "popup blocked. allow popups for this site and try again.",
      });
      return;
    }
    cloudPopupRef.current = popup;
    renderPopupConnectingState(popup, "Connecting to Eliza Cloud…");
    setCloudOpenState("preparing");

    if (!isAuthenticated) {
      pendingCloudOpenRef.current = true;
      updatePopupMessage(popup, "Sign in to Eliza Cloud in the other window…");
      void signIn();
      return;
    }
    if (!cloudClient) {
      // Already signed in (token in storage) but AgentProvider hasn't
      // initialized the client yet. Wait — useEffect will resume.
      pendingCloudOpenRef.current = true;
      updatePopupMessage(popup, "Connecting to your account…");
      void refresh();
      cloudOpenTimeoutRef.current = window.setTimeout(() => {
        cloudOpenTimeoutRef.current = null;
        if (!pendingCloudOpenRef.current) return;
        pendingCloudOpenRef.current = false;
        closeCloudPopup();
        setCloudOpenState("idle");
        setNotice({
          tone: "error",
          text: "couldn't connect to your account. try refreshing.",
        });
      }, 10000);
      return;
    }
    void continueCloudOpen();
  }, [
    cloudOpenState,
    isAuthenticated,
    cloudClient,
    signIn,
    continueCloudOpen,
    refresh,
    closeCloudPopup,
  ]);

  // Cancelling does NOT abort an in-flight createAgent/provisionAgent — those
  // calls complete in the background and the resulting agent will appear in
  // the runtimes grid on next refresh, where the user can delete it.
  const handleCancelCloudOpen = useCallback(() => {
    closeCloudPopup();
    pendingCloudOpenRef.current = false;
    setCloudOpenState("idle");
    setNotice({ tone: "info", text: "cloud open cancelled." });
  }, [closeCloudPopup]);

  // Resume cloud open after sign-in completes.
  useEffect(() => {
    if (
      isAuthenticated &&
      cloudClient &&
      pendingCloudOpenRef.current &&
      cloudPopupRef.current &&
      !cloudPopupRef.current.closed
    ) {
      pendingCloudOpenRef.current = false;
      if (cloudOpenTimeoutRef.current !== null) {
        window.clearTimeout(cloudOpenTimeoutRef.current);
        cloudOpenTimeoutRef.current = null;
      }
      void continueCloudOpen();
    }
  }, [isAuthenticated, cloudClient, continueCloudOpen]);

  // Detect popup closed while we're preparing — reset state so the button
  // becomes clickable again instead of being stuck on "opening cloud…".
  useEffect(() => {
    if (cloudOpenState !== "preparing") return;
    const id = window.setInterval(() => {
      const popup = cloudPopupRef.current;
      if (!popup || popup.closed) {
        window.clearInterval(id);
        cloudPopupRef.current = null;
        pendingCloudOpenRef.current = false;
        setCloudOpenState("idle");
      }
    }, 800);
    return () => window.clearInterval(id);
  }, [cloudOpenState]);

  // Unmount cleanup — clear any lingering timeout so it can't fire after
  // the component is gone.
  useEffect(
    () => () => {
      if (cloudOpenTimeoutRef.current !== null) {
        window.clearTimeout(cloudOpenTimeoutRef.current);
        cloudOpenTimeoutRef.current = null;
      }
    },
    [],
  );

  // If the sign-in flow errors out while we have a pending cloud open,
  // surface the error and reset state so the user can retry.
  useEffect(() => {
    if (loginState === "error" && pendingCloudOpenRef.current) {
      pendingCloudOpenRef.current = false;
      closeCloudPopup();
      setCloudOpenState("idle");
      setNotice({
        tone: "error",
        text: loginError ?? "sign-in failed.",
      });
    }
  }, [loginState, loginError, closeCloudPopup]);

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
          cloudState={cloudOpenState}
          onOpenLocal={handleOpenLocal}
          onOpenCloud={handleOpenCloud}
          onCancelCloud={handleCancelCloudOpen}
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
