import { useCallback, useEffect, useMemo, useState } from "react";
import { useCloudLogin } from "../components/dashboard/useCloudLogin";
import { NoticeToast } from "../components/NoticeToast";
import agentPhrases from "../data/agent-phrases.json";
import { releaseData } from "../generated/release-data";
import { CloudClient } from "../lib/cloud-api";
import { useAuth } from "../lib/useAuth";
import { useCloudOpenFlow } from "../lib/useCloudOpenFlow";
import { useNoticeToast } from "../lib/useNoticeToast";

const GITHUB_RELEASES_URL = "https://github.com/milady-ai/milady/releases";
const GITHUB_LATEST_RELEASE_URL =
  "https://github.com/milady-ai/milady/releases/latest";

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

export function Homepage() {
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
  const { notice, setNotice } = useNoticeToast();
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
  const phrase = useRotatingPhrase(agentPhrases);
  const cloudPreparing = cloudOpenState === "preparing";
  const platformLinks: PlatformLink[] = [
    { label: "MAC", href: downloadUrl("macos-arm64", "macos-x64") },
    { label: "PC", href: downloadUrl("windows-x64") },
    { label: "LINUX", href: downloadUrl("linux-x64") },
    {
      label: "WEB",
      onClick: cloudPreparing ? handleCancelCloudOpen : handleOpenCloud,
    },
  ];
  const checksumUrl =
    releaseData.release.checksum?.url ?? GITHUB_LATEST_RELEASE_URL;

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
