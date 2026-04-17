import { type ReactNode, useEffect, useState } from "react";
import type { ManagedAgent } from "../../lib/AgentProvider";
import type { LocalRuntimeState } from "./Sidebar";
import { Sidebar } from "./Sidebar";

export interface DashboardShellProps {
  children: ReactNode;
  agents: ManagedAgent[];
  localState: LocalRuntimeState;
  onOpenLocal: () => void;
  onAttachRemote: () => void;
  onSignIn: () => void;
  isSigningIn?: boolean;
}

export function DashboardShell({
  children,
  agents,
  localState,
  onOpenLocal,
  onAttachRemote,
  onSignIn,
  isSigningIn,
}: DashboardShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="relative min-h-[100dvh] bg-[#050507] text-white selection:bg-brand selection:text-black">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_10%_0%,rgba(240,185,11,0.10),transparent_45%),linear-gradient(180deg,#050507_0%,#07070b_70%,#050507_100%)]"
      />

      <div className="fixed inset-y-0 left-0 z-30 hidden w-[240px] lg:block">
        <Sidebar
          agents={agents}
          localState={localState}
          onOpenLocal={onOpenLocal}
          onAttachRemote={onAttachRemote}
          onSignIn={onSignIn}
          isSigningIn={isSigningIn}
        />
      </div>

      {drawerOpen ? (
        <>
          <div
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] lg:hidden">
            <Sidebar
              agents={agents}
              localState={localState}
              onOpenLocal={onOpenLocal}
              onAttachRemote={onAttachRemote}
              onSignIn={onSignIn}
              isSigningIn={isSigningIn}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </>
      ) : null}

      <div className="relative z-10 lg:pl-[240px]">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-[#08090d]/85 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-white/80 hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="text-[13px] font-semibold tracking-tight">
            milady
          </span>
          <span className="h-9 w-9" aria-hidden="true" />
        </div>

        <main className="mx-auto min-h-[100dvh] max-w-[1152px] px-4 py-7 sm:px-6 sm:py-9 md:px-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
