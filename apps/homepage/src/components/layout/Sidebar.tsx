import type { ReactNode } from "react";
import { releaseData } from "../../generated/release-data";
import type { ManagedAgent } from "../../lib/AgentProvider";
import { SessionTile } from "./SessionTile";

const GITHUB_URL = "https://github.com/milady-ai/milady";
const LATEST_RELEASE_URL =
  "https://github.com/milady-ai/milady/releases/latest";

export type LocalRuntimeState = "ready" | "probing" | "offline";

export interface SidebarProps {
  agents: ManagedAgent[];
  localState: LocalRuntimeState;
  onOpenLocal: () => void;
  onAttachRemote: () => void;
  onSignIn: () => void;
  isSigningIn?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  agents,
  localState,
  onOpenLocal,
  onAttachRemote,
  onSignIn,
  isSigningIn,
  onClose,
}: SidebarProps) {
  const remoteCount = agents.filter((a) => a.source === "remote").length;

  return (
    <aside
      aria-label="Primary"
      className="flex h-full w-full flex-col gap-5 border-r border-border bg-[#08090d] px-4 py-5 text-white"
    >
      <div className="flex items-center justify-between">
        <a
          href="/dashboard"
          className="flex items-center gap-2.5"
          onClick={onClose}
        >
          <span className="text-[15px] font-semibold tracking-tight">
            milady
          </span>
        </a>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-md border border-border p-1.5 text-white/60 transition hover:text-white lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-0.5">
          <OpenLocalRow
            state={localState}
            onClick={() => {
              onClose?.();
              onOpenLocal();
            }}
          />
          <NavItemButton
            label="attach remote"
            onClick={() => {
              onClose?.();
              onAttachRemote();
            }}
            prefix="+"
            count={remoteCount > 0 ? remoteCount : undefined}
          />
        </div>

        <NavGroup title="resources">
          <NavItemExternal href="/docs" label="docs" internal />
          <NavItemExternal href={GITHUB_URL} label="github" />
          <NavItemExternal
            href={LATEST_RELEASE_URL}
            label={`release ${releaseData.release.tagName}`}
          />
        </NavGroup>
      </nav>

      <SessionTile onSignIn={onSignIn} isSigningIn={isSigningIn} />
    </aside>
  );
}

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-2 font-mono text-[10px] lowercase tracking-[0.18em] text-white/55">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavItemButton({
  label,
  onClick,
  prefix,
  count,
}: {
  label: string;
  onClick: () => void;
  prefix?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-white/70 transition hover:bg-white/[0.04] hover:text-white"
    >
      <span className="flex items-center gap-2">
        {prefix ? (
          <span className="font-mono text-[12px] text-white/40 transition group-hover:text-brand">
            {prefix}
          </span>
        ) : null}
        {label}
      </span>
      {typeof count === "number" ? (
        <span className="font-mono text-[10px] text-white/40">{count}</span>
      ) : null}
    </button>
  );
}

function NavItemExternal({
  href,
  label,
  internal = false,
}: {
  href: string;
  label: string;
  internal?: boolean;
}) {
  return (
    <a
      href={href}
      target={internal ? undefined : "_blank"}
      rel={internal ? undefined : "noreferrer"}
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-white/70 transition hover:bg-white/[0.04] hover:text-white"
    >
      <span>{label}</span>
      {internal ? null : (
        <span aria-hidden="true" className="text-[11px] text-white/30">
          ↗
        </span>
      )}
    </a>
  );
}

function OpenLocalRow({
  state,
  onClick,
}: {
  state: LocalRuntimeState;
  onClick: () => void;
}) {
  if (state === "probing") {
    return (
      <div
        aria-disabled="true"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-white/55"
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand/70"
        />
        <span>looking for local…</span>
      </div>
    );
  }

  if (state === "offline") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="No local Milady running. Open install guidance."
        className="group flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-white/55 transition hover:bg-white/[0.04] hover:text-white/85"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-white/25"
          />
          <span>start local</span>
        </span>
        <span
          aria-hidden="true"
          className="font-mono text-[10px] tracking-wider text-white/30 transition group-hover:text-white/50"
        >
          offline
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-white/85 transition hover:bg-white/[0.04] hover:text-white"
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_6px_rgba(240,185,11,0.4)]"
        />
        <span>open local</span>
      </span>
      <span
        aria-hidden="true"
        className="text-[11px] text-white/30 transition group-hover:translate-x-0.5 group-hover:text-brand"
      >
        →
      </span>
    </button>
  );
}
