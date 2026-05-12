import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandHero } from "./components/dashboard/BrandHero";
import { ConnectionModal } from "./components/dashboard/ConnectionModal";
import { InstanceGrid } from "./components/dashboard/InstanceGrid";
import { ProvisionAgentModal } from "./components/dashboard/ProvisionAgentModal";
import { QuickOpsStrip } from "./components/dashboard/QuickOpsStrip";
import { useCloudLogin } from "./components/dashboard/useCloudLogin";
import { DashboardShell } from "./components/layout/DashboardShell";
import { releaseData } from "./generated/release-data";
import {
  AgentProvider,
  type ManagedAgent,
  useAgents,
} from "./lib/AgentProvider";
import { CloudClient } from "./lib/cloud-api";
import { openWebUI, openWebUIDirect } from "./lib/open-web-ui";
import { CLOUD_BASE, LOCAL_AGENT_BASE } from "./lib/runtime-config";
import { useAuth } from "./lib/useAuth";
import { type Notice, useCloudOpenFlow } from "./lib/useCloudOpenFlow";

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function copyToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable in this browser.");
  }
  await navigator.clipboard.writeText(text);
}

const GITHUB_RELEASES_URL = "https://github.com/milady-ai/milady/releases";
const GITHUB_LATEST_RELEASE_URL =
  "https://github.com/milady-ai/milady/releases/latest";

const AGENT_PHRASES = [
  "MAKE MONEY",
  "SCAM OLD PEOPLE",
  "SELL DRUGS",
  "FARM AIRDROPS",
  "APPLY TO YC",
  "CLOSE TICKETS",
  "INSIDER TRADE",
  "SHIP APPS",
  "PUMP SHITCOINS",
  "DUMP ON RETAIL",
  "YAP ON DISCORD",
  "LAUNDER ETH",
  "DOOMSCROLL",
  "SQUAT DOMAINS",
  "FARM AURA",
  "STEAL YOUR JOB",
  "NUKE PROD",
  "DROP BANGERS",
  "CALL YOUR MOM",
  "TRIP BALLS",
  "LISTEN IN",
  "GRIND HARD",
  "HIT ON CHICKS",
  "FLIP BURGERS",
  "RESELL NIKES",
  "PLAY GAMES",
  "SHIT POST",
  "AUTOMATE YOUR JOB",
  "SAVE THE WORLD",
  "SMOKE WEED",
  "HACK VERCEL",
  "DESTROY VALUE",
  "GET NXDOMAINED",
  "BOT RUNESCAPE",
  "ARGUE WITH ICANN",
  "SOLVE CAPTCHAS",
  "POST THROUGH IT",
  "SUMMON THE GLOWIES",
  "SELL THE TOP",
  "BUY THE BOTTOM",
  "RAISE A PRESEED",
  "POST ON /G/",
  "TUCK YOU IN",
  "WAKE YOU UP",
  "RUN YOUR LIFE",
  "RUIN YOUR LIFE",
];

interface ReleaseDownload {
  id: string;
  label: string;
  fileName: string;
  url: string;
  sizeLabel: string;
  note: string;
}

interface PlatformLink {
  label: string;
  href?: string;
  onClick?: () => void;
}

const releaseDownloads: readonly ReleaseDownload[] =
  releaseData.release.downloads;

function getDownload(...ids: string[]): ReleaseDownload | null {
  return releaseDownloads.find((download) => ids.includes(download.id)) ?? null;
}

function downloadUrl(...ids: string[]): string {
  return getDownload(...ids)?.url ?? GITHUB_LATEST_RELEASE_URL;
}

function useRotatingPhrase(phrases: readonly string[]) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % phrases.length);
    }, 1550);
    return () => window.clearInterval(id);
  }, [phrases.length]);

  return phrases[index];
}

function NoticeToast({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
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
  );
}

function PlatformBar({ links }: { links: PlatformLink[] }) {
  return (
    <nav
      aria-label="Platform downloads"
      className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[12px] uppercase text-white/68 sm:gap-x-7 sm:text-[13px]"
    >
      {links.map((link) =>
        link.onClick ? (
          <button
            key={link.label}
            type="button"
            onClick={link.onClick}
            aria-label="Open Milady web"
            className="bg-transparent p-0 font-mono uppercase text-white/68 transition hover:text-brand"
          >
            {link.label}
          </button>
        ) : (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="text-white/68 transition hover:text-brand"
          >
            {link.label}
          </a>
        ),
      )}
    </nav>
  );
}

