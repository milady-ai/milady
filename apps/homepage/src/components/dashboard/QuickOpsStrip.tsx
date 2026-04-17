import { useState } from "react";
import { releaseData } from "../../generated/release-data";

export interface QuickOpsStripProps {
  onCopy: (command: string, label: string) => void;
}

export function QuickOpsStrip({ onCopy }: QuickOpsStripProps) {
  const [platform, setPlatform] = useState<"shell" | "powershell">("shell");
  const command =
    platform === "shell"
      ? releaseData.scripts.shell.command
      : releaseData.scripts.powershell.command;
  const label = platform === "shell" ? "Shell" : "PowerShell";
  const downloads = releaseData.release.downloads.slice(0, 3);

  return (
    <section aria-labelledby="quickops-heading" className="space-y-4">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <h2
          id="quickops-heading"
          className="font-mono text-[11px] lowercase tracking-[0.14em] text-white/45"
        >
          install
        </h2>
        <span className="font-mono text-[10px] lowercase tracking-[0.08em] text-white/30">
          released · {releaseData.release.publishedAtLabel.toLowerCase()}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 rounded-lg border border-border bg-[#0a0a0d] p-3.5 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-[11px] lowercase tracking-[0.12em] text-white/45">
              one-line
            </div>
            <div className="inline-flex items-center gap-0.5 rounded-md border border-border p-0.5">
              <PlatformToggle
                active={platform === "shell"}
                onClick={() => setPlatform("shell")}
                label="shell"
              />
              <PlatformToggle
                active={platform === "powershell"}
                onClick={() => setPlatform("powershell")}
                label="pwsh"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-black/40 px-3 py-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-brand sm:text-[12px]">
              {command}
            </code>
            <button
              type="button"
              onClick={() => onCopy(command, label)}
              aria-label={`Copy ${label} install command`}
              className="shrink-0 rounded-md border border-border px-2.5 py-1.5 font-mono text-[10px] lowercase tracking-wider text-white/65 transition hover:border-white/25 hover:text-white"
            >
              copy
            </button>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-border bg-[#0a0a0d] p-3.5 sm:p-4">
          <div className="mb-3 font-mono text-[11px] lowercase tracking-[0.12em] text-white/45">
            desktop
          </div>
          <div className="flex flex-col gap-1.5">
            {downloads.length === 0 ? (
              <span className="text-[12px] text-white/40">
                no desktop builds available yet.
              </span>
            ) : (
              downloads.map((download) => (
                <a
                  key={download.id}
                  href={download.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[44px] items-center justify-between gap-2 rounded-md border border-border bg-transparent px-3 py-2.5 text-[12px] text-white transition hover:border-white/25 hover:bg-white/[0.03]"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {download.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-white/50">
                    {download.sizeLabel}
                  </span>
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PlatformToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-sm px-2.5 py-1 font-mono text-[10px] lowercase tracking-wider transition ${
        active ? "bg-brand text-black" : "text-white/50 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
