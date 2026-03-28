import { useRef, useState } from "react";
import { HeroBackground } from "./components/Hero";
import { releaseData } from "./generated/release-data";

const DISCORD_URL = "https://discord.gg/F6ww5WHtsg";
const GITHUB_URL = "https://github.com/milady-ai/milady";
const DASHBOARD_URL = "/dashboard";

function GithubIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className ?? "w-5 h-5"}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className ?? "w-5 h-5"}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 12V5.3l9.5-1.3V12h-9.5zm0 .5H21v7.8l-9.5-1.3v-6.5z" />
    </svg>
  );
}

function LinuxIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className ?? "w-5 h-5"}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12.504 0c-.155 0-.311.015-.465.04C9.92.34 8.18 1.675 7.3 3.62c-.49 1.09-.755 2.3-.755 3.54v1.07c-.01.07-.01.14 0 .21v.86c-.015.11-.015.22 0 .33v2.57c0 .22.01.44.03.65.51 5.09 4.51 9.09 9.58 9.6h.39c5.32-.51 9.39-4.93 9.39-10.31V8.44c0-1.07-.16-2.1-.47-3.06C24.21 2.18 21.32 0 17.93 0h-5.42zm3.93 1.5c2.3 0 4.27 1.42 5.07 3.44.24.61.37 1.27.37 1.95v3.53c0 4.34-3.27 7.93-7.55 8.38h-.31c-4.07-.41-7.29-3.72-7.66-7.76a6.34 6.34 0 01-.03-.52V8.64c0-.08 0-.16.01-.24v-.74c0-.06 0-.12.01-.18V6.62c0-.99.21-1.93.59-2.79.72-1.62 2.16-2.33 3.99-2.33h5.51z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg
      aria-hidden="true"
      className="w-3 h-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function DownloadDropdown() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloads = releaseData.release.downloads;

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  const platformIcon = (id: string) => {
    const cls = "w-5 h-5 text-text-muted";
    if (id.startsWith("macos")) return <AppleIcon className={cls} />;
    if (id === "windows-x64") return <WindowsIcon className={cls} />;
    if (id.startsWith("linux")) return <LinuxIcon className={cls} />;
    return null;
  };

  return (
    <fieldset
      className="relative border-0 p-0 m-0"
      onMouseLeave={scheduleClose}
      onMouseEnter={cancelClose}
    >
      <button
        type="button"
        className="flex items-center gap-2 px-6 py-3 border border-text-subtle/30 text-text-muted font-mono text-[11px] tracking-[0.15em] uppercase hover:border-text-muted/50 hover:text-text-light transition-all"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
      >
        <DownloadIcon />
        Download
        <ChevronDown />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 pb-2 w-72 z-[100]">
          <div className="border border-text-subtle/20 bg-dark/95 backdrop-blur-md">
            {downloads.map((d) => (
              <a
                key={d.id}
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 border-b border-text-subtle/10 px-4 py-3 transition-colors hover:bg-brand/5 last:border-b-0"
              >
                {platformIcon(d.id)}
                <span className="flex-1 font-mono text-[11px] tracking-wider uppercase text-text-light">
                  {d.label}
                </span>
                <span className="font-mono text-[10px] text-text-subtle">
                  {d.sizeLabel}
                </span>
              </a>
            ))}
            <a
              href={releaseData.release.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 border-t border-text-subtle/20 px-4 py-3 text-text-muted transition-colors hover:bg-brand/5 hover:text-brand"
            >
              <GithubIcon />
              <span className="font-mono text-[11px] tracking-wider uppercase">
                All Releases
              </span>
            </a>
          </div>
        </div>
      )}
    </fieldset>
  );
}

function CloudIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-4 h-4 opacity-60"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 18h9a4 4 0 0 0 .4-7.98A6 6 0 0 0 5.1 8.7 4.5 4.5 0 0 0 7 18Z" />
      <path d="M12 10v8" />
      <path d="m9.5 15 2.5 3 2.5-3" />
    </svg>
  );
}

export function Homepage() {
  return (
    <div
      id="top"
      className="relative min-h-screen bg-dark text-text-light font-sans selection:bg-brand selection:text-dark"
    >
      <div className="fixed inset-0 z-0 bg-dark pointer-events-none" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="flex items-center justify-center gap-5 pt-[12vh] relative z-50">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-subtle hover:text-text-light transition-colors [&_svg]:w-6 [&_svg]:h-6"
          >
            <GithubIcon />
          </a>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-subtle hover:text-text-light transition-colors [&_svg]:w-6 [&_svg]:h-6"
          >
            <DiscordIcon />
          </a>
        </div>
        <section className="flex-1 relative flex items-center justify-center overflow-hidden">
          <HeroBackground />
        </section>
        <div className="relative z-50 flex items-center justify-center gap-4 pb-10 px-4">
          <DownloadDropdown />
          <a
            href={DASHBOARD_URL}
            className="flex items-center gap-2 px-6 py-3 border border-text-subtle/30 text-text-muted font-mono text-[11px] tracking-[0.15em] uppercase hover:border-text-muted/50 hover:text-text-light transition-all"
          >
            <CloudIcon />
            Try Cloud
          </a>
        </div>
      </div>
    </div>
  );
}