function MiladyLanding() {
  const { isAuthenticated, token } = useAuth();
  const cloudClient = useMemo(
    () => (token ? new CloudClient(token) : null),
    [token],
  );
  const refresh = useCallback(async () => {}, []);
  const {
    state: loginState,
    error: loginError,
    manualLoginUrl,
    signIn,
  } = useCloudLogin();
  const [notice, setNotice] = useState<Notice | null>(null);
  const { cloudOpenState, handleCancelCloudOpen, handleOpenCloud } =
    useCloudOpenFlow({
      agents: [],
      cloudClient,
      isAuthenticated,
      loginError,
      loginState,
      refresh,
      setNotice,
      signIn,
    });
  const phrase = useRotatingPhrase(AGENT_PHRASES);
  const cloudPreparing = cloudOpenState === "preparing";
  const platformLinks: PlatformLink[] = [
    { label: "MAC", href: downloadUrl("macos-arm64", "macos-x64") },
    { label: "PC", href: downloadUrl("windows-x64") },
    { label: "LINUX", href: downloadUrl("linux-x64", "linux-deb") },
    {
      label: "WEB",
      onClick: cloudPreparing ? handleCancelCloudOpen : handleOpenCloud,
    },
    { label: "ANDROID", href: downloadUrl("android-apk") },
  ];
  const checksumUrl =
    releaseData.release.checksum?.url ?? GITHUB_LATEST_RELEASE_URL;

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-black text-white selection:bg-brand selection:text-black">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-8 top-8 h-8 w-8 border-l border-t border-white/24 sm:left-12 sm:top-12"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-8 top-8 h-8 w-8 border-r border-t border-white/24 sm:right-12 sm:top-12"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-8 left-8 h-8 w-8 border-b border-l border-white/24 sm:bottom-12 sm:left-12"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-8 right-8 h-8 w-8 border-b border-r border-white/24 sm:bottom-12 sm:right-12"
      />

      <header className="absolute left-0 right-0 top-0 z-20 px-5 py-6 sm:py-8">
        <PlatformBar links={platformLinks} />
      </header>

      <main className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-4 py-28 text-center">
        <h1
          aria-label={`AGENTS THAT ${phrase}`}
          className="flex max-w-[72rem] flex-col items-center text-[44px] font-black uppercase leading-[0.9] text-white sm:text-[72px] md:text-[104px] lg:text-[128px]"
        >
          <span aria-hidden="true">AGENTS THAT</span>
          <span
            key={phrase}
            aria-live="polite"
            aria-hidden="true"
            className="mt-2 min-h-[2.1em] max-w-full text-brand sm:min-h-[1.85em] md:min-h-[1em]"
          >
            {phrase}
          </span>
        </h1>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={cloudPreparing ? handleCancelCloudOpen : handleOpenCloud}
            aria-label={
              cloudPreparing
                ? "Cancel opening Milady in the cloud"
                : "Open Milady in the cloud"
            }
            className="min-h-[44px] border border-brand bg-brand px-6 py-3 font-mono text-[12px] font-semibold uppercase text-black transition hover:bg-white hover:text-black active:scale-[0.98]"
          >
            {cloudPreparing ? "cancel opening" : "cloud"}
          </button>
          <a
            href={GITHUB_LATEST_RELEASE_URL}
            target="_blank"
            rel="noreferrer"
            className="min-h-[44px] border border-white/22 px-6 py-3 font-mono text-[12px] font-semibold uppercase text-white/82 transition hover:border-white hover:text-white active:scale-[0.98]"
          >
            latest release
          </a>
        </div>

        {loginError ? (
          <div className="mt-5 max-w-[34rem] border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-100">
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
      </main>

      <footer className="absolute bottom-16 left-0 right-0 z-20 px-6 sm:bottom-8">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[9px] uppercase text-white/48 sm:gap-x-7 sm:text-[11px]">
          <a
            href={GITHUB_RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-brand"
          >
            download releases
          </a>
          <a
            href={GITHUB_LATEST_RELEASE_URL}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-brand"
          >
            latest releases
          </a>
          <a
            href={checksumUrl}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-brand"
          >
            checksums
          </a>
          <span className="hidden sm:inline">
            {releaseData.release.tagName}
          </span>
        </div>
      </footer>

      <NoticeToast notice={notice} />
    </div>
  );
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
  const { cloudOpenState, handleCancelCloudOpen, handleOpenCloud } =
    useCloudOpenFlow({
      agents,
      cloudClient,
      isAuthenticated,
      loginError,
      loginState,
      refresh,
      setNotice,
      signIn,
    });

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
  return <MiladyLanding />;
}

export function Dashboard() {
  return (
    <AgentProvider>
      <MiladyControlHub />
    </AgentProvider>
  );
}
